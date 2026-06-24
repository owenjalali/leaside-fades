import "dotenv/config";

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import { asc, eq, sql } from "drizzle-orm";
import request from "supertest";

import { createDatabaseClient } from "../db/client.ts";
import {
    barbers,
    bookings,
    bookingServices,
    businessHours,
    customers,
    locations,
    notifications,
    serviceCategories,
    services,
    shifts,
} from "../db/schema.ts";
import { createNotificationProviders } from "../notifications/providers.ts";
import { createDrizzleNotificationRepository } from "../notifications/repository.ts";
import { runBookingReminderJob } from "../notifications/reminders.ts";

const QA_EMAIL_DOMAIN = "example.local";
const QA_EMAIL_PATTERN = `phase10-qa-%@${QA_EMAIL_DOMAIN}`;
const QA_NOTE_PREFIX = "Phase 10 reminders QA";
const TIME_ZONE = "America/Toronto";
const REMINDER_OFFSETS = {
    reminder_2h: 2 * 60,
} as const;

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

interface NotificationRow {
    id: string;
    bookingId: string;
    recipientType: "customer" | "barber" | "admin";
    channel: "sms" | "email";
    eventType: string;
    status: "pending" | "sent" | "failed" | "skipped";
    provider: string | null;
    providerMessageId: string | null;
    errorMessage: string | null;
    metadata: Record<string, unknown>;
    attemptCount: number;
    scheduledFor: Date | null;
}

async function main() {
    assertLocalQaAllowed();
    process.env.NOTIFICATION_DELIVERY_MODE = "mock";

    const runId = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
    const usedStarts = new Set<string>();
    const { db, pool } = createDatabaseClient();

    try {
        await cleanupPriorQaRows(db);
        await assertMigrationsAndStaticSeedData(db);
        const seedRows = await loadSeedRows(db);
        await assertDevShiftsExist(db);
        const { default: app } = await import(new URL("../../../server.js", import.meta.url).href);
        logStep("Notification delivery mode is forced to mock for reminder QA.");

        const reminder2Slot = await findFirstAvailableSlot(app, seedRows, usedStarts);
        const reminder2Booking = await createPublicQaBooking(app, seedRows, reminder2Slot, {
            email: `phase10-qa-2h-${runId}@${QA_EMAIL_DOMAIN}`,
            firstName: "Phase10",
            lastName: "Reminder2",
        });
        usedStarts.add(reminder2Slot.startTime);
        await runReminderJobForSlot(db, reminder2Slot.startTime, "reminder_2h");
        await assertReminderRows(db, reminder2Booking.body.id, "reminder_2h", {
            sent: 2,
            failed: 0,
            skipped: 0,
            attemptCount: 1,
        });
        await runReminderJobForSlot(db, reminder2Slot.startTime, "reminder_2h");
        await assertReminderRows(db, reminder2Booking.body.id, "reminder_2h", {
            sent: 2,
            failed: 0,
            skipped: 0,
            attemptCount: 2,
        });
        await assertNoReminderRows(db, reminder2Booking.body.id, "reminder_24h");
        logStep("2-hour reminders send customer SMS/email and duplicate runs increment attempts only.");

        const cancelledSlot = await findFirstAvailableSlot(app, seedRows, usedStarts);
        const cancelledBooking = await createPublicQaBooking(app, seedRows, cancelledSlot, {
            email: `phase10-qa-cancelled-${runId}@${QA_EMAIL_DOMAIN}`,
            firstName: "Phase10",
            lastName: "Cancelled",
        });
        usedStarts.add(cancelledSlot.startTime);
        const cancellationToken = tokenFromActionUrl(cancelledBooking.body.cancelUrl, "cancel");
        await request(app).post(`/api/booking/manage/${cancellationToken}/cancel`).expect(200);
        await runReminderJobForSlot(db, cancelledSlot.startTime, "reminder_2h");
        await assertNoReminderRows(db, cancelledBooking.body.id, "reminder_2h");
        logStep("Cancelled bookings do not receive reminders.");

        const rescheduleSourceSlot = await findFirstAvailableSlot(app, seedRows, usedStarts);
        const rescheduleBooking = await createPublicQaBooking(app, seedRows, rescheduleSourceSlot, {
            email: `phase10-qa-rescheduled-${runId}@${QA_EMAIL_DOMAIN}`,
            firstName: "Phase10",
            lastName: "Rescheduled",
        });
        usedStarts.add(rescheduleSourceSlot.startTime);
        const rescheduleToken = tokenFromActionUrl(rescheduleBooking.body.rescheduleUrl, "reschedule");
        const rescheduleTargetSlot = await findFirstAvailableSlot(app, seedRows, usedStarts);
        usedStarts.add(rescheduleTargetSlot.startTime);
        await request(app)
            .post(`/api/booking/manage/${rescheduleToken}/reschedule`)
            .send({
                locationId: seedRows.locationId,
                barberId: seedRows.barberId,
                startTime: rescheduleTargetSlot.startTime,
            })
            .expect(200);
        await runReminderJobForSlot(db, rescheduleSourceSlot.startTime, "reminder_2h");
        await assertNoReminderRows(db, rescheduleBooking.body.id, "reminder_2h");
        await runReminderJobForSlot(db, rescheduleTargetSlot.startTime, "reminder_2h");
        await assertReminderRows(db, rescheduleBooking.body.id, "reminder_2h", {
            sent: 2,
            failed: 0,
            skipped: 0,
            attemptCount: 1,
        });
        await assertReminderKeysIncludeStart(db, rescheduleBooking.body.id, rescheduleTargetSlot.startTime);
        logStep("Rescheduled bookings receive reminders for the new time only.");

        const failedSlot = await findFirstAvailableSlot(app, seedRows, usedStarts);
        const failedBooking = await createPublicQaBooking(app, seedRows, failedSlot, {
            email: `phase10-qa-failed-${runId}@${QA_EMAIL_DOMAIN}`,
            firstName: "Phase10",
            lastName: "Failed",
        });
        usedStarts.add(failedSlot.startTime);
        await runReminderJobForSlot(db, failedSlot.startTime, "reminder_2h", new Set(["sms"]));
        await assertReminderRows(db, failedBooking.body.id, "reminder_2h", {
            sent: 1,
            failed: 1,
            skipped: 0,
            attemptCount: 1,
        });
        const retryResult = await runReminderJobForSlot(db, failedSlot.startTime, "reminder_2h");
        assert.equal(retryResult.sent, 1, "Recovered retry should send only the previously failed SMS row.");
        assert.equal(retryResult.duplicate, 1, "Recovered retry should not resend the already-sent email row.");
        await assertReminderRows(db, failedBooking.body.id, "reminder_2h", {
            sent: 2,
            failed: 0,
            skipped: 0,
            attemptCount: 2,
        });
        logStep("Failed SMS reminders are retryable while already-sent email reminders stay idempotent.");

        console.log("Phase 10 reminders QA passed.");
    } catch (error) {
        if (isMissingMigrationError(error)) {
            throw new Error(
                `Database prerequisites are missing. Run npm run db:migrate and npm run db:seed against the local database, then retry. Original error: ${error instanceof Error ? error.message : String(error)}`,
            );
        }

        throw error;
    } finally {
        await cleanupPriorQaRows(db).catch((error) => {
            console.error("[phase10-reminders-qa] Cleanup failed");
            console.error(error);
        });
        await pool.end();
    }
}

