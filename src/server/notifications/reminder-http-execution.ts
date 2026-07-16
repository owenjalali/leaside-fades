import type { PoolClient, PoolConfig } from "pg";

import {
    createDatabaseClient,
    createDatabaseExecutor,
    type DatabaseExecutor,
} from "../db/client.ts";
import type { SchedulerJobRunSummary } from "../jobs/scheduler-runs.ts";
import {
    getReminderHttpScheduleDecision,
    reminderHttpBoundaryGraceMinutesFromEnv,
    reminderHttpIntervalFromEnv,
} from "./reminder-http-scheduler.ts";
import {
    getConfiguredBookingReminderJobSummary,
    runConfiguredBookingReminderJob,
} from "./reminder-job-runner.ts";
import type { BookingReminderJobResult } from "./reminders.ts";

const REMINDER_LOCK_KEY_NAMESPACE = 1_279_672_644;
const REMINDER_LOCK_KEY_JOB = 1_380_273_481;
const DEFAULT_CONNECTION_TIMEOUT_MS = 4_000;
const DEFAULT_QUERY_TIMEOUT_MS = 5_000;
const DEFAULT_HTTP_DEADLINE_MS = 24_000;
const MAX_INITIALIZATION_BUDGET_MS = 12_000;

type ReminderRuntimeEnv = Partial<Record<string, string | undefined>>;

interface ReminderHttpClient {
    query(
        text: string,
        params?: unknown[],
    ): Promise<{ rows: Array<Record<string, unknown>> }>;
    release(destroy?: boolean): void;
}

interface ReminderHttpPool {
    connect(): Promise<ReminderHttpClient>;
    end(): Promise<void>;
}

type ExecutionDatabase = DatabaseExecutor | Record<string, unknown>;

interface ReminderHttpExecutionDependencies {
    createDatabaseClient(
        connectionString: string | undefined,
        env: ReminderRuntimeEnv,
        poolOptions: Omit<PoolConfig, "connectionString">,
    ): { pool: ReminderHttpPool };
    createDatabaseExecutor(client: ReminderHttpClient): ExecutionDatabase;
    getSummary(
        env: ReminderRuntimeEnv,
        options: { database: ExecutionDatabase },
    ): Promise<SchedulerJobRunSummary | null>;
    runJob(
        env: ReminderRuntimeEnv,
        options: {
            database: ExecutionDatabase;
            trigger: "http";
            deadlineAtMs: number;
            providerTimeoutMs: number;
        },
    ): Promise<BookingReminderJobResult>;
}

export interface ExecuteReminderHttpRequestOptions {
    startedAtMs?: number;
    now?: () => Date;
    nowMs?: () => number;
    dependencies?: Partial<ReminderHttpExecutionDependencies>;
}

export type ReminderHttpExecutionResult =
    | {
          kind: "skipped";
          skipped: true;
          reason: "concurrent_run";
      }
    | {
          kind: "skipped";
          skipped: true;
          reason: "recent_success";
          schedule: ReturnType<typeof getReminderHttpScheduleDecision>;
      }
    | {
          kind: "completed";
          degraded: boolean;
          result: BookingReminderJobResult;
      };

export class ReminderHttpInitializationError extends Error {
    readonly statusCode = 503;

    constructor() {
        super("Reminder database initialization did not complete within its bounded budget.");
        this.name = "ReminderHttpInitializationError";
    }
}

export class ReminderHttpDeadlineError extends Error {
    readonly statusCode = 503;

    constructor() {
        super("Reminder execution exceeded its bounded HTTP budget.");
        this.name = "ReminderHttpDeadlineError";
    }
}

