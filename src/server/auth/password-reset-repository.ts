import { eq, sql } from "drizzle-orm";

import { createDatabaseClient } from "../db/client.ts";
import { passwordResetTokens, userSessions, users } from "../db/schema.ts";
import type {
    PasswordResetRepository,
    PasswordResetTokenRecord,
    PasswordResetUserRecord,
} from "./password-reset-service.ts";

type DatabaseExecutor = ReturnType<typeof createDatabaseClient>["db"] | Record<string, unknown>;

let databaseClient: ReturnType<typeof createDatabaseClient> | null = null;

export function getPasswordResetDatabase() {
    if (!databaseClient) {
        databaseClient = createDatabaseClient();
    }

    return databaseClient.db;
}

export function createDrizzlePasswordResetRepository(
    database: DatabaseExecutor = getPasswordResetDatabase(),
): PasswordResetRepository {
    return new DrizzlePasswordResetRepository(database);
}

class DrizzlePasswordResetRepository implements PasswordResetRepository {
    private readonly database: DatabaseExecutor;

    constructor(database: DatabaseExecutor) {
        this.database = database;
    }

    async findActiveUserByEmail(email: string): Promise<PasswordResetUserRecord | null> {
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

    async createPasswordResetToken(
        token: Omit<PasswordResetTokenRecord, "id" | "usedAt">,
    ): Promise<PasswordResetTokenRecord> {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const [created] = await db
            .insert(passwordResetTokens)
            .values({
                userId: token.userId,
                tokenHash: token.tokenHash,
                expiresAt: token.expiresAt,
            })
            .returning({
                id: passwordResetTokens.id,
                userId: passwordResetTokens.userId,
                tokenHash: passwordResetTokens.tokenHash,
                expiresAt: passwordResetTokens.expiresAt,
                usedAt: passwordResetTokens.usedAt,
            });

        return created;
    }

    async findPasswordResetTokenByHash(tokenHash: string) {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const [row] = await db
            .select({
                tokenId: passwordResetTokens.id,
                userId: passwordResetTokens.userId,
                tokenHash: passwordResetTokens.tokenHash,
                expiresAt: passwordResetTokens.expiresAt,
                usedAt: passwordResetTokens.usedAt,
                email: users.email,
                displayName: users.displayName,
                role: users.role,
                barberId: users.barberId,
                active: users.active,
                passwordHash: users.passwordHash,
            })
            .from(passwordResetTokens)
            .innerJoin(users, eq(passwordResetTokens.userId, users.id))
            .where(sql`${passwordResetTokens.tokenHash} = ${tokenHash} and ${users.active} = true`)
            .limit(1);

        if (!row) {
            return null;
        }

        return {
            token: {
                id: row.tokenId,
                userId: row.userId,
                tokenHash: row.tokenHash,
                expiresAt: row.expiresAt,
                usedAt: row.usedAt,
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

    async completePasswordReset(input: {
        tokenId: string;
        userId: string;
        passwordHash: string;
        usedAt: Date;
    }): Promise<void> {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];

        await db.transaction(async (tx) => {
            await tx
                .update(passwordResetTokens)
                .set({ usedAt: input.usedAt })
                .where(
                    sql`${passwordResetTokens.id} = ${input.tokenId} and ${passwordResetTokens.userId} = ${input.userId} and ${passwordResetTokens.usedAt} is null`,
                );

            await tx
                .update(users)
                .set({
                    passwordHash: input.passwordHash,
                    updatedAt: sql`now()`,
                })
                .where(eq(users.id, input.userId));

            await tx
                .update(userSessions)
                .set({
                    revokedAt: input.usedAt,
                    updatedAt: sql`now()`,
                })
                .where(
                    sql`${userSessions.userId} = ${input.userId} and ${userSessions.revokedAt} is null`,
                );
        });
    }
}
