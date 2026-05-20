import { describe, expect, test } from "vitest";

import {
    buildVercelLogArgs,
    hasRecoveredReminderScheduler,
    hasSuccessfulReminderRun,
    parseVercelJsonLogLines,
    summarizeReminderLogs,
} from "./production-reminder-scheduler-check.ts";

describe("production reminder scheduler log check", () => {
    test("ignores Vercel progress text and summarizes reminder status codes", () => {
        const entries = parseVercelJsonLogLines([
            "Retrieving project...",
            JSON.stringify({
                timestamp: 1779294337673,
                deploymentId: "dpl_a",
                requestPath: "/api/jobs/send-reminders",
                responseStatusCode: 401,
            }),
            JSON.stringify({
                timestamp: 1779294937673,
                deploymentId: "dpl_b",
                requestPath: "/api/jobs/send-reminders",
                responseStatusCode: 200,
            }),
            JSON.stringify({
                timestamp: 1779294937674,
                requestPath: "/api/health",
                responseStatusCode: 200,
            }),
        ].join("\n"));

        const summary = summarizeReminderLogs(entries);

        expect(summary).toEqual({
            totalReminderRequests: 2,
            statusCounts: {
                200: 1,
                401: 1,
            },
            latestTimestamp: "2026-05-20T16:35:37.673Z",
            latestDeploymentId: "dpl_b",
        });
        expect(hasSuccessfulReminderRun(summary)).toBe(true);
    });

    test("does not treat unauthenticated probes as a recovered scheduler", () => {
        const summary = summarizeReminderLogs([
            {
                timestamp: 1779294337673,
                requestPath: "/api/jobs/send-reminders",
                responseStatusCode: 401,
            },
        ]);

        expect(summary.statusCounts).toEqual({ 401: 1 });
        expect(hasSuccessfulReminderRun(summary)).toBe(false);
    });

    test("requires durable heartbeat evidence when a 200 may be a dry-run or skipped request", () => {
        const summary = summarizeReminderLogs([
            {
                timestamp: 1779294937673,
                requestPath: "/api/jobs/send-reminders",
                responseStatusCode: 200,
            },
        ]);

        expect(hasSuccessfulReminderRun(summary)).toBe(true);
        expect(hasRecoveredReminderScheduler(summary, { requireHeartbeat: true, heartbeatStatus: null })).toBe(false);
        expect(
            hasRecoveredReminderScheduler(summary, {
                requireHeartbeat: true,
                heartbeatStatus: {
                    ok: true,
                    state: "healthy",
                    message: "Last successful reminder scheduler heartbeat 0 minutes ago.",
                    latestRunAt: "2026-05-20T17:45:00.000Z",
                    latestStatus: "success",
                    lastSuccessAt: "2026-05-20T17:45:00.000Z",
                    lastFailureAt: null,
                    minutesSinceLastSuccess: 0,
                },
            }),
        ).toBe(true);
    });

    test("can target a specific Vercel deployment when project-level logs omit CLI deployments", () => {
        expect(
            buildVercelLogArgs({
                since: "2026-05-20T18:25:00.000Z",
                target: "leaside-fades-3efvguugx-owenjalalis-projects.vercel.app",
            }),
        ).toEqual([
            "logs",
            "leaside-fades-3efvguugx-owenjalalis-projects.vercel.app",
            "--since",
            "2026-05-20T18:25:00.000Z",
            "--query",
            "send-reminders",
            "--limit",
            "100",
            "--json",
            "--no-follow",
        ]);
    });
});
