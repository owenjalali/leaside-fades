import { describe, expect, test } from "vitest";

import {
    classifyReminderHeartbeat,
    readConfig,
} from "./production-reminder-heartbeat.ts";
import type { SchedulerJobRunRecord, SchedulerJobRunSummary } from "../jobs/scheduler-runs.ts";

const currentTime = new Date("2026-05-20T18:00:00.000Z");

describe("production reminder heartbeat QA", () => {
    test("reads config and validates since timestamp", () => {
        expect(
            readConfig({
                PRODUCTION_REMINDER_HEARTBEAT_ENV_FILE: ".env.production.local",
                PRODUCTION_REMINDER_HEARTBEAT_STALE_AFTER_MINUTES: "120",
                PRODUCTION_REMINDER_HEARTBEAT_SINCE: "2026-05-20T17:30:00.000Z",
            }),
        ).toEqual({
            envFile: ".env.production.local",
            jobName: "booking_reminders",
            staleAfterMinutes: 120,
            since: new Date("2026-05-20T17:30:00.000Z"),
        });

        expect(() =>
            readConfig({
                PRODUCTION_REMINDER_HEARTBEAT_SINCE: "not-a-date",
            }),
        ).toThrow("PRODUCTION_REMINDER_HEARTBEAT_SINCE must be a valid ISO timestamp.");
    });

    test("passes when the latest successful heartbeat is recent enough", () => {
        const latestSuccess = heartbeat({ status: "success", finishedAt: "2026-05-20T17:45:00.000Z" });

        expect(
            classifyReminderHeartbeat(summary({ latest: latestSuccess, latestSuccess }), {
                now: currentTime,
                staleAfterMinutes: 90,
            }),
        ).toMatchObject({
            ok: true,
            state: "healthy",
            minutesSinceLastSuccess: 15,
        });
    });

    test("fails when no successful heartbeat exists after the requested restart window", () => {
        const latestSuccess = heartbeat({ status: "success", finishedAt: "2026-05-20T17:20:00.000Z" });

        expect(
            classifyReminderHeartbeat(summary({ latest: latestSuccess, latestSuccess }), {
                now: currentTime,
                staleAfterMinutes: 90,
                since: new Date("2026-05-20T17:30:00.000Z"),
            }),
        ).toMatchObject({
            ok: false,
            state: "stale",
            message: "No successful reminder scheduler heartbeat since 2026-05-20T17:30:00.000Z.",
        });
    });

    test("fails when the latest heartbeat is a failure", () => {
        const latestSuccess = heartbeat({ status: "success", finishedAt: "2026-05-20T17:20:00.000Z" });
        const latestFailure = heartbeat({ status: "failure", finishedAt: "2026-05-20T17:50:00.000Z" });

        expect(
            classifyReminderHeartbeat(summary({ latest: latestFailure, latestSuccess, latestFailure }), {
                now: currentTime,
                staleAfterMinutes: 90,
            }),
        ).toMatchObject({
            ok: false,
            state: "failing",
            latestStatus: "failure",
        });
    });

    test("fails when the latest successful heartbeat is stale", () => {
        const latestSuccess = heartbeat({ status: "success", finishedAt: "2026-05-20T15:00:00.000Z" });

        expect(
            classifyReminderHeartbeat(summary({ latest: latestSuccess, latestSuccess }), {
                now: currentTime,
                staleAfterMinutes: 90,
            }),
        ).toMatchObject({
            ok: false,
            state: "stale",
            minutesSinceLastSuccess: 180,
        });
    });
});

function summary(input: {
    latest: SchedulerJobRunRecord | null;
    latestSuccess?: SchedulerJobRunRecord | null;
    latestFailure?: SchedulerJobRunRecord | null;
}): SchedulerJobRunSummary {
    return {
        latest: input.latest,
        latestSuccess: input.latestSuccess ?? null,
        latestFailure: input.latestFailure ?? null,
    };
}

function heartbeat(input: {
    status: SchedulerJobRunRecord["status"];
    finishedAt: string;
}): SchedulerJobRunRecord {
    const finishedAt = new Date(input.finishedAt);

    return {
        id: `heartbeat-${input.status}-${finishedAt.getTime()}`,
        jobName: "booking_reminders",
        trigger: "http",
        status: input.status,
        startedAt: new Date(finishedAt.getTime() - 250),
        finishedAt,
        durationMs: 250,
        result: input.status === "success" ? { scanned: 0 } : null,
        errorMessage: input.status === "failure" ? "provider unavailable" : null,
        createdAt: finishedAt,
        updatedAt: finishedAt,
    };
}
