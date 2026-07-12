const DEFAULT_API_BASE_URL = "https://api.cron-job.org";
const DEFAULT_JOB_ID = 7_551_064;
const DEFAULT_EXPECTED_URL = "https://www.leasidefades.com/api/jobs/send-reminders";
const DEFAULT_CADENCE_MINUTES = 30;
// Reminder due-times only occur while the shop takes appointments, so the
// production schedule stays inside these America/Toronto hours. Overnight runs
// would only wake the Neon database for nothing and burn the Free-plan
// monthly compute quota — the failure that once took the booking system down.
const DEFAULT_ACTIVE_START_HOUR = 6;
const DEFAULT_ACTIVE_END_HOUR = 21;

export interface CronJobOrgConfig {
    apiBaseUrl: string;
    apiKey?: string;
    jobId: number;
    expectedUrl: string;
    cadenceMinutes: number;
    activeStartHour: number;
    activeEndHour: number;
    expectedSecret?: string;
    apply: boolean;
}

interface CronJobOrgSchedule {
    timezone?: string;
    expiresAt?: number;
    hours?: number[];
    mdays?: number[];
    minutes?: number[];
    months?: number[];
    wdays?: number[];
}

interface CronJobOrgExtendedData {
    headers?: Record<string, string>;
    body?: string;
}

export interface CronJobOrgJob {
    jobId?: number;
    enabled?: boolean;
    title?: string;
    url?: string;
    requestMethod?: number;
    requestTimeout?: number;
    redirectSuccess?: boolean;
    saveResponses?: boolean;
    schedule?: CronJobOrgSchedule;
    extendedData?: CronJobOrgExtendedData;
    lastStatus?: number;
    lastExecution?: number;
    nextExecution?: number | null;
}

export interface CronJobOrgHistoryItem {
    date?: number;
    status?: number;
    statusText?: string;
    httpStatus?: number;
    duration?: number;
    identifier?: string;
}

export interface CronJobOrgFinding {
    level: "error" | "warning";
    message: string;
}

export interface CronJobOrgHistorySummary {
    total: number;
    statusCounts: Record<number, number>;
    httpStatusCounts: Record<number, number>;
    latestDate?: string;
    latestHttpStatus?: number;
    latestStatusText?: string;
}

function main() {
    const config = readConfig(process.env, process.argv.slice(2));

    run(config)
        .then(() => {
            console.log("[cron-job-org-reminder] Check passed.");
        })
        .catch((error) => {
            console.error("[cron-job-org-reminder] FAILED");
            console.error(error);
            process.exit(1);
        });
}

export function readConfig(
    env: Partial<Record<string, string | undefined>>,
    args: string[] = [],
): CronJobOrgConfig {
    return {
        apiBaseUrl: normalizeUrl(env.CRON_JOB_ORG_API_BASE_URL || DEFAULT_API_BASE_URL),
        apiKey: nonEmpty(env.CRON_JOB_ORG_API_KEY),
        jobId: parsePositiveInteger(env.CRON_JOB_ORG_REMINDER_JOB_ID, DEFAULT_JOB_ID),
        expectedUrl: normalizeUrl(env.CRON_JOB_ORG_REMINDER_URL || DEFAULT_EXPECTED_URL),
        cadenceMinutes: parsePositiveInteger(
            env.CRON_JOB_ORG_REMINDER_CADENCE_MINUTES,
            DEFAULT_CADENCE_MINUTES,
        ),
        activeStartHour: parseHour(
            env.CRON_JOB_ORG_REMINDER_ACTIVE_START_HOUR,
            DEFAULT_ACTIVE_START_HOUR,
        ),
        activeEndHour: parseHour(
            env.CRON_JOB_ORG_REMINDER_ACTIVE_END_HOUR,
            DEFAULT_ACTIVE_END_HOUR,
        ),
        expectedSecret: normalizeSecret(
            env.CRON_JOB_ORG_REMINDER_SECRET || env.CRON_SECRET || env.PRODUCTION_SMOKE_CRON_SECRET,
        ),
        apply: args.includes("--apply") || env.CRON_JOB_ORG_APPLY === "1",
    };
}

