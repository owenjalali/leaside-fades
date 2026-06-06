import { and, asc, eq, gte, inArray, isNull, sql } from "drizzle-orm";

import { createDatabaseClient } from "../db/client.ts";
import {
    barberLocations,
    barberServices,
    barbers,
    bookings,
    locations,
    services,
    shifts,
    userInviteTokens,
    userSessions,
    users,
} from "../db/schema.ts";
import type {
    TeamOnboardingRepository,
    TeamBarberRecord,
    TeamListBarberRecord,
    TeamShiftRecord,
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

    async findExistingBarberSlugs(baseSlug: string): Promise<string[]> {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const rows = await db
            .select({ slug: barbers.slug })
            .from(barbers)
            .where(sql`${barbers.slug} = ${baseSlug} OR ${barbers.slug} LIKE ${`${baseSlug}-%`}`);

        return rows.map((row) => row.slug);
    }

    async findActiveServiceIds(): Promise<string[]> {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const rows = await db
            .select({ id: services.id })
            .from(services)
            .where(eq(services.active, true))
            .orderBy(asc(services.sortOrder), asc(services.name));

        return rows.map((row) => row.id);
    }

    async countFutureConfirmedBookings(barberId: string, now: Date): Promise<number> {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const [row] = await db
            .select({ count: sql<number>`count(*)::int` })
            .from(bookings)
            .where(
                and(
                    eq(bookings.barberId, barberId),
                    eq(bookings.status, "confirmed"),
                    gte(bookings.startTime, now),
                ),
            );

        return row?.count ?? 0;
    }

    async listTeamBarbers(now: Date): Promise<TeamListBarberRecord[]> {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const barberRows = await db
            .select({
                id: barbers.id,
                slug: barbers.slug,
                displayName: barbers.displayName,
                email: barbers.email,
                phoneE164: barbers.phoneE164,
                profileImageUrl: barbers.profileImageUrl,
                profileImagePathname: barbers.profileImagePathname,
                active: barbers.active,
                sortOrder: barbers.sortOrder,
            })
            .from(barbers)
            .where(eq(barbers.active, true))
            .orderBy(asc(barbers.sortOrder), asc(barbers.displayName));
        const barberIds = barberRows.map((barber) => barber.id);

        if (barberIds.length === 0) {
            return [];
        }

        const [locationRows, userRows, shiftRows, bookingCountRows] = await Promise.all([
            db
                .select({
                    barberId: barberLocations.barberId,
                    locationId: barberLocations.locationId,
                })
                .from(barberLocations)
                .where(inArray(barberLocations.barberId, barberIds)),
            db
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
                .where(and(inArray(users.barberId, barberIds), eq(users.role, "barber"))),
            db
                .select({
                    id: shifts.id,
                    barberId: shifts.barberId,
                    locationId: shifts.locationId,
                    dayOfWeek: shifts.dayOfWeek,
                    startTime: shifts.startTime,
                    endTime: shifts.endTime,
                    effectiveFrom: shifts.effectiveFrom,
                    effectiveTo: shifts.effectiveTo,
                    active: shifts.active,
                })
                .from(shifts)
                .where(and(inArray(shifts.barberId, barberIds), eq(shifts.active, true)))
                .orderBy(asc(shifts.dayOfWeek), asc(shifts.startTime)),
            db
                .select({
                    barberId: bookings.barberId,
                    count: sql<number>`count(*)::int`,
                })
                .from(bookings)
                .where(
                    and(
                        inArray(bookings.barberId, barberIds),
                        eq(bookings.status, "confirmed"),
                        gte(bookings.startTime, now),
                    ),
                )
                .groupBy(bookings.barberId),
        ]);
        const countsByBarberId = new Map(bookingCountRows.map((row) => [row.barberId, row.count]));

        return barberRows.map((barber) => ({
            id: barber.id,
            slug: barber.slug,
            displayName: barber.displayName,
            email: barber.email,
            phoneE164: barber.phoneE164,
            profileImageUrl: barber.profileImageUrl,
            profileImagePathname: barber.profileImagePathname,
            active: barber.active,
            locationIds: locationRows
                .filter((location) => location.barberId === barber.id)
                .map((location) => location.locationId),
            user: userRows.find((user) => user.barberId === barber.id) ?? null,
            weeklyShifts: shiftRows
                .filter((shift) => shift.barberId === barber.id)
                .map(toTeamShiftRecord),
            futureConfirmedBookingCount: countsByBarberId.get(barber.id) ?? 0,
        }));
    }

    async createBarberWithInvite(input: {
        barber: {
            slug: string;
            displayName: string;
            email: string;
            phoneE164: string | null;
            profileImageUrl: string;
            profileImagePathname: string;
            locationIds: string[];
        };
        weeklyShifts: Array<{
            locationId: string;
            dayOfWeek: number;
            startTime: string;
            endTime: string;
            effectiveFrom: string | null;
            effectiveTo: string | null;
        }>;
        serviceIds: string[];
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
                    profileImageUrl: input.barber.profileImageUrl,
                    profileImagePathname: input.barber.profileImagePathname,
                    active: true,
                })
                .returning({
                    id: barbers.id,
                    slug: barbers.slug,
                    displayName: barbers.displayName,
                    email: barbers.email,
                    phoneE164: barbers.phoneE164,
                    profileImageUrl: barbers.profileImageUrl,
                    profileImagePathname: barbers.profileImagePathname,
                    active: barbers.active,
                });

            await tx.insert(barberLocations).values(
                input.barber.locationIds.map((locationId) => ({
                    barberId: createdBarber.id,
                    locationId,
                })),
            );

            await tx.insert(barberServices).values(
                input.serviceIds.map((serviceId) => ({
                    barberId: createdBarber.id,
                    serviceId,
                    active: true,
                })),
            );

            await tx.insert(shifts).values(
                input.weeklyShifts.map((shift) => ({
                    barberId: createdBarber.id,
                    locationId: shift.locationId,
                    dayOfWeek: shift.dayOfWeek,
                    startTime: shift.startTime,
                    endTime: shift.endTime,
                    effectiveFrom: shift.effectiveFrom,
                    effectiveTo: shift.effectiveTo,
                    active: true,
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

function toTeamShiftRecord(
    shift: Omit<TeamShiftRecord, "startTime" | "endTime" | "effectiveFrom" | "effectiveTo"> & {
        startTime: string;
        endTime: string;
        effectiveFrom: string | Date | null;
        effectiveTo: string | Date | null;
    },
): TeamShiftRecord {
    return {
        ...shift,
        startTime: shift.startTime.slice(0, 5),
        endTime: shift.endTime.slice(0, 5),
        effectiveFrom: normalizeDate(shift.effectiveFrom),
        effectiveTo: normalizeDate(shift.effectiveTo),
    };
}

function normalizeDate(value: string | Date | null) {
    if (!value) {
        return null;
    }

    if (value instanceof Date) {
        return value.toISOString().slice(0, 10);
    }

    return value.slice(0, 10);
}
