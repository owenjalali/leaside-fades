import { describe, expect, test } from "vitest";

import {
    assertLocalDatabaseUrl,
    buildLocalDevSampleShiftSpecs,
} from "./seed-dev-shifts.ts";

describe("local dev sample shifts", () => {
    test("builds clearly scoped sample shifts for local browser QA", () => {
        const shifts = buildLocalDevSampleShiftSpecs({
            effectiveFrom: "2026-04-27",
            effectiveTo: "2026-05-27",
        });

        expect(shifts).toHaveLength(35);
        expect(shifts).toContainEqual(
            expect.objectContaining({
                barberSlug: "sam-to",
                locationSlug: "eglinton",
                dayOfWeek: 1,
                startTime: "10:00",
                endTime: "19:00",
            }),
        );
        expect(shifts).toContainEqual(
            expect.objectContaining({
                barberSlug: "shayan-hussain",
                locationSlug: "millwood",
                dayOfWeek: 0,
                startTime: "10:00",
                endTime: "17:00",
            }),
        );
        expect(shifts).toContainEqual(
            expect.objectContaining({
                barberSlug: "josef",
                locationSlug: "eglinton",
                dayOfWeek: 1,
                startTime: "11:00",
                endTime: "19:00",
            }),
        );
    });

    test("does not create local sample availability for Yogesh at Eglinton", () => {
        const shifts = buildLocalDevSampleShiftSpecs({
            effectiveFrom: "2026-04-27",
            effectiveTo: "2026-05-27",
        });

        expect(shifts).toContainEqual(
            expect.objectContaining({
                barberSlug: "yogesh-kumar",
                locationSlug: "millwood",
            }),
        );
        expect(shifts).not.toContainEqual(
            expect.objectContaining({
                barberSlug: "yogesh-kumar",
                locationSlug: "eglinton",
            }),
        );
    });

    test("guards against non-local database URLs", () => {
        expect(() =>
            assertLocalDatabaseUrl("postgres://postgres:postgres@localhost:5432/leaside_fades"),
        ).not.toThrow();
        expect(() =>
            assertLocalDatabaseUrl("postgres://postgres:postgres@127.0.0.1:5432/leaside_fades"),
        ).not.toThrow();
        expect(() =>
            assertLocalDatabaseUrl("postgres://postgres:postgres@db.example.com:5432/leaside_fades"),
        ).toThrow(/local development databases/);
    });
});
