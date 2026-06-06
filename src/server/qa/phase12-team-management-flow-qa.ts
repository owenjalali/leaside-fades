import "dotenv/config";

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import { asc, eq, sql } from "drizzle-orm";
import request from "supertest";

import { getLocalDate, localDateToDayOfWeek } from "../availability/time.ts";
import { createDatabaseClient } from "../db/client.ts";
import { seedDevOwner } from "../db/seed-dev-owner.ts";
import {
    barbers,
    businessHours,
    locations,
    services,
    users,
} from "../db/schema.ts";

const QA_EMAIL_DOMAIN = "example.local";
const QA_EMAIL_PATTERN = `phase12-team-qa-%@${QA_EMAIL_DOMAIN}`;
const QA_NOTE_PREFIX = "Phase 12 team QA";
const QA_APP_URL = "http://localhost:3000";
const TIME_ZONE = "America/Toronto";

interface SeedRows {
    locationId: string;
    locationName: string;
    serviceId: string;
    serviceName: string;
    qaDate: string;
    shiftStartTime: string;
    shiftEndTime: string;
    dayOfWeek: number;
}

async function main() {
    assertLocalQaAllowed();
    process.env.APP_URL ??= QA_APP_URL;
    process.env.TEAM_PROFILE_IMAGE_UPLOAD_MODE = "mock";

    const ownerEmail = (process.env.DEV_OWNER_EMAIL || `phase12-team-qa-owner@${QA_EMAIL_DOMAIN}`)
        .trim()
        .toLowerCase();
    const ownerPassword =
        process.env.DEV_OWNER_PASSWORD || `qa-owner-${randomBytes(18).toString("base64url")}`;
    const barberPassword = `qa-barber-${randomBytes(18).toString("base64url")}`;
    const runId = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
    const barberEmail = `phase12-team-qa-barber-${runId}@${QA_EMAIL_DOMAIN}`;
    const displayName = `Phase 12 Team QA ${runId}`;

    const { db, pool } = createDatabaseClient();

    try {
        await cleanupPriorQaRows(db);
        await assertStaticSeedData(db);
        const seedRows = await loadSeedRows(db);
        await seedDevOwner({
            ...process.env,
            DEV_OWNER_EMAIL: ownerEmail,
            DEV_OWNER_PASSWORD: ownerPassword,
            DEV_OWNER_NAME: "Phase 12 Team QA Owner",
        });

        const { default: app } = await import(new URL("../../../server.js", import.meta.url).href);
        const ownerAgent = request.agent(app);

        await ownerAgent
            .post("/api/admin/auth/login")
            .send({ email: ownerEmail, password: ownerPassword })
            .expect(200);
        logStep("Owner logged in through real admin auth.");

        const uploadResponse = await ownerAgent
            .post("/api/admin/team/profile-image?filename=phase12-team.png")
            .set("Content-Type", "image/png")
            .send(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            .expect(201);
        assert.equal(uploadResponse.body.url, "https://blob.example/barbers/phase12-team.png");
        assert.equal(uploadResponse.body.pathname, "barbers/phase12-team.png");
        logStep("Owner uploaded a local mock profile image through the authenticated image endpoint.");

        let createResponse: request.Response;
        const inviteToken = await captureLocalDevToken("/admin/accept-invite", async () => {
            createResponse = await ownerAgent
                .post("/api/admin/team/barbers")
                .send({
                    displayName,
                    email: barberEmail,
                    phoneE164: "+16475550123",
                    profileImageUrl: uploadResponse.body.url,
                    profileImagePathname: uploadResponse.body.pathname,
                    locationIds: [seedRows.locationId],
                    weeklyShifts: [
                        {
                            locationId: seedRows.locationId,
                            dayOfWeek: seedRows.dayOfWeek,
                            startTime: seedRows.shiftStartTime,
                            endTime: seedRows.shiftEndTime,
                        },
                    ],
                })
                .expect(201);
        });
        const createdBarberId = createResponse!.body.barber.id;
        assert.equal(createResponse!.body.barber.email, barberEmail);
        assert.equal(createResponse!.body.barber.profileImageUrl, uploadResponse.body.url);
        logStep("Owner created a barber with profile image, all services, invite, and weekly shifts.");

        const teamResponse = await ownerAgent.get("/api/admin/team/barbers").expect(200);
        const listedTeamBarber = teamResponse.body.barbers.find((barber: { id: string }) => barber.id === createdBarberId);
        assert.ok(listedTeamBarber, "Created barber was not returned by team list.");
        assert.equal(listedTeamBarber.user.active, false);
        assert.equal(listedTeamBarber.weeklyShifts.length, 1);
        logStep("Team list returned pending account status, weekly shifts, photo, and booking count.");

        const calendarOptions = await ownerAgent.get("/api/admin/calendar/options").expect(200);
        assertBarberVisible(calendarOptions.body.barbers, createdBarberId, "admin calendar options");
        logStep("Created barber appeared in admin calendar options immediately.");

        const catalogResponse = await request(app).get("/api/booking/catalog").expect(200);
        const catalogBarber = catalogResponse.body.barbers.find((barber: { id: string }) => barber.id === createdBarberId);
        assert.ok(catalogBarber, "Created barber was not returned by public catalog.");
        assert.equal(catalogBarber.profileImageUrl, uploadResponse.body.url);
        logStep("Created barber appeared in public booking catalog with uploaded photo.");

        const availabilityResponse = await request(app)
            .get("/api/booking/availability")
            .query({
                locationId: seedRows.locationId,
                serviceIds: seedRows.serviceId,
                date: seedRows.qaDate,
                barberId: createdBarberId,
            })
            .expect(200);
        const barberAvailability = availabilityResponse.body.barberSlots.find(
            (entry: { barberId: string }) => entry.barberId === createdBarberId,
        );
        assert.ok(barberAvailability?.slots?.length > 0, "Created barber did not generate public availability.");
        logStep("Public availability generated slots for the created barber before invite acceptance.");

        await request(app)
            .post("/api/admin/auth/accept-invite")
            .send({ token: inviteToken, password: barberPassword })
            .expect(204);
        const barberAgent = request.agent(app);
        const barberLogin = await barberAgent
            .post("/api/admin/auth/login")
            .send({ email: barberEmail, password: barberPassword })
            .expect(200);
        assert.equal(barberLogin.body.user.role, "barber");
        assert.equal(barberLogin.body.user.barberId, createdBarberId);
        logStep("Created barber accepted invite and logged in with barber-scoped account.");

        const firstSlot = barberAvailability.slots[0];
        const bookingResponse = await ownerAgent
            .post("/api/admin/bookings")
            .send({
                locationId: seedRows.locationId,
                serviceIds: [seedRows.serviceId],
                barberId: createdBarberId,
                startTime: firstSlot.startTime,
                customer: {
                    firstName: "Phase12",
                    lastName: "Team",
                    phone: "+16475550199",
                    email: `phase12-team-qa-customer-${runId}@${QA_EMAIL_DOMAIN}`,
                },
                internalNotes: `${QA_NOTE_PREFIX} future booking ${runId}`,
            })
            .expect(201);
        const bookingId = bookingResponse.body.booking.id;
        logStep("Owner created a future booking for the new barber through admin booking API.");

        const scopedBookings = await barberAgent
            .get("/api/admin/bookings")
            .query({ from: seedRows.qaDate, to: seedRows.qaDate })
            .expect(200);
        assert.ok(
            scopedBookings.body.bookings.some((booking: { id: string }) => booking.id === bookingId),
            "Barber scoped bookings did not include their own booking.",
        );
        assert.ok(
            scopedBookings.body.bookings.every((booking: { barberId: string }) => booking.barberId === createdBarberId),
            "Barber scoped bookings included another barber.",
        );
        logStep("Barber login was scoped to that barber's own bookings.");

        await ownerAgent
            .post(`/api/admin/team/barbers/${createdBarberId}/deactivate`)
            .expect(409);
        logStep("Removal was blocked while the barber had a future confirmed booking.");

        await ownerAgent.post(`/api/admin/bookings/${bookingId}/cancel`).expect(200);
        logStep("Future booking was cancelled through admin booking management.");

        await ownerAgent
            .post(`/api/admin/team/barbers/${createdBarberId}/deactivate`)
            .expect(200);
        await barberAgent.get("/api/admin/auth/session").expect(401);
        logStep("Barber removal deactivated the barber user and revoked their session.");

        const hiddenCalendarOptions = await ownerAgent.get("/api/admin/calendar/options").expect(200);
        assertBarberHidden(hiddenCalendarOptions.body.barbers, createdBarberId, "admin calendar options");
        const hiddenCatalogResponse = await request(app).get("/api/booking/catalog").expect(200);
        assertBarberHidden(hiddenCatalogResponse.body.barbers, createdBarberId, "public catalog");
        logStep("Removed barber was hidden from admin calendar options and public catalog.");

        await cleanupPriorQaRows(db);
        logStep("Phase 12 team QA cleanup completed.");
        console.log("Phase 12 team management QA passed.");
    } catch (error) {
        console.error("Phase 12 team management QA failed.");
        throw error;
    } finally {
        await pool.end();
    }
}

function assertLocalQaAllowed() {
    if (process.env.NODE_ENV === "production") {
        throw new Error("Phase 12 team QA must not run in production.");
    }

    if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL is required for Phase 12 team QA.");
    }

    const parsed = new URL(process.env.DATABASE_URL);
    const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

    if (!localHosts.has(parsed.hostname)) {
        throw new Error("Phase 12 team QA may only run against a local development database.");
    }
}

