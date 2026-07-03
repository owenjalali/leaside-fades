import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema.ts";

const POSTGRES_SCHEME_PATTERN = /^postgres(?:ql)?:\/\//;
// Anchor on ? or & so a differently named param that merely ends in
// "sslmode" (for example custom_sslmode) can never match.
const SSLMODE_PARAM_PATTERN = /([?&]sslmode=)([^&#]*)/;
// The sslmode values pg-connection-string accepts; anything else would be
// spliced into the query string verbatim and silently misbehave.
const VALID_SSL_MODES = new Set(["disable", "prefer", "require", "verify-ca", "verify-full", "no-verify"]);

/**
 * Rewrites sslmode=require to sslmode=verify-full so node-postgres stops
 * emitting its once-per-process "SECURITY WARNING" about require semantics
 * on every serverless cold start. Neon's TLS certificates chain to a public
 * CA, so verify-full is safe and strictly stronger than require.
 *
 * Set DATABASE_SSL_MODE to force a specific sslmode instead (escape hatch).
 * Unrecognized override values are ignored rather than spliced into the URL.
 *
 * Only the sslmode key/value substring is touched; every other byte of the
 * connection string (credentials, channel_binding=require, etc.) is
 * preserved verbatim.
 */
export function normalizeDatabaseUrl(
    connectionString: string,
    env: Record<string, string | undefined> = process.env,
): string {
    if (!POSTGRES_SCHEME_PATTERN.test(connectionString)) {
        return connectionString;
    }

    const overrideCandidate = env.DATABASE_SSL_MODE?.trim();
    const override = overrideCandidate && VALID_SSL_MODES.has(overrideCandidate) ? overrideCandidate : undefined;
    const match = connectionString.match(SSLMODE_PARAM_PATTERN);

    if (override) {
        if (match) {
            return connectionString.replace(SSLMODE_PARAM_PATTERN, (_full, prefix: string) => `${prefix}${override}`);
        }

        const separator = connectionString.includes("?") ? "&" : "?";
        return `${connectionString}${separator}sslmode=${override}`;
    }

    if (match && match[2] === "require") {
        return connectionString.replace(SSLMODE_PARAM_PATTERN, "$1verify-full");
    }

    return connectionString;
}

export function createDatabaseClient(
    connectionString = process.env.DATABASE_URL,
    env: Record<string, string | undefined> = process.env,
) {
    if (!connectionString) {
        throw new Error("DATABASE_URL is required to connect to PostgreSQL.");
    }

    const pool = new Pool({ connectionString: normalizeDatabaseUrl(connectionString, env) });
    const db = drizzle(pool, { schema });

    return { db, pool };
}
