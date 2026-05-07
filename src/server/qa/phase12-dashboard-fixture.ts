import "dotenv/config";

import assert from "node:assert/strict";

import { and, eq, inArray, like, sql } from "drizzle-orm";

import {
    addMinutes,
    getLocalDate,
    localDateTimeToUtc,
    timeToMinutes,
    minutesToTime,
    rangesOverlap,
} from "../availability/time.ts";
import { createDatabaseClient } from "../db/client.ts";
import {
    barbers,
    bookings,
    bookingServices,
    customers,
    locations,
    notifications,
    serviceCategories,
    services,
} from "../db/schema.ts";

const DEFAULT_TIME_ZONE = "America/Toronto";
const QA_NOTE_PREFIX = "Phase 12 dashboard fixture";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

export type DashboardFixtureStatus = "confirmed" | "cancelled" | "completed" | "no_show";
export type DashboardFixtureSource = "public" | "manual" | "walk_in" | "imported";
export type DashboardFixtureActivityEvent =
    | "booking_confirmation"
    | "cancellation_confirmation"
    | "reschedule_confirmation"
    | "reminder_24h"
    | "reminder_2h";
export type DashboardFixtureNotificationStatus = "pending" | "sent" | "failed" | "skipped";

export interface DashboardFixtureBookingPlan {
    key: string;
    firstName: string;
    lastName: string;
    status: DashboardFixtureStatus;
    source: DashboardFixtureSource;
    dayOffset: number;
    startClock: string;
    barberSlug: string;
    locationSlug: string;
    serviceSlugs: string[];
    estimatedPriceCents: number;
    fallbackDurationMinutes?: number;
    customerPhone: string | null;
    customerEmail: string | null;
    activityEventType?: DashboardFixtureActivityEvent;
    activityChannel?: "sms" | "email";
    notificationStatus?: DashboardFixtureNotificationStatus;
    scheduledOffsetMinutes?: number;
}

export interface DashboardFixturePlan {
    now: Date;
    today: string;
    bookings: DashboardFixtureBookingPlan[];
}

export function assertLocalDashboardFixtureAllowed(input: {
    databaseUrl: string | undefined;
    nodeEnv: string | undefined;
}) {
    if (input.nodeEnv === "production") {
        throw new Error("Phase 12 dashboard fixture must not run in production.");
    }

    if (!input.databaseUrl) {
        throw new Error("DATABASE_URL is required for the Phase 12 dashboard fixture.");
    }

    const parsed = new URL(input.databaseUrl);

    if (!LOCAL_HOSTS.has(parsed.hostname)) {
        throw new Error("Phase 12 dashboard fixture may only run against local development databases.");
    }
}

export function buildDashboardFixturePlan(now = new Date()): DashboardFixturePlan {
    const today = getLocalDate(now, DEFAULT_TIME_ZONE);

    return {
        now,
        today,
        bookings: [
            fixtureBooking("value-public-completed", -6, "10:00", "completed", "public", "sam-to", "eglinton", ["mens-cut"], 3800, {
                event: "booking_confirmation",
                notificationStatus: "sent",
                channel: "sms",
            }),
            fixtureBooking("value-manual-confirmed", -5, "10:45", "confirmed", "manual", "laura-nguyen", "millwood", ["mens-fade", "beard-trim"], 5300, {
                event: "booking_confirmation",
                notificationStatus: "sent",
                channel: "email",
            }),
            fixtureBooking("value-walkin-from-price", -4, "11:30", "completed", "walk_in", "yogesh-kumar", "millwood", ["womens-color"], 7000, {
                event: "booking_confirmation",
                notificationStatus: "skipped",
                channel: "sms",
                contact: "none",
            }),
            fixtureBooking("cancelled-excluded-value", -3, "12:15", "cancelled", "public", "sam-to", "eglinton", ["mens-cut"], 3800, {
                event: "cancellation_confirmation",
                notificationStatus: "sent",
                channel: "sms",
            }),
            fixtureBooking("no-show-excluded-value", -2, "13:00", "no_show", "manual", "laura-nguyen", "eglinton", ["mens-fade"], 4500),
            fixtureBooking("imported-active-value", -1, "14:30", "confirmed", "imported", "shayan-hussain", "millwood", ["mens-wash-fade"], 5500, {
                event: "booking_confirmation",
                notificationStatus: "skipped",
                channel: "email",
                contact: "none",
            }),
            fixtureBooking("today-unpriced-active", 0, "18:15", "confirmed", "manual", "sam-to", "eglinton", [], 0, {
                event: "booking_confirmation",
                notificationStatus: "skipped",
                channel: "sms",
                contact: "none",
                fallbackDurationMinutes: 30,
            }),
            fixtureBooking("upcoming-public-confirmed", 1, "10:00", "confirmed", "public", "sam-to", "eglinton", ["mens-cut"], 3800, {
                event: "booking_confirmation",
                notificationStatus: "sent",
                channel: "sms",
            }),
            fixtureBooking("upcoming-manual-confirmed", 2, "11:00", "confirmed", "manual", "laura-nguyen", "millwood", ["womens-medium-haircut-wash"], 4500, {
                event: "reminder_24h",
                notificationStatus: "pending",
                channel: "email",
                scheduledOffsetMinutes: -24 * 60,
            }),
            fixtureBooking("upcoming-cancelled", 3, "12:00", "cancelled", "manual", "yogesh-kumar", "millwood", ["mens-cut"], 3800, {
                event: "cancellation_confirmation",
                notificationStatus: "failed",
                channel: "sms",
            }),
            fixtureBooking("upcoming-rescheduled", 4, "13:00", "confirmed", "walk_in", "shayan-hussain", "millwood", ["senior-citizens-cut"], 3200, {
                event: "reschedule_confirmation",
                notificationStatus: "sent",
                channel: "email",
            }),
            fixtureBooking("upcoming-imported-confirmed", 5, "15:00", "confirmed", "imported", "laura-nguyen", "eglinton", ["mens-wash-cut"], 4800),
            fixtureBooking("upcoming-cancelled-public", 6, "16:00", "cancelled", "public", "sam-to", "eglinton", ["boys-cut-under-9"], 2800, {
                event: "cancellation_confirmation",
                notificationStatus: "sent",
                channel: "email",
            }),
        ],
    };
}

