import assert from "node:assert/strict";

import { resolveBarberDay } from "../../admin/admin-utils.ts";
import type { AdminSchedule } from "../../admin/types.ts";

const DEFAULT_BASE_URL = "https://www.leasidefades.com";
const TIME_ZONE = "America/Toronto";

interface JsonResult {
    status: number;
    body: unknown;
    bodyText: string;
}

async function main() {
    const baseUrl = normalizeBaseUrl(process.env.PRODUCTION_SMOKE_BASE_URL || DEFAULT_BASE_URL);

    logStep(`Running non-mutating production smoke against ${baseUrl}.`);

    await assertPublicShellLoads(baseUrl);
    await assertHealthIsDatabaseReady(baseUrl);
    await assertCatalogShape(baseUrl);
    await assertInvalidAdminLoginFailsCleanly(baseUrl);
    await assertAdminRouteRequiresAuth(baseUrl);
    await assertReminderEndpointRequiresAuth(baseUrl);
    await assertReminderEndpointAuthenticatedDryRun(baseUrl);
    await assertPublicAvailabilityIsConsistent(baseUrl);
    await assertAvailabilityMatchesScheduleForOwner(baseUrl);

    console.log("Production smoke passed.");
}

function torontoLocalDate(daysFromNow: number): string {
    const now = new Date(Date.now() + daysFromNow * 86_400_000);
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(now);
}

function torontoClock(iso: string): string {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: TIME_ZONE,
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
    }).formatToParts(new Date(iso));
    const hour = parts.find((part) => part.type === "hour")?.value ?? "00";
    const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
    return `${hour === "24" ? "00" : hour}:${minute}`;
}

/**
 * Non-mutating structural consistency of the PUBLIC availability API (no auth):
 * every returned slot must belong to the requested barber+location, sit inside a
 * location the barber is assigned to, be 15-minute aligned, ordered, and carry the
 * requested service duration. A barber must never be offered at a location they
 * are not assigned to.
 */
async function assertPublicAvailabilityIsConsistent(baseUrl: string) {
    const catalog = await readJson(`${baseUrl}/api/booking/catalog`);
    assertRecord(catalog.body, "catalog body");
    const locations = catalog.body.locations as Array<{ id: string }>;
    const barbers = catalog.body.barbers as Array<{ id: string; displayName: string; locationIds: string[] }>;
    const categories = catalog.body.serviceCategories as Array<{ services: Array<{ id: string; durationMinutes: number }> }>;
    const service = categories.flatMap((category) => category.services)[0];
    assert.ok(service, "Catalog must expose at least one service.");

    const dates = [torontoLocalDate(1), torontoLocalDate(5), torontoLocalDate(14)];
    let checked = 0;

    for (const barber of barbers.slice(0, 3)) {
        for (const location of locations) {
            for (const date of dates) {
                const url = new URL(`${baseUrl}/api/booking/availability`);
                url.searchParams.set("locationId", location.id);
                url.searchParams.set("serviceIds", service.id);
                url.searchParams.set("date", date);
                url.searchParams.set("barberId", barber.id);
                const response = await readJson(url.toString());
                assert.equal(response.status, 200, failureMessage("/api/booking/availability", response));
                assertRecord(response.body, "availability body");
                const barberSlots = (response.body.barberSlots as Array<{ barberId: string; locationId: string; slots: Array<{ startTime: string; endTime: string; totalDurationMinutes: number }> }>) ?? [];

                for (const entry of barberSlots) {
                    assert.equal(entry.barberId, barber.id, "Availability returned a slot for a different barber than requested.");
                    assert.equal(entry.locationId, location.id, "Availability returned a slot for a different location than requested.");
                    assert.ok(
                        barber.locationIds.includes(location.id),
                        `${barber.displayName} returned slots at a location they are not assigned to (${location.id}).`,
                    );
                    let previousStart = "";
                    for (const slot of entry.slots) {
                        const start = torontoClock(slot.startTime);
                        assert.match(start, /^\d{2}:(00|15|30|45)$/, `Slot start ${start} is not 15-minute aligned.`);
                        assert.ok(start > previousStart, `Slots are not strictly ordered (${previousStart} then ${start}).`);
                        previousStart = start;
                        assert.equal(
                            slot.totalDurationMinutes,
                            service.durationMinutes,
                            "Slot duration does not match the requested service duration.",
                        );
                    }
                }
                checked += 1;
            }
        }
    }
    logStep(`Public availability is internally consistent across ${checked} barber/location/date probes.`);
}

/**
 * OPTIONAL read-only cross-check: when PRODUCTION_SMOKE_OWNER_EMAIL/PASSWORD are
 * provided, log in as owner (read-only), pull the admin schedule, and confirm the
 * PUBLIC availability agrees with the grid's own resolveBarberDay for the same
 * barbers/locations/dates. Zero writes: login -> GETs -> logout.
 */
