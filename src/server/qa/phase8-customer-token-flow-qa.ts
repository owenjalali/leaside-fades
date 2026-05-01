import "dotenv/config";

import assert from "node:assert/strict";

import { eq, sql } from "drizzle-orm";
import request from "supertest";

import { hashBookingManagementToken } from "../bookings/tokens.ts";
import { createDatabaseClient } from "../db/client.ts";
import {
    barbers,
    bookings,
    bookingServices,
    businessHours,
    customers,
    locations,
    serviceCategories,
    services,
    shifts,
    users,
} from "../db/schema.ts";

const QA_EMAIL_DOMAIN = "example.local";
const QA_EMAIL_PATTERN = `phase8-qa-%@${QA_EMAIL_DOMAIN}`;
const TIME_ZONE = "America/Toronto";

interface SeedRows {
    locationId: string;
    barberId: string;
    serviceId: string;
}

interface AvailableSlot {
    barberId: string;
    locationId: string;
    startTime: string;
    endTime: string;
    totalDurationMinutes: number;
}

async function main() {
    assertLocalQaAllowed();

    const runId = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
    const { db, pool } = createDatabaseClient();

    try {
        await cleanupPriorQaRows(db);
        await assertMigrationsAndStaticSeedData(db);
        const seedRows = await loadSeedRows(db);
        await assertDevShiftsExist(db);

        const { default: app } = await import(new URL("../../../server.js", import.meta.url).href);

        await request(app).get("/api/booking/manage/not-a-real-token").expect(404);
        logStep("Invalid customer management token was rejected.");

        const cancelSlot = await findFirstAvailableSlot(app, seedRows);
        const cancelBooking = await createPublicQaBooking(app, seedRows, cancelSlot, {
            email: `phase8-qa-cancel-${runId}@${QA_EMAIL_DOMAIN}`,
            firstName: "Phase8",
            lastName: "Cancel",
        });
        const cancellationToken = tokenFromActionUrl(cancelBooking.body.cancelUrl, "cancel");
        const rescheduleTokenForCancelBooking = tokenFromActionUrl(cancelBooking.body.rescheduleUrl, "reschedule");

        await assertTokenHashesStored(db, cancelBooking.body.id, cancellationToken, rescheduleTokenForCancelBooking);
        await request(app).get(`/api/booking/manage/${cancellationToken}`).expect(200);
        await request(app).post(`/api/booking/manage/${rescheduleTokenForCancelBooking}/cancel`).expect(404);
        logStep("Public booking returned hashed token-backed management links and wrong-token cancel was rejected.");

        await request(app).post(`/api/booking/manage/${cancellationToken}/cancel`).expect(200);
        await request(app).post(`/api/booking/manage/${cancellationToken}/cancel`).expect(200);
        await assertBookingStatus(db, cancelBooking.body.id, "cancelled");
        await assertSlotAvailability(app, seedRows, cancelSlot.startTime, true);
        logStep("Cancellation token cancelled idempotently and freed the old slot.");

        const sourceSlot = await findFirstAvailableSlot(app, seedRows, { excludeStarts: new Set([cancelSlot.startTime]) });
        const rescheduleBooking = await createPublicQaBooking(app, seedRows, sourceSlot, {
            email: `phase8-qa-reschedule-${runId}@${QA_EMAIL_DOMAIN}`,
            firstName: "Phase8",
            lastName: "Reschedule",
        });
        const cancellationTokenForRescheduleBooking = tokenFromActionUrl(rescheduleBooking.body.cancelUrl, "cancel");
        const rescheduleToken = tokenFromActionUrl(rescheduleBooking.body.rescheduleUrl, "reschedule");
        const targetSlot = await findFirstAvailableSlot(app, seedRows, {
            excludeStarts: new Set([cancelSlot.startTime, sourceSlot.startTime]),
        });

        await request(app)
            .get(`/api/booking/manage/${rescheduleToken}/availability`)
            .query({
                locationId: seedRows.locationId,
                barberId: seedRows.barberId,
                date: localDateFromIso(targetSlot.startTime),
            })
            .expect(200);
        await request(app)
            .post(`/api/booking/manage/${cancellationTokenForRescheduleBooking}/reschedule`)
            .send({
                locationId: seedRows.locationId,
                barberId: seedRows.barberId,
                startTime: targetSlot.startTime,
            })
            .expect(404);
        const rescheduled = await request(app)
            .post(`/api/booking/manage/${rescheduleToken}/reschedule`)
            .send({
                locationId: seedRows.locationId,
                barberId: seedRows.barberId,
                startTime: targetSlot.startTime,
            })
            .expect(200);
        assert.equal(rescheduled.body.booking.startTime, targetSlot.startTime);
        await assertSlotAvailability(app, seedRows, sourceSlot.startTime, true);
        await assertSlotAvailability(app, seedRows, targetSlot.startTime, false);
        logStep("Reschedule token moved the booking, freed the old slot, and blocked the new slot.");

        const blockingSlot = await findFirstAvailableSlot(app, seedRows, {
            excludeStarts: new Set([cancelSlot.startTime, sourceSlot.startTime, targetSlot.startTime]),
        });
        await createPublicQaBooking(app, seedRows, blockingSlot, {
            email: `phase8-qa-blocking-${runId}@${QA_EMAIL_DOMAIN}`,
            firstName: "Phase8",
            lastName: "Blocking",
        });
        await request(app)
            .post(`/api/booking/manage/${rescheduleToken}/reschedule`)
            .send({
                locationId: seedRows.locationId,
                barberId: seedRows.barberId,
                startTime: blockingSlot.startTime,
            })
            .expect(409);
        logStep("Customer reschedule rejected a confirmed booking overlap.");

        console.log("Phase 8 customer token flow QA passed.");
    } catch (error) {
        if (isMissingMigrationError(error)) {
            throw new Error(
                `Database prerequisites are missing. Run npm run db:migrate and npm run db:seed against the local database, then retry. Original error: ${error instanceof Error ? error.message : String(error)}`,
            );
        }

        throw error;
    } finally {
        await cleanupPriorQaRows(db).catch((error) => {
            console.error("[phase8-customer-token-qa] Cleanup failed");
            console.error(error);
        });
        await pool.end();
    }
}

