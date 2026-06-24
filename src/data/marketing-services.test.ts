import { describe, expect, test } from "vitest";

import {
    marketingServiceTabs,
    serviceTabLabels,
    type MarketingServiceTab,
} from "./marketing-services";
import { serviceCategorySeeds, serviceSeeds } from "@/server/db/seed-data";

function servicesForTab(tab: MarketingServiceTab) {
    return marketingServiceTabs[tab].flatMap((group) => group.items);
}

describe("marketing services", () => {
    test("uses customer-friendly tabs backed by the booking categories", () => {
        expect(serviceTabLabels).toEqual(["Men", "Women", "Boys"]);

        expect(servicesForTab("Men")).toHaveLength(16);
        expect(servicesForTab("Women")).toHaveLength(14);
        expect(servicesForTab("Boys")).toHaveLength(8);
        expect(servicesForTab("Men")).toEqual(expect.arrayContaining([
            expect.objectContaining({
                slug: "mens-color-root-touchup",
                name: "Men's Color Root Touchup",
                displayPrice: "from $65",
                durationMinutes: 45,
            }),
        ]));
    });

    test("matches booking seed service names, prices, durations, and order", () => {
        const categoryBySlug = new Map(
            serviceCategorySeeds.map((category) => [category.slug, category.name]),
        );

        const marketingServices = serviceTabLabels.flatMap((tab) =>
            servicesForTab(tab).map((service) => ({
                categoryName: service.categoryName,
                name: service.name,
                displayPrice: service.displayPrice,
                durationMinutes: service.durationMinutes,
                sortOrder: service.sortOrder,
            })),
        );

        const bookingServices = serviceSeeds.map((service) => ({
            categoryName: categoryBySlug.get(service.categorySlug),
            name: service.name,
            displayPrice: service.displayPrice,
            durationMinutes: service.durationMinutes,
            sortOrder: service.sortOrder,
        }));

        expect(marketingServices).toEqual(bookingServices);
    });
});
