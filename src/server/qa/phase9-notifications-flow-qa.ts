import "dotenv/config";

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import { asc, eq, sql } from "drizzle-orm";
import request from "supertest";

import { seedDevOwner } from "../db/seed-dev-owner.ts";
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
    userSessions,
    users,
} from "../db/schema.ts";

const QA_EMAIL_DOMAIN = "example.local";
const QA_EMAIL_PATTERN = `phase9-qa-%@${QA_EMAIL_DOMAIN}`;
const QA_NOTE_PREFIX = "Phase 9 notifications QA";
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

interface NotificationRow {
    id: string;
    bookingId: string;
    recipientType: "customer" | "barber" | "admin";
    recipientPhone: string | null;
    recipientEmail: string | null;
    channel: "sms" | "email";
    eventType: string;
    status: "pending" | "sent" | "failed" | "skipped";
    provider: string | null;
    idempotencyKey: string;
    providerMessageId: string | null;
    errorMessage: string | null;
    metadata: Record<string, unknown>;
    attemptCount: number;
}

async function main() {
    assertLocalQaAllowed();
    process.env.NOTIFICATION_DELIVERY_MODE = "mock";

    const ownerEmail = (process.env.DEV_OWNER_EMAIL || `phase9-qa-owner@${QA_EMAIL_DOMAIN}`)
        .trim()
        .toLowerCase();
    const ownerPassword =
        process.env.DEV_OWNER_PASSWORD || `qa-owner-${randomBytes(18).toString("base64url")}`;
    const runId = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
    const usedStarts = new Set<string>();
    const { db, pool } = createDatabaseClient();
    let originalBarberPhone: string | null | undefined;
    let originalBarberEmail: string | null | undefined;

    try {
        await cleanupPriorQaRows(db);
        await assertMigrationsAndStaticSeedData(db);
        const seedRows = await loadSeedRows(db);
        await assertDevShiftsExist(db);
        const originalBarberContact = await loadBarberContact(db, seedRows.barberId);
        originalBarberPhone = originalBarberContact.phoneE164;
        originalBarberEmail = originalBarberContact.email;
        await setBarberContact(db, seedRows.barberId, {
            phoneE164: "+16475550200",
            email: `phase9-qa-staff-${runId}@${QA_EMAIL_DOMAIN}`,
        });
        logStep("Notification delivery mode is forced to mock and local-only staff contact fixtures are set.");

        await seedDevOwner({
            ...process.env,
            DEV_OWNER_EMAIL: ownerEmail,
            DEV_OWNER_PASSWORD: ownerPassword,
            DEV_OWNER_NAME: "Phase 9 QA Owner",
        });
        const { default: app } = await import(new URL("../../../server.js", import.meta.url).href);
        const ownerAgent = request.agent(app);
        await ownerAgent
            .post("/api/admin/auth/login")
            .send({ email: ownerEmail, password: ownerPassword })
            .expect(200);
        logStep("Owner logged in for admin walk-in coverage.");

        const confirmationSlot = await findFirstAvailableSlot(app, seedRows, usedStarts);
        const confirmationBooking = await createPublicQaBooking(app, seedRows, confirmationSlot, {
            email: `phase9-qa-confirm-${runId}@${QA_EMAIL_DOMAIN}`,
            firstName: "Phase9",
            lastName: "Confirm",
        });
        usedStarts.add(confirmationSlot.startTime);
        const cancellationToken = tokenFromActionUrl(confirmationBooking.body.cancelUrl, "cancel");
        const rescheduleToken = tokenFromActionUrl(confirmationBooking.body.rescheduleUrl, "reschedule");
        await assertLifecycleRows(db, confirmationBooking.body.id, "booking_confirmation", {
            sent: 2,
            skipped: 0,
            attemptCount: 1,
        });
        await assertNoRawTokenPersistence(db, confirmationBooking.body.id, [
            cancellationToken,
            rescheduleToken,
        ]);
        logStep("Public booking confirmation logged customer and assigned staff attempts without raw token persistence.");

        await request(app).post(`/api/booking/manage/${cancellationToken}/cancel`).expect(200);
        await assertLifecycleRows(db, confirmationBooking.body.id, "cancellation_confirmation", {
            sent: 2,
            skipped: 0,
            attemptCount: 1,
        });
        await request(app).post(`/api/booking/manage/${cancellationToken}/cancel`).expect(200);
        await assertLifecycleRows(db, confirmationBooking.body.id, "cancellation_confirmation", {
            sent: 2,
            skipped: 0,
            attemptCount: 2,
        });
        logStep("Cancellation notifications are idempotent: retry increments attempts without duplicate rows.");

        const sourceSlot = await findFirstAvailableSlot(app, seedRows, usedStarts);
        const rescheduleBooking = await createPublicQaBooking(app, seedRows, sourceSlot, {
            email: `phase9-qa-reschedule-${runId}@${QA_EMAIL_DOMAIN}`,
            firstName: "Phase9",
            lastName: "Reschedule",
        });
        usedStarts.add(sourceSlot.startTime);
        const customerRescheduleToken = tokenFromActionUrl(
            rescheduleBooking.body.rescheduleUrl,
            "reschedule",
        );
        const targetSlot = await findFirstAvailableSlot(app, seedRows, usedStarts);
        usedStarts.add(targetSlot.startTime);
        await request(app)
            .post(`/api/booking/manage/${customerRescheduleToken}/reschedule`)
            .send({
                locationId: seedRows.locationId,
                barberId: seedRows.barberId,
                startTime: targetSlot.startTime,
            })
            .expect(200);
        await assertLifecycleRows(db, rescheduleBooking.body.id, "reschedule_confirmation", {
            sent: 2,
            skipped: 0,
            attemptCount: 1,
        });
        await assertRescheduleKeysIncludeStart(db, rescheduleBooking.body.id, targetSlot.startTime);
        logStep("Reschedule confirmation logged with occurrence-specific idempotency keys.");

        await setBarberContact(db, seedRows.barberId, { phoneE164: null, email: null });
        const skippedSlot = await findFirstAvailableSlot(app, seedRows, usedStarts);
        const skippedBooking = await createPublicQaBooking(app, seedRows, skippedSlot, {
            email: `phase9-qa-skipped-${runId}@${QA_EMAIL_DOMAIN}`,
            firstName: "Phase9",
            lastName: "Skipped",
        });
        usedStarts.add(skippedSlot.startTime);
        await assertLifecycleRows(db, skippedBooking.body.id, "booking_confirmation", {
            sent: 1,
            skipped: 1,
            attemptCount: 1,
        });
        await assertSkippedStaffContacts(db, skippedBooking.body.id);
        logStep("Missing staff email safely logged a skipped staff attempt while the customer email sent.");

        await setBarberContact(db, seedRows.barberId, {
            phoneE164: "+16475550200",
            email: `phase9-qa-staff-${runId}@${QA_EMAIL_DOMAIN}`,
        });
        const walkInSlot = await findFirstAvailableAdminSlot(ownerAgent, seedRows, usedStarts);
        usedStarts.add(walkInSlot.startTime);
        const walkInResponse = await ownerAgent
            .post("/api/admin/bookings/walk-in")
            .send({
                locationId: seedRows.locationId,
                barberId: seedRows.barberId,
                serviceIds: [seedRows.serviceId],
                startTime: walkInSlot.startTime,
                customerName: "Phase9 WalkIn",
                customer: {
                    phone: "+16475550198",
                    email: `phase9-qa-walkin-${runId}@${QA_EMAIL_DOMAIN}`,
                },
                internalNotes: `${QA_NOTE_PREFIX} walk-in ${runId}`,
            })
            .expect(201);
        assert.equal(walkInResponse.body.booking.source, "walk_in");
        await assertLifecycleRows(db, walkInResponse.body.booking.id, "booking_confirmation", {
            sent: 2,
            skipped: 0,
            attemptCount: 1,
        });
        logStep("Walk-ins with customer contact create customer and staff booking confirmation attempts.");

        console.log("Phase 9 notifications QA passed.");
    } catch (error) {
        if (isMissingMigrationError(error)) {
            throw new Error(
                `Database prerequisites are missing. Run npm run db:migrate and npm run db:seed against the local database, then retry. Original error: ${error instanceof Error ? error.message : String(error)}`,
            );
        }

        throw error;
    } finally {
        if (originalBarberPhone !== undefined || originalBarberEmail !== undefined) {
            const seedRows = await loadSeedRows(db).catch(() => null);
            if (seedRows) {
                await setBarberContact(db, seedRows.barberId, {
                    phoneE164: originalBarberPhone ?? null,
                    email: originalBarberEmail ?? null,
                }).catch((error) => {
                    console.error("[phase9-notifications-qa] Barber contact restore failed");
                    console.error(error);
                });
            }
        }
        await cleanupPriorQaRows(db).catch((error) => {
            console.error("[phase9-notifications-qa] Cleanup failed");
            console.error(error);
        });
        await pool.end();
    }
}

