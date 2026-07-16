import { afterEach, describe, expect, test, vi } from "vitest";

import {
    createDrizzleSchedulerJobRunRepository,
    runTrackedSchedulerJob,
    type SchedulerJobRunRepository,
    type SchedulerJobRunSummary,
} from "./scheduler-runs.ts";

class InMemorySchedulerJobRunRepository implements SchedulerJobRunRepository {
    records: Parameters<SchedulerJobRunRepository["recordJobRun"]>[0][] = [];
    failWrites = false;

    async recordJobRun(input: Parameters<SchedulerJobRunRepository["recordJobRun"]>[0]) {
        if (this.failWrites) {
            throw new Error("heartbeat table unavailable");
        }

        this.records.push(input);
    }

    async getJobRunSummary(): Promise<SchedulerJobRunSummary | null> {
        return null;
    }
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("scheduler job run tracking", () => {
    test("reads scheduler summary sequentially on a single database executor", async () => {
        let activeQueries = 0;
        let maximumActiveQueries = 0;
        const database = {
            select: vi.fn(() => ({
                from: () => ({
                    where: () => ({
                        orderBy: () => ({
                            limit: async () => {
                                activeQueries += 1;
                                maximumActiveQueries = Math.max(maximumActiveQueries, activeQueries);
                                await Promise.resolve();
                                activeQueries -= 1;
                                return [];
                            },
                        }),
                    }),
                }),
            })),
        };
        const repository = createDrizzleSchedulerJobRunRepository(database);

        await expect(repository.getJobRunSummary({ jobName: "booking_reminders" })).resolves.toEqual({
            latest: null,
            latestSuccess: null,
            latestFailure: null,
        });

        expect(database.select).toHaveBeenCalledTimes(3);
        expect(maximumActiveQueries).toBe(1);
    });

    test("records successful scheduler jobs without changing the job result", async () => {
        const repository = new InMemorySchedulerJobRunRepository();
        const clock = fixedClock([
            new Date("2026-05-20T16:30:00.000Z"),
            new Date("2026-05-20T16:30:00.250Z"),
        ]);

        const result = await runTrackedSchedulerJob({
            jobName: "booking_reminders",
            trigger: "http",
            repository,
            now: clock,
            run: async () => ({
                scanned: 2,
                sent: 1,
                failed: 1,
                deferred: 1,
                failedByProvider: { brevo: 1 },
            }),
        });

        expect(result).toEqual({
            scanned: 2,
            sent: 1,
            failed: 1,
            deferred: 1,
            failedByProvider: { brevo: 1 },
        });
        expect(repository.records).toEqual([
            expect.objectContaining({
                jobName: "booking_reminders",
                trigger: "http",
                status: "success",
                durationMs: 250,
                result: {
                    scanned: 2,
                    sent: 1,
                    failed: 1,
                    deferred: 1,
                    failedByProvider: { brevo: 1 },
                },
                errorMessage: null,
            }),
        ]);
    });

    test("records failed scheduler jobs and rethrows the original error", async () => {
        const repository = new InMemorySchedulerJobRunRepository();
        const clock = fixedClock([
            new Date("2026-05-20T16:30:00.000Z"),
            new Date("2026-05-20T16:30:01.000Z"),
        ]);

        await expect(
            runTrackedSchedulerJob({
                jobName: "booking_reminders",
                trigger: "cli",
                repository,
                now: clock,
                run: async () => {
                    throw new Error("provider unavailable");
                },
            }),
        ).rejects.toThrow("provider unavailable");

        expect(repository.records).toEqual([
            expect.objectContaining({
                status: "failure",
                durationMs: 1000,
                result: null,
                errorMessage: "provider unavailable",
            }),
        ]);
    });

    test("does not fail the reminder job when heartbeat persistence is unavailable", async () => {
        const repository = new InMemorySchedulerJobRunRepository();
        repository.failWrites = true;
        vi.spyOn(console, "error").mockImplementation(() => {});

        await expect(
            runTrackedSchedulerJob({
                jobName: "booking_reminders",
                trigger: "http",
                repository,
                run: async () => ({ scanned: 0 }),
            }),
        ).resolves.toEqual({ scanned: 0 });
    });
});

function fixedClock(values: Date[]) {
    let index = 0;

    return () => values[Math.min(index++, values.length - 1)];
}
