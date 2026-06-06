import { and, asc, eq, gt, inArray, lt, or, sql, type SQL } from "drizzle-orm";

import { getLocalDate, localDateTimeToUtc } from "../availability/time.ts";
import { createDatabaseClient } from "../db/client.ts";
import {
    barberLocations,
    barbers,
    blockedTimes,
    bookings,
    locations,
    shiftOverrides,
    shifts,
} from "../db/schema.ts";
import type {
    AdminBlockedTimeRecord,
    AdminScheduleData,
    AdminScheduleRepository,
    AdminShiftOverrideRecord,
    AdminShiftRecord,
} from "./schedule-service.ts";

type DatabaseExecutor = ReturnType<typeof createDatabaseClient>["db"] | Record<string, unknown>;

interface ScheduleRows {
    locations: AdminScheduleData["locations"];
    barbers: Array<Omit<AdminScheduleData["barbers"][number], "locationIds">>;
    barberLocations: Array<{ barberId: string; locationId: string }>;
    shifts: Array<
        Omit<AdminShiftRecord, "startTime" | "endTime" | "effectiveFrom" | "effectiveTo"> & {
            startTime: string;
            endTime: string;
            effectiveFrom: string | Date | null;
            effectiveTo: string | Date | null;
        }
    >;
    shiftOverrides: Array<
        Omit<AdminShiftOverrideRecord, "overrideDate" | "startTime" | "endTime"> & {
            overrideDate: string | Date;
            startTime: string | null;
            endTime: string | null;
        }
    >;
    blockedTimes: AdminBlockedTimeRecord[];
}

let databaseClient: ReturnType<typeof createDatabaseClient> | null = null;

export function getAdminScheduleDatabase() {
    if (!databaseClient) {
        databaseClient = createDatabaseClient();
    }

    return databaseClient.db;
}

export function createDrizzleAdminScheduleRepository(
    database: DatabaseExecutor = getAdminScheduleDatabase(),
): AdminScheduleRepository {
    return new DrizzleAdminScheduleRepository(database);
}

class DrizzleAdminScheduleRepository implements AdminScheduleRepository {
    private readonly database: DatabaseExecutor;

    constructor(database: DatabaseExecutor) {
        this.database = database;
    }

    async listSchedule(scope: { barberId?: string; from?: string; to?: string }) {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const barberRows = await db
            .select({
                id: barbers.id,
                slug: barbers.slug,
                displayName: barbers.displayName,
                profileImageUrl: barbers.profileImageUrl,
                profileImagePathname: barbers.profileImagePathname,
                sortOrder: barbers.sortOrder,
            })
            .from(barbers)
            .where(compactAnd(eq(barbers.active, true), scope.barberId ? eq(barbers.id, scope.barberId) : undefined))
            .orderBy(asc(barbers.sortOrder), asc(barbers.displayName));
        const scopedBarberIds = barberRows.map((barber) => barber.id);

        const barberLocationRows = scopedBarberIds.length
            ? await db
                  .select({
                      barberId: barberLocations.barberId,
                      locationId: barberLocations.locationId,
                  })
                  .from(barberLocations)
                  .where(inArray(barberLocations.barberId, scopedBarberIds))
            : [];
        const scopedLocationIds = Array.from(new Set(barberLocationRows.map((row) => row.locationId)));

        const [locationRows, shiftRows, overrideRows, blockedTimeRows] = await Promise.all([
            scopedLocationIds.length
                ? db
                      .select({
                          id: locations.id,
                          name: locations.name,
                          sortOrder: locations.sortOrder,
                      })
                      .from(locations)
                      .where(compactAnd(eq(locations.active, true), inArray(locations.id, scopedLocationIds)))
                      .orderBy(asc(locations.sortOrder), asc(locations.name))
                : Promise.resolve([]),
            scopedBarberIds.length
                ? db
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
                      .where(compactAnd(eq(shifts.active, true), inArray(shifts.barberId, scopedBarberIds)))
                      .orderBy(asc(shifts.dayOfWeek), asc(shifts.startTime))
                : Promise.resolve([]),
            scopedBarberIds.length
                ? db
                      .select({
                          id: shiftOverrides.id,
                          barberId: shiftOverrides.barberId,
                          locationId: shiftOverrides.locationId,
                          overrideDate: shiftOverrides.overrideDate,
                          overrideType: shiftOverrides.overrideType,
                          startTime: shiftOverrides.startTime,
                          endTime: shiftOverrides.endTime,
                          reason: shiftOverrides.reason,
                      })
                      .from(shiftOverrides)
                      .where(
                          compactAnd(
                              inArray(shiftOverrides.barberId, scopedBarberIds),
                              scope.from ? sql`${shiftOverrides.overrideDate} >= ${scope.from}` : undefined,
                              scope.to ? sql`${shiftOverrides.overrideDate} <= ${scope.to}` : undefined,
                          ),
                      )
                      .orderBy(asc(shiftOverrides.overrideDate), asc(shiftOverrides.startTime))
                : Promise.resolve([]),
            db
                .select({
                    id: blockedTimes.id,
                    scope: blockedTimes.scope,
                    barberId: blockedTimes.barberId,
                    locationId: blockedTimes.locationId,
                    startTime: blockedTimes.startTime,
                    endTime: blockedTimes.endTime,
                    reason: blockedTimes.reason,
                    createdByUserId: blockedTimes.createdByUserId,
                })
                .from(blockedTimes)
                .where(this.buildBlockedTimeListCondition(scope, scopedLocationIds))
                .orderBy(asc(blockedTimes.startTime)),
        ]);

        return formatScheduleRows({
            locations: locationRows,
            barbers: barberRows,
            barberLocations: barberLocationRows,
            shifts: shiftRows,
            shiftOverrides: overrideRows,
            blockedTimes: blockedTimeRows,
        });
    }

