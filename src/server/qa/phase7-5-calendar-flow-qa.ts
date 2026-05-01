import "dotenv/config";

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import { and, asc, eq, ne, sql } from "drizzle-orm";
import request from "supertest";

import { hashPassword } from "../auth/password.ts";
import { localDateTimeToUtc } from "../availability/time.ts";
import { createDatabaseClient } from "../db/client.ts";
import { seedDevOwner } from "../db/seed-dev-owner.ts";
import {
    barbers,
    barberLocations,
    blockedTimes,
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
const QA_EMAIL_PATTERN = `phase75-qa-%@${QA_EMAIL_DOMAIN}`;
const QA_NOTE_PREFIX = "Phase 7.5 calendar QA";
const QA_REASON_PREFIX = "Phase 7.5 calendar QA";
const TIME_ZONE = "America/Toronto";

interface SeedRows {
    locationId: string;
    barberId: string;
    otherBarberId: string;
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

    const ownerEmail = (process.env.DEV_OWNER_EMAIL || `phase75-qa-owner@${QA_EMAIL_DOMAIN}`)
        .trim()
        .toLowerCase();
    const ownerPassword =
        process.env.DEV_OWNER_PASSWORD || `qa-owner-${randomBytes(18).toString("base64url")}`;
    const runId = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
    const barberEmail = `phase75-qa-barber-${runId}@${QA_EMAIL_DOMAIN}`;
    const barberPassword = `qa-barber-${randomBytes(18).toString("base64url")}`;
    const misconfiguredEmail = `phase75-qa-misconfigured-${runId}@${QA_EMAIL_DOMAIN}`;
    const inactiveEmail = `phase75-qa-inactive-${runId}@${QA_EMAIL_DOMAIN}`;
    let restoreBarberId: string | null = null;

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
            DEV_OWNER_NAME: "Phase 7.5 QA Owner",
        });
        await createBarberUser(db, {
            email: barberEmail,
            password: barberPassword,
            barberId: seedRows.barberId,
            displayName: "Phase 7.5 QA Barber",
            active: true,
        });
        await createBarberUser(db, {
            email: misconfiguredEmail,
            password: barberPassword,
            barberId: null,
            displayName: "Phase 7.5 Misconfigured Barber",
            active: true,
        });
        await createBarberUser(db, {
            email: inactiveEmail,
            password: barberPassword,
            barberId: seedRows.barberId,
            displayName: "Phase 7.5 Inactive Barber",
            active: false,
        });

        const { default: app } = await import(new URL("../../../server.js", import.meta.url).href);
        const ownerAgent = request.agent(app);
        const barberAgent = request.agent(app);
        const misconfiguredAgent = request.agent(app);

        await ownerAgent
            .post("/api/admin/auth/login")
            .send({ email: ownerEmail, password: ownerPassword })
            .expect(200);
        await barberAgent
            .post("/api/admin/auth/login")
            .send({ email: barberEmail, password: barberPassword })
            .expect(200);
        await request(app)
            .post("/api/admin/auth/login")
            .send({ email: inactiveEmail, password: barberPassword })
            .expect(401);
        logStep("Owner and linked barber logged in; inactive user login was rejected.");

        await misconfiguredAgent
            .post("/api/admin/auth/login")
            .send({ email: misconfiguredEmail, password: barberPassword })
            .expect(200);
        await misconfiguredAgent
            .post("/api/admin/bookings/walk-in")
            .send({
                locationId: seedRows.locationId,
                barberId: seedRows.barberId,
                serviceIds: [seedRows.serviceId],
                startTime: localDateTimeToUtc(localDateAfter(1), "10:00", TIME_ZONE).toISOString(),
                customerName: "Phase75 Misconfigured",
            })
            .expect(403);
        logStep("Misconfigured barber user without barberId cannot create walk-ins.");

        const ownWalkInSlot = await findFirstAvailableSlot(ownerAgent, seedRows, seedRows.barberId);
        const ownWalkIn = await barberAgent
            .post("/api/admin/bookings/walk-in")
            .send({
                locationId: seedRows.locationId,
                barberId: seedRows.barberId,
                serviceIds: [seedRows.serviceId],
                startTime: ownWalkInSlot.startTime,
                customerName: "Phase75 OwnWalkIn",
                internalNotes: `${QA_NOTE_PREFIX} own walk-in ${runId}`,
            })
            .expect(201);
        assert.equal(ownWalkIn.body.booking.source, "walk_in");
        assert.equal(ownWalkIn.body.booking.customerEmail, null);
        assert.equal(ownWalkIn.body.booking.customerPhone, null);
        logStep("Barber created own walk-in with name only and nullable contact fields.");

        await barberAgent
            .post("/api/admin/bookings/walk-in")
            .send({
                locationId: seedRows.locationId,
                barberId: seedRows.otherBarberId,
                serviceIds: [seedRows.serviceId],
                startTime: ownWalkInSlot.startTime,
                customerName: "Phase75 SpoofedBarber",
                internalNotes: `${QA_NOTE_PREFIX} forbidden walk-in ${runId}`,
            })
            .expect(403);
        logStep("Barber spoofed barberId was rejected.");

        await ownerAgent
            .post("/api/admin/bookings/walk-in")
            .send({
                locationId: seedRows.locationId,
                barberId: seedRows.barberId,
                serviceIds: [seedRows.serviceId],
                startTime: ownWalkInSlot.startTime,
                customerName: "Phase75 Overlap",
                internalNotes: `${QA_NOTE_PREFIX} overlap ${runId}`,
            })
            .expect(409);
        logStep("Overlapping walk-in was rejected by backend availability.");

        await ownerAgent
            .post("/api/admin/bookings/walk-in")
            .send({
                locationId: seedRows.locationId,
                barberId: seedRows.barberId,
                serviceIds: [seedRows.serviceId],
                startTime: localDateTimeToUtc(localDateAfter(3), "05:00", TIME_ZONE).toISOString(),
                customerName: "Phase75 OutsideShift",
                internalNotes: `${QA_NOTE_PREFIX} outside shift ${runId}`,
            })
            .expect(409);
        logStep("Walk-in outside shift/business hours was rejected.");

        await assertWalkInRejectedDuringBlock(ownerAgent, seedRows, "barber", runId);
        await assertWalkInRejectedDuringBlock(ownerAgent, seedRows, "location", runId);
        await assertWalkInRejectedDuringBlock(ownerAgent, seedRows, "business", runId);
        logStep("Walk-ins during barber, location, and business blocked time were rejected.");

        const otherWalkInSlot = await findFirstAvailableSlot(ownerAgent, seedRows, seedRows.otherBarberId);
        const ownerWalkIn = await ownerAgent
            .post("/api/admin/bookings/walk-in")
            .send({
                locationId: seedRows.locationId,
                barberId: seedRows.otherBarberId,
                serviceIds: [seedRows.serviceId],
                startTime: otherWalkInSlot.startTime,
                customerName: "Phase75 OwnerWalkIn",
                customer: {
                    phone: "+16475550100",
                    email: `phase75-qa-owner-walkin-${runId}@${QA_EMAIL_DOMAIN}`,
                },
                internalNotes: `${QA_NOTE_PREFIX} owner walk-in ${runId}`,
            })
            .expect(201);
        assert.equal(ownerWalkIn.body.booking.source, "walk_in");
        logStep("Owner created a walk-in for another active barber.");

        restoreBarberId = seedRows.otherBarberId;
        await db.update(barbers).set({ active: false }).where(eq(barbers.id, seedRows.otherBarberId));
        await ownerAgent
            .post("/api/admin/bookings/walk-in")
            .send({
                locationId: seedRows.locationId,
                barberId: seedRows.otherBarberId,
                serviceIds: [seedRows.serviceId],
                startTime: localDateTimeToUtc(localDateAfter(4), "10:00", TIME_ZONE).toISOString(),
                customerName: "Phase75 InactiveBarber",
                internalNotes: `${QA_NOTE_PREFIX} inactive barber ${runId}`,
            })
            .expect(409);
        await db.update(barbers).set({ active: true }).where(eq(barbers.id, seedRows.otherBarberId));
        restoreBarberId = null;
        logStep("Inactive barber target was rejected and restored.");

        const pastOwnBookingId = await createQaBooking(db, {
            customerEmail: `phase75-qa-past-own-${runId}@${QA_EMAIL_DOMAIN}`,
            customerFirstName: "Phase75",
            customerLastName: "PastOwn",
            barberId: seedRows.barberId,
            locationId: seedRows.locationId,
            serviceId: seedRows.serviceId,
            startTime: farPastUtc(2, 15),
            status: "confirmed",
            source: "manual",
            note: `${QA_NOTE_PREFIX} past own ${runId}`,
        });
        await barberAgent.post(`/api/admin/bookings/${pastOwnBookingId}/no-show`).expect(200);
        const pastOwnDetail = await ownerAgent.get(`/api/admin/bookings/${pastOwnBookingId}`).expect(200);
        assert.equal(pastOwnDetail.body.booking.status, "no_show");
        logStep("Barber marked own current/past booking as no-show.");

        await barberAgent.post(`/api/admin/bookings/${ownWalkIn.body.booking.id}/no-show`).expect(409);
        await assertNoShowRejectedForStatus(ownerAgent, db, seedRows, "cancelled", runId);
        await assertNoShowRejectedForStatus(ownerAgent, db, seedRows, "completed", runId);
        await assertNoShowRejectedForStatus(ownerAgent, db, seedRows, "no_show", runId);
        logStep("Future, cancelled, completed, and already no-show bookings cannot be marked no-show.");

        const otherPastBookingId = await createQaBooking(db, {
            customerEmail: `phase75-qa-other-past-${runId}@${QA_EMAIL_DOMAIN}`,
            customerFirstName: "Phase75",
            customerLastName: "OtherPast",
            barberId: seedRows.otherBarberId,
            locationId: seedRows.locationId,
            serviceId: seedRows.serviceId,
            startTime: farPastUtc(3, 15),
            status: "confirmed",
            source: "manual",
            note: `${QA_NOTE_PREFIX} other past ${runId}`,
        });
        await barberAgent.post(`/api/admin/bookings/${otherPastBookingId}/no-show`).expect(404);
        logStep("Barber no-show attempt on another barber's booking was scoped out.");

        const dragSlot = await findFirstAvailableSlot(ownerAgent, seedRows, seedRows.barberId);
        const dragBooking = await ownerAgent
            .post("/api/admin/bookings/walk-in")
            .send({
                locationId: seedRows.locationId,
                barberId: seedRows.barberId,
                serviceIds: [seedRows.serviceId],
                startTime: dragSlot.startTime,
                customerName: "Phase75 DragSource",
                internalNotes: `${QA_NOTE_PREFIX} drag source ${runId}`,
            })
            .expect(201);
        const dragBookingId = dragBooking.body.booking.id as string;

        await ownerAgent
            .post(`/api/admin/bookings/${dragBookingId}/reschedule`)
            .send({
                locationId: seedRows.locationId,
                barberId: seedRows.barberId,
                startTime: ownWalkInSlot.startTime,
            })
            .expect(409);
        await ownerAgent
            .post(`/api/admin/bookings/${dragBookingId}/reschedule`)
            .send({
                locationId: seedRows.locationId,
                barberId: seedRows.barberId,
                startTime: localDateTimeToUtc(localDateAfter(5), "05:00", TIME_ZONE).toISOString(),
            })
            .expect(409);
        await assertRescheduleRejectedDuringBlock(ownerAgent, seedRows, dragBookingId, runId);
        logStep("Drag/reschedule overlap, outside shift, and blocked-time moves were rejected.");

        const crossBarberSlot = await findFirstAvailableSlot(ownerAgent, seedRows, seedRows.otherBarberId);
        await barberAgent
            .post(`/api/admin/bookings/${dragBookingId}/reschedule`)
            .send({
                locationId: seedRows.locationId,
                barberId: seedRows.otherBarberId,
                startTime: crossBarberSlot.startTime,
            })
            .expect(403);
        const ownerCrossMove = await ownerAgent
            .post(`/api/admin/bookings/${dragBookingId}/reschedule`)
            .send({
                locationId: seedRows.locationId,
                barberId: seedRows.otherBarberId,
                startTime: crossBarberSlot.startTime,
            })
            .expect(200);
        assert.equal(ownerCrossMove.body.booking.barberId, seedRows.otherBarberId);
        logStep("Barber cross-column drag was rejected; owner cross-barber reschedule passed validation.");

        const calendarResponse = await ownerAgent
            .get("/api/admin/bookings")
            .query({ from: localDateAfter(1), to: localDateAfter(21), locationId: seedRows.locationId })
            .expect(200);
        assert.ok(
            calendarResponse.body.bookings.some((booking: { id: string }) => booking.id === ownWalkIn.body.booking.id),
            "Created walk-in was missing from calendar booking feed.",
        );
        assert.ok(
            calendarResponse.body.bookings.some((booking: { id: string }) => booking.id === dragBookingId),
            "Rescheduled booking was missing from calendar booking feed.",
        );
        logStep("Calendar feed reflects walk-ins and rescheduled bookings.");

        console.log("Phase 7.5 calendar flow QA passed.");
    } catch (error) {
        if (isMissingMigrationError(error)) {
            throw new Error(
                `Database prerequisites are missing. Run npm run db:migrate and npm run db:seed against the local database, then retry. Original error: ${error instanceof Error ? error.message : String(error)}`,
            );
        }

        throw error;
    } finally {
        if (restoreBarberId) {
            await db.update(barbers).set({ active: true }).where(eq(barbers.id, restoreBarberId)).catch(() => undefined);
        }
        await cleanupPriorQaRows(db).catch((error) => {
            console.error("[phase7-5-calendar-qa] Cleanup failed");
            console.error(error);
        });
        await pool.end();
    }
}

