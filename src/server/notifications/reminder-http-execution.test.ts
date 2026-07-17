import { describe, expect, test, vi } from "vitest";

import {
    ReminderHttpInitializationError,
    ReminderHttpDeadlineError,
    executeReminderHttpRequest,
} from "./reminder-http-execution.ts";
import type { SchedulerJobRunRecord, SchedulerJobRunSummary } from "../jobs/scheduler-runs.ts";
import type { BookingReminderJobResult } from "./reminders.ts";

const ENV = {
    DATABASE_URL: "postgres://example",
    APP_URL: "https://leasidefades.example",
    NOTIFICATION_DELIVERY_MODE: "live",
    SMS_DELIVERY_MODE: "paused",
    BREVO_API_KEY: "brevo-test-key",
    EMAIL_FROM: "Leaside Fades <bookings@leasidefades.com>",
    REMINDER_HTTP_MIN_INTERVAL_MINUTES: "30",
};

function executionHarness(options: { lockAcquired?: boolean; connectError?: Error } = {}) {
    const events: string[] = [];
    const query = vi.fn(async (text: string, params?: unknown[]) => {
        events.push(text.includes("try_advisory") ? "lock" : "unlock");
        expect(params).toHaveLength(2);
        return text.includes("try_advisory")
            ? { rows: [{ acquired: options.lockAcquired ?? true }] }
            : { rows: [{ unlocked: true }] };
    });
    const client = {
        query,
        release: vi.fn(() => events.push("release")),
    };
    const pool = {
        connect: vi.fn(async () => {
            events.push("connect");
            if (options.connectError) throw options.connectError;
            return client;
        }),
        end: vi.fn(async () => {
            events.push("end");
        }),
    };
    const runJob = vi.fn(async (): Promise<BookingReminderJobResult> => ({
        scanned: 1,
        totalAttempts: 2,
        sent: 1,
        failed: 0,
        skipped: 1,
        duplicate: 0,
        deferred: 0,
        failedByProvider: {},
        pausedByProvider: { twilio: 1 },
    }));
    const getSummary = vi.fn(async (): Promise<SchedulerJobRunSummary | null> => ({
        latest: null,
        latestSuccess: null,
        latestFailure: null,
    }));
    const createDatabaseClient = vi.fn(() => ({
        pool,
        db: { wrongExecutor: true },
    }));
    const createDatabaseExecutor = vi.fn(() => ({ sharedExecutor: true }));

    return {
        events,
        pool,
        client,
        runJob,
        getSummary,
        createDatabaseClient,
        dependencies: {
            createDatabaseClient,
            createDatabaseExecutor,
            runJob,
            getSummary,
        },
    };
}

