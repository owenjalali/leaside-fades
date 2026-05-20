import { spawnSync } from "node:child_process";

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

function main() {
    const since = process.env.PRODUCTION_REMINDER_LOG_SINCE || defaultSince();
    const requireSuccess = process.env.PRODUCTION_REMINDER_REQUIRE_SUCCESS !== "0";
    assertSafeCliValue(since, "PRODUCTION_REMINDER_LOG_SINCE");

    const args = [
        "logs",
        "--environment",
        "production",
        "--since",
        since,
        "--query",
        "send-reminders",
        "--limit",
        "100",
        "--json",
        "--no-follow",
    ];

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
    console.log(`[production-reminder-scheduler] totalReminderRequests=${summary.totalReminderRequests}`);
    console.log(`[production-reminder-scheduler] statusCounts=${JSON.stringify(summary.statusCounts)}`);

    if (summary.latestTimestamp) {
        console.log(`[production-reminder-scheduler] latestTimestamp=${summary.latestTimestamp}`);
    }

    if (summary.latestDeploymentId) {
        console.log(`[production-reminder-scheduler] latestDeploymentId=${summary.latestDeploymentId}`);
    }

    if (requireSuccess && !hasSuccessfulReminderRun(summary)) {
        throw new Error("No successful 200 reminder scheduler run was found in the selected Vercel log window.");
    }
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

if (process.argv[1]?.endsWith("production-reminder-scheduler-check.ts")) {
    main();
}
