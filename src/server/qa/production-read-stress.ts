import assert from "node:assert/strict";

const DEFAULT_BASE_URL = "https://www.leasidefades.com";
const DEFAULT_REQUESTS = 32;
const DEFAULT_CONCURRENCY = 4;
const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_P95_MS = 8_000;
const TORONTO_TIME_ZONE = "America/Toronto";

export interface ProductionReadStressConfig {
    baseUrl: string;
    requests: number;
    concurrency: number;
    timeoutMs: number;
    maxP95Ms: number;
    availabilityDate: string;
    adminEmail?: string;
    adminPassword?: string;
}

export interface StressCheck {
    label: string;
    weight: number;
    execute: () => Promise<StressCheckOutcome | void>;
}

export interface StressCheckOutcome {
    status?: number;
}

export interface StressResult {
    label: string;
    ok: boolean;
    status?: number;
    durationMs: number;
    errorMessage?: string;
}

export interface StressSummary {
    total: number;
    failed: number;
    p50Ms: number;
    p95Ms: number;
    maxMs: number;
    byLabel: Record<string, { total: number; failed: number; p95Ms: number; maxMs: number; statusCounts: Record<number, number> }>;
}

interface JsonResult {
    status: number;
    body: unknown;
    bodyText: string;
    headers: Headers;
}

async function main() {
    const config = readConfig(process.env);
    const fetcher = createTimedFetcher(config.timeoutMs);

    logStep(
        `Running ${config.requests} non-mutating production reads against ${config.baseUrl} with concurrency ${config.concurrency}.`,
    );

    const catalog = await loadCatalog(config.baseUrl, fetcher);
    const checks = await buildStressChecks(config, catalog, fetcher);
    const results = await runStressChecks(checks, {
        requests: config.requests,
        concurrency: config.concurrency,
    });
    const summary = summarizeStressResults(results);

    logSummary(summary);
    assert.equal(summary.failed, 0, `${summary.failed} production stress request(s) failed.`);
    assert.ok(
        summary.p95Ms <= config.maxP95Ms,
        `Production stress p95 ${summary.p95Ms}ms exceeded ${config.maxP95Ms}ms.`,
    );

    console.log("Production read stress passed.");
}

export function readConfig(env: Partial<Record<string, string | undefined>>): ProductionReadStressConfig {
    return {
        baseUrl: normalizeBaseUrl(env.PRODUCTION_STRESS_BASE_URL || DEFAULT_BASE_URL),
        requests: parsePositiveInteger(env.PRODUCTION_STRESS_REQUESTS, DEFAULT_REQUESTS, 4, 500),
        concurrency: parsePositiveInteger(env.PRODUCTION_STRESS_CONCURRENCY, DEFAULT_CONCURRENCY, 1, 25),
        timeoutMs: parsePositiveInteger(env.PRODUCTION_STRESS_TIMEOUT_MS, DEFAULT_TIMEOUT_MS, 1_000, 60_000),
        maxP95Ms: parsePositiveInteger(env.PRODUCTION_STRESS_MAX_P95_MS, DEFAULT_MAX_P95_MS, 1_000, 60_000),
        availabilityDate: env.PRODUCTION_STRESS_AVAILABILITY_DATE || formatTorontoDate(addDays(new Date(), 1)),
        adminEmail: nonEmpty(env.PRODUCTION_STRESS_ADMIN_EMAIL),
        adminPassword: nonEmpty(env.PRODUCTION_STRESS_ADMIN_PASSWORD),
    };
}

