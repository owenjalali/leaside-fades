import { describe, expect, test } from "vitest";

import {
    buildAdminBookingQuery,
    buildAdminScheduleQuery,
    buildDashboardChartScale,
    buildDashboardPeriodRange,
    buildCalendarUnavailableRanges,
    buildBookingDragPayload,
    buildBlockedTimePayload,
    buildCalendarBoardRows,
    buildCalendarTimeSlots,
    buildCalendarWorkingWindows,
    buildDateRangeForView,
    buildMonthDays,
    buildWeekDays,
    buildDeleteSchedulePeriodPlan,
    buildTemporarySchedulePlan,
    buildWeeklyScheduleDraft,
    buildWeeklyScheduleSavePlan,
    describeSchedulePeriod,
    formatLocalDateLabel,
    listWeeklyShiftPatterns,
    localDateWeekday,
    weekdaysInLocalDateRange,
    weeklyShiftPatternKey,
    weeklyShiftPatternLabel,
    bookingFallsOutsideWorkingWindows,
    calendarRangeFitsWorkingWindows,
    calculateWeeklyScheduleHours,
    clearWeeklyScheduleDay,
    estimateMobileCalendarGridHeight,
    formatCompactDashboardCurrency,
    formatDashboardPeriodLabel,
    formatAdminStatus,
    formatDashboardCurrency,
    copyWeeklyScheduleDay,
    compactNotificationFailureMessage,
    duplicateWeeklyScheduleWindow,
    getBookingCardTone,
    getBookingToneClasses,
    getActiveNotificationFailures,
    getCalendarInitialScrollTop,
    getScheduledCalendarBarbers,
    formatScheduleWindow,
    getWeeklyCopyTargetDayOptions,
    groupBookingsByLocalDate,
    groupShiftsByBarberAndWeekday,
    mobileAdminCalendarLayoutBudget,
    moveWeeklyScheduleWindow,
    navigateCalendarDate,
    navigateDashboardPeriod,
    notificationFilterMatches,
    resizeWeeklyScheduleWindow,
    seriesHasDashboardData,
    snapWeeklyScheduleClock,
    summarizeNotificationHealth,
    validateWeeklyScheduleDraft,
} from "./admin-utils";
import type {
    AdminBookingSummary,
    AdminCalendarOptions,
    AdminDashboardActivity,
    AdminSchedule,
    AdminShift,
    SafeAdminUser,
} from "./types";

const bookingA: AdminBookingSummary = {
    id: "booking-a",
    barberId: "barber-a",
    barberName: "Sam To",
    locationId: "location-a",
    locationName: "Leaside Fades Eglinton",
    customerName: "Ada Lovelace",
    customerEmail: "ada@example.com",
    customerPhone: "+16475550199",
    status: "confirmed",
    source: "public",
    startTime: "2026-04-27T14:00:00.000Z",
    endTime: "2026-04-27T14:30:00.000Z",
    totalDurationMinutes: 30,
    services: ["Men's Cut"],
};

const bookingB: AdminBookingSummary = {
    ...bookingA,
    id: "booking-b",
    startTime: "2026-04-28T15:00:00.000Z",
    endTime: "2026-04-28T15:30:00.000Z",
};

const failedNotificationActivity = {
    id: "failed-historical",
    bookingId: "booking-a",
    eventType: "booking_confirmation",
    status: "failed",
    channel: "email",
    recipientType: "customer",
    recipientLabel: "Customer Email a***@example.com",
    customerName: "Ada Lovelace",
    barberId: "barber-a",
    barberName: "Sam To",
    locationName: "Leaside Fades Eglinton",
    appointmentStatus: "confirmed",
    appointmentSource: "public",
    appointmentStartTime: "2026-05-02T19:00:00.000Z",
    appointmentEndTime: "2026-05-02T19:30:00.000Z",
    services: ["Men's Cut"],
    createdAt: "2026-05-02T13:00:00.000Z",
    updatedAt: "2026-05-02T13:00:00.000Z",
    sentAt: null,
    scheduledFor: null,
    errorMessage:
        "The leasidefades.com domain is not verified. Please, add and verify your domain on https://resend.com/domains",
    provider: "resend",
    providerMessageId: null,
    attemptCount: 15,
    lastAttemptAt: "2026-05-02T13:00:00.000Z",
    isActiveFailure: false,
    failureCategory: "provider_config",
    failureSummary: "Email provider configuration issue",
} as AdminDashboardActivity;

