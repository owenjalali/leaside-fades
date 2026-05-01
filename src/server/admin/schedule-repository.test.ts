import { describe, expect, test } from "vitest";

import {
    formatScheduleRows,
    scheduleEffectiveRangesOverlap,
} from "./schedule-repository.ts";

const barberId = "11111111-1111-1111-1111-111111111111";
const locationId = "22222222-2222-2222-2222-222222222222";

describe("Phase 7 admin schedule repository mapping", () => {
    test("normalizes shift and override times plus date-only fields", () => {
        const schedule = formatScheduleRows({
            locations: [{ id: locationId, name: "Leaside Fades Eglinton", sortOrder: 10 }],
            barbers: [{ id: barberId, displayName: "Sam To", sortOrder: 10 }],
            barberLocations: [{ barberId, locationId }],
            shifts: [
                {
                    id: "shift-a",
                    barberId,
                    locationId,
                    dayOfWeek: 1,
                    startTime: "10:00:00",
                    endTime: "19:00:00",
                    effectiveFrom: new Date("2026-05-01T00:00:00.000Z"),
                    effectiveTo: "2026-05-31",
                    active: true,
                },
            ],
            shiftOverrides: [
                {
                    id: "override-a",
                    barberId,
                    locationId,
                    overrideDate: new Date("2026-05-04T00:00:00.000Z"),
                    overrideType: "add" as const,
                    startTime: "11:15:00",
                    endTime: "15:45:00",
                    reason: "Coverage",
                },
            ],
            blockedTimes: [
                {
                    id: "blocked-a",
                    scope: "location" as const,
                    barberId: null,
                    locationId,
                    startTime: new Date("2026-05-04T15:00:00.000Z"),
                    endTime: new Date("2026-05-04T16:00:00.000Z"),
                    reason: "Private event",
                    createdByUserId: "owner",
                },
            ],
        });

        expect(schedule.barbers[0]).toMatchObject({ id: barberId, locationIds: [locationId] });
        expect(schedule.shifts[0]).toMatchObject({
            startTime: "10:00",
            endTime: "19:00",
            effectiveFrom: "2026-05-01",
            effectiveTo: "2026-05-31",
        });
        expect(schedule.shiftOverrides[0]).toMatchObject({
            overrideDate: "2026-05-04",
            startTime: "11:15",
            endTime: "15:45",
        });
        expect(schedule.blockedTimes[0].startTime).toEqual(new Date("2026-05-04T15:00:00.000Z"));
    });

    test("detects overlap between bounded and unbounded effective date ranges", () => {
        expect(scheduleEffectiveRangesOverlap(null, null, "2026-05-01", "2026-05-31")).toBe(true);
        expect(scheduleEffectiveRangesOverlap("2026-05-01", "2026-05-31", "2026-06-01", "2026-06-30")).toBe(false);
        expect(scheduleEffectiveRangesOverlap("2026-05-01", "2026-05-31", "2026-05-31", "2026-06-30")).toBe(true);
    });
});
