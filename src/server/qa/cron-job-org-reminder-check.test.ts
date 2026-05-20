import { describe, expect, test } from "vitest";

import {
    buildEveryNMinutesSchedule,
    buildRepairPatch,
    evaluateJob,
    readConfig,
    summarizeHistory,
    type CronJobOrgConfig,
    type CronJobOrgJob,
} from "./cron-job-org-reminder-check.ts";

const baseConfig: CronJobOrgConfig = {
    apiBaseUrl: "https://api.cron-job.org",
    apiKey: "api-key",
    jobId: 7551064,
    expectedUrl: "https://www.leasidefades.com/api/jobs/send-reminders",
    cadenceMinutes: 30,
    expectedSecret: "current-secret",
    apply: false,
};

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
            expectedSecret: "current-secret",
            apply: true,
        });
    });

    test("builds the recommended every-30-minutes cron-job.org schedule", () => {
        expect(buildEveryNMinutesSchedule(30)).toEqual({
            timezone: "America/Toronto",
            expiresAt: 0,
            hours: [-1],
            mdays: [-1],
            minutes: [0, 30],
            months: [-1],
            wdays: [-1],
        });
    });

    test("flags disabled jobs and stale authorization headers as errors", () => {
        const job: CronJobOrgJob = {
            enabled: false,
            url: "https://www.leasidefades.com/api/jobs/send-reminders",
            requestMethod: 0,
            schedule: buildEveryNMinutesSchedule(30),
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
            schedule: buildEveryNMinutesSchedule(30),
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
                schedule: buildEveryNMinutesSchedule(30),
                extendedData: {
                    headers: {
                        Authorization: "Bearer current-secret",
                    },
                    body: "",
                },
            },
        });
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