describe("Phase 6 admin UI utilities", () => {
    test("builds Sunday-start week days for the selected date", () => {
        expect(buildWeekDays("2026-04-29").map((day) => day.date)).toEqual([
            "2026-04-26",
            "2026-04-27",
            "2026-04-28",
            "2026-04-29",
            "2026-04-30",
            "2026-05-01",
            "2026-05-02",
        ]);
    });

    test("builds a full month grid including leading and trailing week days", () => {
        const days = buildMonthDays("2026-04-15");

        expect(days[0].date).toBe("2026-03-29");
        expect(days[days.length - 1]?.date).toBe("2026-05-02");
        expect(days).toHaveLength(35);
        expect(days.filter((day) => day.inCurrentMonth)).toHaveLength(30);
    });

    test("keeps month fetch ranges separate from the selected month anchor", () => {
        expect(buildDateRangeForView("month", "2026-05-08")).toEqual({
            from: "2026-04-26",
            to: "2026-06-06",
        });
        expect(buildMonthDays("2026-05-08").filter((day) => day.inCurrentMonth)).toHaveLength(31);
    });

    test("navigates month view by calendar month instead of fixed day counts", () => {
        expect(navigateCalendarDate("month", "2026-05-08", 1)).toBe("2026-06-08");
        expect(navigateCalendarDate("month", "2026-05-08", -1)).toBe("2026-04-08");
        expect(navigateCalendarDate("month", "2026-03-31", -1)).toBe("2026-02-28");
    });

    test("serializes only active booking filters", () => {
        expect(
            buildAdminBookingQuery({
                from: "2026-04-27",
                to: "2026-04-27",
                locationId: "location-a",
                barberId: "",
                status: "confirmed",
            }),
        ).toBe("from=2026-04-27&to=2026-04-27&locationId=location-a&status=confirmed");
    });

    test("groups bookings by Toronto local date", () => {
        expect(groupBookingsByLocalDate([bookingA, bookingB])).toEqual({
            "2026-04-27": [bookingA],
            "2026-04-28": [bookingB],
        });
    });

    test("formats booking status labels for compact UI surfaces", () => {
        expect(formatAdminStatus("confirmed")).toBe("Confirmed");
        expect(formatAdminStatus("no_show")).toBe("No show");
    });

    test("keeps historical failed notifications in failed history while excluding them from active issues", () => {
        const activeFailure = {
            ...failedNotificationActivity,
            id: "active-failure",
            isActiveFailure: true,
        };

        expect(getActiveNotificationFailures([failedNotificationActivity, activeFailure])).toEqual([
            activeFailure,
        ]);
        expect(notificationFilterMatches(failedNotificationActivity, "failed")).toBe(true);
    });

    test("trims long provider failure messages for dashboard cards", () => {
        expect(compactNotificationFailureMessage(failedNotificationActivity.errorMessage, failedNotificationActivity.failureSummary)).toBe(
            "Email provider configuration issue",
        );
        expect(compactNotificationFailureMessage("x".repeat(180), null)).toHaveLength(117);
    });

    test("formats dashboard currency for full and compact chart labels", () => {
        expect(formatDashboardCurrency(269400)).toBe("CA$ 2,694");
        expect(formatCompactDashboardCurrency(120000)).toBe("CA$ 1.2k");
        expect(formatCompactDashboardCurrency(0)).toBe("CA$ 0");
    });

    test("builds stable dashboard chart scales for empty and large data", () => {
        expect(buildDashboardChartScale([])).toEqual({ max: 1, ticks: [1, 0.75, 0.5, 0.25, 0] });
        expect(buildDashboardChartScale([0, 3000, 12500]).max).toBe(15000);
        expect(seriesHasDashboardData([{ totalCents: 0 }, { totalCents: 0 }], "totalCents")).toBe(false);
        expect(seriesHasDashboardData([{ totalCents: 0 }, { totalCents: 1 }], "totalCents")).toBe(true);
    });

    test("builds dashboard revenue period labels and navigation", () => {
        expect(buildDashboardPeriodRange("week", "2026-06-09")).toEqual({
            period: "week",
            anchorDate: "2026-06-09",
            periodStart: "2026-06-03",
            periodEnd: "2026-06-09",
        });
        expect(buildDashboardPeriodRange("month", "2026-06-09")).toEqual({
            period: "month",
            anchorDate: "2026-06-09",
            periodStart: "2026-06-01",
            periodEnd: "2026-06-30",
        });
        expect(buildDashboardPeriodRange("year", "2026-06-09")).toEqual({
            period: "year",
            anchorDate: "2026-06-09",
            periodStart: "2026-01-01",
            periodEnd: "2026-12-31",
        });
        expect(buildDashboardPeriodRange("all-time", "2026-06-09")).toEqual({
            period: "all-time",
            anchorDate: "2026-06-09",
            periodStart: "2026-06-09",
            periodEnd: "2026-06-09",
        });
        expect(navigateDashboardPeriod("week", "2026-06-09", -1)).toBe("2026-06-02");
        expect(navigateDashboardPeriod("month", "2026-03-31", -1)).toBe("2026-02-28");
        expect(navigateDashboardPeriod("year", "2026-06-09", 1)).toBe("2027-06-09");
        expect(navigateDashboardPeriod("all-time", "2026-06-09", 1)).toBe("2026-06-09");
        expect(formatDashboardPeriodLabel("week", "2026-06-03", "2026-06-09")).toBe("Jun 3-Jun 9, 2026");
        expect(formatDashboardPeriodLabel("month", "2026-06-01", "2026-06-30")).toBe("June 2026");
        expect(formatDashboardPeriodLabel("year", "2026-01-01", "2026-12-31")).toBe("2026");
        expect(formatDashboardPeriodLabel("all-time", "2025-12-31", "2026-05-18")).toBe("All time");
    });

    test("summarizes notification health for compact dashboard panels", () => {
        expect(
            summarizeNotificationHealth({
                sentCount: 18,
                scheduledCount: 11,
                skippedCount: 3,
                failedActiveCount: 2,
                failedHistoricalCount: 4,
                deliverySuccessRate: 90,
                reminderQueueCount: 11,
                reminderScheduler: {
                    state: "healthy",
                    latestRunAt: "2026-05-20T16:30:00.000Z",
                    latestStatus: "success",
                    lastSuccessAt: "2026-05-20T16:30:00.000Z",
                    lastFailureAt: null,
                    minutesSinceLastSuccess: 12,
                    staleAfterMinutes: 90,
                    trigger: "http",
                    durationMs: 141,
                    errorMessage: null,
                    latestResult: { scanned: 0 },
                    message: "Last successful reminder scheduler run 12 minutes ago.",
                },
            }),
        ).toEqual(["90% delivery success", "2 active issues", "11 reminders queued", "Scheduler healthy"]);
    });
});

const shiftA: AdminShift = {
    id: "shift-a",
    barberId: "barber-a",
    locationId: "location-a",
    dayOfWeek: 1,
    startTime: "10:00",
    endTime: "13:00",
    effectiveFrom: null,
    effectiveTo: null,
    active: true,
};

const shiftB: AdminShift = {
    ...shiftA,
    id: "shift-b",
    dayOfWeek: 3,
    startTime: "14:00",
    endTime: "19:00",
};

