import { describe, expect, test } from "vitest";

import { createDatabaseClient, normalizeDatabaseUrl } from "./client.ts";

const NEON_URL
    = "postgresql://neondb_owner:np9_s3cr3tP4ss@ep-cool-fade-a1b2c3d4.us-east-2.aws.neon.tech/neondb?sslmode=require&channel_binding=require";

describe("normalizeDatabaseUrl", () => {
    test("rewrites sslmode=require to verify-full on a Neon URL and preserves every other byte", () => {
        const result = normalizeDatabaseUrl(NEON_URL, {});

        expect(result).toBe(
            "postgresql://neondb_owner:np9_s3cr3tP4ss@ep-cool-fade-a1b2c3d4.us-east-2.aws.neon.tech/neondb?sslmode=verify-full&channel_binding=require",
        );
        expect(result.replace("sslmode=verify-full", "sslmode=require")).toBe(NEON_URL);
    });

    test("rewrites sslmode=require when it is the only query param", () => {
        const result = normalizeDatabaseUrl("postgres://user:pass@host:5432/db?sslmode=require", {});

        expect(result).toBe("postgres://user:pass@host:5432/db?sslmode=verify-full");
    });

    test("rewrites sslmode=require when it sits between other params", () => {
        const result = normalizeDatabaseUrl(
            "postgres://user:pass@host/db?channel_binding=require&sslmode=require&application_name=leaside",
            {},
        );

        expect(result).toBe("postgres://user:pass@host/db?channel_binding=require&sslmode=verify-full&application_name=leaside");
    });

    test("leaves a URL without an sslmode param unchanged", () => {
        const url = "postgres://user:pass@host/db?channel_binding=require";

        expect(normalizeDatabaseUrl(url, {})).toBe(url);
    });

    test("leaves sslmode=verify-full unchanged", () => {
        const url = "postgres://user:pass@host/db?sslmode=verify-full";

        expect(normalizeDatabaseUrl(url, {})).toBe(url);
    });

    test("leaves sslmode=disable unchanged", () => {
        const url = "postgres://user:pass@host/db?sslmode=disable";

        expect(normalizeDatabaseUrl(url, {})).toBe(url);
    });

    test("does not touch a differently named param that ends in sslmode", () => {
        const url = "postgres://user:pass@host/db?custom_sslmode=require";

        expect(normalizeDatabaseUrl(url, {})).toBe(url);
    });

    test("leaves non-postgres connection strings unchanged", () => {
        const url = "mysql://user:pass@host/db?sslmode=require";

        expect(normalizeDatabaseUrl(url, {})).toBe(url);
    });

    test("DATABASE_SSL_MODE override replaces an existing sslmode value", () => {
        const result = normalizeDatabaseUrl(NEON_URL, { DATABASE_SSL_MODE: "require" });

        expect(result).toBe(NEON_URL);
    });

    test("DATABASE_SSL_MODE override replaces a non-require sslmode value too", () => {
        const result = normalizeDatabaseUrl(
            "postgres://user:pass@host/db?sslmode=verify-full&channel_binding=require",
            { DATABASE_SSL_MODE: "no-verify" },
        );

        expect(result).toBe("postgres://user:pass@host/db?sslmode=no-verify&channel_binding=require");
    });

    test("DATABASE_SSL_MODE override appends sslmode when absent, with existing query params", () => {
        const result = normalizeDatabaseUrl(
            "postgres://user:pass@host/db?channel_binding=require",
            { DATABASE_SSL_MODE: "verify-full" },
        );

        expect(result).toBe("postgres://user:pass@host/db?channel_binding=require&sslmode=verify-full");
    });

    test("DATABASE_SSL_MODE override appends sslmode when there is no query string at all", () => {
        const result = normalizeDatabaseUrl("postgres://user:pass@host/db", { DATABASE_SSL_MODE: "disable" });

        expect(result).toBe("postgres://user:pass@host/db?sslmode=disable");
    });

    test("empty DATABASE_SSL_MODE override is ignored", () => {
        const result = normalizeDatabaseUrl(NEON_URL, { DATABASE_SSL_MODE: "" });

        expect(result).toContain("sslmode=verify-full");
    });

    test("whitespace-only DATABASE_SSL_MODE override is ignored", () => {
        const result = normalizeDatabaseUrl(NEON_URL, { DATABASE_SSL_MODE: "   " });

        expect(result).toContain("sslmode=verify-full");
    });

    test("unrecognized DATABASE_SSL_MODE override is ignored", () => {
        const result = normalizeDatabaseUrl(NEON_URL, { DATABASE_SSL_MODE: "verifyfull" });

        expect(result).toBe(
            "postgresql://neondb_owner:np9_s3cr3tP4ss@ep-cool-fade-a1b2c3d4.us-east-2.aws.neon.tech/neondb?sslmode=verify-full&channel_binding=require",
        );
    });

    test("DATABASE_SSL_MODE override containing query separators is ignored", () => {
        const result = normalizeDatabaseUrl(NEON_URL, { DATABASE_SSL_MODE: "verify-full&options=x" });

        expect(result).toBe(
            "postgresql://neondb_owner:np9_s3cr3tP4ss@ep-cool-fade-a1b2c3d4.us-east-2.aws.neon.tech/neondb?sslmode=verify-full&channel_binding=require",
        );
    });
});

describe("createDatabaseClient", () => {
    test("throws when the connection string is missing", () => {
        expect(() => createDatabaseClient("")).toThrow("DATABASE_URL is required to connect to PostgreSQL.");
    });

    test("pipes the connection string through normalizeDatabaseUrl before creating the pool", async () => {
        const { pool } = createDatabaseClient("postgres://user:pass@host:5432/db?sslmode=require&channel_binding=require", {});
        const options = (pool as unknown as { options: { connectionString?: string } }).options;

        try {
            expect(options.connectionString).toBe("postgres://user:pass@host:5432/db?sslmode=verify-full&channel_binding=require");
        } finally {
            await pool.end();
        }
    });
});