    async findActiveBarber(barberId: string) {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const [barber] = await db
            .select({
                id: barbers.id,
                slug: barbers.slug,
                displayName: barbers.displayName,
                profileImageUrl: barbers.profileImageUrl,
                profileImagePathname: barbers.profileImagePathname,
                sortOrder: barbers.sortOrder,
            })
            .from(barbers)
            .where(compactAnd(eq(barbers.id, barberId), eq(barbers.active, true)))
            .limit(1);

        if (!barber) {
            return null;
        }

        const assignments = await db
            .select({ locationId: barberLocations.locationId })
            .from(barberLocations)
            .where(eq(barberLocations.barberId, barberId));

        return {
            ...barber,
            locationIds: assignments.map((assignment) => assignment.locationId),
        };
    }

    async findActiveLocation(locationId: string) {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const [location] = await db
            .select({
                id: locations.id,
                name: locations.name,
                sortOrder: locations.sortOrder,
            })
            .from(locations)
            .where(compactAnd(eq(locations.id, locationId), eq(locations.active, true)))
            .limit(1);

        return location ?? null;
    }

    async findShiftById(shiftId: string) {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const [shift] = await db
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
            .where(eq(shifts.id, shiftId))
            .limit(1);

        return shift ? formatScheduleRows({
            locations: [],
            barbers: [],
            barberLocations: [],
            shifts: [shift],
            shiftOverrides: [],
            blockedTimes: [],
        }).shifts[0] : null;
    }

    async findShiftOverrideById(overrideId: string) {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const [override] = await db
            .select({
                id: shiftOverrides.id,
                barberId: shiftOverrides.barberId,
                locationId: shiftOverrides.locationId,
                overrideDate: shiftOverrides.overrideDate,
                overrideType: shiftOverrides.overrideType,
                startTime: shiftOverrides.startTime,
                endTime: shiftOverrides.endTime,
                reason: shiftOverrides.reason,
            })
            .from(shiftOverrides)
            .where(eq(shiftOverrides.id, overrideId))
            .limit(1);

        return override ? formatScheduleRows({
            locations: [],
            barbers: [],
            barberLocations: [],
            shifts: [],
            shiftOverrides: [override],
            blockedTimes: [],
        }).shiftOverrides[0] : null;
    }

    async findBlockedTimeById(blockedTimeId: string) {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const [blockedTime] = await db
            .select({
                id: blockedTimes.id,
                scope: blockedTimes.scope,
                barberId: blockedTimes.barberId,
                locationId: blockedTimes.locationId,
                startTime: blockedTimes.startTime,
                endTime: blockedTimes.endTime,
                reason: blockedTimes.reason,
                createdByUserId: blockedTimes.createdByUserId,
            })
            .from(blockedTimes)
            .where(eq(blockedTimes.id, blockedTimeId))
            .limit(1);

        return blockedTime ?? null;
    }

    async hasOverlappingShift(candidate: Omit<AdminShiftRecord, "id" | "active"> & { excludeShiftId?: string }) {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const rows = await db
            .select({ id: shifts.id })
            .from(shifts)
            .where(
                compactAnd(
                    eq(shifts.active, true),
                    eq(shifts.barberId, candidate.barberId),
                    eq(shifts.dayOfWeek, candidate.dayOfWeek),
                    lt(shifts.startTime, candidate.endTime),
                    sql`${shifts.endTime} > ${candidate.startTime}`,
                    candidate.excludeShiftId ? sql`${shifts.id} <> ${candidate.excludeShiftId}` : undefined,
                    candidate.effectiveFrom
                        ? sql`(${shifts.effectiveTo} is null OR ${shifts.effectiveTo} >= ${candidate.effectiveFrom})`
                        : undefined,
                    candidate.effectiveTo
                        ? sql`(${shifts.effectiveFrom} is null OR ${shifts.effectiveFrom} <= ${candidate.effectiveTo})`
                        : undefined,
                ),
            )
            .limit(1);

        return rows.length > 0;
    }

