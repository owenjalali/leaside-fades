import "dotenv/config";

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import { asc, eq, ne, sql } from "drizzle-orm";
import request from "supertest";

import { hashPassword } from "../auth/password.ts";
import { localDateToDayOfWeek } from "../availability/time.ts";
import { createDatabaseClient } from "../db/client.ts";
import { seedDevOwner } from "../db/seed-dev-owner.ts";
import {
    barbers,
    blockedTimes,
    bookings,
    bookingServices,
    businessHours,
    customers,
    locations,
    serviceCategories,
    services,
    shiftOverrides,
    shifts,
    userSessions,
    users,
} from "../db/schema.ts";

const QA_EMAIL_DOMAIN = "example.local";
const QA_EMAIL_PATTERN = `phase7-qa-%@${QA_EMAIL_DOMAIN}`;
const QA_NOTE_PREFIX = "Phase 7 schedule QA";
const QA_REASON_PREFIX = "Phase 7 schedule QA";
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

    const ownerEmail = (process.env.DEV_OWNER_EMAIL || `phase7-qa-owner@${QA_EMAIL_DOMAIN}`)
        .trim()
        .toLowerCase();
    const ownerPassword =
        process.env.DEV_OWNER_PASSWORD || `qa-owner-${randomBytes(18).toString("base64url")}`;
    const runId = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
    const barberEmail = `phase7-qa-barber-${runId}@${QA_EMAIL_DOMAIN}`;
    const barberPassword = `qa-barber-${randomBytes(18).toString("base64url")}`;
    const qaDate = localDateAfter(6);
    const qaDayOfWeek = localDateToDayOfWeek(qaDate);

    const { db, pool } = createDatabaseClient();

    try {
        await cleanupPriorQaRows(db);
        await assertMigrationsAndStaticSeedData(db);
        const seedRows = await loadSeedRows(db);

        await seedDevOwner({
            ...process.env,
            DEV_OWNER_EMAIL: ownerEmail,
            DEV_OWNER_PASSWORD: ownerPassword,
            DEV_OWNER_NAME: "Phase 7 QA Owner",
        });
        await createLinkedBarberUser(db, {
            email: barberEmail,
            password: barberPassword,
            barberId: seedRows.barberId,
        });

        const { default: app } = await import(new URL("../../../server.js", import.meta.url).href);
        const ownerAgent = request.agent(app);

        await ownerAgent
            .post("/api/admin/auth/login")
            .send({ email: ownerEmail, password: ownerPassword })
            .expect(200);
        logStep("Owner logged in through the real admin auth route.");

        const scheduleResponse = await ownerAgent
            .get("/api/admin/schedule")
            .query({ from: qaDate, to: qaDate })
            .expect(200);
        assert.ok(Array.isArray(scheduleResponse.body.shifts), "Schedule shifts payload is invalid.");
        assert.ok(Array.isArray(scheduleResponse.body.blockedTimes), "Schedule blocked-times payload is invalid.");
        logStep("Owner loaded the authenticated schedule endpoint.");

        const firstShift = await ownerAgent
            .post("/api/admin/schedule/shifts")
            .send({
                barberId: seedRows.barberId,
                locationId: seedRows.locationId,
                dayOfWeek: qaDayOfWeek,
                startTime: "06:00",
                endTime: "06:30",
                effectiveFrom: qaDate,
                effectiveTo: qaDate,
            })
            .expect(201);
        const secondShift = await ownerAgent
            .post("/api/admin/schedule/shifts")
            .send({
                barberId: seedRows.barberId,
                locationId: seedRows.locationId,
                dayOfWeek: qaDayOfWeek,
                startTime: "06:30",
                endTime: "07:00",
                effectiveFrom: qaDate,
                effectiveTo: qaDate,
            })
            .expect(201);
        logStep("Owner created adjacent split shifts.");

        await ownerAgent
            .post("/api/admin/schedule/shifts")
            .send({
                barberId: seedRows.barberId,
                locationId: seedRows.locationId,
                dayOfWeek: qaDayOfWeek,
                startTime: "06:15",
                endTime: "06:45",
                effectiveFrom: qaDate,
                effectiveTo: qaDate,
            })
            .expect(409);
        logStep("Overlapping active recurring shift was rejected.");

        await ownerAgent
            .post("/api/admin/schedule/shift-overrides")
            .send({
                barberId: seedRows.barberId,
                locationId: seedRows.locationId,
                overrideDate: qaDate,
                overrideType: "add",
                startTime: "07:00",
                endTime: "07:30",
                reason: `${QA_REASON_PREFIX} add ${runId}`,
            })
            .expect(201);
        await ownerAgent
            .post("/api/admin/schedule/shift-overrides")
            .send({
                barberId: seedRows.barberId,
                overrideDate: qaDate,
                overrideType: "not_working",
                reason: `${QA_REASON_PREFIX} not working ${runId}`,
            })
            .expect(201);
        logStep("Owner created add and not-working one-off overrides.");

        const businessClosure = await ownerAgent
            .post("/api/admin/schedule/blocked-times")
            .send({
                scope: "business",
                startDate: qaDate,
                startTime: "07:30",
                endDate: qaDate,
                endTime: "07:45",
                reason: `${QA_REASON_PREFIX} business closure ${runId}`,
            })
            .expect(201);
        const locationClosure = await ownerAgent
            .post("/api/admin/schedule/blocked-times")
            .send({
                scope: "location",
                locationId: seedRows.locationId,
                startDate: qaDate,
                startTime: "07:45",
                endDate: qaDate,
                endTime: "08:00",
                reason: `${QA_REASON_PREFIX} location closure ${runId}`,
            })
            .expect(201);
        logStep("Owner created business and location closures.");

        const availabilitySlot = await findFirstAvailableOwnerSlot(ownerAgent, seedRows);
        const blockedWindow = localWindowFromSlot(availabilitySlot);
        const availabilityBlock = await ownerAgent
            .post("/api/admin/schedule/blocked-times")
            .send({
                scope: "barber",
                barberId: seedRows.barberId,
                locationId: seedRows.locationId,
                ...blockedWindow,
                reason: `${QA_REASON_PREFIX} availability block ${runId}`,
            })
            .expect(201);

        const blockedAvailability = await ownerAgent
            .get("/api/admin/availability")
            .query({
                locationId: seedRows.locationId,
                serviceIds: seedRows.serviceId,
                barberId: seedRows.barberId,
                date: blockedWindow.startDate,
            })
            .expect(200);
        const remainingSlotStarts = flattenSlots(blockedAvailability.body).map((slot) => slot.startTime);
        assert.ok(
            !remainingSlotStarts.includes(availabilitySlot.startTime),
            "Blocked time did not remove the original available slot.",
        );
        logStep("Barber blocked time removed the affected availability slot.");

        await ownerAgent
            .post(`/api/admin/schedule/blocked-times/${availabilityBlock.body.blockedTime.id}/delete`)
            .expect(200);

        const bookingResponse = await ownerAgent
            .post("/api/admin/bookings")
            .send({
                locationId: seedRows.locationId,
                serviceIds: [seedRows.serviceId],
                barberId: seedRows.barberId,
                startTime: availabilitySlot.startTime,
                customer: {
                    firstName: "Phase7",
                    lastName: "Confirmed",
                    phone: "+16475550123",
                    email: `phase7-qa-confirmed-customer-${runId}@${QA_EMAIL_DOMAIN}`,
                },
                internalNotes: `${QA_NOTE_PREFIX} confirmed booking ${runId}`,
            })
            .expect(201);
        assert.ok(bookingResponse.body.booking.id, "Expected manual QA booking id.");

        await ownerAgent
            .post("/api/admin/schedule/blocked-times")
            .send({
                scope: "barber",
                barberId: seedRows.barberId,
                locationId: seedRows.locationId,
                ...blockedWindow,
                reason: `${QA_REASON_PREFIX} rejected overlap ${runId}`,
            })
            .expect(409);
        logStep("Blocked time overlapping a confirmed booking was rejected.");

        const barberAgent = request.agent(app);
        await barberAgent
            .post("/api/admin/auth/login")
            .send({ email: barberEmail, password: barberPassword })
            .expect(200);

        const barberBlock = await barberAgent
            .post("/api/admin/schedule/blocked-times")
            .send({
                scope: "barber",
                barberId: seedRows.barberId,
                locationId: seedRows.locationId,
                startDate: qaDate,
                startTime: "08:00",
                endDate: qaDate,
                endTime: "08:15",
                reason: `${QA_REASON_PREFIX} barber block ${runId}`,
            })
            .expect(201);
        await barberAgent
            .post("/api/admin/schedule/blocked-times")
            .send({
                scope: "location",
                locationId: seedRows.locationId,
                startDate: qaDate,
                startTime: "08:15",
                endDate: qaDate,
                endTime: "08:30",
                reason: `${QA_REASON_PREFIX} forbidden location ${runId}`,
            })
            .expect(403);
        await barberAgent
            .post("/api/admin/schedule/blocked-times")
            .send({
                scope: "barber",
                barberId: seedRows.otherBarberId,
                startDate: qaDate,
                startTime: "08:30",
                endDate: qaDate,
                endTime: "08:45",
                reason: `${QA_REASON_PREFIX} forbidden other barber ${runId}`,
            })
            .expect(403);
        logStep("Barber can create own blocked time but cannot manage broader or other-barber scope.");

        const barberSchedule = await barberAgent
            .get("/api/admin/schedule")
            .query({ from: qaDate, to: qaDate })
            .expect(200);
        assert.ok(
            barberSchedule.body.blockedTimes.some(
                (blockedTime: { id: string }) => blockedTime.id === barberBlock.body.blockedTime.id,
            ),
            "Barber schedule did not include the barber-created blocked time.",
        );
        assert.ok(
            barberSchedule.body.blockedTimes.some(
                (blockedTime: { id: string }) => blockedTime.id === businessClosure.body.blockedTime.id,
            ),
            "Barber schedule did not include business closures as read-only context.",
        );
        logStep("Barber schedule includes own blocks and broader read-only closures.");

        await ownerAgent.post(`/api/admin/schedule/shifts/${firstShift.body.shift.id}/deactivate`).expect(200);
        await ownerAgent.post(`/api/admin/schedule/shifts/${secondShift.body.shift.id}/deactivate`).expect(200);
        await ownerAgent
            .post(`/api/admin/schedule/blocked-times/${businessClosure.body.blockedTime.id}/delete`)
            .expect(200);
        await ownerAgent
            .post(`/api/admin/schedule/blocked-times/${locationClosure.body.blockedTime.id}/delete`)
            .expect(200);
        await ownerAgent
            .post(`/api/admin/schedule/blocked-times/${barberBlock.body.blockedTime.id}/delete`)
            .expect(200);
        logStep("QA-created rows were cleaned through schedule APIs where practical.");

        console.log("Phase 7 schedule flow QA passed.");
    } catch (error) {
        if (isMissingMigrationError(error)) {
            throw new Error(
                `Database prerequisites are missing. Run npm run db:migrate and npm run db:seed against the local database, then retry. Original error: ${error instanceof Error ? error.message : String(error)}`,
            );
        }

        throw error;
    } finally {
        await cleanupPriorQaRows(db).catch((error) => {
            console.error("[phase7-schedule-qa] Cleanup failed");
            console.error(error);
        });
        await pool.end();
    }
}

