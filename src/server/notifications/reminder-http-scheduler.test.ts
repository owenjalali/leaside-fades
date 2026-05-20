import { describe, expect, test } from "vitest";

import {
    getReminderHttpScheduleDecision,
    reminderHttpIntervalFromEnv,
} from "./reminder-http-scheduler.ts";

describe("reminder HTTP scheduler guard", () => {
    test("defaults to a 30 minute database cadence for quota-limited hosted databases", () => {
        expect(reminderHttpIntervalFromEnv({})).toBe(30);
    });

    test("ignores unsupported or malformed cadence values", () => {
        expect(reminderHttpIntervalFromEnv({ REMINDER_HTTP_MIN_INTERVAL_MINUTES: "0" })).toBe(30);
        expect(reminderHttpIntervalFromEnv({ REMINDER_HTTP_MIN_INTERVAL_MINUTES: "7" })).toBe(30);
        expect(reminderHttpIntervalFromEnv({ REMINDER_HTTP_MIN_INTERVAL_MINUTES: "30.5" })).toBe(30);
        expect(reminderHttpIntervalFromEnv({ REMINDER_HTTP_MIN_INTERVAL_MINUTES: "not-a-number" })).toBe(30);
    });

    test("allows paid environments to opt back into every cron invocation", () => {
        expect(reminderHttpIntervalFromEnv({ REMINDER_HTTP_MIN_INTERVAL_MINUTES: "5" })).toBe(5);
    });

    test("runs on the configured minute boundary", () => {
        expect(
            getReminderHttpScheduleDecision({
                now: new Date("2026-05-20T15:30:12.000Z"),
                intervalMinutes: 30,
            }),
        ).toEqual({
            shouldRun: true,
            intervalMinutes: 30,
        });
    });

    test("skips off-boundary cron calls before opening a database connection", () => {
        expect(
            getReminderHttpScheduleDecision({
                now: new Date("2026-05-20T15:35:12.000Z"),
                intervalMinutes: 30,
            }),
        ).toEqual({
            shouldRun: false,
            intervalMinutes: 30,
            reason: "outside_scheduled_boundary",
            nextRunAt: "2026-05-20T16:00:00.000Z",
        });
    });
});
