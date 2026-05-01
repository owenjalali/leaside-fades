import "dotenv/config";

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import { asc, eq, ne, sql } from "drizzle-orm";
import request from "supertest";

import { hashPassword } from "../auth/password.ts";
import { seedDevOwner } from "../db/seed-dev-owner.ts";
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
    userSessions,
    users,
} from "../db/schema.ts";

const QA_EMAIL_DOMAIN = "example.local";
const QA_EMAIL_PATTERN = `phase6-qa-%@${QA_EMAIL_DOMAIN}`;
const QA_NOTE_PREFIX = "Phase 6 admin QA";

interface SeedRows {
    locationId: string;
    barberId: string;
    otherBarberId: string;
    serviceId: string;
}

async function main() {
    assertLocalQaAllowed();

    const ownerEmail = (process.env.DEV_OWNER_EMAIL || `phase6-qa-owner@${QA_EMAIL_DOMAIN}`)
        .trim()
        .toLowerCase();
    const ownerPassword =
        process.env.DEV_OWNER_PASSWORD || `qa-owner-${randomBytes(18).toString("base64url")}`;
    const runId = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
    const barberEmail = `phase6-qa-barber-${runId}@${QA_EMAIL_DOMAIN}`;
    const barberPassword = `qa-barber-${randomBytes(18).toString("base64url")}`;

    const { db, pool } = createDatabaseClient();

    try {
        await cleanupPriorQaRows(db);
        await assertMigrationsAndStaticSeedData(db);
        const seedRows = await loadSeedRows(db);
        await assertDevShiftsExist(db);
        await seedDevOwner({
            ...process.env,
            DEV_OWNER_EMAIL: ownerEmail,
            DEV_OWNER_PASSWORD: ownerPassword,
            DEV_OWNER_NAME: "Phase 6 QA Owner",
        });
        await createLinkedBarberUser(db, {
            email: barberEmail,
            password: barberPassword,
            barberId: seedRows.barberId,
        });
        const otherBookingId = await createQaBooking(db, {
            customerEmail: `phase6-qa-other-customer-${runId}@${QA_EMAIL_DOMAIN}`,
            customerFirstName: "Phase6",
            customerLastName: "Other",
            barberId: seedRows.otherBarberId,
            locationId: seedRows.locationId,
            serviceId: seedRows.serviceId,
            startTime: futureUtcHour(15),
            note: `${QA_NOTE_PREFIX} other ${runId}`,
        });

        const { default: app } = await import(new URL("../../../server.js", import.meta.url).href);
        const ownerAgent = request.agent(app);

        await ownerAgent
            .post("/api/admin/auth/login")
            .send({ email: ownerEmail, password: ownerPassword })
            .expect(200);
        logStep("Owner logged in through the real admin auth route.");

        await request(app).get("/api/booking/catalog").expect(200);
        await request(app).get("/api/booking/catalog").set("Origin", "https://evil.example").expect(200);
        await request(app)
            .get("/api/booking/availability")
            .set("Origin", "https://evil.example")
            .query({
                locationId: seedRows.locationId,
                serviceIds: seedRows.serviceId,
                barberId: seedRows.barberId,
                date: localDateAfter(1),
            })
            .expect(200);
        logStep("Public booking catalog and availability remain public and outside the admin Origin guard.");

        const optionsResponse = await ownerAgent.get("/api/admin/calendar/options").expect(200);
        assert.ok(optionsResponse.body.locations.length >= 2, "Expected admin calendar locations.");
        assert.ok(optionsResponse.body.barbers.length >= 1, "Expected admin calendar barbers.");
        logStep("Owner loaded admin calendar options.");

        const slot = await findFirstAvailableOwnerSlot(ownerAgent, seedRows);
        logStep(`Owner availability returned slot ${slot.startTime}.`);

        await ownerAgent
            .post("/api/admin/bookings")
            .set("Origin", "https://evil.example")
            .send({
                locationId: seedRows.locationId,
                serviceIds: [seedRows.serviceId],
                barberId: seedRows.barberId,
                startTime: slot.startTime,
                customer: {
                    firstName: "Phase6",
                    lastName: "RejectedOrigin",
                    phone: "+16475550123",
                    email: `phase6-qa-rejected-origin-${runId}@${QA_EMAIL_DOMAIN}`,
                },
                internalNotes: `${QA_NOTE_PREFIX} rejected origin ${runId}`,
            })
            .expect(403);
        logStep("Admin mutation Origin guard rejected an invalid Origin header.");

        const createResponse = await ownerAgent
            .post("/api/admin/bookings")
            .send({
                locationId: seedRows.locationId,
                serviceIds: [seedRows.serviceId],
                barberId: seedRows.barberId,
                startTime: slot.startTime,
                customer: {
                    firstName: "Phase6",
                    lastName: "Manual",
                    phone: "+16475550123",
                    email: `phase6-qa-manual-customer-${runId}@${QA_EMAIL_DOMAIN}`,
                },
                internalNotes: `${QA_NOTE_PREFIX} manual ${runId}`,
            })
            .expect(201);
        const bookingId = createResponse.body.booking.id;
        assert.equal(createResponse.body.booking.source, "manual");
        logStep("Owner created a manual booking through the authenticated API.");

        await ownerAgent.get(`/api/admin/bookings/${bookingId}`).expect(200);
        logStep("Owner opened the booking detail route.");

        const barberAgent = request.agent(app);
        await barberAgent
            .post("/api/admin/auth/login")
            .send({ email: barberEmail, password: barberPassword })
            .expect(200);
        const barberBookingsResponse = await barberAgent.get("/api/admin/bookings").expect(200);
        assert.ok(
            barberBookingsResponse.body.bookings.every(
                (booking: { barberId: string }) => booking.barberId === seedRows.barberId,
            ),
            "Barber received out-of-scope booking rows.",
        );
        await barberAgent.get(`/api/admin/bookings/${otherBookingId}`).expect(404);
        await barberAgent
            .post(`/api/admin/bookings/${otherBookingId}/cancel`)
            .expect(404);
        logStep("Barber reads and management are scoped to the linked barber only.");

        const rescheduleSlot = await findFirstAvailableOwnerSlot(ownerAgent, seedRows, bookingId);
        await ownerAgent
            .post(`/api/admin/bookings/${bookingId}/reschedule`)
            .send({
                locationId: seedRows.locationId,
                barberId: seedRows.barberId,
                startTime: rescheduleSlot.startTime,
            })
            .expect(200);
        logStep("Owner rescheduled the manual booking.");

        await ownerAgent.post(`/api/admin/bookings/${bookingId}/cancel`).expect(200);
        const cancelledDetail = await ownerAgent.get(`/api/admin/bookings/${bookingId}`).expect(200);
        assert.equal(cancelledDetail.body.booking.status, "cancelled");
        logStep("Owner cancelled the manual booking and detail reflects cancellation.");

        console.log("Phase 6 admin flow QA passed.");
    } catch (error) {
        if (isMissingMigrationError(error)) {
            throw new Error(
                `Database prerequisites are missing. Run npm run db:migrate and npm run db:seed against the local database, then retry. Original error: ${error instanceof Error ? error.message : String(error)}`,
            );
        }

        throw error;
    } finally {
        await pool.end();
    }
}