function assertLocalQaAllowed() {
    if (process.env.NODE_ENV === "production") {
        throw new Error("Phase 8 customer token QA must not run in production.");
    }

    if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL is required for Phase 8 customer token QA.");
    }

    const parsed = new URL(process.env.DATABASE_URL);
    const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

    if (!localHosts.has(parsed.hostname)) {
        throw new Error("Phase 8 customer token QA may only run against a local development database.");
    }
}

async function assertMigrationsAndStaticSeedData(db: ReturnType<typeof createDatabaseClient>["db"]) {
    await countRows(db, users);

    const [locationCount, businessHourCount, barberCount, categoryCount, serviceCount] =
        await Promise.all([
            countRows(db, locations),
            countRows(db, businessHours),
            countRows(db, barbers),
            countRows(db, serviceCategories),
            countRows(db, services),
        ]);

    assert.ok(locationCount >= 2, "Static seed data missing locations. Run npm run db:seed.");
    assert.ok(businessHourCount >= 14, "Static seed data missing business hours. Run npm run db:seed.");
    assert.ok(barberCount >= 2, "Static seed data missing barbers. Run npm run db:seed.");
    assert.ok(categoryCount >= 1, "Static seed data missing service categories. Run npm run db:seed.");
    assert.ok(serviceCount >= 1, "Static seed data missing services. Run npm run db:seed.");
    logStep("Database migrations and static seed data are present.");
}

async function loadSeedRows(db: ReturnType<typeof createDatabaseClient>["db"]): Promise<SeedRows> {
    const [location] = await db
        .select({ id: locations.id })
        .from(locations)
        .where(eq(locations.slug, "eglinton"))
        .limit(1);
    const [service] = await db
        .select({ id: services.id })
        .from(services)
        .where(eq(services.slug, "mens-cut"))
        .limit(1);
    const [barber] = await db
        .select({ id: barbers.id })
        .from(barbers)
        .where(eq(barbers.slug, "sam-to"))
        .limit(1);

    assert.ok(location?.id, "Seeded Eglinton location is missing.");
    assert.ok(service?.id, "Seeded Men's Cut service is missing.");
    assert.ok(barber?.id, "Seeded Sam To barber is missing.");

    return {
        locationId: location.id,
        serviceId: service.id,
        barberId: barber.id,
    };
}

async function assertDevShiftsExist(db: ReturnType<typeof createDatabaseClient>["db"]) {
    const shiftCount = await countRows(db, shifts);

    if (shiftCount === 0) {
        throw new Error("No local dev shifts found. Run npm run db:seed:dev-shifts before Phase 8 QA.");
    }

    logStep(`${shiftCount} local dev shift row(s) are available for QA.`);
}

async function createPublicQaBooking(
    app: any,
    seedRows: SeedRows,
    slot: AvailableSlot,
    customer: { email: string; firstName: string; lastName: string },
) {
    const response = await request(app)
        .post("/api/booking/bookings")
        .send({
            locationId: seedRows.locationId,
            serviceIds: [seedRows.serviceId],
            barberId: seedRows.barberId,
            startTime: slot.startTime,
            customer: {
                firstName: customer.firstName,
                lastName: customer.lastName,
                phone: "+16475550199",
                email: customer.email,
                notes: "Phase 8 customer token QA",
            },
        })
        .expect(201);

    assert.match(response.body.cancelUrl, /^\/booking\/[A-Za-z0-9_-]+\/cancel$/);
    assert.match(response.body.rescheduleUrl, /^\/booking\/[A-Za-z0-9_-]+\/reschedule$/);

    return response;
}