function assertLocalQaAllowed() {
    if (process.env.NODE_ENV === "production") {
        throw new Error("Phase 9 notifications QA must not run in production.");
    }

    if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL is required for Phase 9 notifications QA.");
    }

    const parsed = new URL(process.env.DATABASE_URL);
    const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

    if (!localHosts.has(parsed.hostname)) {
        throw new Error("Phase 9 notifications QA may only run against a local development database.");
    }
}

async function assertMigrationsAndStaticSeedData(db: ReturnType<typeof createDatabaseClient>["db"]) {
    await Promise.all([countRows(db, users), countRows(db, notifications)]);

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
        throw new Error("No local dev shifts found. Run npm run db:seed:dev-shifts before Phase 9 QA.");
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
                notes: QA_NOTE_PREFIX,
            },
        })
        .expect(201);

    assert.match(response.body.cancelUrl, /^\/booking\/[A-Za-z0-9_-]+\/cancel$/);
    assert.match(response.body.rescheduleUrl, /^\/booking\/[A-Za-z0-9_-]+\/reschedule$/);

    return response;
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

    throw new Error("No available Phase 9 QA slot found. Run npm run db:seed:dev-shifts for the local database.");
}

async function findFirstAvailableAdminSlot(agent: any, seedRows: SeedRows, excludeStarts: Set<string>) {
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
        const slot = flattenSlots(response.body).find(
            (candidate) => !excludeStarts.has(candidate.startTime),
        );

        if (slot) {
            return slot;
        }
    }

    throw new Error("No available Phase 9 admin QA slot found. Run npm run db:seed:dev-shifts for the local database.");
}

