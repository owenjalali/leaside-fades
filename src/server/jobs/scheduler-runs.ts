import { and, desc, eq } from "drizzle-orm";

import { createDatabaseClient } from "../db/client.ts";
import { schedulerJobRuns } from "../db/schema.ts";

export const BOOKING_REMINDER_JOB_NAME = "booking_reminders";

export type SchedulerJobRunStatus = "success" | "failure";

export interface SchedulerJobRunRecord {
    id: string;
    jobName: string;
    trigger: string;
    status: SchedulerJobRunStatus;
    startedAt: Date;
    finishedAt: Date;
    durationMs: number;
    result: Record<string, unknown> | null;
    errorMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface SchedulerJobRunSummary {
    latest: SchedulerJobRunRecord | null;
    latestSuccess: SchedulerJobRunRecord | null;
    latestFailure: SchedulerJobRunRecord | null;
}

export interface SchedulerJobRunRepository {
    recordJobRun(input: {
        jobName: string;
        trigger: string;
        status: SchedulerJobRunStatus;
        startedAt: Date;
        finishedAt: Date;
        durationMs: number;
        result: Record<string, unknown> | null;
        errorMessage: string | null;
    }): Promise<void>;
    getJobRunSummary(input: { jobName: string }): Promise<SchedulerJobRunSummary | null>;
}

type DatabaseExecutor = ReturnType<typeof createDatabaseClient>["db"] | Record<string, unknown>;

let databaseClient: ReturnType<typeof createDatabaseClient> | null = null;

export function getSchedulerJobRunDatabase() {
    if (!databaseClient) {
        databaseClient = createDatabaseClient();
    }

    return databaseClient.db;
}

export function createDrizzleSchedulerJobRunRepository(
    database: DatabaseExecutor = getSchedulerJobRunDatabase(),
): SchedulerJobRunRepository {
    return new DrizzleSchedulerJobRunRepository(database);
}

export async function runTrackedSchedulerJob<T>(input: {
    jobName: string;
    trigger: string;
    repository: SchedulerJobRunRepository;
    run: () => Promise<T>;
    now?: () => Date;
}): Promise<T> {
    const now = input.now ?? (() => new Date());
    const startedAt = now();

    try {
        const result = await input.run();
        const finishedAt = now();
        await recordJobRunSafely(input.repository, {
            jobName: input.jobName,
            trigger: input.trigger,
            status: "success",
            startedAt,
            finishedAt,
            durationMs: elapsedMs(startedAt, finishedAt),
            result: toRecord(result),
            errorMessage: null,
        });
        return result;
    } catch (error) {
        const finishedAt = now();
        await recordJobRunSafely(input.repository, {
            jobName: input.jobName,
            trigger: input.trigger,
            status: "failure",
            startedAt,
            finishedAt,
            durationMs: elapsedMs(startedAt, finishedAt),
            result: null,
            errorMessage: errorMessage(error),
        });
        throw error;
    }
}

class DrizzleSchedulerJobRunRepository implements SchedulerJobRunRepository {
    private readonly database: DatabaseExecutor;

    constructor(database: DatabaseExecutor) {
        this.database = database;
    }

    async recordJobRun(input: {
        jobName: string;
        trigger: string;
        status: SchedulerJobRunStatus;
        startedAt: Date;
        finishedAt: Date;
        durationMs: number;
        result: Record<string, unknown> | null;
        errorMessage: string | null;
    }) {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        await db.insert(schedulerJobRuns).values({
            jobName: input.jobName,
            trigger: input.trigger,
            status: input.status,
            startedAt: input.startedAt,
            finishedAt: input.finishedAt,
            durationMs: input.durationMs,
            result: input.result,
            errorMessage: input.errorMessage,
            createdAt: input.finishedAt,
            updatedAt: input.finishedAt,
        });
    }

    async getJobRunSummary(input: { jobName: string }) {
        // The reminder HTTP path deliberately reuses one leased PostgreSQL
        // client. Keep these reads serialized so pg never receives overlapping
        // queries on that client (concurrent client.query calls are deprecated).
        const latest = await this.getLatestJobRun(input.jobName);
        const latestSuccess = await this.getLatestJobRun(input.jobName, "success");
        const latestFailure = await this.getLatestJobRun(input.jobName, "failure");

        return {
            latest,
            latestSuccess,
            latestFailure,
        };
    }

    private async getLatestJobRun(jobName: string, status?: SchedulerJobRunStatus) {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const [row] = await db
            .select(schedulerJobRunReturningFields)
            .from(schedulerJobRuns)
            .where(
                status
                    ? and(eq(schedulerJobRuns.jobName, jobName), eq(schedulerJobRuns.status, status))
                    : eq(schedulerJobRuns.jobName, jobName),
            )
            .orderBy(desc(schedulerJobRuns.startedAt))
            .limit(1);

        if (!row) {
            return null;
        }

        return mapSchedulerJobRun(row);
    }
}

const schedulerJobRunReturningFields = {
    id: schedulerJobRuns.id,
    jobName: schedulerJobRuns.jobName,
    trigger: schedulerJobRuns.trigger,
    status: schedulerJobRuns.status,
    startedAt: schedulerJobRuns.startedAt,
    finishedAt: schedulerJobRuns.finishedAt,
    durationMs: schedulerJobRuns.durationMs,
    result: schedulerJobRuns.result,
    errorMessage: schedulerJobRuns.errorMessage,
    createdAt: schedulerJobRuns.createdAt,
    updatedAt: schedulerJobRuns.updatedAt,
};

function mapSchedulerJobRun(row: any): SchedulerJobRunRecord {
    return {
        id: row.id,
        jobName: row.jobName,
        trigger: row.trigger,
        status: row.status as SchedulerJobRunStatus,
        startedAt: row.startedAt,
        finishedAt: row.finishedAt,
        durationMs: row.durationMs,
        result: row.result ?? null,
        errorMessage: row.errorMessage,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

async function recordJobRunSafely(
    repository: SchedulerJobRunRepository,
    input: Parameters<SchedulerJobRunRepository["recordJobRun"]>[0],
) {
    try {
        await repository.recordJobRun(input);
    } catch (error) {
        console.error("[scheduler] failed to record job run", error);
    }
}

function elapsedMs(startedAt: Date, finishedAt: Date) {
    return Math.max(0, finishedAt.getTime() - startedAt.getTime());
}

function errorMessage(error: unknown) {
    if (error instanceof Error && error.message) {
        return error.message;
    }

    return String(error);
}

function toRecord(value: unknown): Record<string, unknown> | null {
    if (value && typeof value === "object" && !Array.isArray(value)) {
        return value as Record<string, unknown>;
    }

    return value === undefined ? null : { value };
}