export async function run(config: CronJobOrgConfig) {
    if (!config.apiKey) {
        throw new Error(
            "CRON_JOB_ORG_API_KEY is required to inspect cron-job.org job configuration and execution history.",
        );
    }

    logStep(`Inspecting cron-job.org job ${config.jobId}.`);
    const before = await fetchJob(config);
    const history = await fetchHistory(config);
    logJobSummary(before, summarizeHistory(history));

    const beforeFindings = evaluateJob(before, config);

    if (!config.apply) {
        reportFindings(beforeFindings);
        if (hasErrors(beforeFindings)) {
            throw new Error("cron-job.org reminder job does not match the required production configuration.");
        }
        return;
    }

    if (!config.expectedSecret) {
        throw new Error("CRON_SECRET or CRON_JOB_ORG_REMINDER_SECRET is required when running with --apply.");
    }

    await verifyProductionReminderSecret(config);
    logStep("Production reminder endpoint accepted the supplied CRON_SECRET in dry-run mode.");

    logStep("Applying cron-job.org reminder job repair patch.");
    await patchJob(config, buildRepairPatch(config));

    const after = await fetchJob(config);
    const afterFindings = evaluateJob(after, config);
    reportFindings(afterFindings);

    if (hasErrors(afterFindings)) {
        throw new Error("cron-job.org reminder job still does not match the required production configuration.");
    }
}

export function evaluateJob(job: CronJobOrgJob, config: CronJobOrgConfig): CronJobOrgFinding[] {
    const findings: CronJobOrgFinding[] = [];
    const headers = job.extendedData?.headers ?? {};
    const authorization = findHeader(headers, "authorization");

    if (job.enabled !== true) {
        findings.push({
            level: "error",
            message: "Job is disabled; cron-job.org will not call the reminder endpoint.",
        });
    }

    if (normalizeUrl(job.url || "") !== config.expectedUrl) {
        findings.push({
            level: "error",
            message: `Job URL is ${job.url || "<missing>"} instead of ${config.expectedUrl}.`,
        });
    }

    if (job.requestMethod !== undefined && job.requestMethod !== 0) {
        findings.push({
            level: "error",
            message: "Job request method must be GET.",
        });
    }

    if (!authorization) {
        findings.push({
            level: "error",
            message: "Job is missing the Authorization custom header.",
        });
    } else if (!authorization.startsWith("Bearer ")) {
        findings.push({
            level: "error",
            message: "Job Authorization custom header must use Bearer token auth.",
        });
    } else if (config.expectedSecret && authorization !== `Bearer ${config.expectedSecret}`) {
        findings.push({
            level: "error",
            message: "Job Authorization custom header does not match the current CRON_SECRET.",
        });
    } else if (!config.expectedSecret) {
        findings.push({
            level: "warning",
            message: "Authorization header is present, but CRON_SECRET is not set locally so the value was not compared.",
        });
    }

    if (!scheduleMatchesExpected(job.schedule, config)) {
        findings.push({
            level: "warning",
            message:
                `Job schedule is not the expected every-${config.cadenceMinutes}-minutes cadence ` +
                `within America/Toronto hours ${config.activeStartHour}:00-${config.activeEndHour}:59.`,
        });
    }

    if (job.redirectSuccess === true) {
        findings.push({
            level: "warning",
            message: "Job currently treats redirects as success; the production URL should not redirect.",
        });
    }

    return findings;
}

export function buildRepairPatch(config: CronJobOrgConfig) {
    if (!config.expectedSecret) {
        throw new Error("Cannot build repair patch without CRON_SECRET or CRON_JOB_ORG_REMINDER_SECRET.");
    }

    return {
        job: {
            enabled: true,
            saveResponses: true,
            url: config.expectedUrl,
            requestMethod: 0,
            redirectSuccess: false,
            requestTimeout: 30,
            schedule: buildReminderSchedule(config),
            extendedData: {
                headers: {
                    Authorization: `Bearer ${config.expectedSecret}`,
                },
                body: "",
            },
        },
    };
}