async function main() {
    assertLocalDashboardFixtureAllowed({
        databaseUrl: process.env.DATABASE_URL,
        nodeEnv: process.env.NODE_ENV,
    });

    const { db, pool } = createDatabaseClient();
    const plan = buildDashboardFixturePlan();

    try {
        await cleanupPriorFixtureRows(db);
        const seedRows = await loadFixtureSeedRows(db, plan);
        const insertedBookingIds: string[] = [];

        for (const [index, bookingPlan] of plan.bookings.entries()) {
            const bookingId = await insertFixtureBooking(db, seedRows, bookingPlan, plan, index);
            insertedBookingIds.push(bookingId);
        }

        console.log(
            `Seeded ${insertedBookingIds.length} local dashboard fixture bookings for ${plan.today}. Open /admin/dashboard and refresh to inspect realistic chart data.`,
        );
    } finally {
        await pool.end();
    }
}

function fixtureBooking(
    key: string,
    dayOffset: number,
    startClock: string,
    status: DashboardFixtureStatus,
    source: DashboardFixtureSource,
    barberSlug: string,
    locationSlug: string,
    serviceSlugs: string[],
    estimatedPriceCents: number,
    options: {
        event?: DashboardFixtureActivityEvent;
        notificationStatus?: DashboardFixtureNotificationStatus;
        channel?: "sms" | "email";
        contact?: "normal" | "none";
        fallbackDurationMinutes?: number;
        scheduledOffsetMinutes?: number;
    } = {},
): DashboardFixtureBookingPlan {
    const contact = options.contact ?? "normal";

    return {
        key,
        firstName: "Dashboard",
        lastName: titleCaseKey(key),
        status,
        source,
        dayOffset,
        startClock,
        barberSlug,
        locationSlug,
        serviceSlugs,
        estimatedPriceCents,
        fallbackDurationMinutes: options.fallbackDurationMinutes,
        customerPhone: contact === "none" ? null : "+16475550123",
        customerEmail: contact === "none" ? null : `${key}@example.local`,
        activityEventType: options.event,
        activityChannel: options.channel,
        notificationStatus: options.notificationStatus,
        scheduledOffsetMinutes: options.scheduledOffsetMinutes,
    };
}

type Db = ReturnType<typeof createDatabaseClient>["db"];

interface FixtureSeedRows {
    locationsBySlug: Map<string, { id: string; name: string }>;
    barbersBySlug: Map<string, { id: string; displayName: string }>;
    servicesBySlug: Map<
        string,
        {
            id: string;
            name: string;
            categoryName: string;
            durationMinutes: number;
            priceCents: number;
            priceType: "fixed" | "from";
            displayPrice: string;
        }
    >;
}

async function cleanupPriorFixtureRows(db: Db) {
    const priorBookings = await db
        .select({ id: bookings.id })
        .from(bookings)
        .where(like(bookings.internalNotes, `${QA_NOTE_PREFIX}%`));
    const priorBookingIds = priorBookings.map((booking) => booking.id);

    if (priorBookingIds.length > 0) {
        await db.delete(notifications).where(inArray(notifications.bookingId, priorBookingIds));
        await db.delete(bookingServices).where(inArray(bookingServices.bookingId, priorBookingIds));
        await db.delete(bookings).where(inArray(bookings.id, priorBookingIds));
    }

    await db.delete(customers).where(like(customers.notes, `${QA_NOTE_PREFIX}%`));
}

