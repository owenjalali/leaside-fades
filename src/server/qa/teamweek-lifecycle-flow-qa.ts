import "dotenv/config";

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

import { and, asc, eq, sql } from "drizzle-orm";
import request from "supertest";

import {
    getLocalDate,
    localDateTimeToUtc,
    localDateToDayOfWeek,
    minutesToTime,
    timeToMinutes,
} from "../availability/time.ts";
import { createDatabaseClient } from "../db/client.ts";
import { seedDevOwner } from "../db/seed-dev-owner.ts";
import { businessHours, locations, services } from "../db/schema.ts";

const QA_EMAIL_DOMAIN = "example.local";
const QA_EMAIL_PATTERN = `teamweek-qa-%@${QA_EMAIL_DOMAIN}`;
const QA_BARBER_SLUG_PATTERN = "team-week-qa-%";
const QA_REASON_PREFIX = "Team Week lifecycle QA";
const QA_APP_URL = "http://localhost:3000";
const TIME_ZONE = "America/Toronto";
const SLOT_INTERVAL_MINUTES = 15;
const FULL_SHIFT_START = "09:00";
const FULL_SHIFT_END = "12:00";
const BLOCKED_WINDOW_START = "09:00";
const BLOCKED_WINDOW_END = "10:30";

const COUNTED_TABLES = [
    "users",
    "user_sessions",
    "user_invite_tokens",
    "barbers",
    "barber_locations",
    "barber_services",
    "shifts",
    "shift_overrides",
    "blocked_times",
    "bookings",
    "booking_services",
    "customers",
    "notifications",
] as const;

type CountedTable = (typeof COUNTED_TABLES)[number];
type CountSnapshot = Record<CountedTable, number>;
type Db = ReturnType<typeof createDatabaseClient>["db"];
type AppUnderTest = Parameters<typeof request>[0];

interface SeedRows {
    locationId: string;
    locationName: string;
    serviceId: string;
    serviceName: string;
    serviceDurationMinutes: number;
    initialShiftDayOfWeek: number;
    weeklyShiftDayOfWeek: number;
}

interface PublicAvailabilitySlot {
    barberId: string;
    locationId: string;
    startTime: string;
    endTime: string;
    totalDurationMinutes: number;
}

interface PublicAvailabilityBody {
    barberSlots?: Array<{ barberId: string; locationId: string; slots?: PublicAvailabilitySlot[] }>;
}

interface PublicCatalogBody {
    barbers?: Array<{ id: string }>;
}

interface AdminScheduleShiftRow {
    id: string;
    barberId: string;
    locationId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    active: boolean;
}

interface AdminScheduleBody {
    barbers?: Array<{ id: string }>;
    shifts?: AdminScheduleShiftRow[];
}

interface WeeklyBatchBody {
    applied?: number;
    shifts?: AdminScheduleShiftRow[];
    deactivatedShiftIds?: string[];
}

interface StepResult {
    name: string;
    status: "PASS" | "FAIL";
    detail?: string;
}

const stepResults: StepResult[] = [];

