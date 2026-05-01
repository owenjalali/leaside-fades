import { describe, expect, test } from "vitest";

import {
    barberLocationSeeds,
    barberSeeds,
    businessHourSeeds,
    locationSeeds,
    serviceCategorySeeds,
    serviceSeeds,
} from "./seed-data";

function expectUnique(values: readonly string[]) {
    expect(new Set(values).size).toBe(values.length);
}

describe("Phase 1 seed data", () => {
    test("uses stable unique slugs", () => {
        expectUnique(locationSeeds.map((location) => location.slug));
        expectUnique(barberSeeds.map((barber) => barber.slug));
        expectUnique(serviceCategorySeeds.map((category) => category.slug));
        expectUnique(serviceSeeds.map((service) => service.slug));
    });

    test("matches the Phase 1 expected business counts", () => {
        expect(locationSeeds).toHaveLength(2);
        expect(barberSeeds).toHaveLength(4);
        expect(serviceCategorySeeds).toHaveLength(3);
        expect(serviceSeeds).toHaveLength(37);
        expect(barberLocationSeeds).toHaveLength(5);
    });

    test("has complete business hours for each week", () => {
        expect(businessHourSeeds).toHaveLength(7);
        expectUnique(businessHourSeeds.map((hours) => String(hours.dayOfWeek)));

        for (const hours of businessHourSeeds) {
            expect(hours.dayOfWeek).toBeGreaterThanOrEqual(0);
            expect(hours.dayOfWeek).toBeLessThanOrEqual(6);
            expect(hours.openTime).toMatch(/^\d{2}:\d{2}$/);
            expect(hours.closeTime).toMatch(/^\d{2}:\d{2}$/);
            expect(hours.openTime < hours.closeTime).toBe(true);
        }
    });

    test("references existing locations, barbers, and service categories", () => {
        const locationSlugs = new Set(locationSeeds.map((location) => location.slug));
        const barberSlugs = new Set(barberSeeds.map((barber) => barber.slug));
        const categorySlugs = new Set(serviceCategorySeeds.map((category) => category.slug));

        for (const assignment of barberLocationSeeds) {
            expect(barberSlugs.has(assignment.barberSlug)).toBe(true);
            expect(locationSlugs.has(assignment.locationSlug)).toBe(true);
        }

        for (const service of serviceSeeds) {
            expect(categorySlugs.has(service.categorySlug)).toBe(true);
        }
    });

    test("keeps Yogesh Millwood-only for launch", () => {
        expect(barberLocationSeeds).toContainEqual({
            barberSlug: "yogesh-kumar",
            locationSlug: "millwood",
        });
        expect(barberLocationSeeds).not.toContainEqual({
            barberSlug: "yogesh-kumar",
            locationSlug: "eglinton",
        });
    });

    test("uses valid service durations, prices, and configurable featured defaults", () => {
        for (const service of serviceSeeds) {
            expect(service.durationMinutes).toBeGreaterThan(0);
            expect(service.durationMinutes % 15).toBe(0);
            expect(service.priceCents).toBeGreaterThanOrEqual(0);
            expect(["fixed", "from"]).toContain(service.priceType);
            expect(service.displayPrice).toMatch(/\$/);
            expect(service.isFeatured).toBe(false);
        }
    });
});