function assertLocalQaAllowed() {
    if (process.env.NODE_ENV === "production") {
        throw new Error("Phase 6 admin QA must not run in production.");
    }

    if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL is required for Phase 6 admin QA.");
    }

    const parsed = new URL(process.env.DATABASE_URL);
    const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

    if (!localHosts.has(parsed.hostname)) {
        throw new Error("Phase 6 admin QA may only run against a local development database.");
    }
}

async function assertMigrationsAndStaticSeedData(db: ReturnType<typeof createDatabaseClient>["db"]) {
    await Promise.all([countRows(db, users), countRows(db, userSessions)]);

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
    const [otherBarber] = await db
        .select({ id: barbers.id })
        .from(barbers)
        .where(ne(barbers.slug, "sam-to"))
        .orderBy(asc(barbers.sortOrder), asc(barbers.slug))
        .limit(1);

    assert.ok(location?.id, "Seeded Eglinton location is missing.");
    assert.ok(service?.id, "Seeded Men's Cut service is missing.");
    assert.ok(barber?.id, "Seeded Sam To barber is missing.");
    assert.ok(otherBarber?.id, "A second seeded barber is required for scope QA.");

    return {
        locationId: location.id,
        serviceId: service.id,
        barberId: barber.id,
        otherBarberId: otherBarber.id,
    };
}

async function assertDevShiftsExist(db: ReturnType<typeof createDatabaseClient>["db"]) {
    const shiftCount = await countRows(db, shifts);

    if (shiftCount === 0) {
        throw new Error("No local dev shifts found. Run npm run db:seed:dev-shifts before Phase 6 QA.");
    }

    logStep(`${shiftCount} local dev shift row(s) are available for QA.`);
}