function assertLocalQaAllowed() {
    if (process.env.NODE_ENV === "production") {
        throw new Error("Phase 7 schedule QA must not run in production.");
    }

    if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL is required for Phase 7 schedule QA.");
    }

    const parsed = new URL(process.env.DATABASE_URL);
    const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

    if (!localHosts.has(parsed.hostname)) {
        throw new Error("Phase 7 schedule QA may only run against a local development database.");
    }
}

async function assertMigrationsAndStaticSeedData(db: ReturnType<typeof createDatabaseClient>["db"]) {
    await Promise.all([
        countRows(db, users),
        countRows(db, userSessions),
        countRows(db, shifts),
        countRows(db, shiftOverrides),
        countRows(db, blockedTimes),
    ]);

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

async function createLinkedBarberUser(
    db: ReturnType<typeof createDatabaseClient>["db"],
    input: { email: string; password: string; barberId: string },
) {
    await db.insert(users).values({
        email: input.email,
        displayName: "Phase 7 QA Barber",
        role: "barber",
        barberId: input.barberId,
        passwordHash: await hashPassword(input.password),
        active: true,
    });
}

async function findFirstAvailableOwnerSlot(agent: any, seedRows: SeedRows) {
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
        const [slot] = flattenSlots(response.body);

        if (slot) {
            return slot;
        }
    }

    throw new Error("No available Phase 7 QA slot found. Run npm run db:seed:dev-shifts for the local database.");
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

async function countRows(db: ReturnType<typeof createDatabaseClient>["db"], table: any) {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(table);
    return Number(row?.count ?? 0);
}

async function cleanupPriorQaRows(db: ReturnType<typeof createDatabaseClient>["db"]) {
    await db.execute(sql`delete from booking_services where booking_id in (select id from bookings where internal_notes like ${`${QA_NOTE_PREFIX}%`})`);
    await db.execute(sql`delete from bookings where internal_notes like ${`${QA_NOTE_PREFIX}%`}`);
    await db.execute(sql`delete from customers where email like ${QA_EMAIL_PATTERN}`);
    await db.execute(sql`delete from blocked_times where reason like ${`${QA_REASON_PREFIX}%`}`);
    await db.execute(sql`delete from shift_overrides where reason like ${`${QA_REASON_PREFIX}%`}`);
    await db.execute(sql`
        delete from shifts
        where start_time in ('06:00', '06:15', '06:30')
          and end_time in ('06:30', '06:45', '07:00')
          and effective_from is not null
          and effective_to = effective_from
    `);
    await db.execute(sql`delete from user_sessions where user_id in (select id from users where email like ${QA_EMAIL_PATTERN})`);
    await db.execute(sql`delete from users where email like ${QA_EMAIL_PATTERN}`);
    logStep("Prior Phase 7 QA rows were cleaned from the local database.");
}

function isMissingMigrationError(error: unknown) {
    if (!(error instanceof Error)) {
        return false;
    }

    return /relation .* does not exist|column .* does not exist|schema .* does not exist/i.test(error.message);
}

function logStep(message: string) {
    console.log(`[phase7-schedule-qa] ${message}`);
}

main()
    .then(() => {
        process.exit(0);
    })
    .catch((error) => {
        console.error("[phase7-schedule-qa] FAILED");
        console.error(error);
        process.exit(1);
    });
