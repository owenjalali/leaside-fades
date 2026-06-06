import "dotenv/config";

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import { asc, eq, ne, sql } from "drizzle-orm";
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
    passwordResetTokens,
    serviceCategories,
    services,
    shifts,
    userInviteTokens,
    userSessions,
    users,
} from "../db/schema.ts";

const QA_EMAIL_DOMAIN = "example.local";
const QA_EMAIL_PATTERN = `phase5-qa-%@${QA_EMAIL_DOMAIN}`;
const QA_BOOKING_NOTE_PREFIX = "Phase 5 auth QA";
const QA_APP_URL = "http://localhost:3000";

interface SeedRows {
    eglintonLocationId: string;
    otherSeedBarberId: string;
    mensCutServiceId: string;
}

interface QaBookingInput {
    customerEmail: string;
    customerFirstName: string;
    customerLastName: string;
    barberId: string;
    locationId: string;
    serviceId: string;
    startTime: Date;
    note: string;
}

async function main() {
    assertLocalQaAllowed();
    process.env.APP_URL ??= QA_APP_URL;

    const ownerEmail = (process.env.DEV_OWNER_EMAIL || `phase5-qa-owner@${QA_EMAIL_DOMAIN}`)
        .trim()
        .toLowerCase();
    const ownerInitialPassword =
        process.env.DEV_OWNER_PASSWORD || `qa-owner-${randomBytes(18).toString("base64url")}`;
    const ownerResetPassword = `qa-owner-reset-${randomBytes(18).toString("base64url")}`;
    const runId = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
    const barberEmail = `phase5-qa-barber-${runId}@${QA_EMAIL_DOMAIN}`;
    const barberPassword = `qa-barber-${randomBytes(18).toString("base64url")}`;

    const { db, pool } = createDatabaseClient();

    try {
        await cleanupPriorQaRows(db);
        await assertMigrationsAndStaticSeedData(db);
        const seedRows = await loadSeedRows(db);
        await reportDevShiftState(db);
        await seedDevOwner({
            ...process.env,
            DEV_OWNER_EMAIL: ownerEmail,
            DEV_OWNER_PASSWORD: ownerInitialPassword,
            DEV_OWNER_NAME: process.env.DEV_OWNER_NAME || "Phase 5 QA Owner",
        });

        const { default: app } = await import(new URL("../../../server.js", import.meta.url).href);

        const ownerAgent = request.agent(app);
        const loginResponse = await ownerAgent
            .post("/api/admin/auth/login")
            .send({ email: ownerEmail, password: ownerInitialPassword })
            .expect(200);
        assertSafeOwnerUser(loginResponse.body.user, ownerEmail);
        assertAdminCookieWasSet(loginResponse.headers["set-cookie"]);
        logStep("Owner login created an HTTP-only admin session cookie.");

        const sessionResponse = await ownerAgent.get("/api/admin/auth/session").expect(200);
        assertSafeOwnerUser(sessionResponse.body.user, ownerEmail);
        logStep("Owner session check returned only the safe user shape.");

        const ownerBookingsResponse = await ownerAgent.get("/api/admin/bookings").expect(200);
        assert.ok(Array.isArray(ownerBookingsResponse.body.bookings), "Owner bookings payload is invalid.");
        logStep("Owner can read protected admin bookings.");

        const logoutResponse = await ownerAgent.post("/api/admin/auth/logout").expect(204);
        assertClearedAdminCookie(logoutResponse.headers["set-cookie"]);
        await ownerAgent.get("/api/admin/auth/session").expect(401);
        await request(app).get("/api/admin/bookings").expect(401);
        logStep("Logout cleared the cookie and unauthenticated booking reads return 401.");

        const preResetOwnerAgent = request.agent(app);
        await preResetOwnerAgent
            .post("/api/admin/auth/login")
            .send({ email: ownerEmail, password: ownerInitialPassword })
            .expect(200);

        const resetToken = await captureLocalDevToken("/admin/reset-password", async () => {
            const forgotResponse = await request(app)
                .post("/api/admin/auth/forgot-password")
                .send({ email: ownerEmail })
                .expect(200);
            assert.deepEqual(Object.keys(forgotResponse.body).sort(), ["message"]);
            assert.equal(
                forgotResponse.body.message,
                "If that email can reset a password, a reset link has been sent.",
            );
        });
        logStep("Captured local-only password reset token from dev delivery log.");

        await request(app)
            .post("/api/admin/auth/reset-password")
            .send({ token: resetToken, password: ownerResetPassword })
            .expect(204);
        await preResetOwnerAgent.get("/api/admin/auth/session").expect(401);
        logStep("Password reset succeeded and revoked the old owner session.");

        const resetOwnerAgent = request.agent(app);
        await resetOwnerAgent
            .post("/api/admin/auth/login")
            .send({ email: ownerEmail, password: ownerResetPassword })
            .expect(200);
        logStep("Owner can log in with the new password.");

        let createBarberResponse: any;
        const inviteToken = await captureLocalDevToken("/admin/accept-invite", async () => {
            createBarberResponse = await resetOwnerAgent
                .post("/api/admin/team/barbers")
                .send({
                    displayName: `Phase 5 QA Barber ${runId}`,
                    email: barberEmail,
                    phoneE164: "+16475550123",
                    profileImageUrl: `https://blob.example/barbers/phase5-qa-${runId}.png`,
                    profileImagePathname: `barbers/phase5-qa-${runId}.png`,
                    locationIds: [seedRows.eglintonLocationId],
                    weeklyShifts: [
                        {
                            locationId: seedRows.eglintonLocationId,
                            dayOfWeek: 1,
                            startTime: "10:00",
                            endTime: "18:00",
                        },
                    ],
                })
                .expect(201);
        });
        assertCreatedBarberPayload(createBarberResponse.body, barberEmail, seedRows.eglintonLocationId);
        logStep("Owner created a linked pending barber user and local-only invite token.");

        await request(app)
            .post("/api/admin/auth/accept-invite")
            .send({ token: inviteToken, password: barberPassword })
            .expect(204);
        logStep("New barber accepted invite and set a password.");

        const ownBooking = await createQaBooking(db, {
            customerEmail: `phase5-qa-own-customer-${runId}@${QA_EMAIL_DOMAIN}`,
            customerFirstName: "Phase5",
            customerLastName: "Own",
            barberId: createBarberResponse.body.barber.id,
            locationId: seedRows.eglintonLocationId,
            serviceId: seedRows.mensCutServiceId,
            startTime: new Date("2030-01-02T15:00:00.000Z"),
            note: `${QA_BOOKING_NOTE_PREFIX} own ${runId}`,
        });
        await createQaBooking(db, {
            customerEmail: `phase5-qa-other-customer-${runId}@${QA_EMAIL_DOMAIN}`,
            customerFirstName: "Phase5",
            customerLastName: "Other",
            barberId: seedRows.otherSeedBarberId,
            locationId: seedRows.eglintonLocationId,
            serviceId: seedRows.mensCutServiceId,
            startTime: new Date("2030-01-02T16:00:00.000Z"),
            note: `${QA_BOOKING_NOTE_PREFIX} other ${runId}`,
        });

        const barberAgent = request.agent(app);
        const barberLoginResponse = await barberAgent
            .post("/api/admin/auth/login")
            .send({ email: barberEmail, password: barberPassword })
            .expect(200);
        assert.equal(barberLoginResponse.body.user.role, "barber");
        assert.equal(barberLoginResponse.body.user.barberId, createBarberResponse.body.barber.id);
        await barberAgent.get("/api/admin/auth/session").expect(200);
        logStep("New barber can log in and call protected session route.");

        const barberBookingsResponse = await barberAgent.get("/api/admin/bookings").expect(200);
        const bookingIds = barberBookingsResponse.body.bookings.map((booking: { id: string }) => booking.id);
        assert.ok(bookingIds.length >= 1, "Expected barber to receive at least one scoped booking.");
        assert.ok(
            barberBookingsResponse.body.bookings.every(
                (booking: { barberId: string }) => booking.barberId === createBarberResponse.body.barber.id,
            ),
            "Barber received booking rows outside their own barber scope.",
        );
        logStep("Barber protected booking read is scoped to own bookings only.");

        await resetOwnerAgent
            .post(`/api/admin/team/barbers/${createBarberResponse.body.barber.id}/deactivate`)
            .expect(409);
        logStep("Owner deactivation was blocked while the barber had a future confirmed booking.");

        await resetOwnerAgent.post(`/api/admin/bookings/${ownBooking.id}/cancel`).expect(200);
        logStep("Owner cancelled the QA booking before deactivating the barber.");

        const deactivateResponse = await resetOwnerAgent
            .post(`/api/admin/team/barbers/${createBarberResponse.body.barber.id}/deactivate`)
            .expect(200);
        assert.equal(deactivateResponse.body.barberId, createBarberResponse.body.barber.id);
        assert.ok(
            deactivateResponse.body.deactivatedUserIds.includes(createBarberResponse.body.user.id),
            "Deactivate response did not include the linked barber user.",
        );
        await barberAgent.get("/api/admin/auth/session").expect(401);
        await barberAgent.get("/api/admin/bookings").expect(401);
        await request(app)
            .post("/api/admin/auth/login")
            .send({ email: barberEmail, password: barberPassword })
            .expect(401);
        logStep("Owner deactivation revoked the barber session and blocked further admin access.");

        console.log("Phase 5 auth flow QA passed.");
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
        throw new Error("Phase 5 auth QA must not run in production.");
    }

    if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL is required for Phase 5 auth QA.");
    }

    const parsed = new URL(process.env.DATABASE_URL);
    const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

    if (!localHosts.has(parsed.hostname)) {
        throw new Error("Phase 5 auth QA may only run against a local development database.");
    }
}