    async hasConfirmedBookingOverlapForBlockedTime(candidate: {
        scope: AdminBlockedTimeRecord["scope"];
        barberId: string | null;
        locationId: string | null;
        startTime: Date;
        endTime: Date;
    }) {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const rows = await db
            .select({ id: bookings.id })
            .from(bookings)
            .where(
                compactAnd(
                    eq(bookings.status, "confirmed"),
                    lt(bookings.startTime, candidate.endTime),
                    gt(bookings.endTime, candidate.startTime),
                    candidate.scope === "location" && candidate.locationId
                        ? eq(bookings.locationId, candidate.locationId)
                        : undefined,
                    candidate.scope === "barber" && candidate.barberId
                        ? eq(bookings.barberId, candidate.barberId)
                        : undefined,
                    candidate.scope === "barber" && candidate.locationId
                        ? eq(bookings.locationId, candidate.locationId)
                        : undefined,
                ),
            )
            .limit(1);

        return rows.length > 0;
    }

    async createShift(input: Omit<AdminShiftRecord, "id">) {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const [created] = await db.insert(shifts).values(toShiftInsert(input)).returning(returningShiftFields());
        return formatScheduleRows({
            locations: [],
            barbers: [],
            barberLocations: [],
            shifts: [created],
            shiftOverrides: [],
            blockedTimes: [],
        }).shifts[0];
    }

    async updateShift(shiftId: string, input: Omit<AdminShiftRecord, "id">) {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const [updated] = await db
            .update(shifts)
            .set({ ...toShiftInsert(input), updatedAt: new Date() })
            .where(eq(shifts.id, shiftId))
            .returning(returningShiftFields());

        return updated ? formatScheduleRows({
            locations: [],
            barbers: [],
            barberLocations: [],
            shifts: [updated],
            shiftOverrides: [],
            blockedTimes: [],
        }).shifts[0] : null;
    }

    async deactivateShift(shiftId: string) {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const [updated] = await db
            .update(shifts)
            .set({ active: false, updatedAt: new Date() })
            .where(eq(shifts.id, shiftId))
            .returning(returningShiftFields());

        return updated ? formatScheduleRows({
            locations: [],
            barbers: [],
            barberLocations: [],
            shifts: [updated],
            shiftOverrides: [],
            blockedTimes: [],
        }).shifts[0] : null;
    }

    async createShiftOverride(input: Omit<AdminShiftOverrideRecord, "id">) {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const [created] = await db
            .insert(shiftOverrides)
            .values(input)
            .returning(returningShiftOverrideFields());

        return formatScheduleRows({
            locations: [],
            barbers: [],
            barberLocations: [],
            shifts: [],
            shiftOverrides: [created],
            blockedTimes: [],
        }).shiftOverrides[0];
    }

    async updateShiftOverride(overrideId: string, input: Omit<AdminShiftOverrideRecord, "id">) {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const [updated] = await db
            .update(shiftOverrides)
            .set({ ...input, updatedAt: new Date() })
            .where(eq(shiftOverrides.id, overrideId))
            .returning(returningShiftOverrideFields());

        return updated ? formatScheduleRows({
            locations: [],
            barbers: [],
            barberLocations: [],
            shifts: [],
            shiftOverrides: [updated],
            blockedTimes: [],
        }).shiftOverrides[0] : null;
    }

    async deleteShiftOverride(overrideId: string) {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const deleted = await db
            .delete(shiftOverrides)
            .where(eq(shiftOverrides.id, overrideId))
            .returning({ id: shiftOverrides.id });

        return deleted.length > 0;
    }

    async createBlockedTime(input: Omit<AdminBlockedTimeRecord, "id">) {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const [created] = await db
            .insert(blockedTimes)
            .values(input)
            .returning(returningBlockedTimeFields());

        return created;
    }

    async updateBlockedTime(blockedTimeId: string, input: Omit<AdminBlockedTimeRecord, "id">) {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const [updated] = await db
            .update(blockedTimes)
            .set({ ...input, updatedAt: new Date() })
            .where(eq(blockedTimes.id, blockedTimeId))
            .returning(returningBlockedTimeFields());

        return updated ?? null;
    }

    async deleteBlockedTime(blockedTimeId: string) {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const deleted = await db
            .delete(blockedTimes)
            .where(eq(blockedTimes.id, blockedTimeId))
            .returning({ id: blockedTimes.id });

        return deleted.length > 0;
    }

