import { describe, expect, test } from "vitest";

import {
    getReminderHttpScheduleDecision,
    reminderHttpBoundaryGraceMinutesFromEnv,
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

    test("defaults to a small post-boundary grace window for delayed schedulers", () => {
        expect(reminderHttpBoundaryGraceMinutesFromEnv({}, 30)).toBe(2);
        expect(reminderHttpBoundaryGraceMinutesFromEnv({ REMINDER_HTTP_BOUNDARY_GRACE_MINUTES: "0" }, 30)).toBe(0);
        expect(reminderHttpBoundaryGraceMinutesFromEnv({ REMINDER_HTTP_BOUNDARY_GRACE_MINUTES: "not-a-number" }, 30)).toBe(2);
        expect(reminderHttpBoundaryGraceMinutesFromEnv({ REMINDER_HTTP_BOUNDARY_GRACE_MINUTES: "10" }, 30)).toBe(5);
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
            boundaryGraceMinutes: 2,
        });
    });

    test("runs shortly after the configured minute boundary when a scheduler is delayed", () => {
        expect(
            getReminderHttpScheduleDecision({
                now: new Date("2026-05-20T15:31:12.000Z"),
                intervalMinutes: 30,
            }),
        ).toEqual({
            shouldRun: true,
            intervalMinutes: 30,
            boundaryGraceMinutes: 2,
        });
    });

    test("runs off-boundary when the last successful heartbeat is stale", () => {
        expect(
            getReminderHttpScheduleDecision({
                now: new Date("2026-05-20T20:34:12.000Z"),
                intervalMinutes: 30,
                lastSuccessAt: new Date("2026-05-20T18:30:24.875Z"),
            }),
        ).toEqual({
            shouldRun: true,
            intervalMinutes: 30,
            boundaryGraceMinutes: 2,
            lastSuccessAt: "2026-05-20T18:30:24.875Z",
            minutesSinceLastSuccess: 123,
        });
    });

    test("skips off-boundary when a recent successful heartbeat already satisfies the cadence", () => {
        expect(
            getReminderHttpScheduleDecision({
                now: new Date("2026-05-20T20:34:12.000Z"),
                intervalMinutes: 30,
                lastSuccessAt: new Date("2026-05-20T20:30:24.875Z"),
            }),
        ).toEqual({
            shouldRun: false,
            intervalMinutes: 30,
            boundaryGraceMinutes: 2,
            reason: "recent_success",
            nextRunAt: "2026-05-20T21:00:24.875Z",
            lastSuccessAt: "2026-05-20T20:30:24.875Z",
            minutesSinceLastSuccess: 3,
        });
    });

    test("runs when the previous success trails its tick by cold-start drift (28 minutes ago)", () => {
        // A */30 cron fires exactly 30 minutes after the previous tick, but the
        // previous run's success timestamp lags its tick by connect latency, so
        // the on-time next tick measures 28-29 minutes. The grace must absorb it.
        expect(
            getReminderHttpScheduleDecision({
                now: new Date("2026-05-20T21:00:05.000Z"),
                intervalMinutes: 30,
                lastSuccessAt: new Date("2026-05-20T20:31:40.000Z"),
            }),
        ).toEqual({
            shouldRun: true,
            intervalMinutes: 30,
            boundaryGraceMinutes: 2,
            lastSuccessAt: "2026-05-20T20:31:40.000Z",
            minutesSinceLastSuccess: 28,
        });
    });

    test("still skips inside the graced cadence window (27 minutes ago)", () => {
        expect(
            getReminderHttpScheduleDecision({
                now: new Date("2026-05-20T20:58:41.000Z"),
                intervalMinutes: 30,
                lastSuccessAt: new Date("2026-05-20T20:31:40.000Z"),
            }),
        ).toEqual({
            shouldRun: false,
            intervalMinutes: 30,
            boundaryGraceMinutes: 2,
            reason: "recent_success",
            nextRunAt: "2026-05-20T21:01:40.000Z",
            lastSuccessAt: "2026-05-20T20:31:40.000Z",
            minutesSinceLastSuccess: 27,
        });
    });

    test("can establish the first live heartbeat when no previous success exists", () => {
        expect(
            getReminderHttpScheduleDecision({
                now: new Date("2026-05-20T20:34:12.000Z"),
                intervalMinutes: 30,
                runWhenNoSuccess: true,
            }),
        ).toEqual({
            shouldRun: true,
            intervalMinutes: 30,
            boundaryGraceMinutes: 2,
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
            boundaryGraceMinutes: 2,
            reason: "outside_scheduled_boundary",
            nextRunAt: "2026-05-20T16:00:00.000Z",
        });
    });
});