async function assertAvailabilityMatchesScheduleForOwner(baseUrl: string) {
    const email = process.env.PRODUCTION_SMOKE_OWNER_EMAIL;
    const password = process.env.PRODUCTION_SMOKE_OWNER_PASSWORD;
    if (!email || !password) {
        logStep("Availability-vs-schedule cross-check skipped; PRODUCTION_SMOKE_OWNER_EMAIL/PASSWORD not set.");
        return;
    }

    const loginResponse = await fetch(`${baseUrl}/api/admin/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
    });
    assert.equal(loginResponse.status, 200, `Owner login for the smoke cross-check failed (HTTP ${loginResponse.status}).`);
    const cookie = loginResponse.headers
        .getSetCookie()
        .map((entry) => entry.split(";")[0])
        .join("; ");
    assert.ok(cookie, "Owner login returned no session cookie.");

    try {
        const dates = [torontoLocalDate(1), torontoLocalDate(4), torontoLocalDate(8)];
        const scheduleResponse = await fetch(
            `${baseUrl}/api/admin/schedule?from=${dates[0]}&to=${dates[dates.length - 1]}`,
            { headers: { cookie } },
        );
        assert.equal(scheduleResponse.status, 200, `GET /api/admin/schedule failed (HTTP ${scheduleResponse.status}).`);
        const schedule = (await scheduleResponse.json()) as AdminSchedule;
        const catalog = await readJson(`${baseUrl}/api/booking/catalog`);
        const service = (catalog.body as { serviceCategories: Array<{ services: Array<{ id: string }> }> }).serviceCategories
            .flatMap((category) => category.services)[0];

        let mismatches = 0;
        for (const barber of schedule.barbers.slice(0, 4)) {
            for (const location of schedule.locations) {
                for (const date of dates) {
                    const resolved = resolveBarberDay(schedule, barber.id, date);
                    const windowsHere = resolved.windows.filter((window) => window.locationId === location.id);

                    const url = new URL(`${baseUrl}/api/booking/availability`);
                    url.searchParams.set("locationId", location.id);
                    url.searchParams.set("serviceIds", service.id);
                    url.searchParams.set("date", date);
                    url.searchParams.set("barberId", barber.id);
                    const availability = await readJson(url.toString());
                    assertRecord(availability.body, "availability body");
                    const slots =
                        ((availability.body.barberSlots as Array<{ barberId: string; slots: Array<{ startTime: string }> }>) ?? [])
                            .filter((entry) => entry.barberId === barber.id)
                            .flatMap((entry) => entry.slots) ?? [];

                    if (windowsHere.length === 0 && slots.length > 0) {
                        mismatches += 1;
                        console.error(`[production-smoke] MISMATCH: grid shows ${barber.displayName} not working at ${location.id} on ${date} but public has ${slots.length} slots.`);
                        continue;
                    }
                    const outside = slots.filter((slot) => {
                        const clock = torontoClock(slot.startTime);
                        return !windowsHere.some((window) => clock >= window.startTime && (clock < window.endTime || window.endTime === "00:00"));
                    });
                    if (outside.length > 0) {
                        mismatches += 1;
                        console.error(`[production-smoke] MISMATCH: ${outside.length} public slots for ${barber.displayName} at ${location.id} on ${date} fall outside grid windows.`);
                    }
                }
            }
        }
        assert.equal(mismatches, 0, `${mismatches} availability-vs-schedule mismatches found in production.`);
        logStep("Public availability matches the admin schedule grid (read-only owner cross-check).");
    } finally {
        await fetch(`${baseUrl}/api/admin/auth/logout`, { method: "POST", headers: { cookie } });
    }
}

async function assertPublicShellLoads(baseUrl: string) {
    const response = await fetch(`${baseUrl}/book`, { redirect: "manual" });
    assert.equal(response.status, 200, `/book should load the public booking shell. Status: ${response.status}`);
    const body = await response.text();
    assert.match(body, /<html/i, "/book did not return the app shell HTML.");
    logStep("/book app shell loads.");
}

async function assertHealthIsDatabaseReady(baseUrl: string) {
    const response = await readJson(`${baseUrl}/api/health`);
    assert.equal(response.status, 200, failureMessage("/api/health", response));
    assertRecord(response.body, "/api/health body");
    assert.equal(response.body.ok, true, "/api/health must be ok when booking/admin are online.");
    assertRecord(response.body.checks, "/api/health checks");
    assertRecord(response.body.checks.database, "/api/health database check");
    assert.equal(response.body.checks.database.ok, true, "/api/health database check must be ok.");
    assert.equal(response.body.checks.database.status, "ok", "/api/health database status must be ok.");
    logStep("/api/health reports database readiness.");
}

async function assertCatalogShape(baseUrl: string) {
    const response = await readJson(`${baseUrl}/api/booking/catalog`);
    assert.equal(response.status, 200, failureMessage("/api/booking/catalog", response));
    assertRecord(response.body, "/api/booking/catalog body");
    assertArrayLength(response.body.locations, 2, "locations");
    const serviceCategories = assertArrayLength(response.body.serviceCategories, 3, "service categories");
    let serviceCount = 0;
    for (const category of serviceCategories) {
        assertRecord(category, "Catalog service category");
        assert.ok(Array.isArray(category.services), "Catalog service category must include a services array.");
        serviceCount += category.services.length;
    }
    assert.equal(serviceCount, 38, "Catalog services count mismatch.");
    assert.ok(
        serviceCategories.some((category) => {
            assertRecord(category, "Catalog service category");
            return Array.isArray(category.services) && category.services.some((service) => {
                assertRecord(service, "Catalog service");
                return (
                    service.slug === "mens-color-root-touchup" &&
                    service.name === "Men's Color Root Touchup" &&
                    service.durationMinutes === 45 &&
                    service.displayPrice === "from $65"
                );
            });
        }),
        "Catalog must include owner-approved Men's Color Root Touchup.",
    );
    assertArrayLength(response.body.barbers, 5, "barbers");
    logStep("/api/booking/catalog returns the launch catalog.");
}

async function assertInvalidAdminLoginFailsCleanly(baseUrl: string) {
    const response = await readJson(`${baseUrl}/api/admin/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            email: "production-smoke-invalid@example.com",
            password: "not-a-real-password",
        }),
    });

    assert.equal(
        response.status,
        401,
        `Invalid admin login should return 401, not a dependency failure. ${failureMessage("/api/admin/auth/login", response)}`,
    );
    logStep("Admin login DB path responds cleanly for invalid credentials.");
}