function assertLocalQaAllowed() {
    if (process.env.NODE_ENV === "production") {
        throw new Error("Phase 10 reminders QA must not run in production.");
    }

    if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL is required for Phase 10 reminders QA.");
    }

    const parsed = new URL(process.env.DATABASE_URL);
    const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

    if (!localHosts.has(parsed.hostname)) {
        throw new Error("Phase 10 reminders QA may only run against a local development database.");
    }
}

async function assertMigrationsAndStaticSeedData(db: ReturnType<typeof createDatabaseClient>["db"]) {
    await countRows(db, notifications);

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
        throw new Error("No local dev shifts found. Run npm run db:seed:dev-shifts before Phase 10 QA.");
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
                phone: randomLocalPhone(),
                email: customer.email,
                notes: QA_NOTE_PREFIX,
            },
        })
        .expect(201);

    assert.match(response.body.cancelUrl, /^\/booking\/[A-Za-z0-9_-]+\/cancel$/);
    assert.match(response.body.rescheduleUrl, /^\/booking\/[A-Za-z0-9_-]+\/reschedule$/);

    return response;
}

function randomLocalPhone() {
    const suffix = 1000 + (Number.parseInt(randomBytes(2).toString("hex"), 16) % 9000);
    return `+1647555${suffix}`;
}

async function findFirstAvailableSlot(app: any, seedRows: SeedRows, excludeStarts: Set<string>) {
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
            (candidate) => !excludeStarts.has(candidate.startTime),
        );

        if (slot) {
            return slot;
        }
    }

    throw new Error("No available Phase 10 QA slot found. Run npm run db:seed:dev-shifts for the local database.");
}

function flattenSlots(payload: { barberSlots?: Array<{ slots?: AvailableSlot[] }> }) {
    return (payload.barberSlots ?? []).flatMap((barberSlot) => barberSlot.slots ?? []);
}