export async function buildStressChecks(
    config: ProductionReadStressConfig,
    catalog: Record<string, unknown>,
    fetcher: typeof fetch,
): Promise<StressCheck[]> {
    const locationId = firstCatalogLocationId(catalog);
    const serviceId = firstCatalogServiceId(catalog);
    const checks: StressCheck[] = [
        {
            label: "GET /book",
            weight: 2,
            execute: async () => {
                const response = await fetcher(`${config.baseUrl}/book`, { redirect: "manual" });
                assertStatus(response.status, 200, `/book returned HTTP ${response.status}.`);
                const body = await response.text();
                assert.match(body, /<html/i, "/book did not return app shell HTML.");
                return { status: response.status };
            },
        },
        {
            label: "GET /api/health",
            weight: 4,
            execute: async () => {
                const response = await readJson(`${config.baseUrl}/api/health`, fetcher);
                assertStatus(response.status, 200, failureMessage("/api/health", response));
                assertRecord(response.body, "/api/health body");
                assert.equal(response.body.ok, true, "/api/health must report ok.");
                assertRecord(response.body.checks, "/api/health checks");
                assertRecord(response.body.checks.database, "/api/health database check");
                assert.equal(response.body.checks.database.ok, true, "/api/health database check must report ok.");
                return { status: response.status };
            },
        },
        {
            label: "GET /api/booking/catalog",
            weight: 4,
            execute: async () => {
                const response = await readJson(`${config.baseUrl}/api/booking/catalog`, fetcher);
                assertStatus(response.status, 200, failureMessage("/api/booking/catalog", response));
                assertCatalogShape(response.body);
                return { status: response.status };
            },
        },
        {
            label: "GET /api/booking/availability",
            weight: 4,
            execute: async () => {
                const url = new URL(`${config.baseUrl}/api/booking/availability`);
                url.searchParams.set("locationId", locationId);
                url.searchParams.set("serviceIds", serviceId);
                url.searchParams.set("date", config.availabilityDate);
                const response = await readJson(url.toString(), fetcher);
                assertStatus(response.status, 200, failureMessage("/api/booking/availability", response));
                assertAvailabilityShape(response.body, locationId, config.availabilityDate);
                return { status: response.status };
            },
        },
        {
            label: "POST /api/admin/auth/login invalid",
            weight: 1,
            execute: async () => {
                const response = await readJson(`${config.baseUrl}/api/admin/auth/login`, fetcher, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        email: "production-stress-invalid@example.com",
                        password: "not-a-real-password",
                    }),
                });
                assertStatus(response.status, 401, failureMessage("/api/admin/auth/login", response));
                return { status: response.status };
            },
        },
    ];

    if (config.adminEmail && config.adminPassword) {
        const cookie = await loginAdmin(config, fetcher);
        checks.push(
            {
                label: "GET /api/admin/dashboard authenticated",
                weight: 2,
                execute: async () => {
                    const response = await readJson(`${config.baseUrl}/api/admin/dashboard`, fetcher, {
                        headers: { cookie },
                    });
                    assertStatus(response.status, 200, failureMessage("/api/admin/dashboard", response));
                    assertRecord(response.body, "/api/admin/dashboard body");
                    assert.ok(Array.isArray(response.body.todayBookings), "Dashboard must include todayBookings.");
                    assertRecord(response.body.notificationHealth, "Dashboard notificationHealth");
                    return { status: response.status };
                },
            },
            {
                label: "GET /api/admin/calendar/options authenticated",
                weight: 2,
                execute: async () => {
                    const response = await readJson(`${config.baseUrl}/api/admin/calendar/options`, fetcher, {
                        headers: { cookie },
                    });
                    assertStatus(response.status, 200, failureMessage("/api/admin/calendar/options", response));
                    assertRecord(response.body, "/api/admin/calendar/options body");
                    assertArray(response.body.locations, "Admin locations");
                    assertArray(response.body.barbers, "Admin barbers");
                    assertArray(response.body.services, "Admin services");
                    return { status: response.status };
                },
            },
        );
        logStep("Authenticated admin read checks enabled.");
    } else {
        logStep("Authenticated admin read checks skipped; PRODUCTION_STRESS_ADMIN_EMAIL/PASSWORD are not set.");
    }

    return checks;
}

export async function runStressChecks(
    checks: StressCheck[],
    input: { requests: number; concurrency: number },
): Promise<StressResult[]> {
    const queue = expandChecks(checks, input.requests);
    const results: StressResult[] = [];
    let nextIndex = 0;

    async function worker() {
        while (nextIndex < queue.length) {
            const check = queue[nextIndex++];
            const startedAt = Date.now();

            try {
                const outcome = await check.execute();
                results.push({
                    label: check.label,
                    ok: true,
                    status: outcome?.status,
                    durationMs: Date.now() - startedAt,
                });
            } catch (error) {
                results.push({
                    label: check.label,
                    ok: false,
                    status: statusFromError(error),
                    durationMs: Date.now() - startedAt,
                    errorMessage: error instanceof Error ? error.message : String(error),
                });
            }
        }
    }

    await Promise.all(Array.from({ length: Math.min(input.concurrency, queue.length) }, () => worker()));
    return results;
}

