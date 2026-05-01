import { serviceCategorySeeds, serviceSeeds } from "@/server/db/seed-data";

export const serviceTabLabels = ["Men", "Women", "Boys"] as const;

export type MarketingServiceTab = (typeof serviceTabLabels)[number];

export interface MarketingService {
    slug: string;
    categoryName: string;
    name: string;
    displayPrice: string;
    durationMinutes: number;
    priceType: "fixed" | "from";
    sortOrder: number;
}

export interface MarketingServiceGroup {
    heading?: string;
    items: MarketingService[];
}

const categorySlugByTab: Record<MarketingServiceTab, string> = {
    Men: "hair-styling-men",
    Women: "hair-styling-women",
    Boys: "hair-styling-boys",
};

const categoryNameBySlug = new Map(
    serviceCategorySeeds.map((category) => [category.slug, category.name]),
);

function buildServicesForTab(tab: MarketingServiceTab): MarketingServiceGroup[] {
    const categorySlug = categorySlugByTab[tab];
    const categoryName = categoryNameBySlug.get(categorySlug) ?? tab;
    const items = serviceSeeds
        .filter((service) => service.categorySlug === categorySlug)
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder)
        .map((service) => ({
            slug: service.slug,
            categoryName,
            name: service.name,
            displayPrice: service.displayPrice,
            durationMinutes: service.durationMinutes,
            priceType: service.priceType,
            sortOrder: service.sortOrder,
        }));

    return [{ items }];
}

export const marketingServiceTabs = Object.fromEntries(
    serviceTabLabels.map((tab) => [tab, buildServicesForTab(tab)]),
) as Record<MarketingServiceTab, MarketingServiceGroup[]>;
