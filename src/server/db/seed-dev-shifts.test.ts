import { describe, expect, test } from "vitest";

import {
    assertLocalDatabaseUrl,
    buildLocalDevSampleShiftSpecs,
    isPriorSampleGeneration,
    type CandidateShiftRow,
    type ResolvedLocalDevSampleShiftSpec,
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

describe("isPriorSampleGeneration", () => {
    const currentWindow = { effectiveFrom: "2026-07-11", effectiveTo: "2026-08-10" };
    const specs: ResolvedLocalDevSampleShiftSpec[] = [
        {
            barberSlug: "sam-to",
            locationSlug: "eglinton",
            barberId: "barber-sam",
            locationId: "location-eglinton",
            dayOfWeek: 1,
            startTime: "10:00",
            endTime: "19:00",
            effectiveFrom: currentWindow.effectiveFrom,
            effectiveTo: currentWindow.effectiveTo,
        },
    ];

    function row(overrides: Partial<CandidateShiftRow> = {}): CandidateShiftRow {
        return {
            barberId: "barber-sam",
            locationId: "location-eglinton",
            dayOfWeek: 1,
            // Postgres time columns read back with seconds attached.
            startTime: "10:00:00",
            endTime: "19:00:00",
            effectiveFrom: "2026-07-10",
            effectiveTo: "2026-08-09",
            ...overrides,
        };
    }

    test("flags a sample-tuple row whose window is from a prior run", () => {
        expect(isPriorSampleGeneration(row(), specs, currentWindow)).toBe(true);
    });

    test("flags a sample-tuple row that has no window at all", () => {
        expect(
            isPriorSampleGeneration(
                row({ effectiveFrom: null, effectiveTo: null }),
                specs,
                currentWindow,
            ),
        ).toBe(true);
    });

    test("leaves the current run's window untouched", () => {
        expect(
            isPriorSampleGeneration(
                row({
                    effectiveFrom: currentWindow.effectiveFrom,
                    effectiveTo: currentWindow.effectiveTo,
                }),
                specs,
                currentWindow,
            ),
        ).toBe(false);
    });

    test("never flags real rows with non-sample times for a seeded barber and location", () => {
        expect(
            isPriorSampleGeneration(
                row({ startTime: "09:15:00", endTime: "13:45:00" }),
                specs,
                currentWindow,
            ),
        ).toBe(false);
    });

    test("never flags rows for barbers outside the sample set", () => {
        expect(
            isPriorSampleGeneration(row({ barberId: "barber-unrelated" }), specs, currentWindow),
        ).toBe(false);
    });

    test("never flags rows at a location the sample set does not pair with that barber", () => {
        expect(
            isPriorSampleGeneration(row({ locationId: "location-millwood" }), specs, currentWindow),
        ).toBe(false);
    });
});