function assertLocalQaAllowed() {
    if (process.env.NODE_ENV === "production") {
        throw new Error("Phase 7.5 calendar QA must not run in production.");
    }

    if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL is required for Phase 7.5 calendar QA.");
    }

    const parsed = new URL(process.env.DATABASE_URL);
    const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

    if (!localHosts.has(parsed.hostname)) {
        throw new Error("Phase 7.5 calendar QA may only run against a local development database.");
    }
}

async function assertMigrationsAndStaticSeedData(db: ReturnType<typeof createDatabaseClient>["db"]) {
    await Promise.all([countRows(db, users), countRows(db, userSessions), countRows(db, blockedTimes)]);

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
        .from(barberLocations)
        .innerJoin(barbers, eq(barberLocations.barberId, barbers.id))
        .where(and(eq(barberLocations.locationId, location.id), ne(barbers.slug, "sam-to"), eq(barbers.active, true)))
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
        throw new Error("No local dev shifts found. Run npm run db:seed:dev-shifts before Phase 7.5 QA.");
    }

    logStep(`${shiftCount} local dev shift row(s) are available for QA.`);
}

async function createBarberUser(
    db: ReturnType<typeof createDatabaseClient>["db"],
    input: { email: string; password: string; barberId: string | null; displayName: string; active: boolean },
) {
    await db.insert(users).values({
        email: input.email,
        displayName: input.displayName,
        role: "barber",
        barberId: input.barberId,
        passwordHash: await hashPassword(input.password),
        active: input.active,
    });
}

