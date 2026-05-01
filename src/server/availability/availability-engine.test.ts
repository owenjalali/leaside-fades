import { describe, expect, test } from "vitest";

import { getAvailableSlots } from "./availability-engine";
import type { AvailabilityData, AvailabilityRequest } from "./types";

const locationId = "location-eglinton";
const millwoodLocationId = "location-millwood";
const barberAId = "barber-a";
const barberBId = "barber-b";
const haircutId = "service-haircut";
const beardId = "service-beard";

const defaultNow = new Date("2026-05-01T13:00:00.000Z");

function utc(localHour: number, localMinute = 0, localDate = "2026-05-04") {
    const [year, month, day] = localDate.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day, localHour + 4, localMinute));
}

function baseData(overrides: Partial<AvailabilityData> = {}): AvailabilityData {
    return {
        businessHours: [
            {
                locationId,
                dayOfWeek: 1,
                openTime: "10:00",
                closeTime: "19:00",
            },
            {
                locationId,
                dayOfWeek: 5,
                openTime: "10:00",
                closeTime: "19:00",
            },
            {
                locationId,
                dayOfWeek: 6,
                openTime: "10:00",
                closeTime: "19:00",
            },
            {
                locationId: millwoodLocationId,
                dayOfWeek: 1,
                openTime: "10:00",
                closeTime: "19:00",
            },
        ],
        barbers: [
            { id: barberAId, active: true, sortOrder: 1 },
            { id: barberBId, active: true, sortOrder: 2 },
        ],
        barberLocations: [
            { barberId: barberAId, locationId },
            { barberId: barberBId, locationId },
            { barberId: barberAId, locationId: millwoodLocationId },
        ],
        services: [
            { id: haircutId, durationMinutes: 30, active: true },
            { id: beardId, durationMinutes: 15, active: true },
        ],
        shifts: [
            {
                barberId: barberAId,
                locationId,
                dayOfWeek: 1,
                startTime: "10:00",
                endTime: "19:00",
                active: true,
            },
            {
                barberId: barberAId,
                locationId,
                dayOfWeek: 5,
                startTime: "10:00",
                endTime: "19:00",
                active: true,
            },
            {
                barberId: barberBId,
                locationId,
                dayOfWeek: 1,
                startTime: "10:00",
                endTime: "12:00",
                active: true,
            },
        ],
        shiftOverrides: [],
        bookings: [],
        blockedTimes: [],
        ...overrides,
    };
}

function request(overrides: Partial<AvailabilityRequest> = {}): AvailabilityRequest {
    return {
        locationId,
        serviceIds: [haircutId],
        date: "2026-05-04",
        now: defaultNow,
        ...overrides,
    };
}

function barberSlots(data: AvailabilityData, overrides: Partial<AvailabilityRequest> = {}) {
    const result = getAvailableSlots(request(overrides), data);
    return result.barberSlots.find((group) => group.barberId === (overrides.barberId ?? barberAId))
        ?.slots ?? [];
}

function starts(slots: { startTime: Date }[]) {
    return slots.map((slot) => slot.startTime.toISOString());
}