describe("Phase 7 schedule UI utilities", () => {
    test("serializes only active schedule query filters", () => {
        expect(buildAdminScheduleQuery({ from: "2026-05-01", to: "" })).toBe("from=2026-05-01");
    });

    test("groups shifts by barber and weekday for the recurring schedule grid", () => {
        expect(groupShiftsByBarberAndWeekday([shiftA, shiftB])).toEqual({
            "barber-a": {
                1: [shiftA],
                3: [shiftB],
            },
        });
    });

    test("formats local schedule windows for compact shift chips", () => {
        expect(formatScheduleWindow("10:00", "19:00")).toBe("10:00 AM - 7:00 PM");
        expect(formatScheduleWindow("11:15", "15:45")).toBe("11:15 AM - 3:45 PM");
    });

    test("builds weekly copy target days without copying a day onto itself", () => {
        expect(getWeeklyCopyTargetDayOptions(1)).toEqual([
            { dayOfWeek: 2, label: "Tue" },
            { dayOfWeek: 3, label: "Wed" },
            { dayOfWeek: 4, label: "Thu" },
            { dayOfWeek: 5, label: "Fri" },
            { dayOfWeek: 6, label: "Sat" },
            { dayOfWeek: 0, label: "Sun" },
        ]);

        expect(getWeeklyCopyTargetDayOptions(0).map((option) => option.label)).toEqual([
            "Mon",
            "Tue",
            "Wed",
            "Thu",
            "Fri",
            "Sat",
        ]);
    });

    test("builds a selected barber weekly draft with inactive days and split windows", () => {
        const schedule: AdminSchedule = {
            locations: [
                { id: "location-a", name: "Eglinton", sortOrder: 1 },
                { id: "location-b", name: "Millwood", sortOrder: 2 },
            ],
            barbers: [
                { id: "barber-a", displayName: "Laura Nguyen", locationIds: ["location-a", "location-b"], sortOrder: 1 },
                { id: "barber-b", displayName: "Sam To", locationIds: ["location-a"], sortOrder: 2 },
            ],
            shifts: [
                shiftA,
                { ...shiftA, id: "shift-a-2", startTime: "15:00", endTime: "19:00", locationId: "location-b" },
                shiftB,
                { ...shiftA, id: "shift-other", barberId: "barber-b", dayOfWeek: 2 },
                { ...shiftA, id: "inactive", dayOfWeek: 4, active: false },
            ],
            shiftOverrides: [],
            blockedTimes: [],
        };

        const draft = buildWeeklyScheduleDraft(schedule, "barber-a");

        expect(draft.barberId).toBe("barber-a");
        expect(draft.effectiveFrom).toBe("");
        expect(draft.sourceShiftIds).toEqual(["shift-a", "shift-a-2", "shift-b"]);
        expect(draft.days[1]).toMatchObject({
            dayOfWeek: 1,
            active: true,
            windows: [
                { shiftId: "shift-a", locationId: "location-a", startTime: "10:00", endTime: "13:00" },
                { shiftId: "shift-a-2", locationId: "location-b", startTime: "15:00", endTime: "19:00" },
            ],
        });
        expect(draft.days[2]).toMatchObject({ dayOfWeek: 2, active: false, windows: [] });
        expect(draft.days[3].windows[0]).toMatchObject({ shiftId: "shift-b", startTime: "14:00", endTime: "19:00" });
    });

    test("builds the weekly draft from the latest dated recurring pattern", () => {
        const oldMonday = { ...shiftA, id: "old-monday", effectiveFrom: "2026-04-26", effectiveTo: "2026-05-26" };
        const oldWednesday = { ...shiftB, id: "old-wednesday", effectiveFrom: "2026-04-26", effectiveTo: "2026-05-26" };
        const currentMonday = {
            ...shiftA,
            id: "current-monday",
            endTime: "19:00",
            effectiveFrom: "2026-04-30",
            effectiveTo: "2026-05-30",
        };
        const currentWednesday = {
            ...shiftB,
            id: "current-wednesday",
            effectiveFrom: "2026-04-30",
            effectiveTo: "2026-05-30",
        };
        const schedule: AdminSchedule = {
            locations: [{ id: "location-a", name: "Eglinton", sortOrder: 1 }],
            barbers: [{ id: "barber-a", displayName: "Laura Nguyen", locationIds: ["location-a"], sortOrder: 1 }],
            shifts: [oldMonday, currentMonday, oldWednesday, currentWednesday],
            shiftOverrides: [],
            blockedTimes: [],
        };

        const draft = buildWeeklyScheduleDraft(schedule, "barber-a");

        expect(draft.effectiveFrom).toBe("2026-04-30");
        expect(draft.effectiveTo).toBe("2026-05-30");
        expect(draft.sourceShiftIds).toEqual(["current-monday", "current-wednesday"]);
        expect(calculateWeeklyScheduleHours(draft)).toBe(14);
        expect(buildWeeklyScheduleSavePlan(schedule, draft)).toEqual([]);
    });

    test("calculates weekly schedule hours from active split windows", () => {
        const draft = buildWeeklyScheduleDraft({
            locations: [{ id: "location-a", name: "Eglinton", sortOrder: 1 }],
            barbers: [{ id: "barber-a", displayName: "Laura Nguyen", locationIds: ["location-a"], sortOrder: 1 }],
            shifts: [
                shiftA,
                { ...shiftA, id: "shift-a-2", startTime: "15:00", endTime: "19:00" },
                { ...shiftB, startTime: "11:30", endTime: "19:00" },
            ],
            shiftOverrides: [],
            blockedTimes: [],
        }, "barber-a");

        expect(calculateWeeklyScheduleHours(draft)).toBe(14.5);
    });

    test("validates weekly schedule draft time ranges, overlaps, and effective dates", () => {
        const draft = buildWeeklyScheduleDraft({
            locations: [{ id: "location-a", name: "Eglinton", sortOrder: 1 }],
            barbers: [{ id: "barber-a", displayName: "Laura Nguyen", locationIds: ["location-a"], sortOrder: 1 }],
            shifts: [shiftA, shiftB],
            shiftOverrides: [],
            blockedTimes: [],
        }, "barber-a");
        draft.effectiveFrom = "2026-09-01";
        draft.effectiveTo = "2026-08-31";
        draft.effectiveDatesTouched = true;
        draft.days[1].windows[0].startTime = "13:00";
        draft.days[1].windows[0].endTime = "13:00";
        draft.days[3].windows.push({
            draftId: "overlap-wed",
            locationId: "location-a",
            startTime: "18:00",
            endTime: "20:00",
        });

        expect(validateWeeklyScheduleDraft(draft)).toEqual(expect.arrayContaining([
            {
                field: "effectiveTo",
                message: "Ends must be on or after Starts.",
            },
            {
                dayOfWeek: 1,
                field: "endTime",
                message: "End time must be after start time.",
                windowDraftId: "shift-a",
            },
            {
                dayOfWeek: 3,
                field: "window",
                message: "Split shifts on the same day cannot overlap.",
                windowDraftId: "overlap-wed",
            },
        ]));
    });

    test("allows ongoing effective dates and non-overlapping split shifts", () => {
        const draft = buildWeeklyScheduleDraft({
            locations: [{ id: "location-a", name: "Eglinton", sortOrder: 1 }],
            barbers: [{ id: "barber-a", displayName: "Laura Nguyen", locationIds: ["location-a"], sortOrder: 1 }],
            shifts: [
                shiftA,
                { ...shiftA, id: "shift-a-2", startTime: "15:00", endTime: "19:00" },
            ],
            shiftOverrides: [],
            blockedTimes: [],
        }, "barber-a");
        draft.effectiveFrom = "2026-06-01";
        draft.effectiveTo = "";
        draft.effectiveDatesTouched = true;

        expect(validateWeeklyScheduleDraft(draft)).toEqual([]);
    });

    test("snaps weekly timeline edits to 15-minute schedule clocks", () => {
        expect(snapWeeklyScheduleClock("10:07")).toBe("10:00");
        expect(snapWeeklyScheduleClock("10:08")).toBe("10:15");
        expect(snapWeeklyScheduleClock("23:59")).toBe("23:45");
        expect(snapWeeklyScheduleClock("not-a-time")).toBeNull();
    });

    test("moves and resizes weekly shift windows without mutating the original draft", () => {
        const schedule: AdminSchedule = {
            locations: [{ id: "location-a", name: "Eglinton", sortOrder: 1 }],
            barbers: [{ id: "barber-a", displayName: "Laura Nguyen", locationIds: ["location-a"], sortOrder: 1 }],
            shifts: [shiftA],
            shiftOverrides: [],
            blockedTimes: [],
        };
        const draft = buildWeeklyScheduleDraft(schedule, "barber-a");

        const moved = moveWeeklyScheduleWindow(draft, {
            windowDraftId: "shift-a",
            targetDayOfWeek: 2,
            targetStartTime: "11:07",
        });

        expect(draft.days[1]).toMatchObject({ active: true, windows: [{ draftId: "shift-a", startTime: "10:00", endTime: "13:00" }] });
        expect(moved.days[1]).toMatchObject({ active: false, windows: [] });
        expect(moved.days[2]).toMatchObject({
            active: true,
            windows: [{ draftId: "shift-a", shiftId: "shift-a", startTime: "11:00", endTime: "14:00" }],
        });
        expect(buildWeeklyScheduleSavePlan(schedule, moved)).toEqual([{
            type: "update",
            shiftId: "shift-a",
            payload: {
                barberId: "barber-a",
                locationId: "location-a",
                dayOfWeek: 2,
                startTime: "11:00",
                endTime: "14:00",
                effectiveFrom: "",
                effectiveTo: "",
            },
        }]);

        const resized = resizeWeeklyScheduleWindow(moved, {
            windowDraftId: "shift-a",
            edge: "end",
            targetTime: "15:37",
        });

        expect(resized.days[2].windows[0]).toMatchObject({ startTime: "11:00", endTime: "15:30" });
        expect(validateWeeklyScheduleDraft(resized)).toEqual([]);
    });

    test("duplicates, copies, and clears weekly shift windows for inspector actions", () => {
        const draft = buildWeeklyScheduleDraft({
            locations: [
                { id: "location-a", name: "Eglinton", sortOrder: 1 },
                { id: "location-b", name: "Millwood", sortOrder: 2 },
            ],
            barbers: [{ id: "barber-a", displayName: "Laura Nguyen", locationIds: ["location-a", "location-b"], sortOrder: 1 }],
            shifts: [shiftA],
            shiftOverrides: [],
            blockedTimes: [],
        }, "barber-a");

        const duplicated = duplicateWeeklyScheduleWindow(draft, {
            windowDraftId: "shift-a",
            targetDayOfWeek: 2,
            targetStartTime: "12:22",
        });
        const duplicate = duplicated.days[2].windows[0];

        expect(duplicate).toMatchObject({
            locationId: "location-a",
            startTime: "12:15",
            endTime: "15:15",
        });
        expect(duplicate.draftId).not.toBe("shift-a");
        expect(duplicate.shiftId).toBeUndefined();

        const copied = copyWeeklyScheduleDay(duplicated, { fromDayOfWeek: 2, toDayOfWeek: 5 });
        expect(copied.days[5]).toMatchObject({
            active: true,
            windows: [{ locationId: "location-a", startTime: "12:15", endTime: "15:15" }],
        });
        expect(copied.days[5].windows[0].draftId).not.toBe(duplicate.draftId);
        expect(copied.days[5].windows[0].shiftId).toBeUndefined();

        const cleared = clearWeeklyScheduleDay(copied, 5);
        expect(cleared.days[5]).toMatchObject({ active: false, windows: [] });
    });

    test("diffs weekly draft changes into deactivate, update, and create operations", () => {
        const schedule: AdminSchedule = {
            locations: [
                { id: "location-a", name: "Eglinton", sortOrder: 1 },
                { id: "location-b", name: "Millwood", sortOrder: 2 },
            ],
            barbers: [{ id: "barber-a", displayName: "Laura Nguyen", locationIds: ["location-a", "location-b"], sortOrder: 1 }],
            shifts: [
                shiftA,
                { ...shiftA, id: "shift-a-remove", dayOfWeek: 2 },
                { ...shiftB, id: "shift-b-update" },
            ],
            shiftOverrides: [],
            blockedTimes: [],
        };
        const draft = buildWeeklyScheduleDraft(schedule, "barber-a");
        draft.effectiveFrom = "2026-05-19";
        draft.effectiveTo = "2026-08-31";
        draft.effectiveDatesTouched = true;
        draft.days[1].windows[0].endTime = "14:00";
        draft.days[2].active = false;
        draft.days[2].windows = [];
        draft.days[5].active = true;
        draft.days[5].windows = [{
            draftId: "new-friday",
            locationId: "location-b",
            startTime: "10:00",
            endTime: "19:00",
        }];

        expect(buildWeeklyScheduleSavePlan(schedule, draft)).toEqual([
            { type: "deactivate", shiftId: "shift-a-remove" },
            {
                type: "update",
                shiftId: "shift-a",
                payload: {
                    barberId: "barber-a",
                    locationId: "location-a",
                    dayOfWeek: 1,
                    startTime: "10:00",
                    endTime: "14:00",
                    effectiveFrom: "2026-05-19",
                    effectiveTo: "2026-08-31",
                },
            },
            {
                type: "update",
                shiftId: "shift-b-update",
                payload: {
                    barberId: "barber-a",
                    locationId: "location-a",
                    dayOfWeek: 3,
                    startTime: "14:00",
                    endTime: "19:00",
                    effectiveFrom: "2026-05-19",
                    effectiveTo: "2026-08-31",
                },
            },
            {
                type: "create",
                payload: {
                    barberId: "barber-a",
                    locationId: "location-b",
                    dayOfWeek: 5,
                    startTime: "10:00",
                    endTime: "19:00",
                    effectiveFrom: "2026-05-19",
                    effectiveTo: "2026-08-31",
                },
            },
        ]);
    });

    test("builds all-day blocked time payloads with the next local end date", () => {
        expect(
            buildBlockedTimePayload({
                scope: "business",
                startDate: "2026-05-04",
                startTime: "12:00",
                endDate: "2026-05-04",
                endTime: "13:00",
                allDay: true,
                reason: "Staff training",
            }),
        ).toEqual({
            scope: "business",
            startDate: "2026-05-04",
            startTime: "00:00",
            endDate: "2026-05-05",
            endTime: "00:00",
            reason: "Staff training",
        });
    });
});