async function loadFixtureSeedRows(db: Db, plan: DashboardFixturePlan): Promise<FixtureSeedRows> {
    const locationSlugs = [...new Set(plan.bookings.map((booking) => booking.locationSlug))];
    const barberSlugs = [...new Set(plan.bookings.map((booking) => booking.barberSlug))];
    const serviceSlugs = [...new Set(plan.bookings.flatMap((booking) => booking.serviceSlugs))];

    const [locationRows, barberRows, serviceRows] = await Promise.all([
        db
            .select({ id: locations.id, slug: locations.slug, name: locations.name })
            .from(locations)
            .where(inArray(locations.slug, locationSlugs)),
        db
            .select({ id: barbers.id, slug: barbers.slug, displayName: barbers.displayName })
            .from(barbers)
            .where(inArray(barbers.slug, barberSlugs)),
        db
            .select({
                id: services.id,
                slug: services.slug,
                name: services.name,
                categoryName: serviceCategories.name,
                durationMinutes: services.durationMinutes,
                priceCents: services.priceCents,
                priceType: services.priceType,
                displayPrice: services.displayPrice,
            })
            .from(services)
            .innerJoin(serviceCategories, eq(services.categoryId, serviceCategories.id))
            .where(inArray(services.slug, serviceSlugs)),
    ]);

    const locationsBySlug = new Map(locationRows.map((location) => [location.slug, location]));
    const barbersBySlug = new Map(barberRows.map((barber) => [barber.slug, barber]));
    const servicesBySlug = new Map(serviceRows.map((service) => [service.slug, service]));

    for (const slug of locationSlugs) {
        assert.ok(locationsBySlug.has(slug), `Missing seeded location ${slug}. Run npm run db:seed.`);
    }

    for (const slug of barberSlugs) {
        assert.ok(barbersBySlug.has(slug), `Missing seeded barber ${slug}. Run npm run db:seed.`);
    }

    for (const slug of serviceSlugs) {
        assert.ok(servicesBySlug.has(slug), `Missing seeded service ${slug}. Run npm run db:seed.`);
    }

    return { locationsBySlug, barbersBySlug, servicesBySlug };
}

