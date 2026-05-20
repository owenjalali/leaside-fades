import { describe, expect, test } from "vitest";

import {
    buildStressChecks,
    readConfig,
    runStressChecks,
    summarizeStressResults,
    type ProductionReadStressConfig,
    type StressCheck,
} from "./production-read-stress.ts";

const catalog = {
    locations: [{ id: "loc_1" }, { id: "loc_2" }],
    serviceCategories: [
        {
            id: "cat_1",
            services: Array.from({ length: 15 }, (_, index) => ({ id: index === 0 ? "svc_1" : `men_${index}` })),
        },
        {
            id: "cat_2",
            services: Array.from({ length: 14 }, (_, index) => ({ id: `women_${index}` })),
        },
        {
            id: "cat_3",
            services: Array.from({ length: 8 }, (_, index) => ({ id: `boys_${index}` })),
        },
    ],
    barbers: Array.from({ length: 5 }, (_, index) => ({ id: `barber_${index}` })),
};

describe("production read stress QA", () => {
    test("clamps production stress config to bounded defaults", () => {
        const config = readConfig({
            PRODUCTION_STRESS_BASE_URL: "https://example.com///",
            PRODUCTION_STRESS_REQUESTS: "9999",
            PRODUCTION_STRESS_CONCURRENCY: "0",
            PRODUCTION_STRESS_TIMEOUT_MS: "10",
            PRODUCTION_STRESS_MAX_P95_MS: "not-a-number",
            PRODUCTION_STRESS_AVAILABILITY_DATE: "2026-05-21",
            PRODUCTION_STRESS_ADMIN_EMAIL: " owner@example.com ",
            PRODUCTION_STRESS_ADMIN_PASSWORD: " secret ",
        });

        expect(config).toMatchObject({
            baseUrl: "https://example.com",
            requests: 500,
            concurrency: 1,
            timeoutMs: 1_000,
            maxP95Ms: 8_000,
            availabilityDate: "2026-05-21",
            adminEmail: "owner@example.com",
            adminPassword: "secret",
        });
    });

    test("summarizes latency and status counts by check label", () => {
        const summary = summarizeStressResults([
            { label: "GET /api/health", ok: true, status: 200, durationMs: 20 },
            { label: "GET /api/health", ok: true, status: 200, durationMs: 40 },
            { label: "GET /api/booking/catalog", ok: false, status: 500, durationMs: 80 },
        ]);

        expect(summary).toEqual({
            total: 3,
            failed: 1,
            p50Ms: 40,
            p95Ms: 80,
            maxMs: 80,
            byLabel: {
                "GET /api/health": {
                    total: 2,
                    failed: 0,
                    p95Ms: 40,
                    maxMs: 40,
                    statusCounts: { 200: 2 },
                },
                "GET /api/booking/catalog": {
                    total: 1,
                    failed: 1,
                    p95Ms: 80,
                    maxMs: 80,
                    statusCounts: { 500: 1 },
                },
            },
        });
    });

    test("records failed request statuses from stress checks", async () => {
        const failingError = new Error("HTTP 500");
        (failingError as Error & { status?: number }).status = 500;
        const checks: StressCheck[] = [
            {
                label: "healthy",
                weight: 1,
                execute: async () => ({ status: 200 }),
            },
            {
                label: "broken",
                weight: 1,
                execute: async () => {
                    throw failingError;
                },
            },
        ];

        const results = await runStressChecks(checks, { requests: 2, concurrency: 2 });
        const summary = summarizeStressResults(results);

        expect(summary.total).toBe(2);
        expect(summary.failed).toBe(1);
        expect(summary.byLabel.healthy.statusCounts).toEqual({ 200: 1 });
        expect(summary.byLabel.broken.statusCounts).toEqual({ 500: 1 });
    });

    test("builds availability reads from the live catalog shape without mutating bookings", async () => {
        const seenUrls: string[] = [];
        const config: ProductionReadStressConfig = {
            baseUrl: "https://example.com",
            requests: 4,
            concurrency: 1,
            timeoutMs: 1_000,
            maxP95Ms: 8_000,
            availabilityDate: "2026-05-21",
        };
        const fetcher: typeof fetch = async (input) => {
            const url = input.toString();
            seenUrls.push(url);

            return new Response(
                JSON.stringify({
                    date: "2026-05-21",
                    locationId: "loc_1",
                    timeZone: "America/Toronto",
                    totalDurationMinutes: 30,
                    barberSlots: [],
                }),
                { status: 200, headers: { "content-type": "application/json" } },
            );
        };

        const checks = await buildStressChecks(config, catalog, fetcher);
        const availabilityCheck = checks.find((check) => check.label === "GET /api/booking/availability");

        await availabilityCheck?.execute();

        expect(seenUrls).toHaveLength(1);
        const url = new URL(seenUrls[0]);
        expect(url.pathname).toBe("/api/booking/availability");
        expect(url.searchParams.get("locationId")).toBe("loc_1");
        expect(url.searchParams.get("serviceIds")).toBe("svc_1");
        expect(url.searchParams.get("date")).toBe("2026-05-21");
    });
});
