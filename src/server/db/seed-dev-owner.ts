import "dotenv/config";

import { sql } from "drizzle-orm";

import { hashPassword } from "../auth/password.ts";
import { createDatabaseClient } from "./client.ts";
import { users } from "./schema.ts";

interface BootstrapGuardInput {
    databaseUrl: string | undefined;
    nodeEnv: string | undefined;
}

interface DevOwnerSeedInput {
    email: string;
    password: string;
    displayName: string;
}

export function assertLocalDevOwnerBootstrapAllowed(input: BootstrapGuardInput) {
    if (input.nodeEnv === "production") {
        throw new Error("Local dev owner bootstrap must not run in production.");
    }

    if (!input.databaseUrl) {
        throw new Error("DATABASE_URL is required before bootstrapping a local dev owner.");
    }

    const parsed = new URL(input.databaseUrl);
    const localHosts = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);

    if (!localHosts.has(parsed.hostname)) {
        throw new Error("Local dev owner bootstrap may only run against local development databases.");
    }
}

export function buildDevOwnerSeedInput(env: Record<string, string | undefined>): DevOwnerSeedInput {
    const email = env.DEV_OWNER_EMAIL?.trim().toLowerCase();
    const password = env.DEV_OWNER_PASSWORD;
    const displayName = env.DEV_OWNER_NAME?.trim() || "Local Dev Owner";

    if (!email) {
        throw new Error("DEV_OWNER_EMAIL is required for local dev owner bootstrap.");
    }

    if (!password) {
        throw new Error("DEV_OWNER_PASSWORD is required for local dev owner bootstrap.");
    }

    return {
        email,
        password,
        displayName,
    };
}

export async function seedDevOwner(env: Record<string, string | undefined> = process.env) {
    assertLocalDevOwnerBootstrapAllowed({
        databaseUrl: env.DATABASE_URL,
        nodeEnv: env.NODE_ENV,
    });
    const owner = buildDevOwnerSeedInput(env);
    const passwordHash = await hashPassword(owner.password);
    const { db, pool } = createDatabaseClient(env.DATABASE_URL);

    try {
        await db
            .insert(users)
            .values({
                email: owner.email,
                displayName: owner.displayName,
                role: "owner",
                passwordHash,
                barberId: null,
                active: true,
            })
            .onConflictDoUpdate({
                target: users.email,
                set: {
                    displayName: owner.displayName,
                    role: "owner",
                    passwordHash,
                    barberId: null,
                    active: true,
                    updatedAt: sql`now()`,
                },
            });

        console.log(`Seeded local/dev-only owner login for ${owner.email}.`);
    } finally {
        await pool.end();
    }
}

if (process.argv[1]?.endsWith("seed-dev-owner.ts")) {
    seedDevOwner().catch((error) => {
        console.error(error);
        process.exit(1);
    });
}