    private buildBlockedTimeListCondition(scope: { barberId?: string; from?: string; to?: string }, locationIds: string[]) {
        const from = scope.from ? localDateTimeToUtc(scope.from, "00:00", "America/Toronto") : undefined;
        const to = scope.to ? localDateTimeToUtc(nextLocalDate(scope.to), "00:00", "America/Toronto") : undefined;

        return compactAnd(
            to ? lt(blockedTimes.startTime, to) : undefined,
            from ? gt(blockedTimes.endTime, from) : undefined,
            scope.barberId
                ? or(
                      eq(blockedTimes.scope, "business"),
                      eq(blockedTimes.barberId, scope.barberId),
                      locationIds.length ? inArray(blockedTimes.locationId, locationIds) : undefined,
                  )
                : undefined,
        );
    }
}

export function formatScheduleRows(rows: ScheduleRows): AdminScheduleData {
    return {
        locations: rows.locations.sort(compareSortName),
        barbers: rows.barbers
            .map((barber) => ({
                ...barber,
                locationIds: rows.barberLocations
                    .filter((assignment) => assignment.barberId === barber.id)
                    .map((assignment) => assignment.locationId),
            }))
            .sort(compareSortDisplayName),
        shifts: rows.shifts.map((shift) => ({
            ...shift,
            startTime: normalizeTime(shift.startTime),
            endTime: normalizeTime(shift.endTime),
            effectiveFrom: normalizeDate(shift.effectiveFrom),
            effectiveTo: normalizeDate(shift.effectiveTo),
        })),
        shiftOverrides: rows.shiftOverrides.map((override) => ({
            ...override,
            overrideDate: normalizeDate(override.overrideDate) ?? "",
            startTime: override.startTime ? normalizeTime(override.startTime) : null,
            endTime: override.endTime ? normalizeTime(override.endTime) : null,
        })),
        blockedTimes: rows.blockedTimes,
    };
}

export function scheduleEffectiveRangesOverlap(
    startA: string | null,
    endA: string | null,
    startB: string | null,
    endB: string | null,
) {
    return (!endA || !startB || endA >= startB) && (!endB || !startA || endB >= startA);
}

function returningShiftFields() {
    return {
        id: shifts.id,
        barberId: shifts.barberId,
        locationId: shifts.locationId,
        dayOfWeek: shifts.dayOfWeek,
        startTime: shifts.startTime,
        endTime: shifts.endTime,
        effectiveFrom: shifts.effectiveFrom,
        effectiveTo: shifts.effectiveTo,
        active: shifts.active,
    };
}

function returningShiftOverrideFields() {
    return {
        id: shiftOverrides.id,
        barberId: shiftOverrides.barberId,
        locationId: shiftOverrides.locationId,
        overrideDate: shiftOverrides.overrideDate,
        overrideType: shiftOverrides.overrideType,
        startTime: shiftOverrides.startTime,
        endTime: shiftOverrides.endTime,
        reason: shiftOverrides.reason,
    };
}

function returningBlockedTimeFields() {
    return {
        id: blockedTimes.id,
        scope: blockedTimes.scope,
        barberId: blockedTimes.barberId,
        locationId: blockedTimes.locationId,
        startTime: blockedTimes.startTime,
        endTime: blockedTimes.endTime,
        reason: blockedTimes.reason,
        createdByUserId: blockedTimes.createdByUserId,
    };
}

function toShiftInsert(input: Omit<AdminShiftRecord, "id">) {
    return {
        barberId: input.barberId,
        locationId: input.locationId,
        dayOfWeek: input.dayOfWeek,
        startTime: input.startTime,
        endTime: input.endTime,
        effectiveFrom: input.effectiveFrom,
        effectiveTo: input.effectiveTo,
        active: input.active,
    };
}

function compactAnd(...conditions: Array<SQL | undefined>) {
    return and(...conditions.filter(Boolean) as SQL[]);
}

function normalizeTime(value: string) {
    return value.slice(0, 5);
}

function normalizeDate(value: string | Date | null) {
    if (!value) {
        return null;
    }

    if (value instanceof Date) {
        return getLocalDate(value, "UTC");
    }

    return value.slice(0, 10);
}

function nextLocalDate(localDate: string) {
    const [year, month, day] = localDate.split("-").map(Number);
    return getLocalDate(new Date(Date.UTC(year, month - 1, day + 1)), "UTC");
}

function compareSortName(
    a: { sortOrder: number; name: string },
    b: { sortOrder: number; name: string },
) {
    return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
}

function compareSortDisplayName(
    a: { sortOrder: number; displayName: string },
    b: { sortOrder: number; displayName: string },
) {
    return a.sortOrder - b.sortOrder || a.displayName.localeCompare(b.displayName);
}
