import { spawnSync } from "node:child_process";

import dotenv from "dotenv";

import {
    BOOKING_REMINDER_JOB_NAME,
    createDrizzleSchedulerJobRunRepository,
} from "../jobs/scheduler-runs.ts";
import {
    classifyReminderHeartbeat,
    type ReminderHeartbeatStatus,
} from "./production-reminder-heartbeat.ts";

interface ReminderLogEntry {
    timestamp?: number;
    requestPath?: string;
    responseStatusCode?: number;
    deploymentId?: string;
    domain?: string;
}

export interface ReminderLogSummary {
    totalReminderRequests: number;
    statusCounts: Record<number, number>;
    latestTimestamp?: string;
    latestDeploymentId?: string;
}

const DEFAULT_LOOKBACK_HOURS = 24;
const REMINDER_PATH = "/api/jobs/send-reminders";
const DEFAULT_HEARTBEAT_ENV_FILE = ".env.production.local";

export function parseVercelJsonLogLines(output: string): ReminderLogEntry[] {
    const entries: ReminderLogEntry[] = [];

    for (const line of output.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("{")) {
            continue;
        }

        try {
            entries.push(JSON.parse(trimmed) as ReminderLogEntry);
        } catch {
            // Ignore Vercel progress lines or partial JSON fragments.
        }
    }

    return entries;
}

export function summarizeReminderLogs(entries: ReminderLogEntry[]): ReminderLogSummary {
    const reminderEntries = entries.filter((entry) => entry.requestPath === REMINDER_PATH);
    const statusCounts: Record<number, number> = {};
    let latest: ReminderLogEntry | undefined;

    for (const entry of reminderEntries) {
        if (typeof entry.responseStatusCode === "number") {
            statusCounts[entry.responseStatusCode] = (statusCounts[entry.responseStatusCode] ?? 0) + 1;
        }

        if (
            typeof entry.timestamp === "number" &&
            (latest?.timestamp === undefined || entry.timestamp > latest.timestamp)
        ) {
            latest = entry;
        }
    }

    return {
        totalReminderRequests: reminderEntries.length,
        statusCounts,
        latestTimestamp: typeof latest?.timestamp === "number" ? new Date(latest.timestamp).toISOString() : undefined,
        latestDeploymentId: latest?.deploymentId,
    };
}

export function hasSuccessfulReminderRun(summary: ReminderLogSummary) {
    return (summary.statusCounts[200] ?? 0) > 0;
}

export function hasRecoveredReminderScheduler(
    summary: ReminderLogSummary,
    options: { requireHeartbeat?: boolean; heartbeatStatus?: ReminderHeartbeatStatus | null } = {},
) {
    if (!hasSuccessfulReminderRun(summary)) {
        return false;
    }

    return options.requireHeartbeat ? options.heartbeatStatus?.ok === true : true;
}