describe("bounded reminder HTTP execution", () => {
    test("uses one connection for cadence, job, heartbeat, and retention work", async () => {
        const harness = executionHarness();

        const result = await executeReminderHttpRequest(ENV, {
            now: () => new Date("2026-07-16T15:30:00.000Z"),
            nowMs: () => Date.parse("2026-07-16T15:30:00.000Z"),
            dependencies: harness.dependencies,
        });

        expect(result).toMatchObject({ kind: "completed", degraded: false });
        expect(harness.pool.connect).toHaveBeenCalledOnce();
        expect(harness.createDatabaseClient).toHaveBeenCalledWith(
            ENV.DATABASE_URL,
            ENV,
            expect.objectContaining({
                max: 1,
                connectionTimeoutMillis: 8_000,
                query_timeout: 5_000,
            }),
        );
        expect(harness.getSummary).toHaveBeenCalledWith(
            ENV,
            expect.objectContaining({ database: { sharedExecutor: true } }),
        );
        expect(harness.runJob).toHaveBeenCalledWith(
            ENV,
            expect.objectContaining({
                database: { sharedExecutor: true },
                trigger: "http",
                deadlineAtMs: Date.parse("2026-07-16T15:30:24.000Z"),
            }),
        );
        expect(harness.events).toEqual(["connect", "lock", "unlock", "release", "end"]);
    });

    test("skips safely when another invocation owns the advisory lock", async () => {
        const harness = executionHarness({ lockAcquired: false });

        await expect(executeReminderHttpRequest(ENV, {
            dependencies: harness.dependencies,
        })).resolves.toEqual({
            kind: "skipped",
            skipped: true,
            reason: "concurrent_run",
        });

        expect(harness.getSummary).not.toHaveBeenCalled();
        expect(harness.runJob).not.toHaveBeenCalled();
        expect(harness.events).toEqual(["connect", "lock", "release", "end"]);
    });

    test("skips a recent successful run on the same database session", async () => {
        const harness = executionHarness();
        harness.getSummary.mockResolvedValueOnce({
            latest: null,
            latestFailure: null,
            latestSuccess: schedulerRecord(new Date("2026-07-16T15:20:00.000Z")),
        });

        const result = await executeReminderHttpRequest(ENV, {
            now: () => new Date("2026-07-16T15:30:00.000Z"),
            dependencies: harness.dependencies,
        });

        expect(result).toMatchObject({
            kind: "skipped",
            skipped: true,
            reason: "recent_success",
        });
        expect(harness.runJob).not.toHaveBeenCalled();
    });

    test("returns degraded success when provider calls fail or defer", async () => {
        const harness = executionHarness();
        harness.runJob.mockResolvedValueOnce({
            scanned: 1,
            totalAttempts: 2,
            sent: 0,
            failed: 1,
            skipped: 0,
            duplicate: 0,
            deferred: 1,
            failedByProvider: { brevo: 1 },
            pausedByProvider: {},
        });

        const result = await executeReminderHttpRequest(ENV, {
            dependencies: harness.dependencies,
        });

        expect(result).toMatchObject({
            kind: "completed",
            degraded: true,
            result: { failed: 1, deferred: 1 },
        });
    });

    test("maps bounded connection failures to a typed 503 error", async () => {
        const harness = executionHarness({ connectError: new Error("connection timeout") });

        await expect(executeReminderHttpRequest(ENV, {
            dependencies: harness.dependencies,
        })).rejects.toMatchObject({
            name: "ReminderHttpInitializationError",
            statusCode: 503,
            stage: "database_connect",
        } satisfies Partial<ReminderHttpInitializationError>);

        expect(harness.events).toEqual(["connect", "end"]);
    });

    test("unlocks, releases, and closes after an infrastructure exception", async () => {
        const harness = executionHarness();
        harness.runJob.mockRejectedValueOnce(new Error("job query failed"));

        await expect(executeReminderHttpRequest(ENV, {
            dependencies: harness.dependencies,
        })).rejects.toThrow("job query failed");

        expect(harness.events).toEqual(["connect", "lock", "unlock", "release", "end"]);
    });

    test("destroys the session and stops before job work after the overall deadline", async () => {
        const harness = executionHarness();
        const nowMs = vi.fn()
            .mockReturnValueOnce(0)
            .mockReturnValueOnce(0)
            .mockReturnValueOnce(0)
            .mockReturnValueOnce(25_001);

        await expect(executeReminderHttpRequest(ENV, {
            startedAtMs: 0,
            nowMs,
            dependencies: harness.dependencies,
        })).rejects.toBeInstanceOf(ReminderHttpDeadlineError);

        expect(harness.runJob).not.toHaveBeenCalled();
        expect(harness.client.release).toHaveBeenCalledWith(true);
        expect(harness.pool.end).toHaveBeenCalledOnce();
    });
});

function schedulerRecord(finishedAt: Date): SchedulerJobRunRecord {
    return {
        id: "scheduler-run-1",
        jobName: "booking_reminders",
        trigger: "http",
        status: "success",
        startedAt: new Date(finishedAt.getTime() - 250),
        finishedAt,
        durationMs: 250,
        result: { sent: 0, failed: 0 },
        errorMessage: null,
        createdAt: finishedAt,
        updatedAt: finishedAt,
    };
}
