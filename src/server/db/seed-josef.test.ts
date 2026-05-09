import { describe, expect, test } from "vitest";

import { buildJosefLaunchShiftSpecs } from "./seed-josef.ts";

describe("Josef launch seed", () => {
    test("keeps Josef Eglinton-only with 11 AM to 7 PM weekly shifts", () => {
        const shifts = buildJosefLaunchShiftSpecs();

        expect(shifts).toHaveLength(7);
        expect(shifts.map((shift) => shift.dayOfWeek).sort()).toEqual([0, 1, 2, 3, 4, 5, 6]);
        expect(shifts).toEqual(
            expect.arrayContaining([
                {
                    barberSlug: "josef",
                    locationSlug: "eglinton",
                    dayOfWeek: 1,
                    startTime: "11:00",
                    endTime: "19:00",
                },
            ]),
        );
        expect(shifts.every((shift) => shift.barberSlug === "josef")).toBe(true);
        expect(shifts.every((shift) => shift.locationSlug === "eglinton")).toBe(true);
        expect(shifts.every((shift) => shift.startTime === "11:00")).toBe(true);
        expect(shifts.every((shift) => shift.endTime === "19:00")).toBe(true);
    });
});