async function assertWalkInRejectedDuringBlock(agent: any, seedRows: SeedRows, scope: "barber" | "location" | "business", runId: string) {
    const slot = await findFirstAvailableSlot(agent, seedRows, seedRows.barberId);
    const window = localWindowFromSlot(slot);
    const response = await agent
        .post("/api/admin/schedule/blocked-times")
        .send({
            scope,
            barberId: scope === "barber" ? seedRows.barberId : undefined,
            locationId: scope === "business" ? undefined : seedRows.locationId,
            ...window,
            reason: `${QA_REASON_PREFIX} ${scope} walk-in block ${runId}`,
        })
        .expect(201);

    await agent
        .post("/api/admin/bookings/walk-in")
        .send({
            locationId: seedRows.locationId,
            barberId: seedRows.barberId,
            serviceIds: [seedRows.serviceId],
            startTime: slot.startTime,
            customerName: `Phase75 ${scope}Blocked`,
            internalNotes: `${QA_NOTE_PREFIX} ${scope} blocked walk-in ${runId}`,
        })
        .expect(409);

    await agent.post(`/api/admin/schedule/blocked-times/${response.body.blockedTime.id}/delete`).expect(200);
}

async function assertRescheduleRejectedDuringBlock(agent: any, seedRows: SeedRows, bookingId: string, runId: string) {
    const slot = await findFirstAvailableSlot(agent, seedRows, seedRows.barberId);
    const window = localWindowFromSlot(slot);
    const response = await agent
        .post("/api/admin/schedule/blocked-times")
        .send({
            scope: "barber",
            barberId: seedRows.barberId,
            locationId: seedRows.locationId,
            ...window,
            reason: `${QA_REASON_PREFIX} drag block ${runId}`,
        })
        .expect(201);

    await agent
        .post(`/api/admin/bookings/${bookingId}/reschedule`)
        .send({
            locationId: seedRows.locationId,
            barberId: seedRows.barberId,
            startTime: slot.startTime,
        })
        .expect(409);

    await agent.post(`/api/admin/schedule/blocked-times/${response.body.blockedTime.id}/delete`).expect(200);
}

