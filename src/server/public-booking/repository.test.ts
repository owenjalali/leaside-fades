import { describe, expect, test } from "vitest";

import {
    buildAvailabilityData,
    formatCatalog,
    formatPriceSummary,
} from "./repository.ts";

const locationId = "11111111-1111-1111-1111-111111111111";
const barberId = "22222222-2222-2222-2222-222222222222";
const serviceId = "33333333-3333-3333-3333-333333333333";
const categoryId = "44444444-4444-4444-4444-444444444444";

describe("Phase 4 public booking repository mapping", () => {
    test("groups active catalog rows into public location, service, and barber lists", () => {
        const catalog = formatCatalog({
            locations: [
                {
                    id: locationId,
                    slug: "eglinton",
                    name: "Leaside Fades Eglinton",
                    addressLine1: "866 Eglinton Ave E",
                    city: "East York",
                    province: "ON",
                    postalCode: "M4G 2L1",
                    phoneDisplay: "(647) 348-2200",
                    timezone: "America/Toronto",
                    sortOrder: 10,
                },
            ],
            categories: [
                {
                    id: categoryId,
                    slug: "hair-styling-men",
                    name: "Hair & Styling (Men)",
                    sortOrder: 10,
                },
            ],
            services: [
                {
                    id: serviceId,
                    categoryId,
                    slug: "mens-cut",
                    name: "Men's Cut",
                    durationMinutes: 30,
                    priceCents: 3000,
                    priceType: "fixed" as const,
                    displayPrice: "$30",
                    description: null,
                    sortOrder: 20,
                    isFeatured: false,
                },
            ],
            barbers: [
                {
                    id: barberId,
                    slug: "sam-to",
                    displayName: "Sam To",
                    sortOrder: 10,
                },
            ],
            barberLocations: [{ barberId, locationId }],
        });

        expect(catalog.locations).toEqual([
            expect.objectContaining({ id: locationId, slug: "eglinton" }),
        ]);
        expect(catalog.serviceCategories).toEqual([
            expect.objectContaining({
                id: categoryId,
                services: [expect.objectContaining({ id: serviceId, displayPrice: "$30" })],
            }),
        ]);
        expect(catalog.barbers).toEqual([
            expect.objectContaining({ id: barberId, locationIds: [locationId] }),
        ]);
    });

    test("maps database rows into the existing AvailabilityData shape", () => {
        const availabilityData = buildAvailabilityData({
            businessHours: [
                {
                    locationId,
                    dayOfWeek: 1,
                    openTime: "10:00:00",
                    closeTime: "19:00:00",
                    closed: false,
                },
            ],
            barbers: [{ id: barberId, active: true, sortOrder: 10 }],
            barberLocations: [{ barberId, locationId }],
            services: [{ id: serviceId, durationMinutes: 30, active: true }],
            shifts: [
                {
                    barberId,
                    locationId,
                    dayOfWeek: 1,
                    startTime: "10:00:00",
                    endTime: "12:00:00",
                    active: true,
                    effectiveFrom: null,
                    effectiveTo: null,
                },
            ],
            shiftOverrides: [],
            bookings: [
                {
                    barberId,
                    locationId,
                    status: "confirmed",
                    startTime: new Date("2026-05-04T14:30:00.000Z"),
                    endTime: new Date("2026-05-04T15:00:00.000Z"),
                },
            ],
            blockedTimes: [],
        });

        expect(availabilityData).toMatchObject({
            businessHours: [{ openTime: "10:00", closeTime: "19:00" }],
            shifts: [{ startTime: "10:00", endTime: "12:00" }],
            bookings: [{ status: "confirmed" }],
        });
    });

    test("formats stacked price summaries with from-pricing preserved", () => {
        expect(
            formatPriceSummary([
                { priceCents: 3000, priceType: "fixed" },
                { priceCents: 1500, priceType: "fixed" },
            ]),
        ).toBe("$45");

        expect(
            formatPriceSummary([
                { priceCents: 3000, priceType: "fixed" },
                { priceCents: 5500, priceType: "from" },
            ]),
        ).toBe("from $85");
    });
});