async function assertAdminRouteRequiresAuth(baseUrl: string) {
    const response = await readJson(`${baseUrl}/api/admin/calendar/options`);
    assert.equal(response.status, 401, failureMessage("/api/admin/calendar/options", response));
    logStep("Admin calendar options remain protected.");
}

async function assertReminderEndpointRequiresAuth(baseUrl: string) {
    const response = await readJson(`${baseUrl}/api/jobs/send-reminders`);
    assert.equal(response.status, 401, failureMessage("/api/jobs/send-reminders", response));
    logStep("Reminder job endpoint rejects unauthenticated calls before DB work.");
}

async function assertReminderEndpointAuthenticatedDryRun(baseUrl: string) {
    const cronSecret = process.env.PRODUCTION_SMOKE_CRON_SECRET;

    if (!cronSecret) {
        logStep("Authenticated reminder dry-run skipped; PRODUCTION_SMOKE_CRON_SECRET is not set.");
        return;
    }

    const response = await readJson(`${baseUrl}/api/jobs/send-reminders?dryRun=1`, {
        headers: {
            authorization: `Bearer ${cronSecret}`,
        },
    });
    assert.equal(response.status, 200, failureMessage("/api/jobs/send-reminders?dryRun=1", response));
    assertRecord(response.body, "/api/jobs/send-reminders?dryRun=1 body");
    assert.equal(response.body.ok, true, "Authenticated reminder dry-run must report ok.");
    assert.equal(response.body.dryRun, true, "Authenticated reminder dry-run must not run the live reminder job.");
    assertRecord(response.body.schedule, "/api/jobs/send-reminders?dryRun=1 schedule");
    assert.equal(
        typeof response.body.schedule.intervalMinutes,
        "number",
        "Authenticated reminder dry-run must report the configured cadence.",
    );
    logStep("Reminder job endpoint accepts the production cron secret in dry-run mode.");
}

async function readJson(url: string, init?: RequestInit): Promise<JsonResult> {
    const response = await fetch(url, init);
    const bodyText = await response.text();
    let body: unknown = {};

    if (bodyText) {
        try {
            body = JSON.parse(bodyText);
        } catch {
            body = { raw: bodyText.slice(0, 500) };
        }
    }

    return {
        status: response.status,
        body,
        bodyText,
    };
}

function normalizeBaseUrl(value: string) {
    return value.replace(/\/+$/, "");
}

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
    assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
}

function assertArrayLength(value: unknown, expectedLength: number, label: string): unknown[] {
    assert.ok(Array.isArray(value), `Catalog ${label} must be an array.`);
    assert.equal(value.length, expectedLength, `Catalog ${label} count mismatch.`);
    return value;
}

function failureMessage(route: string, response: JsonResult) {
    const body = response.bodyText ? ` Body: ${response.bodyText.slice(0, 500)}` : "";
    return `${route} returned HTTP ${response.status}.${body}`;
}

function logStep(message: string) {
    console.log(`[production-smoke] ${message}`);
}

main()
    .then(() => {
        process.exit(0);
    })
    .catch((error) => {
        console.error("[production-smoke] FAILED");
        console.error(error);
        process.exit(1);
    });