describe("Phase 7.5 calendar-first UI utilities", () => {
    test("keeps a usable mobile day-board viewport budget on the shortest supported phones", () => {
        const budget = estimateMobileCalendarGridHeight({
            ...mobileAdminCalendarLayoutBudget,
            viewportHeightPx: 568,
        });

        expect(budget.availableGridHeightPx).toBeGreaterThanOrEqual(220);
        expect(budget.visibleSlotRows).toBeGreaterThanOrEqual(5);
    });

    test("builds 15-minute day-board slots inside business hours", () => {
        expect(buildCalendarTimeSlots("10:00", "11:00")).toEqual([
            "10:00",
            "10:15",
            "10:30",
            "10:45",
        ]);
    });

    test("adds a visible closing boundary without creating a bookable close slot", () => {
        const rows = buildCalendarBoardRows("10:00", "19:00");

        expect(rows.closeBoundary).toBe("19:00");
        expect(rows.bookableSlots[rows.bookableSlots.length - 1]).toBe("18:45");
        expect(rows.bookableSlots).not.toContain("19:00");
    });

    test("calculates the default day-board scroll position from the full admin day to 9 AM", () => {
        expect(getCalendarInitialScrollTop({ dayStartTime: "00:00", targetTime: "09:00", slotHeightPx: 22 })).toBe(792);
        expect(getCalendarInitialScrollTop({ dayStartTime: "10:00", targetTime: "09:00", slotHeightPx: 22 })).toBe(0);
    });

    test("assigns operational booking card tones by status and walk-in source", () => {
        expect(getBookingCardTone({ ...bookingA, status: "confirmed", source: "public" })).toBe("confirmed");
        expect(getBookingCardTone({ ...bookingA, status: "confirmed", source: "walk_in" })).toBe("walk_in");
        expect(getBookingCardTone({ ...bookingA, status: "no_show", source: "manual" })).toBe("no_show");
        expect(getBookingCardTone({ ...bookingA, status: "cancelled", source: "manual" })).toBe("cancelled");
        expect(getBookingCardTone({ ...bookingA, status: "completed", source: "manual" })).toBe("completed");
    });

    test("uses service category tones for active calendar bookings while keeping statuses dominant", () => {
        expect(getBookingCardTone({ ...bookingA, serviceCategoryNames: ["Hair & Styling (Men)"] } as AdminBookingSummary)).toBe("men");
        expect(getBookingCardTone({ ...bookingA, serviceCategoryNames: ["Hair & Styling (Women)"] } as AdminBookingSummary)).toBe("women");
        expect(getBookingCardTone({ ...bookingA, serviceCategoryNames: ["Hair & Styling (Boy 9 & Under)"] } as AdminBookingSummary)).toBe("boys");
        expect(
            getBookingCardTone({
                ...bookingA,
                serviceCategoryNames: ["Hair & Styling (Men)", "Hair & Styling (Women)"],
            } as AdminBookingSummary),
        ).toBe("mixed");
        expect(getBookingCardTone({ ...bookingA, status: "cancelled", serviceCategoryNames: ["Hair & Styling (Men)"] } as AdminBookingSummary)).toBe("cancelled");
        expect(getBookingCardTone({ ...bookingA, status: "completed", serviceCategoryNames: ["Hair & Styling (Women)"] } as AdminBookingSummary)).toBe("completed");
        expect(getBookingCardTone({ ...bookingA, status: "no_show", serviceCategoryNames: ["Hair & Styling (Boy 9 & Under)"] } as AdminBookingSummary)).toBe("no_show");
    });

    test("uses high-visibility appointment colors for the admin schedule", () => {
        expect(getBookingToneClasses("boys")).toContain("bg-yellow-100");
        expect(getBookingToneClasses("boys")).toContain("border-yellow-700");
        expect(getBookingToneClasses("women")).toContain("bg-pink-100");
        expect(getBookingToneClasses("women")).toContain("border-pink-700");
        expect(getBookingToneClasses("men")).toContain("bg-blue-100");
        expect(getBookingToneClasses("men")).toContain("border-blue-700");
        expect(getBookingToneClasses("no_show")).toContain("bg-red-600");
        expect(getBookingToneClasses("no_show")).toContain("text-white");
    });

    test("builds reschedule payloads for authorized booking drag drops and rejects unsafe drops", () => {
        const owner: SafeAdminUser = {
            id: "owner",
            email: "owner@example.com",
            displayName: "Owner",
            role: "owner",
            barberId: null,
        };
        const barber: SafeAdminUser = {
            id: "barber",
            email: "barber@example.com",
            displayName: "Sam",
            role: "barber",
            barberId: "barber-a",
        };

        expect(
            buildBookingDragPayload({
                user: owner,
                booking: bookingA,
                targetBarberId: "barber-b",
                targetLocationId: "location-a",
                targetStartTime: "2026-04-27T15:00:00.000Z",
            }),
        ).toEqual({
            locationId: "location-a",
            barberId: "barber-b",
            startTime: "2026-04-27T15:00:00.000Z",
        });

        expect(
            buildBookingDragPayload({
                user: barber,
                booking: bookingA,
                targetBarberId: "barber-b",
                targetLocationId: "location-a",
                targetStartTime: "2026-04-27T15:00:00.000Z",
            }),
        ).toBeNull();

        expect(
            buildBookingDragPayload({
                user: owner,
                booking: { ...bookingA, status: "no_show" },
                targetBarberId: "barber-a",
                targetLocationId: "location-a",
                targetStartTime: "2026-04-27T15:00:00.000Z",
            }),
        ).toBeNull();
    });
});

