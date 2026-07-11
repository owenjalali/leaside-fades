import "dotenv/config";

import { and, asc, eq, inArray, isNull, ne, notInArray, sql } from "drizzle-orm";

import { createDatabaseClient } from "./client.ts";
import {
    barbers,
    barberLocations,
    barberServices,
    locations,
    services,
    shifts,
} from "./schema.ts";

const JOSEF_SLUG = "josef";
const EGLINTON_SLUG = "eglinton";
const YOGESH_SLUG = "yogesh-kumar";
const MILLWOOD_SLUG = "millwood";

export interface JosefLaunchShiftSpec {
    barberSlug: typeof JOSEF_SLUG;
    locationSlug: typeof EGLINTON_SLUG;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
}

export function buildJosefLaunchShiftSpecs(): JosefLaunchShiftSpec[] {
    return Array.from({ length: 7 }, (_, dayOfWeek) => ({
        barberSlug: JOSEF_SLUG,
        locationSlug: EGLINTON_SLUG,
        dayOfWeek,
        startTime: "11:00",
        endTime: "19:00",
    }));
}

async function seedJosef() {
    const { db, pool } = createDatabaseClient();

    try {
        const [josef] = await db
            .insert(barbers)
            .values({
                slug: JOSEF_SLUG,
                displayName: "Josef",
                active: true,
                sortOrder: 35,
            })
            .onConflictDoUpdate({
                target: barbers.slug,
                set: {
                    displayName: "Josef",
                    active: true,
                    sortOrder: 35,
                    updatedAt: sql`now()`,
                },
            })
            .returning({ id: barbers.id });

        const [eglinton] = await db
            .select({ id: locations.id })
            .from(locations)
            .where(eq(locations.slug, EGLINTON_SLUG))
            .limit(1);
        const [millwood] = await db
            .select({ id: locations.id })
            .from(locations)
            .where(eq(locations.slug, MILLWOOD_SLUG))
            .limit(1);

        if (!eglinton || !millwood) {
            throw new Error("Launch locations must be seeded before launch staff can be synced.");
        }

        await ensureOnlyLocationAssignment(josef.id, eglinton.id);

        const [yogesh] = await db
            .select({ id: barbers.id })
            .from(barbers)
            .where(eq(barbers.slug, YOGESH_SLUG))
            .limit(1);

        if (yogesh) {
            await ensureOnlyLocationAssignment(yogesh.id, millwood.id);
        }

        const activeServices = await db
            .select({ id: services.id })
            .from(services)
            .where(eq(services.active, true));

        for (const service of activeServices) {
            await db
                .insert(barberServices)
                .values({ barberId: josef.id, serviceId: service.id, active: true })
                .onConflictDoUpdate({
                    target: [barberServices.barberId, barberServices.serviceId],
                    set: {
                        active: true,
                        updatedAt: sql`now()`,
                    },
                });
        }

        const keptShiftIds: string[] = [];
        for (const spec of buildJosefLaunchShiftSpecs()) {
            const [existing] = await db
                .select({ id: shifts.id })
                .from(shifts)
                .where(
                    and(
                        eq(shifts.barberId, josef.id),
                        eq(shifts.locationId, eglinton.id),
                        eq(shifts.dayOfWeek, spec.dayOfWeek),
                        eq(shifts.startTime, spec.startTime),
                        eq(shifts.endTime, spec.endTime),
                        isNull(shifts.effectiveFrom),
                        isNull(shifts.effectiveTo),
                    ),
                )
                .orderBy(asc(shifts.createdAt))
                .limit(1);

            if (existing) {
                await db
                    .update(shifts)
                    .set({ active: true, updatedAt: sql`now()` })
                    .where(eq(shifts.id, existing.id));
                keptShiftIds.push(existing.id);
                continue;
            }

            const [created] = await db
                .insert(shifts)
                .values({
                    barberId: josef.id,
                    locationId: eglinton.id,
                    dayOfWeek: spec.dayOfWeek,
                    startTime: spec.startTime,
                    endTime: spec.endTime,
                    effectiveFrom: null,
                    effectiveTo: null,
                    active: true,
                })
                .returning({ id: shifts.id });

            keptShiftIds.push(created.id);
        }

        if (keptShiftIds.length > 0) {
            await db
                .update(shifts)
                .set({ active: false, updatedAt: sql`now()` })
                .where(and(eq(shifts.barberId, josef.id), notInArray(shifts.id, keptShiftIds)));
        }

        const [assignmentCount] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(barberLocations)
            .where(
                and(
                    eq(barberLocations.barberId, josef.id),
                    inArray(barberLocations.locationId, [eglinton.id]),
                ),
            );

        console.log(
            `Josef launch seed complete: ${assignmentCount?.count ?? 0} Eglinton assignment, ${activeServices.length} services, ${keptShiftIds.length} active shifts.`,
        );
    } finally {
        await pool.end();
    }

    async function ensureOnlyLocationAssignment(barberId: string, locationId: string) {
        await db
            .delete(barberLocations)
            .where(
                and(
                    eq(barberLocations.barberId, barberId),
                    ne(barberLocations.locationId, locationId),
                ),
            );

        await db
            .insert(barberLocations)
            .values({ barberId, locationId })
            .onConflictDoNothing();
    }
}

if (process.argv[1]?.endsWith("seed-josef.ts")) {
    seedJosef().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}