async function insertFixtureBooking(
    db: Db,
    seedRows: FixtureSeedRows,
    bookingPlan: DashboardFixtureBookingPlan,
    plan: DashboardFixturePlan,
    index: number,
) {
    const location = requiredMapValue(seedRows.locationsBySlug, bookingPlan.locationSlug);
    const barber = requiredMapValue(seedRows.barbersBySlug, bookingPlan.barberSlug);
    const serviceSnapshots = bookingPlan.serviceSlugs.map((slug) => requiredMapValue(seedRows.servicesBySlug, slug));
    const localDate = addLocalDays(plan.today, bookingPlan.dayOffset);
    const totalDurationMinutes =
        serviceSnapshots.reduce((sum, service) => sum + service.durationMinutes, 0) ||
        bookingPlan.fallbackDurationMinutes ||
        30;
    const startClock =
        bookingPlan.status === "confirmed"
            ? await findOpenConfirmedClock(db, barber.id, localDate, bookingPlan.startClock, totalDurationMinutes)
            : bookingPlan.startClock;
    const startTime = localDateTimeToUtc(localDate, startClock, DEFAULT_TIME_ZONE);
    const endTime = addMinutes(startTime, totalDurationMinutes);
    const timestamp = new Date(plan.now.getTime() - index * 3 * 60_000);

    const [customer] = await db
        .insert(customers)
        .values({
            firstName: bookingPlan.firstName,
            lastName: bookingPlan.lastName,
            phoneE164: bookingPlan.customerPhone,
            email: bookingPlan.customerEmail,
            notes: `${QA_NOTE_PREFIX} ${bookingPlan.key}`,
            createdAt: timestamp,
            updatedAt: timestamp,
        })
        .returning({ id: customers.id });

    const [booking] = await db
        .insert(bookings)
        .values({
            customerId: customer.id,
            barberId: barber.id,
            locationId: location.id,
            status: bookingPlan.status,
            source: bookingPlan.source,
            startTime,
            endTime,
            totalDurationMinutes,
            customerNotes: null,
            internalNotes: `${QA_NOTE_PREFIX} ${bookingPlan.key}`,
            cancelledAt: bookingPlan.status === "cancelled" ? timestamp : null,
            createdAt: timestamp,
            updatedAt: timestamp,
        })
        .returning({ id: bookings.id });

    if (serviceSnapshots.length > 0) {
        await db.insert(bookingServices).values(
            serviceSnapshots.map((service, serviceIndex) => ({
                bookingId: booking.id,
                serviceId: service.id,
                serviceName: service.name,
                categoryName: service.categoryName,
                durationMinutes: service.durationMinutes,
                priceCents: service.priceCents,
                priceType: service.priceType,
                displayPrice: service.displayPrice,
                sortOrder: serviceIndex,
                createdAt: timestamp,
            })),
        );
    }

    if (bookingPlan.activityEventType && bookingPlan.notificationStatus && bookingPlan.activityChannel) {
        const channel = bookingPlan.activityChannel;
        const scheduledFor =
            bookingPlan.scheduledOffsetMinutes === undefined
                ? null
                : addMinutes(startTime, bookingPlan.scheduledOffsetMinutes);
        const sentAt = bookingPlan.notificationStatus === "sent" ? timestamp : null;
        const lastAttemptAt = bookingPlan.notificationStatus === "pending" ? null : timestamp;

        await db.insert(notifications).values({
            bookingId: booking.id,
            recipientType: "customer",
            recipientPhone: channel === "sms" ? bookingPlan.customerPhone : null,
            recipientEmail: channel === "email" ? bookingPlan.customerEmail : null,
            channel,
            eventType: bookingPlan.activityEventType,
            status: bookingPlan.notificationStatus,
            provider: channel === "sms" ? "twilio" : "resend",
            idempotencyKey: `${QA_NOTE_PREFIX}:${bookingPlan.key}:${channel}`,
            providerMessageId: bookingPlan.notificationStatus === "sent" ? `${bookingPlan.key}-message` : null,
            errorMessage:
                bookingPlan.notificationStatus === "failed"
                    ? "Fixture provider rejected delivery for dashboard QA."
                    : null,
            metadata: {
                fixture: QA_NOTE_PREFIX,
                localDate,
                startClock,
                barber: barber.displayName,
                location: location.name,
            },
            attemptCount: bookingPlan.notificationStatus === "pending" ? 0 : 1,
            lastAttemptAt,
            scheduledFor,
            sentAt,
            createdAt: timestamp,
            updatedAt: timestamp,
        });
    }

    return booking.id;
}

async function findOpenConfirmedClock(
    db: Db,
    barberId: string,
    localDate: string,
    preferredClock: string,
    durationMinutes: number,
) {
    const dayStart = localDateTimeToUtc(localDate, "00:00", DEFAULT_TIME_ZONE);
    const dayEnd = localDateTimeToUtc(addLocalDays(localDate, 1), "00:00", DEFAULT_TIME_ZONE);
    const existing = await db
        .select({ startTime: bookings.startTime, endTime: bookings.endTime })
        .from(bookings)
        .where(
            and(
                eq(bookings.barberId, barberId),
                eq(bookings.status, "confirmed"),
                sql`${bookings.startTime} < ${dayEnd}`,
                sql`${bookings.endTime} > ${dayStart}`,
            ),
        );
    const preferredMinutes = timeToMinutes(preferredClock);

    for (let minutes = preferredMinutes; minutes <= 21 * 60; minutes += 15) {
        const candidateClock = minutesToTime(minutes);
        const candidateStart = localDateTimeToUtc(localDate, candidateClock, DEFAULT_TIME_ZONE);
        const candidateEnd = addMinutes(candidateStart, durationMinutes);
        const overlapsExisting = existing.some((row) =>
            rangesOverlap(candidateStart, candidateEnd, row.startTime, row.endTime),
        );

        if (!overlapsExisting) {
            return candidateClock;
        }
    }

    throw new Error(`No open local fixture slot found for barber ${barberId} on ${localDate}.`);
}

function addLocalDays(localDate: string, offset: number) {
    const [year, month, day] = localDate.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + offset, 12));

    return [
        String(date.getUTCFullYear()).padStart(4, "0"),
        String(date.getUTCMonth() + 1).padStart(2, "0"),
        String(date.getUTCDate()).padStart(2, "0"),
    ].join("-");
}

function titleCaseKey(value: string) {
    return value
        .split("-")
        .map((part) => part[0]?.toUpperCase() + part.slice(1))
        .join(" ");
}

function requiredMapValue<K, V>(map: Map<K, V>, key: K) {
    const value = map.get(key);

    if (!value) {
        throw new Error(`Missing required fixture row for ${String(key)}.`);
    }

    return value;
}

if (process.argv[1]?.endsWith("phase12-dashboard-fixture.ts")) {
    main().catch((error) => {
        console.error(error);
        process.exitCode = 1;
    });
}
