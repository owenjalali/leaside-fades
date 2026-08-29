import { describe, expect, test } from "vitest";

import { blockedTimeAppliesToBarberAtLocation } from "./blocked-time-scope.ts";

const BARBER_A = "barber-a";
const BARBER_B = "barber-b";
const LOCATION_1 = "location-1";
const LOCATION_2 = "location-2";

describe("blockedTimeAppliesToBarberAtLocation", () => {
    test("business scope blocks every barber at every location", () => {
        const block = { scope: "business" as const, barberId: null, locationId: null };
        expect(blockedTimeAppliesToBarberAtLocation(block, BARBER_A, LOCATION_1)).toBe(true);
        expect(blockedTimeAppliesToBarberAtLocation(block, BARBER_B, LOCATION_2)).toBe(true);
    });

    test("location scope blocks every barber at that location only", () => {
        const block = { scope: "location" as const, barberId: null, locationId: LOCATION_1 };
        expect(blockedTimeAppliesToBarberAtLocation(block, BARBER_A, LOCATION_1)).toBe(true);
        expect(blockedTimeAppliesToBarberAtLocation(block, BARBER_B, LOCATION_1)).toBe(true);
        expect(blockedTimeAppliesToBarberAtLocation(block, BARBER_A, LOCATION_2)).toBe(false);
        expect(blockedTimeAppliesToBarberAtLocation(block, BARBER_B, LOCATION_2)).toBe(false);
    });

    test("barber scope without a location blocks that barber everywhere", () => {
        const block = { scope: "barber" as const, barberId: BARBER_A, locationId: null };
        expect(blockedTimeAppliesToBarberAtLocation(block, BARBER_A, LOCATION_1)).toBe(true);
        expect(blockedTimeAppliesToBarberAtLocation(block, BARBER_A, LOCATION_2)).toBe(true);
        expect(blockedTimeAppliesToBarberAtLocation(block, BARBER_B, LOCATION_1)).toBe(false);
        expect(blockedTimeAppliesToBarberAtLocation(block, BARBER_B, LOCATION_2)).toBe(false);
    });

    test("barber scope with a location never blocks other barbers at that location (production regression shape)", () => {
        // The dominant production shape: scope='barber' rows that also carry a
        // location. The old SQL guard matched these for EVERY barber at the
        // location, 409-ing unrelated bookings.
        const block = { scope: "barber" as const, barberId: BARBER_A, locationId: LOCATION_1 };
        expect(blockedTimeAppliesToBarberAtLocation(block, BARBER_A, LOCATION_1)).toBe(true);
        expect(blockedTimeAppliesToBarberAtLocation(block, BARBER_B, LOCATION_1)).toBe(false);
    });

    test("barber scope with a location does not block that barber at other locations", () => {
        const block = { scope: "barber" as const, barberId: BARBER_A, locationId: LOCATION_1 };
        expect(blockedTimeAppliesToBarberAtLocation(block, BARBER_A, LOCATION_2)).toBe(false);
    });

    test("missing ids never match by accident", () => {
        expect(
            blockedTimeAppliesToBarberAtLocation(
                { scope: "barber", barberId: null, locationId: LOCATION_1 },
                BARBER_A,
                LOCATION_1,
            ),
        ).toBe(false);
        expect(
            blockedTimeAppliesToBarberAtLocation(
                { scope: "location", barberId: null, locationId: null },
                BARBER_A,
                LOCATION_1,
            ),
        ).toBe(false);
    });
});
