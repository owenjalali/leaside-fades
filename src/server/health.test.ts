import { describe, expect, test, vi } from "vitest";

import { checkApplicationHealth, healthHttpStatus } from "./health.ts";

describe("application health", () => {
    test("reports healthy when the database answers", async () => {
        const pool = {
            query: vi.fn(async () => ({ rows: [{ ok: 1 }] })),
            end: vi.fn(async () => undefined),
        };

        const result = await checkApplicationHealth({
            env: { DATABASE_URL: "postgres://example" },
            createClient: () => ({ pool }),
            now: () => new Date("2026-05-20T15:00:00.000Z"),
        });

        expect(result).toEqual({
            ok: true,
            timestamp: "2026-05-20T15:00:00.000Z",
            checks: {
                database: {
                    ok: true,
                    status: "ok",
                },
            },
        });
        expect(pool.query).toHaveBeenCalledWith("select 1");
        expect(pool.end).toHaveBeenCalledTimes(1);
        expect(healthHttpStatus(result)).toBe(200);
    });

    test("reports unhealthy without leaking connection details when the database quota is exhausted", async () => {
        const pool = {
            query: vi.fn(async () => {
                throw new Error("Your account or project has exceeded the compute time quota. Upgrade your plan.");
            }),
            end: vi.fn(async () => undefined),
        };

        const result = await checkApplicationHealth({
            env: { DATABASE_URL: "postgres://user:secret@example" },
            createClient: () => ({ pool }),
            now: () => new Date("2026-05-20T15:00:00.000Z"),
        });

        expect(result.ok).toBe(false);
        expect(result.checks.database).toEqual({
            ok: false,
            status: "unavailable",
            message: "Database is unavailable.",
        });
        expect(JSON.stringify(result)).not.toContain("secret");
        expect(pool.end).toHaveBeenCalledTimes(1);
        expect(healthHttpStatus(result)).toBe(503);
    });

    test("reports unhealthy when DATABASE_URL is missing", async () => {
        const result = await checkApplicationHealth({
            env: {},
            createClient: () => {
                throw new Error("should not connect");
            },
            now: () => new Date("2026-05-20T15:00:00.000Z"),
        });

        expect(result).toEqual({
            ok: false,
            timestamp: "2026-05-20T15:00:00.000Z",
            checks: {
                database: {
                    ok: false,
                    status: "missing_configuration",
                    message: "DATABASE_URL is not configured.",
                },
            },
        });
        expect(healthHttpStatus(result)).toBe(503);
    });
});