function flattenSlots(payload: { barberSlots?: Array<{ slots?: AvailableSlot[] }> }) {
    return (payload.barberSlots ?? []).flatMap((barberSlot) => barberSlot.slots ?? []);
}

async function assertLifecycleRows(
    db: ReturnType<typeof createDatabaseClient>["db"],
    bookingId: string,
    eventType: "booking_confirmation" | "cancellation_confirmation" | "reschedule_confirmation",
    expected: { sent: number; skipped: number; attemptCount: number },
) {
    const rows = await loadNotificationRows(db, bookingId, eventType);
    const sentRows = rows.filter((row) => row.status === "sent");
    const skippedRows = rows.filter((row) => row.status === "skipped");

    assert.equal(rows.length, expected.sent + expected.skipped, `${eventType} row count mismatch.`);
    assert.equal(sentRows.length, expected.sent, `${eventType} sent row count mismatch.`);
    assert.equal(skippedRows.length, expected.skipped, `${eventType} skipped row count mismatch.`);
    assert.ok(
        rows.every((row) => row.attemptCount === expected.attemptCount),
        `${eventType} expected every attempt_count to be ${expected.attemptCount}.`,
    );
    assert.ok(
        sentRows.every((row) => row.provider === "mock" && row.providerMessageId),
        `${eventType} sent rows should use mock provider ids.`,
    );
}

async function assertSkippedStaffContacts(db: ReturnType<typeof createDatabaseClient>["db"], bookingId: string) {
    const rows = await loadNotificationRows(db, bookingId, "booking_confirmation");
    const skippedEmail = rows.find(
        (row) =>
            row.recipientType === "barber" &&
            row.channel === "email" &&
            row.status === "skipped",
    );

    assert.ok(skippedEmail, "Expected a skipped barber email row.");
    assert.equal(skippedEmail.recipientEmail, null);
    assert.equal(skippedEmail.metadata.skipReason, "missing_recipient_contact");
}

async function assertNoNotificationsForBooking(db: ReturnType<typeof createDatabaseClient>["db"], bookingId: string) {
    const rows = await db.select({ id: notifications.id }).from(notifications).where(eq(notifications.bookingId, bookingId));
    assert.equal(rows.length, 0, "Walk-in booking created notification attempts.");
}