async function runReminderJobForSlot(
    db: ReturnType<typeof createDatabaseClient>["db"],
    startTime: string,
    eventType: keyof typeof REMINDER_OFFSETS,
    failChannels?: Set<"sms" | "email">,
) {
    const start = new Date(startTime);
    const now = new Date(start.getTime() - REMINDER_OFFSETS[eventType] * 60_000);
    return runBookingReminderJob({
        repository: createDrizzleNotificationRepository(db),
        providers: createNotificationProviders({ mode: "mock", failChannels }),
        now,
        lookBackMinutes: 0,
        lookAheadMinutes: 1,
    });
}

async function assertReminderRows(
    db: ReturnType<typeof createDatabaseClient>["db"],
    bookingId: string,
    eventType: "reminder_24h" | "reminder_2h",
    expected: { sent: number; failed: number; skipped: number; attemptCount: number },
) {
    const rows = await loadReminderRows(db, bookingId, eventType);
    const sentRows = rows.filter((row) => row.status === "sent");
    const failedRows = rows.filter((row) => row.status === "failed");
    const skippedRows = rows.filter((row) => row.status === "skipped");

    assert.equal(rows.length, expected.sent + expected.failed + expected.skipped, `${eventType} row count mismatch.`);
    assert.equal(sentRows.length, expected.sent, `${eventType} sent row count mismatch.`);
    assert.equal(failedRows.length, expected.failed, `${eventType} failed row count mismatch.`);
    assert.equal(skippedRows.length, expected.skipped, `${eventType} skipped row count mismatch.`);
    assert.ok(
        rows.every((row) => row.recipientType === "customer"),
        `${eventType} rows should target customers only.`,
    );
    assert.ok(
        rows.every((row) => row.attemptCount === expected.attemptCount),
        `${eventType} expected every attempt_count to be ${expected.attemptCount}.`,
    );
    assert.ok(rows.every((row) => row.scheduledFor), `${eventType} rows should record scheduled_for.`);
}

async function assertNoReminderRows(
    db: ReturnType<typeof createDatabaseClient>["db"],
    bookingId: string,
    eventType: "reminder_24h" | "reminder_2h",
) {
    const rows = await loadReminderRows(db, bookingId, eventType);
    assert.equal(rows.length, 0, `${eventType} reminder rows should not exist.`);
}

async function assertReminderKeysIncludeStart(
    db: ReturnType<typeof createDatabaseClient>["db"],
    bookingId: string,
    startTime: string,
) {
    const rows = await loadReminderRows(db, bookingId, "reminder_2h");
    assert.ok(rows.length > 0, "Expected reminder rows.");
    assert.ok(
        rows.every((row) => row.metadata.appointmentStartTime === startTime),
        "Reminder metadata should describe the current appointment start time.",
    );
}

async function loadReminderRows(
    db: ReturnType<typeof createDatabaseClient>["db"],
    bookingId: string,
    eventType: "reminder_24h" | "reminder_2h",
): Promise<NotificationRow[]> {
    return db
        .select({
            id: notifications.id,
            bookingId: notifications.bookingId,
            recipientType: notifications.recipientType,
            channel: notifications.channel,
            eventType: notifications.eventType,
            status: notifications.status,
            provider: notifications.provider,
            providerMessageId: notifications.providerMessageId,
            errorMessage: notifications.errorMessage,
            metadata: notifications.metadata,
            attemptCount: notifications.attemptCount,
            scheduledFor: notifications.scheduledFor,
        })
        .from(notifications)
        .where(sql`${notifications.bookingId} = ${bookingId} and ${notifications.eventType} = ${eventType}`)
        .orderBy(asc(notifications.channel));
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
               or bookings.customer_notes like ${`${QA_NOTE_PREFIX}%`}
        )
    `);
    await db.execute(sql`
        delete from bookings
        where customer_id in (
            select id from customers where email like ${QA_EMAIL_PATTERN}
        )
        or customer_notes like ${`${QA_NOTE_PREFIX}%`}
    `);
    await db.execute(sql`delete from customers where email like ${QA_EMAIL_PATTERN}`);
    logStep("Prior Phase 10 QA rows were cleaned from the local database.");
}

function isMissingMigrationError(error: unknown) {
    if (!(error instanceof Error)) {
        return false;
    }

    return /relation .* does not exist|column .* does not exist|schema .* does not exist/i.test(error.message);
}

function logStep(message: string) {
    console.log(`[phase10-reminders-qa] ${message}`);
}

main()
    .then(() => {
        process.exit(0);
    })
    .catch((error) => {
        console.error("[phase10-reminders-qa] FAILED");
        console.error(error);
        process.exit(1);
    });