async function assertNoShowRejectedForStatus(
    agent: any,
    db: ReturnType<typeof createDatabaseClient>["db"],
    seedRows: SeedRows,
    status: "cancelled" | "completed" | "no_show",
    runId: string,
) {
    const bookingId = await createQaBooking(db, {
        customerEmail: `phase75-qa-${status}-${runId}@${QA_EMAIL_DOMAIN}`,
        customerFirstName: "Phase75",
        customerLastName: status,
        barberId: seedRows.barberId,
        locationId: seedRows.locationId,
        serviceId: seedRows.serviceId,
        startTime: farPastUtc(status === "cancelled" ? 4 : status === "completed" ? 5 : 6, 15),
        status,
        source: "manual",
        note: `${QA_NOTE_PREFIX} ${status} ${runId}`,
    });

    await agent.post(`/api/admin/bookings/${bookingId}/no-show`).expect(409);
}

async function createQaBooking(db: ReturnType<typeof createDatabaseClient>["db"], input: {
    customerEmail: string;
    customerFirstName: string;
    customerLastName: string;
    barberId: string;
    locationId: string;
    serviceId: string;
    startTime: Date;
    status: "confirmed" | "cancelled" | "completed" | "no_show";
    source: "manual" | "walk_in";
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
            status: input.status,
            source: input.source,
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

async function findFirstAvailableSlot(agent: any, seedRows: SeedRows, barberId: string) {
    for (let dayOffset = 1; dayOffset <= 21; dayOffset += 1) {
        const date = localDateAfter(dayOffset);
        const response = await agent
            .get("/api/admin/availability")
            .query({
                locationId: seedRows.locationId,
                serviceIds: seedRows.serviceId,
                barberId,
                date,
            })
            .expect(200);
        const [slot] = flattenSlots(response.body);

        if (slot) {
            return slot;
        }
    }

    throw new Error("No available Phase 7.5 QA slot found. Run npm run db:seed:dev-shifts for the local database.");
}

function flattenSlots(payload: { barberSlots?: Array<{ slots?: AvailableSlot[] }> }) {
    return (payload.barberSlots ?? []).flatMap((barberSlot) => barberSlot.slots ?? []);
}

function localWindowFromSlot(slot: AvailableSlot) {
    const start = localPartsFromIso(slot.startTime);
    const end = localPartsFromIso(slot.endTime);

    return {
        startDate: start.date,
        startTime: start.time,
        endDate: end.date,
        endTime: end.time,
    };
}

function localPartsFromIso(value: string) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).formatToParts(new Date(value));
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";

    return {
        date: `${get("year")}-${get("month")}-${get("day")}`,
        time: `${get("hour")}:${get("minute")}`,
    };
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

function farPastUtc(dayOfMonth: number, hour: number) {
    return new Date(Date.UTC(2025, 0, dayOfMonth, hour, 0, 0, 0));
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
    await db.execute(sql`delete from customers where first_name = 'Phase75' or email like ${QA_EMAIL_PATTERN}`);
    await db.execute(sql`delete from blocked_times where reason like ${`${QA_REASON_PREFIX}%`}`);
    await db.execute(sql`delete from user_sessions where user_id in (select id from users where email like ${QA_EMAIL_PATTERN})`);
    await db.execute(sql`delete from users where email like ${QA_EMAIL_PATTERN}`);
    logStep("Prior Phase 7.5 QA rows were cleaned from the local database.");
}

function isMissingMigrationError(error: unknown) {
    if (!(error instanceof Error)) {
        return false;
    }

    return /relation .* does not exist|column .* does not exist|schema .* does not exist|invalid input value for enum/i.test(error.message);
}

function logStep(message: string) {
    console.log(`[phase7-5-calendar-qa] ${message}`);
}

main()
    .then(() => {
        process.exit(0);
    })
    .catch((error) => {
        console.error("[phase7-5-calendar-qa] FAILED");
        console.error(error);
        process.exit(1);
    });