const ownerUser: SafeAdminUser = {
    id: "owner",
    email: "owner@example.com",
    displayName: "Owner",
    role: "owner",
    barberId: null,
};

const calendarOptions: AdminCalendarOptions = {
    locations: [
        { id: "eglington", name: "Leaside Fades Eglinton", sortOrder: 1 },
        { id: "millwood", name: "Leaside Fades Millwood", sortOrder: 2 },
    ],
    barbers: [
        { id: "sam", displayName: "Sam To", locationIds: ["eglington"], sortOrder: 1 },
        { id: "laura", displayName: "Laura Nguyen", locationIds: ["eglington", "millwood"], sortOrder: 2 },
        { id: "yogesh", displayName: "Yogesh Kumar", locationIds: ["millwood"], sortOrder: 3 },
    ],
    services: [],
};

const saturdaySchedule: AdminSchedule = {
    locations: calendarOptions.locations,
    barbers: calendarOptions.barbers,
    shifts: [
        {
            id: "sam-sat-eglinton",
            barberId: "sam",
            locationId: "eglington",
            dayOfWeek: 6,
            startTime: "10:00",
            endTime: "19:00",
            effectiveFrom: null,
            effectiveTo: null,
            active: true,
        },
        {
            id: "laura-sat-millwood",
            barberId: "laura",
            locationId: "millwood",
            dayOfWeek: 6,
            startTime: "15:00",
            endTime: "19:00",
            effectiveFrom: null,
            effectiveTo: null,
            active: true,
        },
        {
            id: "yogesh-sat-millwood",
            barberId: "yogesh",
            locationId: "millwood",
            dayOfWeek: 6,
            startTime: "12:00",
            endTime: "19:00",
            effectiveFrom: "2026-01-01",
            effectiveTo: "2026-12-31",
            active: true,
        },
    ],
    shiftOverrides: [],
    blockedTimes: [],
};