async function assertStaticSeedData(db: ReturnType<typeof createDatabaseClient>["db"]) {
    const [locationCount, businessHourCount, serviceCount] = await Promise.all([
        countRows(db, locations),
        countRows(db, businessHours),
        countRows(db, services),
    ]);

    assert.ok(locationCount >= 1, "Static seed data missing locations. Run npm run db:seed.");
    assert.ok(businessHourCount >= 1, "Static seed data missing business hours. Run npm run db:seed.");
    assert.ok(serviceCount >= 1, "Static seed data missing services. Run npm run db:seed.");
    logStep("Database migrations and static booking seed data are present.");
}

async function loadSeedRows(db: ReturnType<typeof createDatabaseClient>["db"]): Promise<SeedRows> {
    const [location] = await db
        .select({
            id: locations.id,
            name: locations.name,
        })
        .from(locations)
        .where(eq(locations.active, true))
        .orderBy(asc(locations.sortOrder), asc(locations.name))
        .limit(1);
    assert.ok(location?.id, "No active location is available for QA.");

    const [service] = await db
        .select({ id: services.id, name: services.name })
        .from(services)
        .where(eq(services.active, true))
        .orderBy(asc(services.sortOrder), asc(services.name))
        .limit(1);
    assert.ok(service?.id, "No active service is available for QA.");

    const [businessHour] = await db
        .select({
            dayOfWeek: businessHours.dayOfWeek,
            openTime: businessHours.openTime,
            closeTime: businessHours.closeTime,
        })
        .from(businessHours)
        .where(sql`${businessHours.locationId} = ${location.id} and ${businessHours.closed} = false`)
        .orderBy(asc(businessHours.dayOfWeek))
        .limit(1);
    assert.ok(businessHour, "No open business-hour window is available for QA.");

    const qaDate = nextLocalDateForDay(businessHour.dayOfWeek);

    return {
        locationId: location.id,
        locationName: location.name,
        serviceId: service.id,
        serviceName: service.name,
        qaDate,
        shiftStartTime: businessHour.openTime.slice(0, 5),
        shiftEndTime: businessHour.closeTime.slice(0, 5),
        dayOfWeek: businessHour.dayOfWeek,
    };
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
    await db.execute(sql`
        delete from user_invite_tokens
        where user_id in (select id from users where email like ${QA_EMAIL_PATTERN})
    `);
    await db.execute(sql`
        delete from user_sessions
        where user_id in (select id from users where email like ${QA_EMAIL_PATTERN})
    `);
    await db.execute(sql`delete from users where email like ${QA_EMAIL_PATTERN}`);
    await db.execute(sql`
        delete from shifts
        where barber_id in (select id from barbers where email like ${QA_EMAIL_PATTERN} or slug like 'phase-12-team-qa-%')
    `);
    await db.execute(sql`
        delete from barber_services
        where barber_id in (select id from barbers where email like ${QA_EMAIL_PATTERN} or slug like 'phase-12-team-qa-%')
    `);
    await db.execute(sql`
        delete from barber_locations
        where barber_id in (select id from barbers where email like ${QA_EMAIL_PATTERN} or slug like 'phase-12-team-qa-%')
    `);
    await db.execute(sql`delete from barbers where email like ${QA_EMAIL_PATTERN} or slug like 'phase-12-team-qa-%'`);
    logStep("Prior Phase 12 team QA rows were cleaned from the local database.");
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

function assertBarberVisible(barbersPayload: unknown, barberId: string, label: string) {
    assert.ok(Array.isArray(barbersPayload), `${label} barbers payload is invalid.`);
    assert.ok(
        barbersPayload.some((barber: { id?: string }) => barber.id === barberId),
        `Expected barber ${barberId} in ${label}.`,
    );
}

function assertBarberHidden(barbersPayload: unknown, barberId: string, label: string) {
    assert.ok(Array.isArray(barbersPayload), `${label} barbers payload is invalid.`);
    assert.ok(
        barbersPayload.every((barber: { id?: string }) => barber.id !== barberId),
        `Expected barber ${barberId} to be hidden from ${label}.`,
    );
}

function nextLocalDateForDay(dayOfWeek: number) {
    for (let offset = 3; offset <= 28; offset += 1) {
        const date = getLocalDate(new Date(Date.now() + offset * 24 * 60 * 60 * 1000), TIME_ZONE);

        if (localDateToDayOfWeek(date) === dayOfWeek) {
            return date;
        }
    }

    throw new Error(`Could not find QA date for day ${dayOfWeek} within booking window.`);
}

function logStep(message: string) {
    console.log(`[phase12-team-qa] ${message}`);
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});