async function createLinkedBarberUser(
    db: ReturnType<typeof createDatabaseClient>["db"],
    input: { email: string; password: string; barberId: string },
) {
    await db.insert(users).values({
        email: input.email,
        displayName: "Phase 6 QA Barber",
        role: "barber",
        barberId: input.barberId,
        passwordHash: await hashPassword(input.password),
        active: true,
    });
}

async function createQaBooking(db: ReturnType<typeof createDatabaseClient>["db"], input: {
    customerEmail: string;
    customerFirstName: string;
    customerLastName: string;
    barberId: string;
    locationId: string;
    serviceId: string;
    startTime: Date;
    note: string;
}) {
    const [customer] = await db
        .insert(customers)
        .values({
            firstName: input.customerFirstName,
            lastName: input.customerLastName,
            phoneE164: "+16475550199",
            email: input.customerEmail,
        })
        .returning({ id: customers.id });
    const [booking] = await db
        .insert(bookings)
        .values({
            customerId: customer.id,
            barberId: input.barberId,
            locationId: input.locationId,
            status: "confirmed",
            source: "manual",
            startTime: input.startTime,
            endTime: new Date(input.startTime.getTime() + 30 * 60 * 1000),
            totalDurationMinutes: 30,
            internalNotes: input.note,
        })
        .returning({ id: bookings.id });

    await db.insert(bookingServices).values({
        bookingId: booking.id,
        serviceId: input.serviceId,
        serviceName: "Men's Cut",
        categoryName: "Hair & Styling (Men)",
        durationMinutes: 30,
        priceCents: 3000,
        priceType: "fixed",
        displayPrice: "$30",
        sortOrder: 10,
    });

    return booking.id;
}

async function findFirstAvailableOwnerSlot(
    agent: any,
    seedRows: SeedRows,
    excludeBookingId?: string,
) {
    for (let dayOffset = 1; dayOffset <= 21; dayOffset += 1) {
        const date = localDateAfter(dayOffset);
        const response = await agent
            .get("/api/admin/availability")
            .query({
                locationId: seedRows.locationId,
                serviceIds: seedRows.serviceId,
                barberId: seedRows.barberId,
                date,
            })
            .expect(200);
        const slots = response.body.barberSlots.flatMap((barberSlot: { slots: any[] }) => barberSlot.slots);
        const slot = slots.find((candidate: { startTime: string }) =>
            excludeBookingId ? !candidate.startTime.endsWith("14:00:00.000Z") : true,
        );

        if (slot) {
            return slot as { startTime: string; endTime: string };
        }
    }

    throw new Error("No available Phase 6 QA slot found. Confirm local dev shifts and booking window.");
}

function localDateAfter(days: number) {
    const date = new Date();
    date.setDate(date.getDate() + days);
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Toronto",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    });
    return formatter.format(date);
}

function futureUtcHour(hour: number) {
    const date = new Date();
    date.setUTCDate(date.getUTCDate() + 10);
    date.setUTCHours(hour, 0, 0, 0);
    return date;
}

async function countRows(db: ReturnType<typeof createDatabaseClient>["db"], table: any) {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(table);
    return Number(row?.count ?? 0);
}

async function cleanupPriorQaRows(db: ReturnType<typeof createDatabaseClient>["db"]) {
    await db.execute(sql`
        delete from booking_services
        where booking_id in (
            select id from bookings where internal_notes like ${`${QA_NOTE_PREFIX}%`}
        )
    `);
    await db.execute(sql`delete from bookings where internal_notes like ${`${QA_NOTE_PREFIX}%`}`);
    await db.execute(sql`delete from customers where email like ${QA_EMAIL_PATTERN}`);
    await db.execute(sql`delete from user_sessions where user_id in (select id from users where email like ${QA_EMAIL_PATTERN})`);
    await db.execute(sql`delete from users where email like ${QA_EMAIL_PATTERN}`);
    logStep("Prior Phase 6 QA rows were cleaned from the local database.");
}

function isMissingMigrationError(error: unknown) {
    if (!(error instanceof Error)) {
        return false;
    }

    return /relation .* does not exist|column .* does not exist|schema .* does not exist/i.test(error.message);
}

function logStep(message: string) {
    console.log(`[phase6-admin-qa] ${message}`);
}

main()
    .then(() => {
        process.exit(0);
    })
    .catch((error) => {
        console.error("[phase6-admin-qa] FAILED");
        console.error(error);
        process.exit(1);
    });
