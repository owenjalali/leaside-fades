import { afterEach, describe, expect, test, vi } from "vitest";

import {
    JOB_RUN_RETENTION_DAYS,
    NOTIFICATION_RETENTION_DAYS,
    pruneSchedulerHistory,
    pruneSchedulerHistorySafely,
    type SchedulerHistoryRetentionRepository,
} from "./history-retention.ts";

const NOW = new Date("2026-07-12T15:00:00.000Z");

class RecordingRetentionRepository implements SchedulerHistoryRetentionRepository {
    keepIds: string[] = ["latest-success-1"];
    notificationCutoffs: Date[] = [];
    jobRunCalls: Array<{ cutoff: Date; keepIds: string[] }> = [];

    async listLatestSuccessfulJobRunIds() {
        return this.keepIds;
    }

    async deleteNotificationsCreatedBefore(cutoff: Date) {
        this.notificationCutoffs.push(cutoff);
        return 7;
    }

    async deleteJobRunsStartedBefore(cutoff: Date, keepIds: string[]) {
        this.jobRunCalls.push({ cutoff, keepIds });
        return 3;
    }
}

afterEach(() => {
    vi.restoreAllMocks();
});

describe("scheduler history retention", () => {
    test("prunes notifications and job runs at the default retention cutoffs", async () => {
        const repository = new RecordingRetentionRepository();

        const summary = await pruneSchedulerHistory({ repository, now: NOW });

        expect(summary).toEqual({
            notificationsDeleted: 7,
            jobRunsDeleted: 3,
            notificationCutoff: daysBefore(NOW, NOTIFICATION_RETENTION_DAYS).toISOString(),
            jobRunCutoff: daysBefore(NOW, JOB_RUN_RETENTION_DAYS).toISOString(),
        });
        expect(repository.notificationCutoffs).toEqual([
            daysBefore(NOW, NOTIFICATION_RETENTION_DAYS),
        ]);
        expect(repository.jobRunCalls).toEqual([
            { cutoff: daysBefore(NOW, JOB_RUN_RETENTION_DAYS), keepIds: ["latest-success-1"] },
        ]);
    });

    test("always shields the latest successful heartbeat rows from job run pruning", async () => {
        const repository = new RecordingRetentionRepository();
        repository.keepIds = ["booking-reminders-latest", "other-job-latest"];

        await pruneSchedulerHistory({ repository, now: NOW, jobRunRetentionDays: 1 });

        expect(repository.jobRunCalls).toEqual([
            {
                cutoff: daysBefore(NOW, 1),
                keepIds: ["booking-reminders-latest", "other-job-latest"],
            },
        ]);
    });

    test("supports custom retention windows", async () => {
        const repository = new RecordingRetentionRepository();

        const summary = await pruneSchedulerHistory({
            repository,
            now: NOW,
            notificationRetentionDays: 10,
            jobRunRetentionDays: 2,
        });

        expect(summary.notificationCutoff).toBe(daysBefore(NOW, 10).toISOString());
        expect(summary.jobRunCutoff).toBe(daysBefore(NOW, 2).toISOString());
    });

    test("pruneSchedulerHistorySafely reports null instead of throwing when pruning fails", async () => {
        const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
        const repository = new RecordingRetentionRepository();
        repository.deleteNotificationsCreatedBefore = async () => {
            throw new Error("delete failed");
        };

        const result = await pruneSchedulerHistorySafely({ repository, now: NOW });

        expect(result).toBeNull();
        expect(consoleError).toHaveBeenCalledOnce();
    });
});

function daysBefore(value: Date, days: number) {
    return new Date(value.getTime() - days * 24 * 60 * 60 * 1000);
}
