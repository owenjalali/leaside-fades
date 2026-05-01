import { eq, sql } from "drizzle-orm";

import { createDatabaseClient } from "../db/client.ts";
import { userSessions, users } from "../db/schema.ts";
import type { AuthRepository, AuthSessionRecord, AuthUserRecord } from "./service.ts";

type DatabaseExecutor = ReturnType<typeof createDatabaseClient>["db"] | Record<string, unknown>;

let databaseClient: ReturnType<typeof createDatabaseClient> | null = null;

export function getAuthDatabase() {
    if (!databaseClient) {
        databaseClient = createDatabaseClient();
    }

    return databaseClient.db;
}

export function createDrizzleAuthRepository(
    database: DatabaseExecutor = getAuthDatabase(),
): AuthRepository {
    return new DrizzleAuthRepository(database);
}

class DrizzleAuthRepository implements AuthRepository {
    private readonly database: DatabaseExecutor;

    constructor(database: DatabaseExecutor) {
        this.database = database;
    }

    async findActiveUserByEmail(email: string): Promise<AuthUserRecord | null> {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const [user] = await db
            .select({
                id: users.id,
                email: users.email,
                displayName: users.displayName,
                role: users.role,
                barberId: users.barberId,
                active: users.active,
                passwordHash: users.passwordHash,
            })
            .from(users)
            .where(sql`lower(${users.email}) = ${email} and ${users.active} = true`)
            .limit(1);

        return user ?? null;
    }

    async createSession(
        session: Omit<AuthSessionRecord, "id" | "revokedAt" | "lastSeenAt">,
    ): Promise<AuthSessionRecord> {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const [created] = await db
            .insert(userSessions)
            .values({
                userId: session.userId,
                tokenHash: session.tokenHash,
                expiresAt: session.expiresAt,
            })
            .returning({
                id: userSessions.id,
                userId: userSessions.userId,
                tokenHash: userSessions.tokenHash,
                expiresAt: userSessions.expiresAt,
                revokedAt: userSessions.revokedAt,
                lastSeenAt: userSessions.lastSeenAt,
            });

        return created;
    }

    async findSessionByTokenHash(tokenHash: string) {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const [row] = await db
            .select({
                sessionId: userSessions.id,
                userId: userSessions.userId,
                tokenHash: userSessions.tokenHash,
                expiresAt: userSessions.expiresAt,
                revokedAt: userSessions.revokedAt,
                lastSeenAt: userSessions.lastSeenAt,
                email: users.email,
                displayName: users.displayName,
                role: users.role,
                barberId: users.barberId,
                active: users.active,
                passwordHash: users.passwordHash,
            })
            .from(userSessions)
            .innerJoin(users, eq(userSessions.userId, users.id))
            .where(sql`${userSessions.tokenHash} = ${tokenHash} and ${users.active} = true`)
            .limit(1);

        if (!row) {
            return null;
        }

        return {
            session: {
                id: row.sessionId,
                userId: row.userId,
                tokenHash: row.tokenHash,
                expiresAt: row.expiresAt,
                revokedAt: row.revokedAt,
                lastSeenAt: row.lastSeenAt,
            },
            user: {
                id: row.userId,
                email: row.email,
                displayName: row.displayName,
                role: row.role,
                barberId: row.barberId,
                active: row.active,
                passwordHash: row.passwordHash,
            },
        };
    }

    async revokeSession(tokenHash: string, revokedAt: Date): Promise<void> {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        await db
            .update(userSessions)
            .set({
                revokedAt,
                updatedAt: sql`now()`,
            })
            .where(eq(userSessions.tokenHash, tokenHash));
    }

    async touchSession(sessionId: string, seenAt: Date): Promise<void> {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        await db
            .update(userSessions)
            .set({
                lastSeenAt: seenAt,
                updatedAt: sql`now()`,
            })
            .where(eq(userSessions.id, sessionId));
    }
}
