import dotenv from "dotenv";

import {
    BOOKING_REMINDER_JOB_NAME,
    createDrizzleSchedulerJobRunRepository,
    type SchedulerJobRunRecord,
    type SchedulerJobRunSummary,
} from "../jobs/scheduler-runs.ts";

const DEFAULT_ENV_FILE = ".env.production.local";
const DEFAULT_STALE_AFTER_MINUTES = 90;

export interface ReminderHeartbeatConfig {
    envFile: string;
    jobName: string;
    staleAfterMinutes: number;
    since?: Date;
}

export interface ReminderHeartbeatStatus {
    ok: boolean;
    state: "healthy" | "stale" | "failing" | "unknown";
    message: string;
    latestRunAt: string | null;
    latestStatus: string | null;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    minutesSinceLastSuccess: number | null;
}

async function main() {
    const config = readConfig(process.env);
    loadEnvFile(config.envFile);

    const repository = createDrizzleSchedulerJobRunRepository();
    const summary = await repository.getJobRunSummary({ jobName: config.jobName });
    const status = classifyReminderHeartbeat(summary, {
        now: new Date(),
        staleAfterMinutes: config.staleAfterMinutes,
        since: config.since,
    });

    logStatus(config, status);

    if (!status.ok) {
        throw new Error(status.message);
    }

    console.log("[production-reminder-heartbeat] Check passed.");
}

export function readConfig(env: Partial<Record<string, string | undefined>>): ReminderHeartbeatConfig {
    return {
        envFile: env.PRODUCTION_REMINDER_HEARTBEAT_ENV_FILE || DEFAULT_ENV_FILE,
        jobName: env.PRODUCTION_REMINDER_HEARTBEAT_JOB_NAME || BOOKING_REMINDER_JOB_NAME,
        staleAfterMinutes: parsePositiveInteger(
            env.PRODUCTION_REMINDER_HEARTBEAT_STALE_AFTER_MINUTES,
            DEFAULT_STALE_AFTER_MINUTES,
        ),
        since: parseOptionalDate(env.PRODUCTION_REMINDER_HEARTBEAT_SINCE, "PRODUCTION_REMINDER_HEARTBEAT_SINCE"),
    };
}

export function classifyReminderHeartbeat(
    summary: SchedulerJobRunSummary | null | undefined,
    input: { now: Date; staleAfterMinutes: number; since?: Date },
): ReminderHeartbeatStatus {
    const latest = summary?.latest ?? null;
    const latestSuccess = summary?.latestSuccess ?? null;
    const latestFailure = summary?.latestFailure ?? null;
    const latestRunAt = latest?.finishedAt ?? null;
    const lastSuccessAt = latestSuccess?.finishedAt ?? null;
    const lastFailureAt = latestFailure?.finishedAt ?? null;
    const minutesSinceLastSuccess = lastSuccessAt
        ? Math.max(0, Math.floor((input.now.getTime() - lastSuccessAt.getTime()) / 60_000))
        : null;
    const base = {
        latestRunAt: isoOrNull(latestRunAt),
        latestStatus: latest?.status ?? null,
        lastSuccessAt: isoOrNull(lastSuccessAt),
        lastFailureAt: isoOrNull(lastFailureAt),
        minutesSinceLastSuccess,
    };

    if (!latest) {
        return {
            ...base,
            ok: false,
            state: "unknown",
            message: "No reminder scheduler heartbeat has been recorded.",
        };
    }

    if (latest.status === "failure") {
        return {
            ...base,
            ok: false,
            state: "failing",
            message: `Latest reminder scheduler heartbeat failed at ${latest.finishedAt.toISOString()}.`,
        };
    }

    if (!lastSuccessAt) {
        return {
            ...base,
            ok: false,
            state: "unknown",
            message: "No successful reminder scheduler heartbeat has been recorded.",
        };
    }

    if (input.since && lastSuccessAt < input.since) {
        return {
            ...base,
            ok: false,
            state: "stale",
            message: `No successful reminder scheduler heartbeat since ${input.since.toISOString()}.`,
        };
    }

    if (minutesSinceLastSuccess !== null && minutesSinceLastSuccess > input.staleAfterMinutes) {
        return {
            ...base,
            ok: false,
            state: "stale",
            message: `No successful reminder scheduler heartbeat in ${minutesSinceLastSuccess} minutes.`,
        };
    }

    return {
        ...base,
        ok: true,
        state: "healthy",
        message: `Last successful reminder scheduler heartbeat ${minutesSinceLastSuccess} minutes ago.`,
    };
}

function loadEnvFile(path: string) {
    dotenv.config({ path, override: false, quiet: true });
}

function logStatus(config: ReminderHeartbeatConfig, status: ReminderHeartbeatStatus) {
    console.log(`[production-reminder-heartbeat] jobName=${config.jobName}`);
    console.log(`[production-reminder-heartbeat] staleAfterMinutes=${config.staleAfterMinutes}`);

    if (config.since) {
        console.log(`[production-reminder-heartbeat] since=${config.since.toISOString()}`);
    }

    console.log(`[production-reminder-heartbeat] state=${status.state}`);
    console.log(`[production-reminder-heartbeat] latestRunAt=${status.latestRunAt ?? "<none>"}`);
    console.log(`[production-reminder-heartbeat] latestStatus=${status.latestStatus ?? "<none>"}`);
    console.log(`[production-reminder-heartbeat] lastSuccessAt=${status.lastSuccessAt ?? "<none>"}`);
    console.log(`[production-reminder-heartbeat] lastFailureAt=${status.lastFailureAt ?? "<none>"}`);
    console.log(
        `[production-reminder-heartbeat] minutesSinceLastSuccess=${status.minutesSinceLastSuccess ?? "<none>"}`,
    );
    console.log(`[production-reminder-heartbeat] message=${status.message}`);
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseOptionalDate(value: string | undefined, label: string) {
    const trimmed = value?.trim();

    if (!trimmed) {
        return undefined;
    }

    const parsed = new Date(trimmed);

    if (Number.isNaN(parsed.getTime())) {
        throw new Error(`${label} must be a valid ISO timestamp.`);
    }

    return parsed;
}

function isoOrNull(value: Date | null) {
    return value ? value.toISOString() : null;
}

if (process.argv[1]?.endsWith("production-reminder-heartbeat.ts")) {
    main().catch((error) => {
        console.error("[production-reminder-heartbeat] FAILED");
        console.error(error);
        process.exit(1);
    });
}