async function assertNoRawTokenPersistence(
    db: ReturnType<typeof createDatabaseClient>["db"],
    bookingId: string,
    rawTokens: string[],
) {
    const rows = await db
        .select({
            idempotencyKey: notifications.idempotencyKey,
            providerMessageId: notifications.providerMessageId,
            errorMessage: notifications.errorMessage,
            metadataText: sql<string>`${notifications.metadata}::text`,
        })
        .from(notifications)
        .where(eq(notifications.bookingId, bookingId));

    const persistedText = rows
        .map((row) =>
            [
                row.idempotencyKey,
                row.providerMessageId,
                row.errorMessage,
                row.metadataText,
            ].join("\n"),
        )
        .join("\n");

    for (const rawToken of rawTokens) {
        assert.ok(!persistedText.includes(rawToken), "Notification logs persisted a raw management token.");
    }
}

async function assertRescheduleKeysIncludeStart(
    db: ReturnType<typeof createDatabaseClient>["db"],
    bookingId: string,
    startTime: string,
) {
    const rows = await loadNotificationRows(db, bookingId, "reschedule_confirmation");
    assert.ok(rows.length > 0, "Expected reschedule notification rows.");
    assert.ok(
        rows.every((row) => row.idempotencyKey.includes(startTime)),
        "Reschedule idempotency keys should include the new start time occurrence marker.",
    );
}

async function loadNotificationRows(
    db: ReturnType<typeof createDatabaseClient>["db"],
    bookingId: string,
    eventType: string,
): Promise<NotificationRow[]> {
    return db
        .select({
            id: notifications.id,
            bookingId: notifications.bookingId,
            recipientType: notifications.recipientType,
            recipientPhone: notifications.recipientPhone,
            recipientEmail: notifications.recipientEmail,
            channel: notifications.channel,
            eventType: notifications.eventType,
            status: notifications.status,
            provider: notifications.provider,
            idempotencyKey: notifications.idempotencyKey,
            providerMessageId: notifications.providerMessageId,
            errorMessage: notifications.errorMessage,
            metadata: notifications.metadata,
            attemptCount: notifications.attemptCount,
        })
        .from(notifications)
        .where(sql`${notifications.bookingId} = ${bookingId} and ${notifications.eventType} = ${eventType}`)
        .orderBy(asc(notifications.recipientType), asc(notifications.channel));
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

async function loadBarberContact(db: ReturnType<typeof createDatabaseClient>["db"], barberId: string) {
    const [row] = await db
        .select({ phoneE164: barbers.phoneE164, email: barbers.email })
        .from(barbers)
        .where(eq(barbers.id, barberId))
        .limit(1);

    return {
        phoneE164: row?.phoneE164 ?? null,
        email: row?.email ?? null,
    };
}

async function setBarberContact(
    db: ReturnType<typeof createDatabaseClient>["db"],
    barberId: string,
    contact: { phoneE164: string | null; email: string | null },
) {
    await db.update(barbers).set({ ...contact, updatedAt: new Date() }).where(eq(barbers.id, barberId));
}

async function countActiveOwnerAdminEmails(db: ReturnType<typeof createDatabaseClient>["db"]) {
    const rows = await db
        .select({ email: users.email })
        .from(users)
        .where(sql`${users.active} = true and ${users.role} in ('owner', 'admin')`);

    return new Set(rows.map((row) => row.email.trim()).filter(Boolean)).size;
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
               or bookings.internal_notes like ${`${QA_NOTE_PREFIX}%`}
        )
    `);
    await db.execute(sql`
        delete from bookings
        where customer_id in (
            select id from customers where email like ${QA_EMAIL_PATTERN}
        )
        or internal_notes like ${`${QA_NOTE_PREFIX}%`}
    `);
    await db.execute(sql`delete from customers where email like ${QA_EMAIL_PATTERN}`);
    await db.execute(sql`delete from user_sessions where user_id in (select id from users where email like ${QA_EMAIL_PATTERN})`);
    await db.execute(sql`delete from users where email like ${QA_EMAIL_PATTERN}`);
    logStep("Prior Phase 9 QA rows were cleaned from the local database.");
}

function isMissingMigrationError(error: unknown) {
    if (!(error instanceof Error)) {
        return false;
    }

    return /relation .* does not exist|column .* does not exist|schema .* does not exist/i.test(error.message);
}

function logStep(message: string) {
    console.log(`[phase9-notifications-qa] ${message}`);
}

main()
    .then(() => {
        process.exit(0);
    })
    .catch((error) => {
        console.error("[phase9-notifications-qa] FAILED");
        console.error(error);
        process.exit(1);
    });