export async function executeReminderHttpRequest(
    env: ReminderRuntimeEnv = process.env,
    options: ExecuteReminderHttpRequestOptions = {},
): Promise<ReminderHttpExecutionResult> {
    const dependencies = resolveDependencies(options.dependencies);
    const nowMs = options.nowMs ?? Date.now;
    const startedAtMs = options.startedAtMs ?? nowMs();
    const providerTimeoutMs = boundedTimeout(
        env.NOTIFICATION_PROVIDER_TIMEOUT_MS,
        DEFAULT_QUERY_TIMEOUT_MS,
    );
    const deadlineAtMs = startedAtMs + boundedHttpDeadline(env.REMINDER_HTTP_DEADLINE_MS);
    const initializationDeadlineAtMs = Math.min(
        startedAtMs + MAX_INITIALIZATION_BUDGET_MS,
        deadlineAtMs - providerTimeoutMs - 1_000,
    );
    const poolOptions = {
        max: 1,
        connectionTimeoutMillis: boundedTimeout(
            env.REMINDER_DB_CONNECT_TIMEOUT_MS,
            DEFAULT_CONNECTION_TIMEOUT_MS,
        ),
        query_timeout: boundedTimeout(
            env.REMINDER_DB_QUERY_TIMEOUT_MS,
            DEFAULT_QUERY_TIMEOUT_MS,
        ),
    };
    let pool: ReminderHttpPool;

    try {
        pool = dependencies.createDatabaseClient(env.DATABASE_URL, env, poolOptions).pool;
    } catch {
        throw new ReminderHttpInitializationError();
    }

    let client: ReminderHttpClient | null = null;
    let lockAcquired = false;
    let destroyClient = false;

    try {
        try {
            client = await withinDeadline(
                () => pool.connect(),
                initializationDeadlineAtMs,
                nowMs,
                () => new ReminderHttpInitializationError(),
            );
            const lockResult = await withinDeadline(
                () => client!.query(
                    "select pg_try_advisory_lock($1, $2) as acquired",
                    [REMINDER_LOCK_KEY_NAMESPACE, REMINDER_LOCK_KEY_JOB],
                ),
                initializationDeadlineAtMs,
                nowMs,
                () => new ReminderHttpInitializationError(),
            );
            lockAcquired = lockResult.rows[0]?.acquired === true;
        } catch (error) {
            destroyClient = client !== null;
            if (error instanceof ReminderHttpInitializationError) {
                throw error;
            }
            throw new ReminderHttpInitializationError();
        }

        if (!lockAcquired) {
            return {
                kind: "skipped",
                skipped: true,
                reason: "concurrent_run",
            };
        }

        const database = dependencies.createDatabaseExecutor(client);
        let summary: SchedulerJobRunSummary | null;
        try {
            summary = await withinDeadline(
                () => dependencies.getSummary(env, { database }),
                initializationDeadlineAtMs,
                nowMs,
                () => new ReminderHttpInitializationError(),
            );
        } catch (error) {
            if (error instanceof ReminderHttpInitializationError) {
                destroyClient = true;
            }
            throw error;
        }
        const intervalMinutes = reminderHttpIntervalFromEnv(env);
        const boundaryGraceMinutes = reminderHttpBoundaryGraceMinutesFromEnv(
            env,
            intervalMinutes,
        );
        const schedule = getReminderHttpScheduleDecision({
            now: options.now?.(),
            intervalMinutes,
            boundaryGraceMinutes,
            lastSuccessAt: summary?.latestSuccess?.finishedAt ?? null,
            runWhenNoSuccess: true,
        });

        if (!schedule.shouldRun) {
            return {
                kind: "skipped",
                skipped: true,
                reason: "recent_success",
                schedule,
            };
        }

        let result: BookingReminderJobResult;
        try {
            result = await withinDeadline(
                () => dependencies.runJob(env, {
                    database,
                    trigger: "http",
                    deadlineAtMs,
                    providerTimeoutMs,
                }),
                deadlineAtMs,
                nowMs,
                () => new ReminderHttpDeadlineError(),
            );
        } catch (error) {
            if (error instanceof ReminderHttpDeadlineError) {
                destroyClient = true;
            }
            throw error;
        }

        return {
            kind: "completed",
            degraded: result.failed > 0 || result.deferred > 0,
            result,
        };
    } finally {
        if (client && lockAcquired && !destroyClient) {
            try {
                await client.query(
                    "select pg_advisory_unlock($1, $2) as unlocked",
                    [REMINDER_LOCK_KEY_NAMESPACE, REMINDER_LOCK_KEY_JOB],
                );
            } catch {
                console.error("[scheduler] failed to release reminder advisory lock");
            }
        }

        client?.release(destroyClient);

        try {
            await pool.end();
        } catch {
            console.error("[scheduler] failed to close bounded reminder database pool");
        }
    }
}

async function withinDeadline<T>(
    operation: () => Promise<T>,
    deadlineAtMs: number,
    nowMs: () => number,
    timeoutError: () => Error,
): Promise<T> {
    const remainingMs = deadlineAtMs - nowMs();

    if (remainingMs <= 0) {
        throw timeoutError();
    }

    return new Promise<T>((resolve, reject) => {
        const timeout = setTimeout(() => reject(timeoutError()), remainingMs);

        operation().then(
            (value) => {
                clearTimeout(timeout);
                resolve(value);
            },
            (error) => {
                clearTimeout(timeout);
                reject(error);
            },
        );
    });
}

function resolveDependencies(
    overrides: Partial<ReminderHttpExecutionDependencies> | undefined,
): ReminderHttpExecutionDependencies {
    const defaults: ReminderHttpExecutionDependencies = {
        createDatabaseClient: (connectionString, env, poolOptions) =>
            createDatabaseClient(connectionString, env, poolOptions) as unknown as {
                pool: ReminderHttpPool;
            },
        createDatabaseExecutor: (client) =>
            createDatabaseExecutor(client as unknown as PoolClient),
        getSummary: (env, options) =>
            getConfiguredBookingReminderJobSummary(env as NodeJS.ProcessEnv, {
                database: options.database as DatabaseExecutor,
            }),
        runJob: (env, options) =>
            runConfiguredBookingReminderJob(env as NodeJS.ProcessEnv, {
                ...options,
                database: options.database as DatabaseExecutor,
            }),
    };

    return { ...defaults, ...overrides };
}

function boundedTimeout(value: string | undefined, fallback: number) {
    const parsed = Number.parseInt(value ?? "", 10);
    return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1_000), 10_000) : fallback;
}

function boundedHttpDeadline(value: string | undefined) {
    const parsed = Number.parseInt(value ?? "", 10);
    return Number.isFinite(parsed)
        ? Math.min(Math.max(parsed, 10_000), 25_000)
        : DEFAULT_HTTP_DEADLINE_MS;
}