describe("Phase 13 admin calendar schedule visibility utilities", () => {
    test("shows all active location staff as day columns even when a barber has no shift", () => {
        const eglintonColumns = getScheduledCalendarBarbers({
            options: calendarOptions,
            schedule: saturdaySchedule,
            user: ownerUser,
            selectedDate: "2026-05-02",
            locationId: "eglington",
        });

        expect(eglintonColumns.map((item) => item.barber.displayName)).toEqual(["Sam To", "Laura Nguyen"]);
        expect(eglintonColumns.find((item) => item.barber.id === "sam")?.scheduled).toBe(true);
        expect(eglintonColumns.find((item) => item.barber.id === "laura")?.scheduled).toBe(false);
        expect(eglintonColumns.find((item) => item.barber.id === "laura")?.workingWindows).toEqual([]);

        const millwoodColumns = getScheduledCalendarBarbers({
            options: calendarOptions,
            schedule: saturdaySchedule,
            user: ownerUser,
            selectedDate: "2026-05-02",
            locationId: "millwood",
        });

        expect(millwoodColumns.map((item) => item.barber.displayName)).toEqual(["Laura Nguyen", "Yogesh Kumar"]);
        expect(millwoodColumns.find((item) => item.barber.id === "laura")?.workingWindows).toEqual([
            { barberId: "laura", locationId: "millwood", startTime: "15:00", endTime: "19:00", source: "shift" },
        ]);
    });

    test("applies add, remove, and not-working overrides to calendar working windows", () => {
        const schedule: AdminSchedule = {
            ...saturdaySchedule,
            shiftOverrides: [
                {
                    id: "sam-remove-middle",
                    barberId: "sam",
                    locationId: "eglington",
                    overrideDate: "2026-05-02",
                    overrideType: "remove",
                    startTime: "13:00",
                    endTime: "14:00",
                    reason: "Lunch",
                },
                {
                    id: "yogesh-add-eglinton",
                    barberId: "yogesh",
                    locationId: "eglington",
                    overrideDate: "2026-05-02",
                    overrideType: "add",
                    startTime: "16:00",
                    endTime: "18:00",
                    reason: null,
                },
                {
                    id: "laura-off",
                    barberId: "laura",
                    locationId: null,
                    overrideDate: "2026-05-02",
                    overrideType: "not_working",
                    startTime: null,
                    endTime: null,
                    reason: "Away",
                },
            ],
        };

        expect(
            buildCalendarWorkingWindows({
                schedule,
                selectedDate: "2026-05-02",
                locationId: "eglington",
                businessStartTime: "10:00",
                businessEndTime: "19:00",
            }),
        ).toEqual({
            sam: [
                { barberId: "sam", locationId: "eglington", startTime: "10:00", endTime: "13:00", source: "shift" },
                { barberId: "sam", locationId: "eglington", startTime: "14:00", endTime: "19:00", source: "shift" },
            ],
            yogesh: [
                { barberId: "yogesh", locationId: "eglington", startTime: "16:00", endTime: "18:00", source: "override" },
            ],
        });
    });

    test("computes non-working ranges and flags bookings outside scheduled hours", () => {
        const windows = [
            { barberId: "laura", locationId: "millwood", startTime: "15:30", endTime: "19:00", source: "shift" as const },
        ];

        expect(buildCalendarUnavailableRanges(windows, { startTime: "10:00", endTime: "19:00" })).toEqual([
            { startTime: "10:00", endTime: "15:30" },
        ]);
        expect(bookingFallsOutsideWorkingWindows({ ...bookingA, startTime: "2026-05-02T21:00:00.000Z", endTime: "2026-05-02T21:30:00.000Z" }, windows)).toBe(false);
        expect(bookingFallsOutsideWorkingWindows({ ...bookingA, startTime: "2026-05-02T18:30:00.000Z", endTime: "2026-05-02T19:00:00.000Z" }, windows)).toBe(true);
    });

    test("marks only ranges fully inside working windows as clickable", () => {
        const windows = [
            { barberId: "laura", locationId: "millwood", startTime: "15:30", endTime: "19:00", source: "shift" as const },
        ];

        expect(calendarRangeFitsWorkingWindows({ startTime: "15:00", endTime: "15:30" }, windows)).toBe(false);
        expect(calendarRangeFitsWorkingWindows({ startTime: "15:15", endTime: "15:45" }, windows)).toBe(false);
        expect(calendarRangeFitsWorkingWindows({ startTime: "15:30", endTime: "16:00" }, windows)).toBe(true);
        expect(calendarRangeFitsWorkingWindows({ startTime: "18:30", endTime: "19:00" }, windows)).toBe(true);
        expect(calendarRangeFitsWorkingWindows({ startTime: "18:45", endTime: "19:15" }, windows)).toBe(false);
    });
});