export async function verifyProductionReminderSecret(config: CronJobOrgConfig, fetcher: typeof fetch = fetch) {
    if (!config.expectedSecret) {
        throw new Error("CRON_SECRET or CRON_JOB_ORG_REMINDER_SECRET is required for production dry-run verification.");
    }

    const url = new URL(config.expectedUrl);
    url.searchParams.set("dryRun", "1");

    const response = await fetcher(url, {
        headers: {
            authorization: `Bearer ${config.expectedSecret}`,
        },
    });
    const bodyText = await response.text();
    let body: unknown = {};

    if (bodyText) {
        try {
            body = JSON.parse(bodyText);
        } catch {
            body = { raw: bodyText.slice(0, 500) };
        }
    }

    if (response.status !== 200) {
        throw new Error(
            `Production reminder dry-run rejected the supplied CRON_SECRET with HTTP ${response.status}. Body: ${bodyText.slice(0, 500)}`,
        );
    }

    if (!isRecord(body) || body.ok !== true || body.dryRun !== true) {
        throw new Error("Production reminder dry-run did not return the expected ok dryRun response.");
    }
}

export function buildReminderSchedule(input: {
    cadenceMinutes: number;
    activeStartHour: number;
    activeEndHour: number;
}): CronJobOrgSchedule {
    if (
        !Number.isInteger(input.cadenceMinutes) ||
        input.cadenceMinutes < 1 ||
        input.cadenceMinutes > 60 ||
        60 % input.cadenceMinutes !== 0
    ) {
        throw new Error("Cron cadence must be an integer divisor of 60 minutes.");
    }

    if (
        !Number.isInteger(input.activeStartHour) ||
        !Number.isInteger(input.activeEndHour) ||
        input.activeStartHour < 0 ||
        input.activeEndHour > 23 ||
        input.activeStartHour > input.activeEndHour
    ) {
        throw new Error("Active hours must satisfy 0 <= start <= end <= 23.");
    }

    return {
        timezone: "America/Toronto",
        expiresAt: 0,
        hours: Array.from(
            { length: input.activeEndHour - input.activeStartHour + 1 },
            (_, index) => input.activeStartHour + index,
        ),
        mdays: [-1],
        minutes: Array.from({ length: 60 / input.cadenceMinutes }, (_, index) => index * input.cadenceMinutes),
        months: [-1],
        wdays: [-1],
    };
}

export function summarizeHistory(history: CronJobOrgHistoryItem[]): CronJobOrgHistorySummary {
    const statusCounts: Record<number, number> = {};
    const httpStatusCounts: Record<number, number> = {};
    let latest: CronJobOrgHistoryItem | undefined;

    for (const item of history) {
        if (typeof item.status === "number") {
            statusCounts[item.status] = (statusCounts[item.status] ?? 0) + 1;
        }

        if (typeof item.httpStatus === "number") {
            httpStatusCounts[item.httpStatus] = (httpStatusCounts[item.httpStatus] ?? 0) + 1;
        }

        if (typeof item.date === "number" && (latest?.date === undefined || item.date > latest.date)) {
            latest = item;
        }
    }

    return {
        total: history.length,
        statusCounts,
        httpStatusCounts,
        latestDate: latest?.date ? new Date(latest.date * 1000).toISOString() : undefined,
        latestHttpStatus: latest?.httpStatus,
        latestStatusText: latest?.statusText,
    };
}

async function fetchJob(config: CronJobOrgConfig): Promise<CronJobOrgJob> {
    const body = await cronJobOrgJson(config, `/jobs/${config.jobId}`);
    const jobDetails = (body as { jobDetails?: unknown }).jobDetails;

    if (Array.isArray(jobDetails)) {
        const [job] = jobDetails;
        return assertJob(job);
    }

    return assertJob(jobDetails);
}

async function fetchHistory(config: CronJobOrgConfig): Promise<CronJobOrgHistoryItem[]> {
    const body = await cronJobOrgJson(config, `/jobs/${config.jobId}/history`);
    const history = (body as { history?: unknown }).history;
    return Array.isArray(history) ? history.map(assertHistoryItem) : [];
}