export function summarizeStressResults(results: StressResult[]): StressSummary {
    const durations = results.map((result) => result.durationMs).sort((a, b) => a - b);
    const byLabel: StressSummary["byLabel"] = {};

    for (const result of results) {
        byLabel[result.label] ??= { total: 0, failed: 0, p95Ms: 0, maxMs: 0, statusCounts: {} };
        byLabel[result.label].total += 1;
        byLabel[result.label].failed += result.ok ? 0 : 1;
        byLabel[result.label].maxMs = Math.max(byLabel[result.label].maxMs, result.durationMs);

        if (typeof result.status === "number") {
            byLabel[result.label].statusCounts[result.status] =
                (byLabel[result.label].statusCounts[result.status] ?? 0) + 1;
        }
    }

    for (const label of Object.keys(byLabel)) {
        const labelDurations = results
            .filter((result) => result.label === label)
            .map((result) => result.durationMs)
            .sort((a, b) => a - b);
        byLabel[label].p95Ms = percentile(labelDurations, 95);
    }

    return {
        total: results.length,
        failed: results.filter((result) => !result.ok).length,
        p50Ms: percentile(durations, 50),
        p95Ms: percentile(durations, 95),
        maxMs: durations.length > 0 ? durations[durations.length - 1] : 0,
        byLabel,
    };
}

async function loadCatalog(baseUrl: string, fetcher: typeof fetch) {
    const response = await readJson(`${baseUrl}/api/booking/catalog`, fetcher);
    assert.equal(response.status, 200, failureMessage("/api/booking/catalog", response));
    assertCatalogShape(response.body);
    return response.body;
}

async function loginAdmin(config: ProductionReadStressConfig, fetcher: typeof fetch) {
    const response = await fetcher(`${config.baseUrl}/api/admin/auth/login`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            email: config.adminEmail,
            password: config.adminPassword,
        }),
    });
    const bodyText = await response.text();

    assert.equal(
        response.status,
        200,
        `/api/admin/auth/login authenticated stress setup returned HTTP ${response.status}. Body: ${bodyText.slice(0, 500)}`,
    );

    const headers = response.headers as Headers & { getSetCookie?: () => string[] };
    const setCookie = headers.getSetCookie?.() ?? [];
    const sessionCookie =
        setCookie.find((cookieValue) => cookieValue.startsWith("lf_admin_session=")) ??
        response.headers.get("set-cookie");

    assert.ok(sessionCookie, "Authenticated admin stress setup did not receive a session cookie.");
    return sessionCookie.split(";")[0];
}

async function readJson(url: string, fetcher: typeof fetch, init?: RequestInit): Promise<JsonResult> {
    const response = await fetcher(url, init);
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
        headers: response.headers,
    };
}

function createTimedFetcher(timeoutMs: number): typeof fetch {
    return ((url: RequestInfo | URL, init: RequestInit = {}) =>
        fetch(url, {
            ...init,
            signal: AbortSignal.timeout(timeoutMs),
        })) as typeof fetch;
}

function expandChecks(checks: StressCheck[], requests: number) {
    const weighted = checks.flatMap((check) => Array.from({ length: check.weight }, () => check));
    return Array.from({ length: requests }, (_, index) => weighted[index % weighted.length]);
}