describe("Phase 2 availability engine", () => {
    test("generates single service availability on 15-minute intervals", () => {
        const slots = barberSlots(baseData(), { barberId: barberAId });

        expect(slots[0]).toMatchObject({
            barberId: barberAId,
            locationId,
            totalDurationMinutes: 30,
        });
        expect(slots[0].startTime.toISOString()).toBe("2026-05-04T14:00:00.000Z");
        expect(slots[1].startTime.toISOString()).toBe("2026-05-04T14:15:00.000Z");
    });

    test("stacks multiple selected services into one appointment duration", () => {
        const slots = barberSlots(baseData(), {
            barberId: barberAId,
            serviceIds: [haircutId, beardId],
        });

        expect(slots[0].totalDurationMinutes).toBe(45);
        expect(slots[0].endTime.toISOString()).toBe("2026-05-04T14:45:00.000Z");
    });

    test("allows a slot exactly at opening time", () => {
        const slots = barberSlots(baseData(), { barberId: barberAId });

        expect(starts(slots)).toContain("2026-05-04T14:00:00.000Z");
    });

    test("allows a slot ending exactly at closing time", () => {
        const slots = barberSlots(baseData(), { barberId: barberAId });

        expect(starts(slots)).toContain("2026-05-04T22:30:00.000Z");
        expect(slots[slots.length - 1]?.endTime.toISOString()).toBe(
            "2026-05-04T23:00:00.000Z",
        );
    });

    test("rejects slots that would end after closing", () => {
        const slots = barberSlots(baseData(), { barberId: barberAId });

        expect(starts(slots)).not.toContain("2026-05-04T22:45:00.000Z");
    });

    test("rejects slots less than 30 minutes from now", () => {
        const slots = barberSlots(baseData(), {
            barberId: barberAId,
            date: "2026-05-01",
            now: new Date("2026-05-01T13:45:00.000Z"),
        });

        expect(starts(slots)).not.toContain("2026-05-01T14:00:00.000Z");
        expect(starts(slots)).toContain("2026-05-01T14:15:00.000Z");
    });

    test("rejects dates more than 30 days ahead", () => {
        expect(() =>
            getAvailableSlots(
                request({
                    date: "2026-06-01",
                    now: new Date("2026-05-01T13:00:00.000Z"),
                }),
                baseData(),
            ),
        ).toThrow(/30 days/);
    });

    test("confirmed bookings block overlapping slots but allow adjacent slots", () => {
        const slots = barberSlots(
            baseData({
                bookings: [
                    {
                        barberId: barberAId,
                        locationId,
                        status: "confirmed",
                        startTime: utc(11),
                        endTime: utc(11, 30),
                    },
                ],
            }),
            { barberId: barberAId },
        );

        expect(starts(slots)).not.toContain("2026-05-04T14:45:00.000Z");
        expect(starts(slots)).not.toContain("2026-05-04T15:00:00.000Z");
        expect(starts(slots)).not.toContain("2026-05-04T15:15:00.000Z");
        expect(starts(slots)).toContain("2026-05-04T15:30:00.000Z");
    });

    test("cancelled bookings do not block availability", () => {
        const slots = barberSlots(
            baseData({
                bookings: [
                    {
                        barberId: barberAId,
                        locationId,
                        status: "cancelled",
                        startTime: utc(11),
                        endTime: utc(11, 30),
                    },
                ],
            }),
            { barberId: barberAId },
        );

        expect(starts(slots)).toContain("2026-05-04T15:00:00.000Z");
    });

    test("barber-specific blocked time blocks only that barber", () => {
        const result = getAvailableSlots(
            request(),
            baseData({
                blockedTimes: [
                    {
                        scope: "barber",
                        barberId: barberAId,
                        startTime: utc(10),
                        endTime: utc(10, 30),
                    },
                ],
            }),
        );

        expect(starts(result.barberSlots[0].slots)).not.toContain("2026-05-04T14:00:00.000Z");
        expect(starts(result.barberSlots[1].slots)).toContain("2026-05-04T14:00:00.000Z");
    });

    test("location-wide blocked time blocks all barbers at that location", () => {
        const result = getAvailableSlots(
            request(),
            baseData({
                blockedTimes: [
                    {
                        scope: "location",
                        locationId,
                        startTime: utc(10),
                        endTime: utc(10, 30),
                    },
                ],
            }),
        );

        for (const group of result.barberSlots) {
            expect(starts(group.slots)).not.toContain("2026-05-04T14:00:00.000Z");
        }
    });

    test("business-wide blocked time blocks all availability", () => {
        const result = getAvailableSlots(
            request(),
            baseData({
                blockedTimes: [
                    {
                        scope: "business",
                        startTime: utc(10),
                        endTime: utc(19),
                    },
                ],
            }),
        );

        expect(result.barberSlots.every((group) => group.slots.length === 0)).toBe(true);
    });

    test("split shifts generate availability inside each shift only", () => {
        const slots = barberSlots(
            baseData({
                shifts: [
                    {
                        barberId: barberAId,
                        locationId,
                        dayOfWeek: 1,
                        startTime: "10:00",
                        endTime: "12:00",
                        active: true,
                    },
                    {
                        barberId: barberAId,
                        locationId,
                        dayOfWeek: 1,
                        startTime: "14:00",
                        endTime: "16:00",
                        active: true,
                    },
                ],
            }),
            { barberId: barberAId },
        );

        expect(starts(slots)).toContain("2026-05-04T15:30:00.000Z");
        expect(starts(slots)).not.toContain("2026-05-04T16:00:00.000Z");
        expect(starts(slots)).toContain("2026-05-04T18:00:00.000Z");
    });

    test("uses the selected location when a barber works two locations on the same day", () => {
        const slots = barberSlots(
            baseData({
                shifts: [
                    {
                        barberId: barberAId,
                        locationId: millwoodLocationId,
                        dayOfWeek: 1,
                        startTime: "10:00",
                        endTime: "12:00",
                        active: true,
                    },
                    {
                        barberId: barberAId,
                        locationId,
                        dayOfWeek: 1,
                        startTime: "14:00",
                        endTime: "16:00",
                        active: true,
                    },
                ],
            }),
            { barberId: barberAId },
        );

        expect(starts(slots)).not.toContain("2026-05-04T14:00:00.000Z");
        expect(starts(slots)).toContain("2026-05-04T18:00:00.000Z");
    });

    test("barber with no shift has no availability", () => {
        const result = getAvailableSlots(
            request({ barberId: barberBId }),
            baseData({
                shifts: [
                    {
                        barberId: barberAId,
                        locationId,
                        dayOfWeek: 1,
                        startTime: "10:00",
                        endTime: "19:00",
                        active: true,
                    },
                ],
            }),
        );

        expect(result.barberSlots).toEqual([{ barberId: barberBId, locationId, slots: [] }]);
    });

    test("any available barber returns deterministic slot groups for all eligible barbers", () => {
        const result = getAvailableSlots(request(), baseData());

        expect(result.barberSlots.map((group) => group.barberId)).toEqual([barberAId, barberBId]);
        expect(result.barberSlots[0].slots[0].startTime.toISOString()).toBe(
            "2026-05-04T14:00:00.000Z",
        );
        expect(result.barberSlots[1].slots[0].startTime.toISOString()).toBe(
            "2026-05-04T14:00:00.000Z",
        );
    });

    test("one-off add overrides can supply availability for a target date", () => {
        const slots = barberSlots(
            baseData({
                shifts: [],
                shiftOverrides: [
                    {
                        barberId: barberAId,
                        locationId,
                        overrideDate: "2026-05-04",
                        overrideType: "add",
                        startTime: "13:00",
                        endTime: "15:00",
                    },
                ],
            }),
            { barberId: barberAId },
        );

        expect(starts(slots)).toContain("2026-05-04T17:00:00.000Z");
    });

    test("one-off not-working overrides remove recurring availability", () => {
        const slots = barberSlots(
            baseData({
                shiftOverrides: [
                    {
                        barberId: barberAId,
                        locationId,
                        overrideDate: "2026-05-04",
                        overrideType: "not_working",
                    },
                ],
            }),
            { barberId: barberAId },
        );

        expect(slots).toHaveLength(0);
    });
});
