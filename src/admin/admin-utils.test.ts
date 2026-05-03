import { describe, expect, test } from "vitest";

import {
    buildAdminBookingQuery,
    buildAdminScheduleQuery,
    buildCalendarUnavailableRanges,
    buildBookingDragPayload,
    buildBlockedTimePayload,
    buildCalendarBoardRows,
    buildCalendarTimeSlots,
    buildCalendarWorkingWindows,
    buildMonthDays,
    buildWeekDays,
    bookingFallsOutsideWorkingWindows,
    calendarRangeFitsWorkingWindows,
    formatAdminStatus,
    compactNotificationFailureMessage,
    getBookingCardTone,
    getActiveNotificationFailures,
    getScheduledCalendarBarbers,
    formatScheduleWindow,
    groupBookingsByLocalDate,
    groupShiftsByBarberAndWeekday,
    notificationFilterMatches,
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

    test("assigns operational booking card tones by status and walk-in source", () => {
        expect(getBookingCardTone({ ...bookingA, status: "confirmed", source: "public" })).toBe("confirmed");
        expect(getBookingCardTone({ ...bookingA, status: "confirmed", source: "walk_in" })).toBe("walk_in");
        expect(getBookingCardTone({ ...bookingA, status: "no_show", source: "manual" })).toBe("no_show");
        expect(getBookingCardTone({ ...bookingA, status: "cancelled", source: "manual" })).toBe("cancelled");
        expect(getBookingCardTone({ ...bookingA, status: "completed", source: "manual" })).toBe("completed");
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
    test("shows day columns only for staff scheduled at the selected location and date", () => {
        expect(
            getScheduledCalendarBarbers({
                options: calendarOptions,
                schedule: saturdaySchedule,
                user: ownerUser,
                selectedDate: "2026-05-02",
                locationId: "eglington",
            }).map((item) => item.barber.displayName),
        ).toEqual(["Sam To"]);

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
