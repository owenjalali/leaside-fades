import { and, desc, eq, lt, notInArray } from "drizzle-orm";

import { createDatabaseClient } from "../db/client.ts";
import { notifications, schedulerJobRuns } from "../db/schema.ts";
import { getSchedulerJobRunDatabase } from "./scheduler-runs.ts";

export const NOTIFICATION_RETENTION_DAYS = 180;
export const JOB_RUN_RETENTION_DAYS = 30;

export interface SchedulerHistoryPruneSummary {
    notificationsDeleted: number;
    jobRunsDeleted: number;
    notificationCutoff: string;
    jobRunCutoff: string;
}

export interface SchedulerHistoryRetentionRepository {
    listLatestSuccessfulJobRunIds(): Promise<string[]>;
    deleteNotificationsCreatedBefore(cutoff: Date): Promise<number>;
    deleteJobRunsStartedBefore(cutoff: Date, keepIds: string[]): Promise<number>;
}

export interface PruneSchedulerHistoryInput {
    repository: SchedulerHistoryRetentionRepository;
    now?: Date;
    notificationRetentionDays?: number;
    jobRunRetentionDays?: number;
}

export async function pruneSchedulerHistory(
    input: PruneSchedulerHistoryInput,
): Promise<SchedulerHistoryPruneSummary> {
    const now = input.now ?? new Date();
    const notificationCutoff = addDays(
        now,
        -(input.notificationRetentionDays ?? NOTIFICATION_RETENTION_DAYS),
    );
    const jobRunCutoff = addDays(now, -(input.jobRunRetentionDays ?? JOB_RUN_RETENTION_DAYS));
    // The reminder HTTP cadence guard reads the latest successful heartbeat per
    // job, so those rows must survive pruning no matter how old they are.
    const keepIds = await input.repository.listLatestSuccessfulJobRunIds();
    const notificationsDeleted =
        await input.repository.deleteNotificationsCreatedBefore(notificationCutoff);
    const jobRunsDeleted = await input.repository.deleteJobRunsStartedBefore(jobRunCutoff, keepIds);

    return {
        notificationsDeleted,
        jobRunsDeleted,
        notificationCutoff: notificationCutoff.toISOString(),
        jobRunCutoff: jobRunCutoff.toISOString(),
    };
}

export async function pruneSchedulerHistorySafely(
    input: PruneSchedulerHistoryInput,
): Promise<SchedulerHistoryPruneSummary | null> {
    try {
        return await pruneSchedulerHistory(input);
    } catch (error) {
        console.error("[scheduler] failed to prune notification history", error);
        return null;
    }
}

type DatabaseExecutor = ReturnType<typeof createDatabaseClient>["db"] | Record<string, unknown>;

export function createDrizzleSchedulerHistoryRetentionRepository(
    database: DatabaseExecutor = getSchedulerJobRunDatabase(),
): SchedulerHistoryRetentionRepository {
    return new DrizzleSchedulerHistoryRetentionRepository(database);
}

class DrizzleSchedulerHistoryRetentionRepository implements SchedulerHistoryRetentionRepository {
    private readonly database: DatabaseExecutor;

    constructor(database: DatabaseExecutor) {
        this.database = database;
    }

    async listLatestSuccessfulJobRunIds() {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const rows = await db
            .selectDistinctOn([schedulerJobRuns.jobName], { id: schedulerJobRuns.id })
            .from(schedulerJobRuns)
            .where(eq(schedulerJobRuns.status, "success"))
            .orderBy(schedulerJobRuns.jobName, desc(schedulerJobRuns.startedAt));

        return rows.map((row) => row.id);
    }

    async deleteNotificationsCreatedBefore(cutoff: Date) {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const rows = await db
            .delete(notifications)
            .where(lt(notifications.createdAt, cutoff))
            .returning({ id: notifications.id });

        return rows.length;
    }

    async deleteJobRunsStartedBefore(cutoff: Date, keepIds: string[]) {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const rows = await db
            .delete(schedulerJobRuns)
            .where(
                keepIds.length > 0
                    ? and(
                          lt(schedulerJobRuns.startedAt, cutoff),
                          notInArray(schedulerJobRuns.id, keepIds),
                      )
                    : lt(schedulerJobRuns.startedAt, cutoff),
            )
            .returning({ id: schedulerJobRuns.id });

        return rows.length;
    }
}

function addDays(value: Date, days: number) {
    return new Date(value.getTime() + days * 24 * 60 * 60 * 1000);
}