async function assertMigrationsAndStaticSeedData(db: ReturnType<typeof createDatabaseClient>["db"]) {
    await Promise.all([
        countRows(db, users),
        countRows(db, userSessions),
        countRows(db, passwordResetTokens),
        countRows(db, userInviteTokens),
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
    assert.ok(barberCount >= 4, "Static seed data missing barbers. Run npm run db:seed.");
    assert.ok(categoryCount >= 3, "Static seed data missing service categories. Run npm run db:seed.");
    assert.ok(serviceCount >= 1, "Static seed data missing services. Run npm run db:seed.");
    logStep("Database migrations and static seed data are present.");
}

async function loadSeedRows(db: ReturnType<typeof createDatabaseClient>["db"]): Promise<SeedRows> {
    const [eglinton] = await db
        .select({ id: locations.id })
        .from(locations)
        .where(eq(locations.slug, "eglinton"))
        .limit(1);
    const [mensCut] = await db
        .select({ id: services.id })
        .from(services)
        .where(eq(services.slug, "mens-cut"))
        .limit(1);
    const [otherBarber] = await db
        .select({ id: barbers.id })
        .from(barbers)
        .where(ne(barbers.slug, "phase5-placeholder"))
        .orderBy(asc(barbers.sortOrder), asc(barbers.slug))
        .limit(1);

    assert.ok(eglinton?.id, "Seeded Eglinton location is missing.");
    assert.ok(mensCut?.id, "Seeded Men's Cut service is missing.");
    assert.ok(otherBarber?.id, "Seeded comparison barber is missing.");

    return {
        eglintonLocationId: eglinton.id,
        mensCutServiceId: mensCut.id,
        otherSeedBarberId: otherBarber.id,
    };
}

async function reportDevShiftState(db: ReturnType<typeof createDatabaseClient>["db"]) {
    const activeShiftCount = await countRows(db, shifts);
    const suffix =
        activeShiftCount > 0
            ? `${activeShiftCount} shift rows found.`
            : "none found; not required because this QA runner creates direct booking-scope fixtures.";
    logStep(`Dev shift prerequisite checked: ${suffix}`);
}

async function countRows(db: ReturnType<typeof createDatabaseClient>["db"], table: any) {
    const [row] = await db.select({ count: sql<number>`count(*)::int` }).from(table);
    return Number(row?.count ?? 0);
}

async function cleanupPriorQaRows(db: ReturnType<typeof createDatabaseClient>["db"]) {
    await db.execute(sql`
        delete from booking_services
        where booking_id in (
            select id from bookings
            where internal_notes like ${`${QA_BOOKING_NOTE_PREFIX}%`}
               or barber_id in (
                   select id from barbers
                   where email like ${QA_EMAIL_PATTERN}
                      or slug like 'phase5-qa-%'
                      or slug like 'phase-5-qa-%'
               )
        )
    `);
    await db.execute(sql`
        delete from bookings
        where internal_notes like ${`${QA_BOOKING_NOTE_PREFIX}%`}
           or barber_id in (
               select id from barbers
               where email like ${QA_EMAIL_PATTERN}
                  or slug like 'phase5-qa-%'
                  or slug like 'phase-5-qa-%'
           )
    `);
    await db.execute(sql`delete from customers where email like ${QA_EMAIL_PATTERN}`);
    await db.execute(sql`
        delete from user_invite_tokens
        where user_id in (select id from users where email like ${QA_EMAIL_PATTERN})
    `);
    await db.execute(sql`
        delete from password_reset_tokens
        where user_id in (select id from users where email like ${QA_EMAIL_PATTERN})
    `);
    await db.execute(sql`
        delete from user_sessions
        where user_id in (select id from users where email like ${QA_EMAIL_PATTERN})
    `);
    await db.execute(sql`delete from users where email like ${QA_EMAIL_PATTERN}`);
    await db.execute(sql`
        delete from shifts
        where barber_id in (
            select id from barbers
            where email like ${QA_EMAIL_PATTERN}
               or slug like 'phase5-qa-%'
               or slug like 'phase-5-qa-%'
        )
    `);
    await db.execute(sql`
        delete from barber_services
        where barber_id in (
            select id from barbers
            where email like ${QA_EMAIL_PATTERN}
               or slug like 'phase5-qa-%'
               or slug like 'phase-5-qa-%'
        )
    `);
    await db.execute(sql`
        delete from barber_locations
        where barber_id in (
            select id from barbers
            where email like ${QA_EMAIL_PATTERN}
               or slug like 'phase5-qa-%'
               or slug like 'phase-5-qa-%'
        )
    `);
    await db.execute(sql`
        delete from barbers
        where email like ${QA_EMAIL_PATTERN}
           or slug like 'phase5-qa-%'
           or slug like 'phase-5-qa-%'
    `);
    logStep("Prior Phase 5 QA rows were cleaned from the local database.");
}

async function createQaBooking(db: ReturnType<typeof createDatabaseClient>["db"], input: QaBookingInput) {
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

    return booking;
}

async function captureLocalDevToken(pathname: string, action: () => Promise<void>) {
    const messages: string[] = [];
    const originalInfo = console.info;

    console.info = (...args: unknown[]) => {
        messages.push(args.map(String).join(" "));
    };

    try {
        await action();
    } finally {
        console.info = originalInfo;
    }

    const token = messages
        .flatMap((message) => message.match(/https?:\/\/[^\s)]+/g) ?? [])
        .map((rawUrl) => {
            try {
                return new URL(rawUrl);
            } catch {
                return null;
            }
        })
        .find((url) => url?.pathname === pathname)
        ?.searchParams.get("token");

    assert.ok(token, `Expected dev-mode ${pathname} link to be logged for local QA capture.`);
    return token;
}

function assertSafeOwnerUser(user: unknown, ownerEmail: string) {
    assert.ok(isRecord(user), "Expected safe user object.");
    assert.deepEqual(Object.keys(user).sort(), ["barberId", "displayName", "email", "id", "role"].sort());
    assert.equal(user.email, ownerEmail);
    assert.equal(user.role, "owner");
    assert.equal(user.barberId, null);
}

function assertAdminCookieWasSet(setCookie: unknown) {
    const cookies = normalizeSetCookie(setCookie);
    assert.ok(cookies.some((cookie) => cookie.includes("lf_admin_session=")), "Missing admin session cookie.");
    assert.ok(cookies.some((cookie) => cookie.includes("HttpOnly")), "Admin session cookie is not HTTP-only.");
    assert.ok(cookies.some((cookie) => cookie.includes("SameSite=Lax")), "Admin session cookie is not SameSite=Lax.");
}

function assertClearedAdminCookie(setCookie: unknown) {
    const cookies = normalizeSetCookie(setCookie);
    assert.ok(cookies.some((cookie) => cookie.includes("lf_admin_session=;")), "Logout did not clear cookie.");
}

function assertCreatedBarberPayload(body: any, barberEmail: string, locationId: string) {
    assert.equal(body?.barber?.email, barberEmail);
    assert.equal(body?.barber?.active, true);
    assert.equal(typeof body?.barber?.profileImageUrl, "string");
    assert.deepEqual(body?.barber?.locationIds, [locationId]);
    assert.equal(body?.user?.email, barberEmail);
    assert.equal(body?.user?.role, "barber");
    assert.equal(body?.user?.barberId, body?.barber?.id);
    assert.equal(body?.user?.active, false);
    assert.equal(body?.inviteToken, undefined);
    assert.equal(body?.user?.passwordHash, undefined);
}

function normalizeSetCookie(setCookie: unknown) {
    return Array.isArray(setCookie) ? setCookie.map(String) : setCookie ? [String(setCookie)] : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isMissingMigrationError(error: unknown) {
    if (!(error instanceof Error)) {
        return false;
    }

    return /relation .* does not exist|column .* does not exist|schema .* does not exist/i.test(error.message);
}

function logStep(message: string) {
    console.log(`[phase5-auth-qa] ${message}`);
}

main()
    .then(() => {
        process.exit(0);
    })
    .catch((error) => {
        console.error("[phase5-auth-qa] FAILED");
        console.error(error);
        process.exit(1);
    });
