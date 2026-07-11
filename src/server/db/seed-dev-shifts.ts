import "dotenv/config";

import { and, eq, inArray, sql } from "drizzle-orm";

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

export interface LocalDevSampleShiftWindow {
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

export interface ResolvedLocalDevSampleShiftSpec extends LocalDevSampleShiftSpec {
    barberId: string;
    locationId: string;
}

export interface CandidateShiftRow {
    barberId: string;
    locationId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    effectiveFrom: string | null;
    effectiveTo: string | null;
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

/**
 * Decides whether an existing shift row was produced by a prior run of this
 * seeder. Prior generations match a sample spec's identifying tuple exactly
 * (barber, location, day of week, start and end time) but carry a different
 * (effectiveFrom, effectiveTo) window than the current run. Rows that do not
 * match a sample tuple — for example hand-entered shifts with non-sample
 * times — are never considered seeder output and are never deactivated.
 */
export function isPriorSampleGeneration(
    row: CandidateShiftRow,
    specs: readonly ResolvedLocalDevSampleShiftSpec[],
    currentWindow: LocalDevSampleShiftWindow,
): boolean {
    const matchesSampleTuple = specs.some(
        (spec) =>
            spec.barberId === row.barberId &&
            spec.locationId === row.locationId &&
            spec.dayOfWeek === row.dayOfWeek &&
            normalizeTime(spec.startTime) === normalizeTime(row.startTime) &&
            normalizeTime(spec.endTime) === normalizeTime(row.endTime),
    );

    if (!matchesSampleTuple) {
        return false;
    }

    return (
        row.effectiveFrom !== currentWindow.effectiveFrom ||
        row.effectiveTo !== currentWindow.effectiveTo
    );
}

// Postgres `time` columns read back as "HH:MM:SS" while the sample constants
// use "HH:MM"; compare on the zero-padded HH:MM prefix.
function normalizeTime(value: string) {
    return value.slice(0, 5);
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
        const resolvedSpecs = specs.map((spec): ResolvedLocalDevSampleShiftSpec => {
            const barberId = barberIds.get(spec.barberSlug);
            const locationId = locationIds.get(spec.locationSlug);

            if (!barberId || !locationId) {
                throw new Error(
                    `Missing seeded barber/location for ${spec.barberSlug} at ${spec.locationSlug}.`,
                );
            }

            return { ...spec, barberId, locationId };
        });
        const deactivated = await deactivatePriorSampleGenerations(db, resolvedSpecs, window);
        let inserted = 0;
        let skipped = 0;

        for (const spec of resolvedSpecs) {
            const existing = await db
                .select({ id: shifts.id })
                .from(shifts)
                .where(
                    and(
                        eq(shifts.barberId, spec.barberId),
                        eq(shifts.locationId, spec.locationId),
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
                barberId: spec.barberId,
                locationId: spec.locationId,
                dayOfWeek: spec.dayOfWeek,
                startTime: spec.startTime,
                endTime: spec.endTime,
                effectiveFrom: spec.effectiveFrom,
                effectiveTo: spec.effectiveTo,
                active: true,
            });
            inserted += 1;
        }

        console.log(
            `Seeded ${inserted} local/dev-only sample shifts (${skipped} already existed, ${deactivated} prior-generation rows deactivated) for ${window.effectiveFrom} through ${window.effectiveTo}.`,
        );
    } finally {
        await pool.end();
    }
}

/**
 * Marks every still-active shift left behind by earlier seeder runs as
 * inactive so repeated runs never stack overlapping sample generations.
 * Rows are deactivated, never deleted, and only when they match a sample
 * spec's identifying tuple with a window other than the current run's.
 */
async function deactivatePriorSampleGenerations(
    db: ReturnType<typeof createDatabaseClient>["db"],
    resolvedSpecs: readonly ResolvedLocalDevSampleShiftSpec[],
    window: LocalDevSampleShiftWindow,
): Promise<number> {
    const seededBarberIds = [...new Set(resolvedSpecs.map((spec) => spec.barberId))];

    if (seededBarberIds.length === 0) {
        return 0;
    }

    const candidateRows = await db
        .select({
            id: shifts.id,
            barberId: shifts.barberId,
            locationId: shifts.locationId,
            dayOfWeek: shifts.dayOfWeek,
            startTime: shifts.startTime,
            endTime: shifts.endTime,
            effectiveFrom: shifts.effectiveFrom,
            effectiveTo: shifts.effectiveTo,
        })
        .from(shifts)
        .where(and(inArray(shifts.barberId, seededBarberIds), eq(shifts.active, true)));
    const staleIds = candidateRows
        .filter((row) => isPriorSampleGeneration(row, resolvedSpecs, window))
        .map((row) => row.id);

    if (staleIds.length > 0) {
        await db
            .update(shifts)
            .set({ active: false, updatedAt: sql`now()` })
            .where(inArray(shifts.id, staleIds));
    }

    return staleIds.length;
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
        console.error(error);
        process.exit(1);
    });
}