async function findFirstAvailableSlot(
    app: any,
    seedRows: SeedRows,
    options: { excludeStarts?: Set<string> } = {},
) {
    for (let dayOffset = 1; dayOffset <= 21; dayOffset += 1) {
        const date = localDateAfter(dayOffset);
        const response = await request(app)
            .get("/api/booking/availability")
            .query({
                locationId: seedRows.locationId,
                serviceIds: seedRows.serviceId,
                barberId: seedRows.barberId,
                date,
            })
            .expect(200);
        const slot = flattenSlots(response.body).find(
            (candidate) => !options.excludeStarts?.has(candidate.startTime),
        );

        if (slot) {
            return slot;
        }
    }

    throw new Error("No available Phase 8 QA slot found. Run npm run db:seed:dev-shifts for the local database.");
}

async function assertSlotAvailability(
    app: any,
    seedRows: SeedRows,
    startTime: string,
    expectedAvailable: boolean,
) {
    const response = await request(app)
        .get("/api/booking/availability")
        .query({
            locationId: seedRows.locationId,
            serviceIds: seedRows.serviceId,
            barberId: seedRows.barberId,
            date: localDateFromIso(startTime),
        })
        .expect(200);
    const isAvailable = flattenSlots(response.body).some((slot) => slot.startTime === startTime);
    assert.equal(isAvailable, expectedAvailable, `Expected ${startTime} availability to be ${expectedAvailable}.`);
}

async function assertTokenHashesStored(
    db: ReturnType<typeof createDatabaseClient>["db"],
    bookingId: string,
    cancellationToken: string,
    rescheduleToken: string,
) {
    const [row] = await db
        .select({
            cancellationTokenHash: bookings.cancellationTokenHash,
            rescheduleTokenHash: bookings.rescheduleTokenHash,
        })
        .from(bookings)
        .where(eq(bookings.id, bookingId))
        .limit(1);

    assert.equal(row?.cancellationTokenHash, hashBookingManagementToken(cancellationToken));
    assert.equal(row?.rescheduleTokenHash, hashBookingManagementToken(rescheduleToken));
    assert.notEqual(row?.cancellationTokenHash, cancellationToken);
    assert.notEqual(row?.rescheduleTokenHash, rescheduleToken);
}

async function assertBookingStatus(
    db: ReturnType<typeof createDatabaseClient>["db"],
    bookingId: string,
    status: "confirmed" | "cancelled" | "completed" | "no_show",
) {
    const [row] = await db
        .select({ status: bookings.status })
        .from(bookings)
        .where(eq(bookings.id, bookingId))
        .limit(1);

    assert.equal(row?.status, status);
}

function flattenSlots(payload: { barberSlots?: Array<{ slots?: AvailableSlot[] }> }) {
    return (payload.barberSlots ?? []).flatMap((barberSlot) => barberSlot.slots ?? []);
}

function tokenFromActionUrl(value: string, action: "cancel" | "reschedule") {
    const parts = value.split("/").filter(Boolean);
    assert.equal(parts[0], "booking");
    assert.equal(parts[2], action);
    return parts[1];
}

function localDateAfter(days: number) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });
    return formatter.format(date);
}

function localDateFromIso(value: string) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(new Date(value));
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
}

async function countRows(db: ReturnType<typeof createDatabaseClient>["db"], table: any) {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(table);
    return Number(row?.count ?? 0);
}

async function cleanupPriorQaRows(db: ReturnType<typeof createDatabaseClient>["db"]) {
    await db.execute(sql`
        delete from booking_services
        where booking_id in (
            select bookings.id
            from bookings
            inner join customers on customers.id = bookings.customer_id
            where customers.email like ${QA_EMAIL_PATTERN}
        )
    `);
    await db.execute(sql`
        delete from bookings
        where customer_id in (
            select id from customers where email like ${QA_EMAIL_PATTERN}
        )
    `);
    await db.execute(sql`delete from customers where email like ${QA_EMAIL_PATTERN}`);
    logStep("Prior Phase 8 QA rows were cleaned from the local database.");
}

function isMissingMigrationError(error: unknown) {
    if (!(error instanceof Error)) {
        return false;
    }

    return /relation .* does not exist|column .* does not exist|schema .* does not exist/i.test(error.message);
}

function logStep(message: string) {
    console.log(`[phase8-customer-token-qa] ${message}`);
}

main()
    .then(() => {
        process.exit(0);
    })
    .catch((error) => {
        console.error("[phase8-customer-token-qa] FAILED");
        console.error(error);
        process.exit(1);
    });