function assertCatalogShape(value: unknown): asserts value is Record<string, unknown> {
    assertRecord(value, "Catalog body");
    assert.equal(assertArray(value.locations, "Catalog locations").length, 2, "Catalog location count mismatch.");
    const categories = assertArray(value.serviceCategories, "Catalog service categories");
    assert.equal(categories.length, 3, "Catalog service category count mismatch.");
    const serviceCount = categories.reduce<number>((count, category) => {
        assertRecord(category, "Catalog service category");
        return count + assertArray(category.services, "Catalog category services").length;
    }, 0);
    assert.equal(serviceCount, 38, "Catalog service count mismatch.");
    assert.ok(
        categories.some((category) => {
            assertRecord(category, "Catalog service category");
            return assertArray(category.services, "Catalog category services").some((service) => {
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
    assert.equal(assertArray(value.barbers, "Catalog barbers").length, 5, "Catalog barber count mismatch.");
}

function assertAvailabilityShape(value: unknown, locationId: string, date: string) {
    assertRecord(value, "Availability body");
    assert.equal(value.locationId, locationId, "Availability location mismatch.");
    assert.equal(value.date, date, "Availability date mismatch.");
    assert.equal(typeof value.totalDurationMinutes, "number", "Availability must include duration.");
    assertArray(value.barberSlots, "Availability barberSlots");
}

function firstCatalogLocationId(catalog: Record<string, unknown>) {
    const [location] = assertArray(catalog.locations, "Catalog locations");
    assertRecord(location, "Catalog location");
    assertString(location.id, "Catalog location id");
    return location.id;
}

function firstCatalogServiceId(catalog: Record<string, unknown>) {
    const [category] = assertArray(catalog.serviceCategories, "Catalog service categories");
    assertRecord(category, "Catalog service category");
    const [service] = assertArray(category.services, "Catalog category services");
    assertRecord(service, "Catalog service");
    assertString(service.id, "Catalog service id");
    return service.id;
}

function assertArray(value: unknown, label: string): unknown[] {
    assert.ok(Array.isArray(value), `${label} must be an array.`);
    return value;
}

function assertRecord(value: unknown, label: string): asserts value is Record<string, unknown> {
    assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object.`);
}

function assertString(value: unknown, label: string): asserts value is string {
    assert.equal(typeof value, "string", `${label} must be a string.`);
}

function assertStatus(actual: number, expected: number, message: string) {
    if (actual === expected) {
        return;
    }

    const error = new Error(message);
    (error as Error & { status?: number }).status = actual;
    throw error;
}

function statusFromError(error: unknown) {
    const maybeStatus = (error as { status?: unknown })?.status;
    return typeof maybeStatus === "number" ? maybeStatus : undefined;
}

function percentile(values: number[], p: number) {
    if (values.length === 0) {
        return 0;
    }

    const index = Math.min(values.length - 1, Math.ceil((p / 100) * values.length) - 1);
    return values[index];
}

function parsePositiveInteger(value: string | undefined, fallback: number, min: number, max: number) {
    const parsed = Number(value);

    if (!Number.isInteger(parsed)) {
        return fallback;
    }

    return Math.min(max, Math.max(min, parsed));
}

function normalizeBaseUrl(value: string) {
    return value.replace(/\/+$/, "");
}

function nonEmpty(value: string | undefined) {
    const trimmed = value?.trim();
    return trimmed ? trimmed : undefined;
}

function addDays(date: Date, days: number) {
    return new Date(date.getTime() + days * 86_400_000);
}

function formatTorontoDate(date: Date) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: TORONTO_TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(date);
    const year = parts.find((part) => part.type === "year")?.value;
    const month = parts.find((part) => part.type === "month")?.value;
    const day = parts.find((part) => part.type === "day")?.value;
    assert.ok(year && month && day, "Could not format Toronto local date.");
    return `${year}-${month}-${day}`;
}

function failureMessage(route: string, response: JsonResult) {
    const body = response.bodyText ? ` Body: ${response.bodyText.slice(0, 500)}` : "";
    return `${route} returned HTTP ${response.status}.${body}`;
}

function logSummary(summary: StressSummary) {
    console.log(
        `[production-read-stress] total=${summary.total} failed=${summary.failed} p50=${summary.p50Ms}ms p95=${summary.p95Ms}ms max=${summary.maxMs}ms`,
    );

    for (const [label, bucket] of Object.entries(summary.byLabel)) {
        console.log(
            `[production-read-stress] ${label} total=${bucket.total} failed=${bucket.failed} p95=${bucket.p95Ms}ms max=${bucket.maxMs}ms statuses=${JSON.stringify(bucket.statusCounts)}`,
        );
    }
}

function logStep(message: string) {
    console.log(`[production-read-stress] ${message}`);
}

if (process.argv[1]?.endsWith("production-read-stress.ts")) {
    main().catch((error) => {
        console.error("[production-read-stress] FAILED");
        console.error(error);
        process.exit(1);
    });
}
