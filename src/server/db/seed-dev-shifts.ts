import "dotenv/config";

import { and, eq } from "drizzle-orm";

import { createDatabaseClient } from "./client.ts";
import { barbers, locations, shifts } from "./schema.ts";

const LOCAL_DEV_SAMPLE_SHIFT_ASSIGNMENTS = [
    {
        barberSlug: "sam-to",
        locationSlug: "eglinton",
        startTime: "10:00",
        weekdayEndTime: "19:00",
        sundayEndTime: "17:00",
    },
    {
        barberSlug: "yogesh-kumar",
        locationSlug: "millwood",
        startTime: "10:00",
        weekdayEndTime: "19:00",
        sundayEndTime: "17:00",
    },
    {
        barberSlug: "laura-nguyen",
        locationSlug: "eglinton",
        startTime: "10:00",
        weekdayEndTime: "19:00",
        sundayEndTime: "17:00",
    },
    {
        barberSlug: "josef",
        locationSlug: "eglinton",
        startTime: "11:00",
        weekdayEndTime: "19:00",
        sundayEndTime: "19:00",
    },
    {
        barberSlug: "shayan-hussain",
        locationSlug: "millwood",
        startTime: "10:00",
        weekdayEndTime: "19:00",
        sundayEndTime: "17:00",
    },
] as const;

interface LocalDevSampleShiftWindow {
    effectiveFrom: string;
    effectiveTo: string;
}

export interface LocalDevSampleShiftSpec {
    barberSlug: string;
    locationSlug: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    effectiveFrom: string;
    effectiveTo: string;
}

export function assertLocalDatabaseUrl(databaseUrl: string | undefined) {
    if (!databaseUrl) {
        throw new Error("DATABASE_URL is required before seeding local dev sample shifts.");
    }

    const parsed = new URL(databaseUrl);
    const localHosts = new Set(["localhost", "127.0.0.1", "::1"]);

    if (!localHosts.has(parsed.hostname)) {
        throw new Error(
            "Local dev sample shifts may only be seeded into local development databases.",
        );
    }
}

export function buildLocalDevSampleShiftSpecs(
    window: LocalDevSampleShiftWindow,
): LocalDevSampleShiftSpec[] {
    return LOCAL_DEV_SAMPLE_SHIFT_ASSIGNMENTS.flatMap((assignment) =>
        Array.from({ length: 7 }, (_, dayOfWeek) => ({
            barberSlug: assignment.barberSlug,
            locationSlug: assignment.locationSlug,
            dayOfWeek,
            startTime: assignment.startTime,
            endTime: dayOfWeek === 0 ? assignment.sundayEndTime : assignment.weekdayEndTime,
            effectiveFrom: window.effectiveFrom,
            effectiveTo: window.effectiveTo,
        })),
    );
}

async function seedLocalDevSampleShifts() {
    assertLocalDatabaseUrl(process.env.DATABASE_URL);

    const window = {
        effectiveFrom: getLocalDateOffset(0),
        effectiveTo: getLocalDateOffset(30),
    };
    const specs = buildLocalDevSampleShiftSpecs(window);
    const { db, pool } = createDatabaseClient();

    try {
        const [barberRows, locationRows] = await Promise.all([
            db.select({ id: barbers.id, slug: barbers.slug }).from(barbers),
            db.select({ id: locations.id, slug: locations.slug }).from(locations),
        ]);
        const barberIds = new Map(barberRows.map((barber) => [barber.slug, barber.id]));
        const locationIds = new Map(locationRows.map((location) => [location.slug, location.id]));
        let inserted = 0;
        let skipped = 0;

        for (const spec of specs) {
            const barberId = barberIds.get(spec.barberSlug);
            const locationId = locationIds.get(spec.locationSlug);

            if (!barberId || !locationId) {
                throw new Error(
                    `Missing seeded barber/location for ${spec.barberSlug} at ${spec.locationSlug}.`,
                );
            }

            const existing = await db
                .select({ id: shifts.id })
                .from(shifts)
                .where(
                    and(
                        eq(shifts.barberId, barberId),
                        eq(shifts.locationId, locationId),
                        eq(shifts.dayOfWeek, spec.dayOfWeek),
                        eq(shifts.startTime, spec.startTime),
                        eq(shifts.endTime, spec.endTime),
                        eq(shifts.effectiveFrom, spec.effectiveFrom),
                        eq(shifts.effectiveTo, spec.effectiveTo),
                    ),
                )
                .limit(1);

            if (existing.length > 0) {
                skipped += 1;
                continue;
            }

            await db.insert(shifts).values({
                barberId,
                locationId,
                dayOfWeek: spec.dayOfWeek,
                startTime: spec.startTime,
                endTime: spec.endTime,
                effectiveFrom: spec.effectiveFrom,
                effectiveTo: spec.effectiveTo,
                active: true,
            });
            inserted += 1;
        }

        // eslint-disable-next-line no-console
        console.log(
            `Seeded ${inserted} local/dev-only sample shifts (${skipped} already existed) for ${window.effectiveFrom} through ${window.effectiveTo}.`,
        );
    } finally {
        await pool.end();
    }
}

function getLocalDateOffset(offsetDays: number) {
    const now = new Date();
    now.setDate(now.getDate() + offsetDays);
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Toronto",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(now);
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";

    return `${get("year")}-${get("month")}-${get("day")}`;
}

if (process.argv[1]?.endsWith("seed-dev-shifts.ts")) {
    seedLocalDevSampleShifts().catch((error) => {
        // eslint-disable-next-line no-console
        console.error(error);
        process.exit(1);
    });
}
