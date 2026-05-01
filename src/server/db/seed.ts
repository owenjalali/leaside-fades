import "dotenv/config";

import { sql } from "drizzle-orm";

import { createDatabaseClient } from "./client.ts";
import {
    barbers,
    barberLocations,
    barberServices,
    businessHours,
    locations,
    serviceCategories,
    services,
} from "./schema.ts";
import {
    barberLocationSeeds,
    barberSeeds,
    businessHourSeeds,
    locationSeeds,
    serviceCategorySeeds,
    serviceSeeds,
} from "./seed-data.ts";

async function seed() {
    const { db, pool } = createDatabaseClient();

    try {
        const locationIds = new Map<string, string>();
        const barberIds = new Map<string, string>();
        const categoryIds = new Map<string, string>();
        const serviceIds = new Map<string, string>();

        for (const location of locationSeeds) {
            const [row] = await db
                .insert(locations)
                .values(location)
                .onConflictDoUpdate({
                    target: locations.slug,
                    set: {
                        name: location.name,
                        addressLine1: location.addressLine1,
                        city: location.city,
                        province: location.province,
                        postalCode: location.postalCode,
                        phoneE164: location.phoneE164,
                        phoneDisplay: location.phoneDisplay,
                        timezone: location.timezone,
                        active: true,
                        sortOrder: location.sortOrder,
                        updatedAt: sql`now()`,
                    },
                })
                .returning({ id: locations.id, slug: locations.slug });

            locationIds.set(row.slug, row.id);
        }

        for (const [locationSlug, locationId] of locationIds) {
            for (const hours of businessHourSeeds) {
                await db
                    .insert(businessHours)
                    .values({
                        locationId,
                        dayOfWeek: hours.dayOfWeek,
                        openTime: hours.openTime,
                        closeTime: hours.closeTime,
                        closed: false,
                    })
                    .onConflictDoUpdate({
                        target: [businessHours.locationId, businessHours.dayOfWeek],
                        set: {
                            openTime: hours.openTime,
                            closeTime: hours.closeTime,
                            closed: false,
                            updatedAt: sql`now()`,
                        },
                    });
            }

            console.log(`Seeded business hours for ${locationSlug}.`);
        }

        for (const barber of barberSeeds) {
            const [row] = await db
                .insert(barbers)
                .values(barber)
                .onConflictDoUpdate({
                    target: barbers.slug,
                    set: {
                        displayName: barber.displayName,
                        active: true,
                        sortOrder: barber.sortOrder,
                        updatedAt: sql`now()`,
                    },
                })
                .returning({ id: barbers.id, slug: barbers.slug });

            barberIds.set(row.slug, row.id);
        }

        for (const assignment of barberLocationSeeds) {
            const barberId = barberIds.get(assignment.barberSlug);
            const locationId = locationIds.get(assignment.locationSlug);

            if (!barberId || !locationId) {
                throw new Error(
                    `Invalid barber/location assignment: ${assignment.barberSlug} -> ${assignment.locationSlug}`,
                );
            }

            await db
                .insert(barberLocations)
                .values({ barberId, locationId })
                .onConflictDoNothing();
        }

        for (const category of serviceCategorySeeds) {
            const [row] = await db
                .insert(serviceCategories)
                .values(category)
                .onConflictDoUpdate({
                    target: serviceCategories.slug,
                    set: {
                        name: category.name,
                        sortOrder: category.sortOrder,
                        updatedAt: sql`now()`,
                    },
                })
                .returning({ id: serviceCategories.id, slug: serviceCategories.slug });

            categoryIds.set(row.slug, row.id);
        }

        for (const service of serviceSeeds) {
            const categoryId = categoryIds.get(service.categorySlug);

            if (!categoryId) {
                throw new Error(`Invalid service category slug: ${service.categorySlug}`);
            }

            const [row] = await db
                .insert(services)
                .values({
                    categoryId,
                    slug: service.slug,
                    name: service.name,
                    durationMinutes: service.durationMinutes,
                    priceCents: service.priceCents,
                    priceType: service.priceType,
                    displayPrice: service.displayPrice,
                    active: true,
                    sortOrder: service.sortOrder,
                    isFeatured: service.isFeatured,
                })
                .onConflictDoUpdate({
                    target: services.slug,
                    set: {
                        categoryId,
                        name: service.name,
                        durationMinutes: service.durationMinutes,
                        priceCents: service.priceCents,
                        priceType: service.priceType,
                        displayPrice: service.displayPrice,
                        active: true,
                        sortOrder: service.sortOrder,
                        isFeatured: service.isFeatured,
                        updatedAt: sql`now()`,
                    },
                })
                .returning({ id: services.id, slug: services.slug });

            serviceIds.set(row.slug, row.id);
        }

        for (const barberId of barberIds.values()) {
            for (const serviceId of serviceIds.values()) {
                await db
                    .insert(barberServices)
                    .values({ barberId, serviceId, active: true })
                    .onConflictDoUpdate({
                        target: [barberServices.barberId, barberServices.serviceId],
                        set: {
                            active: true,
                            updatedAt: sql`now()`,
                        },
                    });
            }
        }

        console.log(
            `Seeded ${locationIds.size} locations, ${barberIds.size} barbers, ${serviceIds.size} services, and ${barberIds.size * serviceIds.size} barber-service capabilities.`,
        );
    } finally {
        await pool.end();
    }
}

seed().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
