import assert from "node:assert/strict";

const DEFAULT_BASE_URL = "https://www.leasidefades.com";

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

    console.log("Production smoke passed.");
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