async function main() {
    const since = process.env.PRODUCTION_REMINDER_LOG_SINCE || defaultSince();
    const logTarget = process.env.PRODUCTION_REMINDER_LOG_TARGET;
    const requireSuccess = process.env.PRODUCTION_REMINDER_REQUIRE_SUCCESS !== "0";
    const requireHeartbeat = process.env.PRODUCTION_REMINDER_REQUIRE_HEARTBEAT !== "0";
    assertSafeCliValue(since, "PRODUCTION_REMINDER_LOG_SINCE");
    if (logTarget) {
        assertSafeCliValue(logTarget, "PRODUCTION_REMINDER_LOG_TARGET");
    }

    const args = buildVercelLogArgs({ since, target: logTarget });

    const result = runVercel(args);

    const output = [result.stdout, result.stderr].filter(Boolean).join("\n");

    if (result.error) {
        throw result.error;
    }

    if (result.status !== 0) {
        console.error(output.trim());
        throw new Error(`vercel logs exited with status ${result.status ?? "unknown"}.`);
    }

    const summary = summarizeReminderLogs(parseVercelJsonLogLines(output));
    console.log(`[production-reminder-scheduler] since=${since}`);
    if (logTarget) {
        console.log(`[production-reminder-scheduler] logTarget=${logTarget}`);
    }
    console.log(`[production-reminder-scheduler] totalReminderRequests=${summary.totalReminderRequests}`);
    console.log(`[production-reminder-scheduler] statusCounts=${JSON.stringify(summary.statusCounts)}`);

    if (summary.latestTimestamp) {
        console.log(`[production-reminder-scheduler] latestTimestamp=${summary.latestTimestamp}`);
    }

    if (summary.latestDeploymentId) {
        console.log(`[production-reminder-scheduler] latestDeploymentId=${summary.latestDeploymentId}`);
    }

    let heartbeatStatus: ReminderHeartbeatStatus | null = null;

    if (requireSuccess && hasSuccessfulReminderRun(summary) && requireHeartbeat) {
        heartbeatStatus = await loadHeartbeatStatus(since);
        console.log(`[production-reminder-scheduler] heartbeatState=${heartbeatStatus.state}`);
        console.log(`[production-reminder-scheduler] heartbeatMessage=${heartbeatStatus.message}`);
        console.log(`[production-reminder-scheduler] heartbeatLastSuccessAt=${heartbeatStatus.lastSuccessAt ?? "<none>"}`);
    }

    if (requireSuccess && !hasRecoveredReminderScheduler(summary, { requireHeartbeat, heartbeatStatus })) {
        throw new Error(
            requireHeartbeat
                ? "No recovered reminder scheduler run was found with both a Vercel 200 log and a durable success heartbeat."
                : "No successful 200 reminder scheduler run was found in the selected Vercel log window.",
        );
    }
}

export function buildVercelLogArgs(input: { since: string; target?: string }) {
    const args = ["logs"];

    if (input.target) {
        args.push(input.target);
    } else {
        args.push("--environment", "production");
    }

    args.push(
        "--since",
        input.since,
        "--query",
        "send-reminders",
        "--limit",
        "100",
        "--json",
        "--no-follow",
    );

    return args;
}

async function loadHeartbeatStatus(logSince: string) {
    const envFile = process.env.PRODUCTION_REMINDER_HEARTBEAT_ENV_FILE || DEFAULT_HEARTBEAT_ENV_FILE;
    dotenv.config({ path: envFile, override: false, quiet: true });

    const repository = createDrizzleSchedulerJobRunRepository();
    const summary = await repository.getJobRunSummary({ jobName: BOOKING_REMINDER_JOB_NAME });
    const since = process.env.PRODUCTION_REMINDER_HEARTBEAT_SINCE || logSince;

    return classifyReminderHeartbeat(summary, {
        now: new Date(),
        staleAfterMinutes: parsePositiveInteger(process.env.PRODUCTION_REMINDER_HEARTBEAT_STALE_AFTER_MINUTES, 90),
        since: new Date(since),
    });
}

function defaultSince() {
    return new Date(Date.now() - DEFAULT_LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();
}

function runVercel(args: string[]) {
    if (process.platform !== "win32") {
        return spawnSync("vercel", args, {
            cwd: process.cwd(),
            encoding: "utf8",
            shell: false,
        });
    }

    for (const arg of args) {
        assertSafeCliValue(arg, "vercel argument");
    }

    const command = ["vercel", ...args].join(" ");
    return spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", command], {
        cwd: process.cwd(),
        encoding: "utf8",
        shell: false,
    });
}

function assertSafeCliValue(value: string, label: string) {
    if (!/^[A-Za-z0-9:._+/=-]+$/.test(value)) {
        throw new Error(`${label} contains unsupported characters for the Vercel CLI check.`);
    }
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

if (process.argv[1]?.endsWith("production-reminder-scheduler-check.ts")) {
    main().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}
