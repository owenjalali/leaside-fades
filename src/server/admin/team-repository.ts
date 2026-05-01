import { and, eq, inArray, isNull, sql } from "drizzle-orm";

import { createDatabaseClient } from "../db/client.ts";
import {
    barberLocations,
    barbers,
    locations,
    userInviteTokens,
    userSessions,
    users,
} from "../db/schema.ts";
import type {
    TeamOnboardingRepository,
    TeamBarberRecord,
    TeamUserRecord,
    UserInviteTokenRecord,
} from "./team-service.ts";

type DatabaseExecutor = ReturnType<typeof createDatabaseClient>["db"] | Record<string, unknown>;

let databaseClient: ReturnType<typeof createDatabaseClient> | null = null;

export function getTeamDatabase() {
    if (!databaseClient) {
        databaseClient = createDatabaseClient();
    }

    return databaseClient.db;
}

export function createDrizzleTeamOnboardingRepository(
    database: DatabaseExecutor = getTeamDatabase(),
): TeamOnboardingRepository {
    return new DrizzleTeamOnboardingRepository(database);
}

class DrizzleTeamOnboardingRepository implements TeamOnboardingRepository {
    private readonly database: DatabaseExecutor;

    constructor(database: DatabaseExecutor) {
        this.database = database;
    }

    async findActiveLocationIds(locationIds: string[]): Promise<string[]> {
        if (locationIds.length === 0) {
            return [];
        }

        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const rows = await db
            .select({ id: locations.id })
            .from(locations)
            .where(and(eq(locations.active, true), inArray(locations.id, locationIds)));

        return rows.map((row) => row.id);
    }

    async createBarberWithInvite(input: {
        barber: {
            slug: string;
            displayName: string;
            email: string;
            phoneE164: string | null;
            locationIds: string[];
        };
        user: {
            email: string;
            displayName: string;
        };
        invite: {
            tokenHash: string;
            expiresAt: Date;
            createdByUserId: string;
        };
    }): Promise<{
        barber: TeamBarberRecord;
        user: TeamUserRecord;
        inviteToken: UserInviteTokenRecord;
    }> {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];

        return db.transaction(async (tx) => {
            const [createdBarber] = await tx
                .insert(barbers)
                .values({
                    slug: input.barber.slug,
                    displayName: input.barber.displayName,
                    email: input.barber.email,
                    phoneE164: input.barber.phoneE164,
                    active: true,
                })
                .returning({
                    id: barbers.id,
                    slug: barbers.slug,
                    displayName: barbers.displayName,
                    email: barbers.email,
                    phoneE164: barbers.phoneE164,
                    active: barbers.active,
                });

            await tx.insert(barberLocations).values(
                input.barber.locationIds.map((locationId) => ({
                    barberId: createdBarber.id,
                    locationId,
                })),
            );

            const [createdUser] = await tx
                .insert(users)
                .values({
                    email: input.user.email,
                    displayName: input.user.displayName,
                    role: "barber",
                    barberId: createdBarber.id,
                    active: false,
                    passwordHash: null,
                })
                .returning({
                    id: users.id,
                    email: users.email,
                    displayName: users.displayName,
                    role: users.role,
                    barberId: users.barberId,
                    active: users.active,
                    passwordHash: users.passwordHash,
                });

            const [createdInviteToken] = await tx
                .insert(userInviteTokens)
                .values({
                    userId: createdUser.id,
                    tokenHash: input.invite.tokenHash,
                    expiresAt: input.invite.expiresAt,
                    createdByUserId: input.invite.createdByUserId,
                })
                .returning({
                    id: userInviteTokens.id,
                    userId: userInviteTokens.userId,
                    tokenHash: userInviteTokens.tokenHash,
                    expiresAt: userInviteTokens.expiresAt,
                    usedAt: userInviteTokens.usedAt,
                    createdByUserId: userInviteTokens.createdByUserId,
                });

            return {
                barber: {
                    ...createdBarber,
                    locationIds: input.barber.locationIds,
                },
                user: createdUser,
                inviteToken: createdInviteToken,
            };
        });
    }

    async findInviteByTokenHash(tokenHash: string) {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const [row] = await db
            .select({
                inviteTokenId: userInviteTokens.id,
                inviteUserId: userInviteTokens.userId,
                tokenHash: userInviteTokens.tokenHash,
                expiresAt: userInviteTokens.expiresAt,
                usedAt: userInviteTokens.usedAt,
                createdByUserId: userInviteTokens.createdByUserId,
                userId: users.id,
                email: users.email,
                displayName: users.displayName,
                role: users.role,
                barberId: users.barberId,
                active: users.active,
                passwordHash: users.passwordHash,
            })
            .from(userInviteTokens)
            .innerJoin(users, eq(userInviteTokens.userId, users.id))
            .where(eq(userInviteTokens.tokenHash, tokenHash))
            .limit(1);

        if (!row) {
            return null;
        }

        return {
            inviteToken: {
                id: row.inviteTokenId,
                userId: row.inviteUserId,
                tokenHash: row.tokenHash,
                expiresAt: row.expiresAt,
                usedAt: row.usedAt,
                createdByUserId: row.createdByUserId,
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

    async acceptInvite(input: {
        inviteTokenId: string;
        userId: string;
        passwordHash: string;
        acceptedAt: Date;
    }): Promise<void> {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];

        await db.transaction(async (tx) => {
            await tx
                .update(userInviteTokens)
                .set({ usedAt: input.acceptedAt })
                .where(
                    sql`${userInviteTokens.id} = ${input.inviteTokenId} and ${userInviteTokens.userId} = ${input.userId} and ${userInviteTokens.usedAt} is null`,
                );

            await tx
                .update(users)
                .set({
                    active: true,
                    passwordHash: input.passwordHash,
                    updatedAt: sql`now()`,
                })
                .where(eq(users.id, input.userId));
        });
    }

    async deactivateBarberAndLinkedUsers(input: {
        barberId: string;
        deactivatedAt: Date;
    }): Promise<{ barberId: string; deactivatedUserIds: string[] }> {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];

        return db.transaction(async (tx) => {
            await tx
                .update(barbers)
                .set({
                    active: false,
                    updatedAt: sql`now()`,
                })
                .where(eq(barbers.id, input.barberId));

            const deactivatedUsers = await tx
                .update(users)
                .set({
                    active: false,
                    updatedAt: sql`now()`,
                })
                .where(eq(users.barberId, input.barberId))
                .returning({ id: users.id });

            const deactivatedUserIds = deactivatedUsers.map((user) => user.id);

            if (deactivatedUserIds.length > 0) {
                await tx
                    .update(userSessions)
                    .set({
                    revokedAt: input.deactivatedAt,
                    updatedAt: sql`now()`,
                })
                    .where(and(inArray(userSessions.userId, deactivatedUserIds), isNull(userSessions.revokedAt)));
            }

            return {
                barberId: input.barberId,
                deactivatedUserIds,
            };
        });
    }
}
