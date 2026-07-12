import { describe, expect, test } from "vitest";

import {
    buildReminderSchedule,
    buildRepairPatch,
    evaluateJob,
    readConfig,
    summarizeHistory,
    verifyProductionReminderSecret,
    type CronJobOrgConfig,
    type CronJobOrgJob,
} from "./cron-job-org-reminder-check.ts";

const baseConfig: CronJobOrgConfig = {
    apiBaseUrl: "https://api.cron-job.org",
    apiKey: "api-key",
    jobId: 7551064,
    expectedUrl: "https://www.leasidefades.com/api/jobs/send-reminders",
    cadenceMinutes: 30,
    activeStartHour: 6,
    activeEndHour: 21,
    expectedSecret: "current-secret",
    apply: false,
};

function businessHoursSchedule() {
    return buildReminderSchedule({ cadenceMinutes: 30, activeStartHour: 6, activeEndHour: 21 });
}

describe("cron-job.org reminder check", () => {
    test("reads default job configuration without printing or requiring secrets", () => {
        const config = readConfig(
            {
                CRON_JOB_ORG_API_BASE_URL: "https://api.example.com/",
                CRON_JOB_ORG_API_KEY: " api-key ",
                CRON_SECRET: " current-secret ",
            },
            ["--apply"],
        );

        expect(config).toEqual({
            apiBaseUrl: "https://api.example.com",
            apiKey: "api-key",
            jobId: 7551064,
            expectedUrl: "https://www.leasidefades.com/api/jobs/send-reminders",
            cadenceMinutes: 30,
            activeStartHour: 6,
            activeEndHour: 21,
            expectedSecret: "current-secret",
            apply: true,
        });
    });

    test("supports overriding the active-hours window through the environment", () => {
        const config = readConfig({
            CRON_JOB_ORG_REMINDER_ACTIVE_START_HOUR: "5",
            CRON_JOB_ORG_REMINDER_ACTIVE_END_HOUR: "22",
        });

        expect(config.activeStartHour).toBe(5);
        expect(config.activeEndHour).toBe(22);

        const invalid = readConfig({
            CRON_JOB_ORG_REMINDER_ACTIVE_START_HOUR: "24",
            CRON_JOB_ORG_REMINDER_ACTIVE_END_HOUR: "not-a-number",
        });

        expect(invalid.activeStartHour).toBe(6);
        expect(invalid.activeEndHour).toBe(21);
    });

    test("normalizes quoted or empty pulled Vercel cron secrets", () => {
        expect(
            readConfig({
                CRON_SECRET: '"current-secret"',
            }).expectedSecret,
        ).toBe("current-secret");

        expect(
            readConfig({
                CRON_SECRET: '""',
            }).expectedSecret,
        ).toBeUndefined();
    });

    test("builds the recommended business-hours cron-job.org schedule", () => {
        expect(businessHoursSchedule()).toEqual({
            timezone: "America/Toronto",
            expiresAt: 0,
            hours: [6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21],
            mdays: [-1],
            minutes: [0, 30],
            months: [-1],
            wdays: [-1],
        });
    });

    test("flags a round-the-clock schedule so repairs cannot regress the Neon quota fix", () => {
        const job: CronJobOrgJob = {
            enabled: true,
            url: "https://www.leasidefades.com/api/jobs/send-reminders",
            requestMethod: 0,
            redirectSuccess: false,
            schedule: {
                timezone: "America/Toronto",
                expiresAt: 0,
                hours: [-1],
                mdays: [-1],
                minutes: [0, 30],
                months: [-1],
                wdays: [-1],
            },
            extendedData: {
                headers: {
                    authorization: "Bearer current-secret",
                },
            },
        };

        expect(evaluateJob(job, baseConfig)).toEqual([
            {
                level: "warning",
                message:
                    "Job schedule is not the expected every-30-minutes cadence " +
                    "within America/Toronto hours 6:00-21:59.",
            },
        ]);
    });

    test("flags disabled jobs and stale authorization headers as errors", () => {
        const job: CronJobOrgJob = {
            enabled: false,
            url: "https://www.leasidefades.com/api/jobs/send-reminders",
            requestMethod: 0,
            schedule: businessHoursSchedule(),
            extendedData: {
                headers: {
                    Authorization: "Bearer old-secret",
                },
            },
        };

        expect(evaluateJob(job, baseConfig)).toEqual([
            {
                level: "error",
                message: "Job is disabled; cron-job.org will not call the reminder endpoint.",
            },
            {
                level: "error",
                message: "Job Authorization custom header does not match the current CRON_SECRET.",
            },
        ]);
    });

    test("accepts enabled job with matching url, bearer secret, and cadence", () => {
        const job: CronJobOrgJob = {
            enabled: true,
            url: "https://www.leasidefades.com/api/jobs/send-reminders",
            requestMethod: 0,
            redirectSuccess: false,
            schedule: businessHoursSchedule(),
            extendedData: {
                headers: {
                    authorization: "Bearer current-secret",
                },
            },
        };

        expect(evaluateJob(job, baseConfig)).toEqual([]);
    });

    test("builds repair patch without exposing the secret except in the API payload", () => {
        expect(buildRepairPatch(baseConfig)).toEqual({
            job: {
                enabled: true,
                saveResponses: true,
                url: "https://www.leasidefades.com/api/jobs/send-reminders",
                requestMethod: 0,
                redirectSuccess: false,
                requestTimeout: 30,
                schedule: businessHoursSchedule(),
                extendedData: {
                    headers: {
                        Authorization: "Bearer current-secret",
                    },
                    body: "",
                },
            },
        });
    });

    test("verifies the supplied secret against the production dry-run endpoint", async () => {
        const seen: { url?: string; authorization?: string } = {};
        const fetcher: typeof fetch = async (input, init) => {
            seen.url = input.toString();
            seen.authorization = new Headers(init?.headers).get("authorization") ?? undefined;
            return Response.json({ ok: true, dryRun: true }, { status: 200 });
        };

        await verifyProductionReminderSecret(baseConfig, fetcher);

        expect(seen.url).toBe("https://www.leasidefades.com/api/jobs/send-reminders?dryRun=1");
        expect(seen.authorization).toBe("Bearer current-secret");
    });

    test("rejects secrets that production does not accept before cron-job.org repair", async () => {
        const fetcher: typeof fetch = async () => Response.json({ error: "Unauthorized" }, { status: 401 });

        await expect(verifyProductionReminderSecret(baseConfig, fetcher)).rejects.toThrow(
            "Production reminder dry-run rejected the supplied CRON_SECRET with HTTP 401",
        );
    });

    test("summarizes execution history with HTTP status counts", () => {
        expect(
            summarizeHistory([
                { date: 1779296731, status: 4, statusText: "Failed (HTTP error)", httpStatus: 401 },
                { date: 1779298531, status: 1, statusText: "OK", httpStatus: 200 },
                { date: 1779294931, status: 4, statusText: "Failed (HTTP error)", httpStatus: 401 },
            ]),
        ).toEqual({
            total: 3,
            statusCounts: { 1: 1, 4: 2 },
            httpStatusCounts: { 200: 1, 401: 2 },
            latestDate: "2026-05-20T17:35:31.000Z",
            latestHttpStatus: 200,
            latestStatusText: "OK",
        });
    });
});