async function patchJob(config: CronJobOrgConfig, payload: unknown) {
    await cronJobOrgJson(config, `/jobs/${config.jobId}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
    });
}

async function cronJobOrgJson(config: CronJobOrgConfig, path: string, init: RequestInit = {}) {
    const response = await fetch(`${config.apiBaseUrl}${path}`, {
        ...init,
        headers: {
            accept: "application/json",
            authorization: `Bearer ${config.apiKey}`,
            ...init.headers,
        },
    });
    const bodyText = await response.text();
    const body = bodyText ? JSON.parse(bodyText) : {};

    if (!response.ok) {
        throw new Error(`cron-job.org ${path} returned HTTP ${response.status}: ${bodyText.slice(0, 500)}`);
    }

    return body;
}

function assertJob(value: unknown): CronJobOrgJob {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("cron-job.org job details response did not include a job object.");
    }

    return value as CronJobOrgJob;
}

function assertHistoryItem(value: unknown): CronJobOrgHistoryItem {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as CronJobOrgHistoryItem) : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function scheduleMatchesExpected(schedule: CronJobOrgSchedule | undefined, config: CronJobOrgConfig) {
    if (!schedule) {
        return false;
    }

    const expected = buildReminderSchedule(config);
    return (
        arrayEquals(schedule.hours, expected.hours) &&
        arrayEquals(schedule.mdays, expected.mdays) &&
        arrayEquals(schedule.minutes, expected.minutes) &&
        arrayEquals(schedule.months, expected.months) &&
        arrayEquals(schedule.wdays, expected.wdays) &&
        (schedule.expiresAt ?? 0) === 0
    );
}

function arrayEquals(left: number[] | undefined, right: number[] | undefined) {
    return JSON.stringify(left ?? []) === JSON.stringify(right ?? []);
}

function findHeader(headers: Record<string, string>, target: string) {
    const match = Object.entries(headers).find(([key]) => key.toLowerCase() === target.toLowerCase());
    return match?.[1];
}

function hasErrors(findings: CronJobOrgFinding[]) {
    return findings.some((finding) => finding.level === "error");
}

function reportFindings(findings: CronJobOrgFinding[]) {
    if (findings.length === 0) {
        logStep("cron-job.org job configuration matches the required production reminder setup.");
        return;
    }

    for (const finding of findings) {
        console.log(`[cron-job-org-reminder] ${finding.level.toUpperCase()}: ${finding.message}`);
    }
}

function logJobSummary(job: CronJobOrgJob, history: CronJobOrgHistorySummary) {
    logStep(`title=${job.title || "<untitled>"} enabled=${String(job.enabled)} url=${job.url || "<missing>"}`);
    logStep(
        `lastStatus=${job.lastStatus ?? "<unknown>"} lastExecution=${formatUnixSeconds(job.lastExecution)} nextExecution=${formatUnixSeconds(job.nextExecution)}`,
    );
    logStep(
        `history total=${history.total} statuses=${JSON.stringify(history.statusCounts)} httpStatuses=${JSON.stringify(history.httpStatusCounts)}`,
    );

    if (history.latestDate) {
        logStep(
            `latestHistory date=${history.latestDate} httpStatus=${history.latestHttpStatus ?? "<none>"} statusText=${history.latestStatusText || "<none>"}`,
        );
    }
}

function formatUnixSeconds(value: number | null | undefined) {
    return typeof value === "number" ? new Date(value * 1000).toISOString() : "<none>";
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseHour(value: string | undefined, fallback: number) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 && parsed <= 23 ? parsed : fallback;
}

function normalizeUrl(value: string) {
    return value.replace(/\/+$/, "");
}

function normalizeSecret(value: string | undefined) {
    const trimmed = value?.trim();
    if (!trimmed) {
        return undefined;
    }

    const unquoted =
        (trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))
            ? trimmed.slice(1, -1).trim()
            : trimmed;

    return unquoted ? unquoted : undefined;
}

function nonEmpty(value: string | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
}

function logStep(message: string) {
    console.log(`[cron-job-org-reminder] ${message}`);
}

if (process.argv[1]?.endsWith("cron-job-org-reminder-check.ts")) {
    main();
}