describe("Schedule periods and temporary schedules", () => {
    const scheduleLocations = [
        { id: "location-a", name: "Eglinton", sortOrder: 1 },
        { id: "location-b", name: "Millwood", sortOrder: 2 },
    ];
    const scheduleBarbers = [
        { id: "barber-a", displayName: "Laura Nguyen", locationIds: ["location-a", "location-b"], sortOrder: 1 },
    ];
    const temporaryInput = {
        barberId: "barber-a",
        locationId: "location-b",
        effectiveFrom: "2026-07-05",
        effectiveTo: "2026-07-10",
        weekdays: [3, 1],
        startTime: "10:00",
        endTime: "19:00",
    };

    test("derives local weekdays from calendar dates without timezone drift", () => {
        expect(localDateWeekday("2026-07-05")).toBe(0);
        expect(localDateWeekday("2026-07-10")).toBe(5);
        expect(weekdaysInLocalDateRange("2026-07-05", "2026-07-10")).toEqual([0, 1, 2, 3, 4, 5]);
        expect(weekdaysInLocalDateRange("2026-07-05", "2026-07-05")).toEqual([0]);
        expect(weekdaysInLocalDateRange("2026-07-05", "2026-08-05")).toEqual([0, 1, 2, 3, 4, 5, 6]);
        expect(weekdaysInLocalDateRange("2026-07-10", "2026-07-05")).toEqual([]);
    });

    test("labels and describes schedule periods from their effective bounds", () => {
        const jul5 = formatLocalDateLabel("2026-07-05");
        const jul10 = formatLocalDateLabel("2026-07-10");

        expect(formatLocalDateLabel("2026-07-05")).toMatch(/Jul/);
        expect(formatLocalDateLabel("2026-07-05", { year: true })).toMatch(/2026/);
        expect(weeklyShiftPatternLabel({ effectiveFrom: "", effectiveTo: "" })).toBe("Ongoing");
        expect(weeklyShiftPatternLabel({ effectiveFrom: "2026-07-11", effectiveTo: "" })).toBe(`From ${formatLocalDateLabel("2026-07-11")}`);
        expect(weeklyShiftPatternLabel({ effectiveFrom: "", effectiveTo: "2026-07-10" })).toBe(`Until ${jul10}`);
        expect(weeklyShiftPatternLabel({ effectiveFrom: "2026-07-05", effectiveTo: "2026-07-10" })).toBe(`${jul5} – ${jul10}`);
        expect(describeSchedulePeriod("", "")).toBe("Repeats weekly with no end date.");
        expect(describeSchedulePeriod("2026-07-05", "")).toBe(
            `Repeats weekly from ${formatLocalDateLabel("2026-07-05", { year: true })} with no end date.`,
        );
        expect(describeSchedulePeriod("", "2026-07-10")).toBe(
            `Repeats weekly until ${formatLocalDateLabel("2026-07-10", { year: true })}.`,
        );
        expect(describeSchedulePeriod("2026-07-05", "2026-07-10")).toBe(
            `Repeats weekly, ${formatLocalDateLabel("2026-07-05", { year: true })} to ${formatLocalDateLabel("2026-07-10", { year: true })}.`,
        );
    });

    test("lists schedule periods grouped by effective range in chronological order", () => {
        const tempSunday = { ...shiftA, id: "temp-sun", dayOfWeek: 0, locationId: "location-b", effectiveFrom: "2026-07-05", effectiveTo: "2026-07-10" };
        const tempMonday = { ...shiftA, id: "temp-mon", locationId: "location-b", effectiveFrom: "2026-07-05", effectiveTo: "2026-07-10" };
        const futureOngoing = { ...shiftB, id: "future-ongoing", effectiveFrom: "2026-08-01" };
        const inactive = { ...shiftA, id: "inactive", active: false, effectiveFrom: "2026-09-01", effectiveTo: "2026-09-05" };
        const otherBarber = { ...shiftA, id: "other", barberId: "barber-b" };

        const patterns = listWeeklyShiftPatterns(
            { shifts: [tempSunday, shiftA, futureOngoing, tempMonday, inactive, otherBarber] },
            "barber-a",
        );

        expect(patterns.map((pattern) => pattern.key)).toEqual([
            weeklyShiftPatternKey("", ""),
            weeklyShiftPatternKey("2026-07-05", "2026-07-10"),
            weeklyShiftPatternKey("2026-08-01", ""),
        ]);
        expect(patterns[0]).toMatchObject({ barberId: "barber-a", effectiveFrom: "", effectiveTo: "", shiftIds: ["shift-a"], locationIds: ["location-a"] });
        expect(patterns[1]).toMatchObject({ shiftIds: ["temp-sun", "temp-mon"], locationIds: ["location-b"] });
    });

    test("delete-period plan removes the pattern and merges paused head/resume pairs back together", () => {
        const head = { ...shiftA, id: "head-mon", effectiveTo: "2026-07-05" };
        const resume = { ...shiftA, id: "resume-mon", effectiveFrom: "2026-07-12", effectiveTo: "2026-08-01" };
        const otherResume = { ...shiftA, id: "resume-other-time", startTime: "15:00", endTime: "18:00", effectiveFrom: "2026-07-12" };
        const tempMon = { ...shiftA, id: "temp-mon", locationId: "location-b", effectiveFrom: "2026-07-06", effectiveTo: "2026-07-11" };
        const tempTue = { ...shiftA, id: "temp-tue", dayOfWeek: 2, locationId: "location-b", effectiveFrom: "2026-07-06", effectiveTo: "2026-07-11" };
        const pattern = {
            barberId: "barber-a",
            effectiveFrom: "2026-07-06",
            effectiveTo: "2026-07-11",
            shiftIds: ["temp-mon", "temp-tue"],
        };

        const plan = buildDeleteSchedulePeriodPlan({ shifts: [head, resume, otherResume, tempMon, tempTue] }, pattern);

        expect(plan.removedShiftCount).toBe(2);
        expect(plan.mergedShiftCount).toBe(1);
        expect(plan.operations).toEqual([
            { type: "deactivate", shiftId: "temp-mon" },
            { type: "deactivate", shiftId: "temp-tue" },
            { type: "deactivate", shiftId: "resume-mon" },
            {
                type: "update",
                shiftId: "head-mon",
                payload: { barberId: "barber-a", locationId: "location-a", dayOfWeek: 1, startTime: "10:00", endTime: "13:00", effectiveFrom: "", effectiveTo: "2026-08-01" },
            },
        ]);
    });

    test("delete-period plan without a merge partner only deactivates the pattern", () => {
        const unrelated = { ...shiftA, id: "unrelated", effectiveTo: "2026-06-30" };
        const tempMon = { ...shiftA, id: "temp-mon", effectiveFrom: "2026-07-06", effectiveTo: "2026-07-11" };
        const halfBounded = {
            barberId: "barber-a",
            effectiveFrom: "",
            effectiveTo: "2026-07-05",
            shiftIds: ["unrelated"],
        };

        const noPartner = buildDeleteSchedulePeriodPlan(
            { shifts: [unrelated, tempMon] },
            { barberId: "barber-a", effectiveFrom: "2026-07-06", effectiveTo: "2026-07-11", shiftIds: ["temp-mon"] },
        );
        expect(noPartner.mergedShiftCount).toBe(0);
        expect(noPartner.operations).toEqual([{ type: "deactivate", shiftId: "temp-mon" }]);

        const notBounded = buildDeleteSchedulePeriodPlan({ shifts: [unrelated] }, halfBounded);
        expect(notBounded.operations).toEqual([{ type: "deactivate", shiftId: "unrelated" }]);
        expect(notBounded.mergedShiftCount).toBe(0);
    });

    test("builds the weekly draft for an explicitly selected period and falls back when the key is stale", () => {
        const tempMonday = {
            ...shiftA,
            id: "temp-monday",
            locationId: "location-b",
            startTime: "11:00",
            endTime: "17:00",
            effectiveFrom: "2026-07-05",
            effectiveTo: "2026-07-10",
        };
        const schedule: AdminSchedule = {
            locations: scheduleLocations,
            barbers: scheduleBarbers,
            shifts: [shiftA, shiftB, tempMonday],
            shiftOverrides: [],
            blockedTimes: [],
        };

        const ongoingDraft = buildWeeklyScheduleDraft(schedule, "barber-a", weeklyShiftPatternKey("", ""));
        expect(ongoingDraft.sourceShiftIds).toEqual(["shift-a", "shift-b"]);
        expect(ongoingDraft.effectiveTo).toBe("");

        const temporaryDraft = buildWeeklyScheduleDraft(schedule, "barber-a", weeklyShiftPatternKey("2026-07-05", "2026-07-10"));
        expect(temporaryDraft.sourceShiftIds).toEqual(["temp-monday"]);
        expect(temporaryDraft.effectiveFrom).toBe("2026-07-05");
        expect(temporaryDraft.effectiveTo).toBe("2026-07-10");

        const fallbackDraft = buildWeeklyScheduleDraft(schedule, "barber-a", "missing|key");
        expect(fallbackDraft.sourceShiftIds).toEqual(["temp-monday"]);
    });

    test("plans a temporary schedule that pauses ongoing shifts and resumes them after the period", () => {
        const plan = buildTemporarySchedulePlan({ shifts: [shiftA, shiftB] }, temporaryInput);

        expect(plan.issues).toEqual([]);
        expect(plan.pausedShiftCount).toBe(2);
        expect(plan.resumedShiftCount).toBe(2);
        expect(plan.temporaryShiftCount).toBe(2);
        expect(plan.resumeDate).toBe("2026-07-11");
        expect(plan.operations).toEqual([
            {
                type: "update",
                shiftId: "shift-a",
                payload: { barberId: "barber-a", locationId: "location-a", dayOfWeek: 1, startTime: "10:00", endTime: "13:00", effectiveFrom: "", effectiveTo: "2026-07-04" },
            },
            {
                type: "create",
                payload: { barberId: "barber-a", locationId: "location-a", dayOfWeek: 1, startTime: "10:00", endTime: "13:00", effectiveFrom: "2026-07-11", effectiveTo: "" },
            },
            {
                type: "update",
                shiftId: "shift-b",
                payload: { barberId: "barber-a", locationId: "location-a", dayOfWeek: 3, startTime: "14:00", endTime: "19:00", effectiveFrom: "", effectiveTo: "2026-07-04" },
            },
            {
                type: "create",
                payload: { barberId: "barber-a", locationId: "location-a", dayOfWeek: 3, startTime: "14:00", endTime: "19:00", effectiveFrom: "2026-07-11", effectiveTo: "" },
            },
            {
                type: "create",
                payload: { barberId: "barber-a", locationId: "location-b", dayOfWeek: 1, startTime: "10:00", endTime: "19:00", effectiveFrom: "2026-07-05", effectiveTo: "2026-07-10" },
            },
            {
                type: "create",
                payload: { barberId: "barber-a", locationId: "location-b", dayOfWeek: 3, startTime: "10:00", endTime: "19:00", effectiveFrom: "2026-07-05", effectiveTo: "2026-07-10" },
            },
        ]);
    });

    test("deactivates dated shifts fully covered by the period and resumes tails that extend beyond it", () => {
        const covered = { ...shiftA, id: "covered", effectiveFrom: "2026-07-06", effectiveTo: "2026-07-08" };
        const tail = { ...shiftB, id: "tail", effectiveFrom: "2026-07-08", effectiveTo: "2026-08-01" };
        const sameStart = { ...shiftA, id: "same-start", dayOfWeek: 5, effectiveFrom: "2026-07-05" };

        const plan = buildTemporarySchedulePlan({ shifts: [covered, tail, sameStart] }, temporaryInput);

        expect(plan.pausedShiftCount).toBe(3);
        expect(plan.resumedShiftCount).toBe(2);
        expect(plan.operations.slice(0, 5)).toEqual([
            { type: "deactivate", shiftId: "covered" },
            { type: "deactivate", shiftId: "tail" },
            {
                type: "create",
                payload: { barberId: "barber-a", locationId: "location-a", dayOfWeek: 3, startTime: "14:00", endTime: "19:00", effectiveFrom: "2026-07-11", effectiveTo: "2026-08-01" },
            },
            { type: "deactivate", shiftId: "same-start" },
            {
                type: "create",
                payload: { barberId: "barber-a", locationId: "location-a", dayOfWeek: 5, startTime: "10:00", endTime: "13:00", effectiveFrom: "2026-07-11", effectiveTo: "" },
            },
        ]);
    });

    test("leaves shifts outside the period untouched", () => {
        const past = { ...shiftA, id: "past", effectiveTo: "2026-07-04" };
        const future = { ...shiftB, id: "future", effectiveFrom: "2026-07-11" };

        const plan = buildTemporarySchedulePlan({ shifts: [past, future] }, temporaryInput);

        expect(plan.pausedShiftCount).toBe(0);
        expect(plan.resumedShiftCount).toBe(0);
        expect(plan.operations).toHaveLength(2);
        expect(plan.operations.every((operation) => operation.type === "create")).toBe(true);
    });

    test("reports temporary schedule input issues instead of planning operations", () => {
        expect(buildTemporarySchedulePlan({ shifts: [] }, { ...temporaryInput, effectiveFrom: "2026-07-12" }).issues)
            .toContain("End date must be on or after the start date.");
        expect(buildTemporarySchedulePlan({ shifts: [] }, { ...temporaryInput, effectiveFrom: "" }).issues)
            .toContain("Choose start and end dates.");
        expect(buildTemporarySchedulePlan({ shifts: [] }, { ...temporaryInput, locationId: "" }).issues)
            .toContain("Choose a location.");
        expect(buildTemporarySchedulePlan({ shifts: [] }, { ...temporaryInput, weekdays: [] }).issues)
            .toContain("Pick at least one working day.");
        expect(buildTemporarySchedulePlan({ shifts: [] }, { ...temporaryInput, weekdays: [6] }).issues)
            .toContain("Some selected days don't occur between those dates.");
        expect(buildTemporarySchedulePlan({ shifts: [] }, { ...temporaryInput, startTime: "10:07" }).issues)
            .toContain("Times must use 15-minute increments.");
        expect(buildTemporarySchedulePlan({ shifts: [] }, { ...temporaryInput, endTime: "10:00" }).issues)
            .toContain("End time must be after start time.");
        expect(buildTemporarySchedulePlan({ shifts: [shiftA] }, { ...temporaryInput, weekdays: [] }).operations).toEqual([]);
    });
});
