import { describe, expect, it } from "vitest";

import {
    assertLocalDashboardFixtureAllowed,
    buildDashboardFixturePlan,
} from "./phase12-dashboard-fixture.ts";

describe("phase12 dashboard fixture", () => {
    it("allows only local development databases", () => {
        expect(() =>
            assertLocalDashboardFixtureAllowed({
                databaseUrl: "postgres://user:pass@localhost:5432/leaside_fades",
                nodeEnv: "development",
            }),
        ).not.toThrow();

        expect(() =>
            assertLocalDashboardFixtureAllowed({
                databaseUrl: "postgres://user:pass@db.example.com:5432/leaside_fades",
                nodeEnv: "development",
            }),
        ).toThrow(/local development databases/i);

        expect(() =>
            assertLocalDashboardFixtureAllowed({
                databaseUrl: "postgres://user:pass@localhost:5432/leaside_fades",
                nodeEnv: "production",
            }),
        ).toThrow(/must not run in production/i);
    });

    it("plans realistic priced dashboard coverage without depending on production data", () => {
        const plan = buildDashboardFixturePlan(new Date("2026-05-05T16:00:00.000Z"));
        const statuses = new Set(plan.bookings.map((booking) => booking.status));
        const sources = new Set(plan.bookings.map((booking) => booking.source));
        const activePricedValue = plan.bookings
            .filter((booking) => (booking.status === "confirmed" || booking.status === "completed") && booking.serviceSlugs.length > 0)
            .reduce((sum, booking) => sum + booking.estimatedPriceCents, 0);

        expect(statuses).toEqual(new Set(["confirmed", "completed", "cancelled", "no_show"]));
        expect(sources).toEqual(new Set(["public", "manual", "walk_in", "imported"]));
        expect(activePricedValue).toBeGreaterThan(0);
        expect(plan.bookings.some((booking) => booking.serviceSlugs.length === 0)).toBe(true);
        expect(plan.bookings.some((booking) => booking.activityEventType === "reschedule_confirmation")).toBe(true);
    });
});