async function main() {
    assertLocalQaAllowed();
    process.env.APP_URL ??= QA_APP_URL;
    // Force local-safe modes: the profile-image upload never touches Vercel
    // Blob and booking notifications never reach Twilio/Resend during QA.
    process.env.TEAM_PROFILE_IMAGE_UPLOAD_MODE = "mock";
    process.env.NOTIFICATION_DELIVERY_MODE = "mock";

    // Unlike other runners this one always uses a QA-tagged owner (never
    // DEV_OWNER_EMAIL) so cleanup provably returns the DB to its pre-run state.
    const ownerEmail = `teamweek-qa-owner@${QA_EMAIL_DOMAIN}`;
    const ownerPassword = `qa-owner-${randomBytes(18).toString("base64url")}`;
    const runId = `${new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14)}-${randomBytes(3).toString("hex")}`;
    const barberEmail = `teamweek-qa-barber-${runId}@${QA_EMAIL_DOMAIN}`;
    const customerEmail = `teamweek-qa-customer-${runId}@${QA_EMAIL_DOMAIN}`;
    const displayName = `Team Week QA ${runId}`;

    const { db, pool } = createDatabaseClient();
    let baseline: CountSnapshot | null = null;
    let cleanupFailure: unknown = null;

    try {
        await cleanupPriorQaRows(db);
        baseline = await snapshotCounts(db);
        logStep("Captured pre-run row-count baseline.");

        const seedRows = await loadSeedRows(db);
        const scheduleDates = upcomingLocalDatesForDay(seedRows.weeklyShiftDayOfWeek, 4);
        const [exactWindowDate, narrowedDate, notWorkingDate, blockedDate] = scheduleDates;
        const [noShiftDate] = upcomingLocalDatesForDay(seedRows.initialShiftDayOfWeek, 1);
        logStep(
            `Using location "${seedRows.locationName}", service "${seedRows.serviceName}" (${seedRows.serviceDurationMinutes} min), weekly day ${seedRows.weeklyShiftDayOfWeek} (${scheduleDates.join(", ")}), no-shift day ${seedRows.initialShiftDayOfWeek} (${noShiftDate}).`,
        );

        await seedDevOwner({
            ...process.env,
            DEV_OWNER_EMAIL: ownerEmail,
            DEV_OWNER_PASSWORD: ownerPassword,
            DEV_OWNER_NAME: "Team Week QA Owner",
        });

        const { default: app } = await import(new URL("../../../server.js", import.meta.url).href);
        const ownerAgent = request.agent(app);

        await ownerAgent
            .post("/api/admin/auth/login")
            .send({ email: ownerEmail, password: ownerPassword })
            .expect(200);
        logStep("Owner logged in through the real admin auth route.");

        const barberId = await step("Barber created through team onboarding API (201)", async () => {
            const uploadResponse = await ownerAgent
                .post(`/api/admin/team/profile-image?filename=teamweek-${runId}.png`)
                .set("Content-Type", "image/png")
                .send(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
                .expect(201);
            const upload = uploadResponse.body as { url?: string; pathname?: string };
            assert.ok(upload.url && upload.pathname, "Mock profile-image upload did not return url/pathname.");

            const createResponse = await ownerAgent
                .post("/api/admin/team/barbers")
                .send({
                    displayName,
                    email: barberEmail,
                    phoneE164: "+16475550177",
                    profileImageUrl: upload.url,
                    profileImagePathname: upload.pathname,
                    locationIds: [seedRows.locationId],
                    weeklyShifts: [
                        {
                            locationId: seedRows.locationId,
                            dayOfWeek: seedRows.initialShiftDayOfWeek,
                            startTime: "10:00",
                            endTime: "14:00",
                        },
                    ],
                })
                .expect(201);
            const created = createResponse.body as { barber?: { id?: string; locationIds?: string[] } };
            assert.ok(created.barber?.id, "Barber creation did not return a barber id.");
            assert.deepEqual(created.barber.locationIds, [seedRows.locationId]);
            return created.barber.id;
        });

        const initialShiftId = await step("New barber appears in public catalog and admin schedule", async () => {
            const catalogResponse = await request(app).get("/api/booking/catalog").expect(200);
            const catalog = catalogResponse.body as PublicCatalogBody;
            assert.ok(
                (catalog.barbers ?? []).some((barber) => barber.id === barberId),
                "Created barber is missing from the public catalog.",
            );

            const scheduleResponse = await ownerAgent.get("/api/admin/schedule").expect(200);
            const schedule = scheduleResponse.body as AdminScheduleBody;
            assert.ok(
                (schedule.barbers ?? []).some((barber) => barber.id === barberId),
                "Created barber is missing from GET /api/admin/schedule barbers.",
            );
            const barberShifts = (schedule.shifts ?? []).filter(
                (shift) => shift.barberId === barberId && shift.active,
            );
            assert.equal(barberShifts.length, 1, "Expected exactly one active onboarding shift.");
            assert.equal(barberShifts[0].dayOfWeek, seedRows.initialShiftDayOfWeek);
            return barberShifts[0].id;
        });

        await step("Weekly batch endpoint replaced the schedule (200, applied count)", async () => {
            const batchResponse = await ownerAgent
                .post("/api/admin/schedule/weekly-batch")
                .send({
                    operations: [
                        { type: "deactivate", shiftId: initialShiftId },
                        {
                            type: "create",
                            payload: {
                                barberId,
                                locationId: seedRows.locationId,
                                dayOfWeek: seedRows.weeklyShiftDayOfWeek,
                                startTime: FULL_SHIFT_START,
                                endTime: FULL_SHIFT_END,
                            },
                        },
                    ],
                })
                .expect(200);
            const batch = batchResponse.body as WeeklyBatchBody;
            assert.equal(batch.applied, 2, "Weekly batch applied count mismatch.");
            assert.equal(batch.shifts?.length, 1, "Weekly batch should return the created shift.");
            assert.deepEqual(batch.deactivatedShiftIds, [initialShiftId]);
        });

        const fullWindowStarts = expectedSlotStarts(
            exactWindowDate,
            FULL_SHIFT_START,
            FULL_SHIFT_END,
            seedRows.serviceDurationMinutes,
        );

        await step("Public availability matches the scheduled window exactly", async () => {
            const slots = await fetchPublicSlots(app, seedRows, barberId, exactWindowDate);
            const actualStarts = slots.map((slot) => slot.startTime);
            assert.ok(fullWindowStarts.length > 0, "QA window is too small for the selected service.");
            assert.deepEqual(actualStarts, fullWindowStarts, "Slots do not exactly fill the scheduled window.");
            assert.equal(actualStarts[0], utcIso(exactWindowDate, FULL_SHIFT_START), "Earliest slot is not the window start.");
            const windowEndMs = utcMs(exactWindowDate, FULL_SHIFT_END);
            for (const slot of slots) {
                assert.equal(slot.totalDurationMinutes, seedRows.serviceDurationMinutes);
                assert.ok(new Date(slot.startTime).getTime() >= utcMs(exactWindowDate, FULL_SHIFT_START));
                assert.ok(new Date(slot.endTime).getTime() <= windowEndMs, "A slot ends after the scheduled window.");
            }
        });

        await step("Public availability is zero on a weekday with no shift", async () => {
            const slots = await fetchPublicSlots(app, seedRows, barberId, noShiftDate);
            assert.equal(slots.length, 0, `Expected zero slots on ${noShiftDate} (no shift that weekday).`);
        });

        await step("Overlapping add+remove resolves add-before-remove (real repository ORDER BY)", async () => {
            // The availability engine folds shift overrides in row order; the
            // whole system stays booking-safe only because the public-booking
            // repository loads them ordered (override_date, override_type, id),
            // so an `add` always reaches the engine before an overlapping
            // `remove`. Exercise that REAL path end-to-end: post the remove
            // FIRST (lower id) so a dropped ORDER BY would surface as
            // remove-before-add, then assert the window is fully closed (removes
            // win), and restore the date for the later booking steps.
            const removeResponse = await ownerAgent
                .post("/api/admin/schedule/shift-overrides")
                .send({
                    barberId,
                    locationId: seedRows.locationId,
                    overrideDate: exactWindowDate,
                    overrideType: "remove",
                    startTime: FULL_SHIFT_START,
                    endTime: FULL_SHIFT_END,
                    reason: `${QA_REASON_PREFIX} order remove ${runId}`,
                })
                .expect(201);
            const addResponse = await ownerAgent
                .post("/api/admin/schedule/shift-overrides")
                .send({
                    barberId,
                    locationId: seedRows.locationId,
                    overrideDate: exactWindowDate,
                    overrideType: "add",
                    startTime: FULL_SHIFT_START,
                    endTime: FULL_SHIFT_END,
                    reason: `${QA_REASON_PREFIX} order add ${runId}`,
                })
                .expect(201);
            const removeId = (removeResponse.body as { shiftOverride?: { id?: string } }).shiftOverride?.id;
            const addId = (addResponse.body as { shiftOverride?: { id?: string } }).shiftOverride?.id;
            assert.ok(removeId && addId, "Shift-override creation did not return ids.");

            const during = await fetchPublicSlots(app, seedRows, barberId, exactWindowDate);
            assert.equal(
                during.length,
                0,
                "Overlapping add+remove must close the window (removes win). A dropped repository ORDER BY re-opens it.",
            );

            await ownerAgent.post(`/api/admin/schedule/shift-overrides/${addId}/delete`).expect(200);
            await ownerAgent.post(`/api/admin/schedule/shift-overrides/${removeId}/delete`).expect(200);

            const restored = await fetchPublicSlots(app, seedRows, barberId, exactWindowDate);
            assert.deepEqual(
                restored.map((slot) => slot.startTime),
                fullWindowStarts,
                "Exact-window date was not restored after the ordering probe cleaned up.",
            );
        });

        await step("Day-shift edit confined one date to a narrower window", async () => {
            const narrowStartMinutes = timeToMinutes("10:00");
            const roundedDuration =
                Math.ceil(seedRows.serviceDurationMinutes / SLOT_INTERVAL_MINUTES) * SLOT_INTERVAL_MINUTES;
            const narrowStart = minutesToTime(narrowStartMinutes);
            const narrowEnd = minutesToTime(narrowStartMinutes + roundedDuration + SLOT_INTERVAL_MINUTES);
            assert.ok(
                timeToMinutes(narrowEnd) <= timeToMinutes(FULL_SHIFT_END),
                "Narrow QA window escaped the full shift window.",
            );

            await ownerAgent
                .post("/api/admin/schedule/day-shifts")
                .send({
                    barberId,
                    locationId: seedRows.locationId,
                    date: narrowedDate,
                    windows: [{ startTime: narrowStart, endTime: narrowEnd }],
                })
                .expect(200);

            const slots = await fetchPublicSlots(app, seedRows, barberId, narrowedDate);
            const expectedStarts = expectedSlotStarts(
                narrowedDate,
                narrowStart,
                narrowEnd,
                seedRows.serviceDurationMinutes,
            );
            assert.ok(expectedStarts.length >= 2, "Narrow window should still produce at least two slots.");
            assert.deepEqual(
                slots.map((slot) => slot.startTime),
                expectedStarts,
                "Availability was not confined to the narrowed day window.",
            );
        });

        await step("Not-working override removed all availability for its date", async () => {
            await ownerAgent
                .post("/api/admin/schedule/shift-overrides")
                .send({
                    barberId,
                    overrideDate: notWorkingDate,
                    overrideType: "not_working",
                    reason: `${QA_REASON_PREFIX} not working ${runId}`,
                })
                .expect(201);

            const slots = await fetchPublicSlots(app, seedRows, barberId, notWorkingDate);
            assert.equal(
                slots.length,
                0,
                `Expected zero slots on ${notWorkingDate} at the barber's location after not_working override.`,
            );
        });

        await step("Barber blocked time dropped the blocked window from availability", async () => {
            await ownerAgent
                .post("/api/admin/schedule/blocked-times")
                .send({
                    scope: "barber",
                    barberId,
                    locationId: seedRows.locationId,
                    startDate: blockedDate,
                    startTime: BLOCKED_WINDOW_START,
                    endDate: blockedDate,
                    endTime: BLOCKED_WINDOW_END,
                    reason: `${QA_REASON_PREFIX} blocked ${runId}`,
                })
                .expect(201);

            const slots = await fetchPublicSlots(app, seedRows, barberId, blockedDate);
            const expectedStarts = withoutStartsOverlappingUtcWindow(
                expectedSlotStarts(blockedDate, FULL_SHIFT_START, FULL_SHIFT_END, seedRows.serviceDurationMinutes),
                utcMs(blockedDate, BLOCKED_WINDOW_START),
                utcMs(blockedDate, BLOCKED_WINDOW_END),
                seedRows.serviceDurationMinutes,
            );
            assert.ok(expectedStarts.length > 0, "Blocked-time QA expects slots to remain after the block.");
            assert.deepEqual(
                slots.map((slot) => slot.startTime),
                expectedStarts,
                "Blocked time did not remove exactly the blocked window.",
            );
        });

        const { bookingId, bookedSlot } = await step("Public booking created into a valid slot (201)", async () => {
            const slots = await fetchPublicSlots(app, seedRows, barberId, exactWindowDate);
            assert.deepEqual(
                slots.map((slot) => slot.startTime),
                fullWindowStarts,
                "Exact-window date availability changed before booking.",
            );
            const targetSlot = slots[0];

            const bookingResponse = await request(app)
                .post("/api/booking/bookings")
                .send({
                    locationId: seedRows.locationId,
                    serviceIds: [seedRows.serviceId],
                    barberId,
                    startTime: targetSlot.startTime,
                    customer: {
                        firstName: "Teamweek",
                        lastName: "Lifecycle",
                        phone: "+16475550188",
                        email: customerEmail,
                    },
                })
                .expect(201);
            const booking = bookingResponse.body as { id?: string; startTime?: string };
            assert.ok(booking.id, "Public booking did not return an id.");
            assert.equal(booking.startTime, targetSlot.startTime);
            return { bookingId: booking.id, bookedSlot: targetSlot };
        });

        await step("Booked slot disappeared from public availability", async () => {
            const slots = await fetchPublicSlots(app, seedRows, barberId, exactWindowDate);
            const expectedStarts = withoutStartsOverlappingUtcWindow(
                fullWindowStarts,
                new Date(bookedSlot.startTime).getTime(),
                new Date(bookedSlot.endTime).getTime(),
                seedRows.serviceDurationMinutes,
            );
            const actualStarts = slots.map((slot) => slot.startTime);
            assert.ok(!actualStarts.includes(bookedSlot.startTime), "Booked slot is still offered.");
            assert.deepEqual(actualStarts, expectedStarts, "Availability after booking is not exactly the remainder.");
        });

        await step("Deactivation blocked (409) while a future confirmed booking exists", async () => {
            await ownerAgent.post(`/api/admin/team/barbers/${barberId}/deactivate`).expect(409);
        });

        await step("Booking cancelled via admin, then deactivation succeeded (200)", async () => {
            await ownerAgent.post(`/api/admin/bookings/${bookingId}/cancel`).expect(200);
            await ownerAgent.post(`/api/admin/team/barbers/${barberId}/deactivate`).expect(200);
        });

        await step("Deactivated barber vanished from catalog and availability", async () => {
            const catalogResponse = await request(app).get("/api/booking/catalog").expect(200);
            const catalog = catalogResponse.body as PublicCatalogBody;
            assert.ok(
                (catalog.barbers ?? []).every((barber) => barber.id !== barberId),
                "Deactivated barber is still in the public catalog.",
            );

            const slots = await fetchPublicSlots(app, seedRows, barberId, exactWindowDate);
            assert.equal(slots.length, 0, "Deactivated barber still produces public availability.");
        });

        console.log("Team Week lifecycle QA passed.");
    } catch (error) {
        if (isMissingMigrationError(error)) {
            throw new Error(
                `Database prerequisites are missing. Run npm run db:migrate and npm run db:seed against the local database, then retry. Original error: ${error instanceof Error ? error.message : String(error)}`,
            );
        }

        throw error;
    } finally {
        printResultMatrix();

        try {
            await cleanupPriorQaRows(db);

            if (baseline) {
                const after = await snapshotCounts(db);
                assertSnapshotsEqual(baseline, after);
            }
        } catch (error) {
            cleanupFailure = error;
            console.error("[teamweek-qa] Cleanup or row-count verification failed");
            console.error(error);
        }

        await pool.end();

        if (cleanupFailure) {
            throw new Error(
                "Team Week lifecycle QA cleanup verification failed. The local database may still contain QA rows.",
            );
        }
    }
}

async function step<T>(name: string, run: () => Promise<T>): Promise<T> {
    try {
        const value = await run();
        stepResults.push({ name, status: "PASS" });
        console.log(`[teamweek-qa] PASS ${name}`);
        return value;
    } catch (error) {
        stepResults.push({
            name,
            status: "FAIL",
            detail: error instanceof Error ? error.message : String(error),
        });
        console.error(`[teamweek-qa] FAIL ${name}`);
        throw error;
    }
}

function printResultMatrix() {
    if (stepResults.length === 0) {
        return;
    }

    console.log("[teamweek-qa] Step matrix:");

    for (const [index, result] of stepResults.entries()) {
        const detail = result.detail ? ` — ${result.detail}` : "";
        console.log(`[teamweek-qa]   ${String(index + 1).padStart(2, " ")}. ${result.status}  ${result.name}${detail}`);
    }
}

function assertLocalQaAllowed() {
    if (process.env.NODE_ENV === "production") {
        throw new Error("Team Week lifecycle QA must not run in production.");
    }

    if (!process.env.DATABASE_URL) {
        throw new Error("DATABASE_URL is required for Team Week lifecycle QA.");
    }

    const parsed = new URL(process.env.DATABASE_URL);
    const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

    if (!localHosts.has(parsed.hostname)) {
        throw new Error("Team Week lifecycle QA may only run against a local development database.");
    }
}

async function loadSeedRows(db: Db): Promise<SeedRows> {
    const [location] = await db
        .select({ id: locations.id, name: locations.name })
        .from(locations)
        .where(eq(locations.active, true))
        .orderBy(asc(locations.sortOrder), asc(locations.name))
        .limit(1);
    assert.ok(location?.id, "No active location is available. Run npm run db:seed.");

    const openHours = await db
        .select({ dayOfWeek: businessHours.dayOfWeek })
        .from(businessHours)
        .where(and(eq(businessHours.locationId, location.id), eq(businessHours.closed, false)))
        .orderBy(asc(businessHours.dayOfWeek));
    const openWeekdays = [...new Set(openHours.map((hour) => hour.dayOfWeek))];
    assert.ok(
        openWeekdays.length >= 2,
        "At least two open weekdays are required for lifecycle QA. Run npm run db:seed.",
    );

    const [service] = await db
        .select({ id: services.id, name: services.name, durationMinutes: services.durationMinutes })
        .from(services)
        .where(eq(services.active, true))
        .orderBy(asc(services.durationMinutes), asc(services.sortOrder), asc(services.name))
        .limit(1);
    assert.ok(service?.id, "No active service is available. Run npm run db:seed.");
    assert.ok(
        service.durationMinutes <= 90,
        `Shortest active service is ${service.durationMinutes} min; lifecycle QA windows require 90 min or less.`,
    );

    return {
        locationId: location.id,
        locationName: location.name,
        serviceId: service.id,
        serviceName: service.name,
        serviceDurationMinutes: service.durationMinutes,
        initialShiftDayOfWeek: openWeekdays[0],
        weeklyShiftDayOfWeek: openWeekdays[1],
    };
}

async function fetchPublicSlots(
    app: AppUnderTest,
    seedRows: SeedRows,
    barberId: string,
    date: string,
): Promise<PublicAvailabilitySlot[]> {
    const response = await request(app)
        .get("/api/booking/availability")
        .query({
            locationId: seedRows.locationId,
            serviceIds: seedRows.serviceId,
            date,
            barberId,
        })
        .expect(200);
    const body = response.body as PublicAvailabilityBody;

    return (body.barberSlots ?? [])
        .filter((barberSlot) => barberSlot.barberId === barberId)
        .flatMap((barberSlot) => barberSlot.slots ?? []);
}

function expectedSlotStarts(date: string, startTime: string, endTime: string, durationMinutes: number) {
    const starts: string[] = [];
    const windowEndMinutes = timeToMinutes(endTime);

    for (
        let minutes = timeToMinutes(startTime);
        minutes + durationMinutes <= windowEndMinutes;
        minutes += SLOT_INTERVAL_MINUTES
    ) {
        starts.push(utcIso(date, minutesToTime(minutes)));
    }

    return starts;
}

function withoutStartsOverlappingUtcWindow(
    starts: string[],
    windowStartMs: number,
    windowEndMs: number,
    durationMinutes: number,
) {
    return starts.filter((startIso) => {
        const startMs = new Date(startIso).getTime();
        const endMs = startMs + durationMinutes * 60_000;
        return startMs >= windowEndMs || endMs <= windowStartMs;
    });
}

function utcIso(date: string, time: string) {
    return localDateTimeToUtc(date, time, TIME_ZONE).toISOString();
}

function utcMs(date: string, time: string) {
    return localDateTimeToUtc(date, time, TIME_ZONE).getTime();
}

function upcomingLocalDatesForDay(dayOfWeek: number, count: number) {
    const dates: string[] = [];

    // Offsets 2..29 keep every date inside the 30-day public booking window
    // while clearing the minimum-notice threshold, and contain exactly four
    // occurrences of every weekday.
    for (let offset = 2; offset <= 29 && dates.length < count; offset += 1) {
        const date = getLocalDate(new Date(Date.now() + offset * 24 * 60 * 60 * 1000), TIME_ZONE);

        if (localDateToDayOfWeek(date) === dayOfWeek) {
            dates.push(date);
        }
    }

    if (dates.length < count) {
        throw new Error(`Could not find ${count} upcoming dates for weekday ${dayOfWeek} within the booking window.`);
    }

    return dates;
}

async function snapshotCounts(db: Db): Promise<CountSnapshot> {
    const snapshot = {} as CountSnapshot;

    for (const table of COUNTED_TABLES) {
        snapshot[table] = await countTableRows(db, table);
    }

    return snapshot;
}

async function countTableRows(db: Db, table: CountedTable) {
    const result = await db.execute(sql.raw(`select count(*)::int as count from ${table}`));
    const row = result.rows[0] as { count?: number | string } | undefined;
    return Number(row?.count ?? 0);
}

function assertSnapshotsEqual(before: CountSnapshot, after: CountSnapshot) {
    const mismatches: string[] = [];
    console.log("[teamweek-qa] Row counts (baseline -> after cleanup):");

    for (const table of COUNTED_TABLES) {
        const matches = before[table] === after[table];
        console.log(
            `[teamweek-qa]   ${table}: ${before[table]} -> ${after[table]} ${matches ? "ok" : "MISMATCH"}`,
        );

        if (!matches) {
            mismatches.push(`${table} (${before[table]} -> ${after[table]})`);
        }
    }

    if (mismatches.length > 0) {
        throw new Error(`Cleanup left row-count drift in: ${mismatches.join(", ")}`);
    }

    logStep("Cleanup verified: every tracked table matches its pre-run row count.");
}

async function cleanupPriorQaRows(db: Db) {
    const qaBarberIds = sql`select id from barbers where email like ${QA_EMAIL_PATTERN} or slug like ${QA_BARBER_SLUG_PATTERN}`;
    const qaCustomerIds = sql`select id from customers where email like ${QA_EMAIL_PATTERN}`;
    const qaUserIds = sql`select id from users where email like ${QA_EMAIL_PATTERN}`;
    const qaBookingIds = sql`select id from bookings where customer_id in (${qaCustomerIds}) or barber_id in (${qaBarberIds})`;

    await db.execute(sql`delete from notifications where booking_id in (${qaBookingIds})`);
    await db.execute(sql`delete from booking_services where booking_id in (${qaBookingIds})`);
    await db.execute(
        sql`delete from bookings where customer_id in (${qaCustomerIds}) or barber_id in (${qaBarberIds})`,
    );
    await db.execute(sql`delete from customers where email like ${QA_EMAIL_PATTERN}`);
    await db.execute(
        sql`delete from blocked_times where reason like ${`${QA_REASON_PREFIX}%`} or barber_id in (${qaBarberIds})`,
    );
    await db.execute(
        sql`delete from shift_overrides where reason like ${`${QA_REASON_PREFIX}%`} or barber_id in (${qaBarberIds})`,
    );
    await db.execute(sql`delete from shifts where barber_id in (${qaBarberIds})`);
    await db.execute(sql`delete from barber_services where barber_id in (${qaBarberIds})`);
    await db.execute(sql`delete from barber_locations where barber_id in (${qaBarberIds})`);
    await db.execute(sql`delete from user_invite_tokens where user_id in (${qaUserIds})`);
    await db.execute(sql`delete from user_sessions where user_id in (${qaUserIds})`);
    await db.execute(sql`delete from users where email like ${QA_EMAIL_PATTERN}`);
    await db.execute(sql`delete from barbers where email like ${QA_EMAIL_PATTERN} or slug like ${QA_BARBER_SLUG_PATTERN}`);
    logStep("QA rows were cleaned from the local database.");
}

function isMissingMigrationError(error: unknown) {
    if (!(error instanceof Error)) {
        return false;
    }

    return /relation .* does not exist|column .* does not exist|schema .* does not exist/i.test(error.message);
}

function logStep(message: string) {
    console.log(`[teamweek-qa] ${message}`);
}

main()
    .then(() => {
        process.exit(0);
    })
    .catch((error) => {
        console.error("[teamweek-qa] FAILED");
        console.error(error);
        process.exit(1);
    });
