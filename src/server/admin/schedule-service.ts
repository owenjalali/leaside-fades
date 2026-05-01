import type { SafeAdminUser } from "../auth/index.ts";
import { localDateTimeToUtc } from "../availability/time.ts";

export type AdminBlockedTimeScope = "barber" | "location" | "business";
export type AdminShiftOverrideType = "add" | "remove" | "not_working";

export interface AdminScheduleLocationOption {
    id: string;
    name: string;
    sortOrder: number;
}

export interface AdminScheduleBarberOption {
    id: string;
    displayName: string;
    sortOrder: number;
    locationIds: string[];
}

export interface AdminShiftRecord {
    id: string;
    barberId: string;
    locationId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    effectiveFrom: string | null;
    effectiveTo: string | null;
    active: boolean;
}

export interface AdminShiftOverrideRecord {
    id: string;
    barberId: string;
    locationId: string | null;
    overrideDate: string;
    overrideType: AdminShiftOverrideType;
    startTime: string | null;
    endTime: string | null;
    reason: string | null;
}

export interface AdminBlockedTimeRecord {
    id: string;
    scope: AdminBlockedTimeScope;
    barberId: string | null;
    locationId: string | null;
    startTime: Date;
    endTime: Date;
    reason: string | null;
    createdByUserId: string | null;
}

export interface AdminScheduleData {
    locations: AdminScheduleLocationOption[];
    barbers: AdminScheduleBarberOption[];
    shifts: AdminShiftRecord[];
    shiftOverrides: AdminShiftOverrideRecord[];
    blockedTimes: AdminBlockedTimeRecord[];
}

export interface AdminScheduleRepository {
    listSchedule(scope: { barberId?: string; from?: string; to?: string }): Promise<AdminScheduleData>;
    findActiveBarber(barberId: string): Promise<AdminScheduleBarberOption | null>;
    findActiveLocation(locationId: string): Promise<AdminScheduleLocationOption | null>;
    findShiftById(shiftId: string): Promise<AdminShiftRecord | null>;
    findShiftOverrideById(overrideId: string): Promise<AdminShiftOverrideRecord | null>;
    findBlockedTimeById(blockedTimeId: string): Promise<AdminBlockedTimeRecord | null>;
    hasOverlappingShift(
        candidate: Omit<AdminShiftRecord, "id" | "active"> & { excludeShiftId?: string },
    ): Promise<boolean>;
    hasConfirmedBookingOverlapForBlockedTime(candidate: {
        scope: AdminBlockedTimeScope;
        barberId: string | null;
        locationId: string | null;
        startTime: Date;
        endTime: Date;
        excludeBlockedTimeId?: string;
    }): Promise<boolean>;
    createShift(input: Omit<AdminShiftRecord, "id">): Promise<AdminShiftRecord>;
    updateShift(shiftId: string, input: Omit<AdminShiftRecord, "id">): Promise<AdminShiftRecord | null>;
    deactivateShift(shiftId: string): Promise<AdminShiftRecord | null>;
    createShiftOverride(input: Omit<AdminShiftOverrideRecord, "id">): Promise<AdminShiftOverrideRecord>;
    updateShiftOverride(
        overrideId: string,
        input: Omit<AdminShiftOverrideRecord, "id">,
    ): Promise<AdminShiftOverrideRecord | null>;
    deleteShiftOverride(overrideId: string): Promise<boolean>;
    createBlockedTime(input: Omit<AdminBlockedTimeRecord, "id">): Promise<AdminBlockedTimeRecord>;
    updateBlockedTime(
        blockedTimeId: string,
        input: Omit<AdminBlockedTimeRecord, "id">,
    ): Promise<AdminBlockedTimeRecord | null>;
    deleteBlockedTime(blockedTimeId: string): Promise<boolean>;
}

export class AdminScheduleRequestError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = "AdminScheduleRequestError";
        this.status = status;
    }
}

const DEFAULT_TIME_ZONE = "America/Toronto";
const VALID_OVERRIDE_TYPES = new Set<AdminShiftOverrideType>(["add", "remove", "not_working"]);
const VALID_BLOCKED_SCOPES = new Set<AdminBlockedTimeScope>(["barber", "location", "business"]);

export async function listAdminSchedule(
    user: SafeAdminUser,
    repository: AdminScheduleRepository,
    query: { from?: unknown; to?: unknown } = {},
) {
    return repository.listSchedule({
        ...actorScheduleScope(user),
        from: optionalLocalDate(query.from, "A valid start date is required."),
        to: optionalLocalDate(query.to, "A valid end date is required."),
    });
}

export async function createAdminShift(
    user: SafeAdminUser,
    payload: Record<string, unknown>,
    repository: AdminScheduleRepository,
    _options: { now?: Date } = {},
) {
    assertOwnerOrAdmin(user);
    const shift = await normalizeShiftPayload(payload, repository);
    await assertNoShiftOverlap(shift, repository);
    return repository.createShift({ ...shift, active: true });
}

export async function updateAdminShift(
    user: SafeAdminUser,
    shiftId: string,
    payload: Record<string, unknown>,
    repository: AdminScheduleRepository,
    _options: { now?: Date } = {},
) {
    assertOwnerOrAdmin(user);
    const existing = await repository.findShiftById(asNonEmptyString(shiftId, "Shift is required."));

    if (!existing) {
        throw new AdminScheduleRequestError(404, "Shift was not found.");
    }

    const shift = await normalizeShiftPayload(payload, repository);
    await assertNoShiftOverlap({ ...shift, excludeShiftId: existing.id }, repository);
    const updated = await repository.updateShift(existing.id, {
        ...shift,
        active: payload.active === false ? false : existing.active,
    });

    if (!updated) {
        throw new AdminScheduleRequestError(404, "Shift was not found.");
    }

    return updated;
}

export async function deactivateAdminShift(
    user: SafeAdminUser,
    shiftId: string,
    repository: AdminScheduleRepository,
    _options: { now?: Date } = {},
) {
    assertOwnerOrAdmin(user);
    const deactivated = await repository.deactivateShift(asNonEmptyString(shiftId, "Shift is required."));

    if (!deactivated) {
        throw new AdminScheduleRequestError(404, "Shift was not found.");
    }

    return deactivated;
}

export async function createAdminShiftOverride(
    user: SafeAdminUser,
    payload: Record<string, unknown>,
    repository: AdminScheduleRepository,
    _options: { now?: Date } = {},
) {
    assertOwnerOrAdmin(user);
    const override = await normalizeShiftOverridePayload(payload, repository);
    return repository.createShiftOverride(override);
}

export async function updateAdminShiftOverride(
    user: SafeAdminUser,
    overrideId: string,
    payload: Record<string, unknown>,
    repository: AdminScheduleRepository,
    _options: { now?: Date } = {},
) {
    assertOwnerOrAdmin(user);
    const existing = await repository.findShiftOverrideById(asNonEmptyString(overrideId, "Override is required."));

    if (!existing) {
        throw new AdminScheduleRequestError(404, "Shift override was not found.");
    }

    const updated = await repository.updateShiftOverride(
        existing.id,
        await normalizeShiftOverridePayload(payload, repository),
    );

    if (!updated) {
        throw new AdminScheduleRequestError(404, "Shift override was not found.");
    }

    return updated;
}

export async function deleteAdminShiftOverride(
    user: SafeAdminUser,
    overrideId: string,
    repository: AdminScheduleRepository,
    _options: { now?: Date } = {},
) {
    assertOwnerOrAdmin(user);
    const deleted = await repository.deleteShiftOverride(asNonEmptyString(overrideId, "Override is required."));

    if (!deleted) {
        throw new AdminScheduleRequestError(404, "Shift override was not found.");
    }

    return { deleted: true };
}

export async function createAdminBlockedTime(
    user: SafeAdminUser,
    payload: Record<string, unknown>,
    repository: AdminScheduleRepository,
    _options: { now?: Date } = {},
) {
    const blockedTime = await normalizeBlockedTimePayload(user, payload, repository);
    await assertNoConfirmedBookingOverlap(blockedTime, repository);
    return repository.createBlockedTime(blockedTime);
}

export async function updateAdminBlockedTime(
    user: SafeAdminUser,
    blockedTimeId: string,
    payload: Record<string, unknown>,
    repository: AdminScheduleRepository,
    _options: { now?: Date } = {},
) {
    const existing = await repository.findBlockedTimeById(asNonEmptyString(blockedTimeId, "Blocked time is required."));

    if (!existing) {
        throw new AdminScheduleRequestError(404, "Blocked time was not found.");
    }

    assertCanMutateExistingBlockedTime(user, existing);
    const blockedTime = await normalizeBlockedTimePayload(user, payload, repository, existing);
    await assertNoConfirmedBookingOverlap({ ...blockedTime, excludeBlockedTimeId: existing.id }, repository);
    const updated = await repository.updateBlockedTime(existing.id, blockedTime);

    if (!updated) {
        throw new AdminScheduleRequestError(404, "Blocked time was not found.");
    }

    return updated;
}

export async function deleteAdminBlockedTime(
    user: SafeAdminUser,
    blockedTimeId: string,
    repository: AdminScheduleRepository,
    _options: { now?: Date } = {},
) {
    const existing = await repository.findBlockedTimeById(asNonEmptyString(blockedTimeId, "Blocked time is required."));

    if (!existing) {
        throw new AdminScheduleRequestError(404, "Blocked time was not found.");
    }

    assertCanMutateExistingBlockedTime(user, existing);
    const deleted = await repository.deleteBlockedTime(existing.id);

    if (!deleted) {
        throw new AdminScheduleRequestError(404, "Blocked time was not found.");
    }

    return { deleted: true };
}

async function normalizeShiftPayload(
    payload: Record<string, unknown>,
    repository: AdminScheduleRepository,
): Promise<Omit<AdminShiftRecord, "id" | "active">> {
    const barberId = asNonEmptyString(payload.barberId, "Barber is required.");
    const locationId = asNonEmptyString(payload.locationId, "Location is required.");
    const dayOfWeek = asDayOfWeek(payload.dayOfWeek);
    const startTime = asQuarterHourTime(payload.startTime, "A valid shift start time is required.");
    const endTime = asQuarterHourTime(payload.endTime, "A valid shift end time is required.");
    const effectiveFrom = optionalLocalDate(payload.effectiveFrom, "A valid effective start date is required.");
    const effectiveTo = optionalLocalDate(payload.effectiveTo, "A valid effective end date is required.");

    if (startTime >= endTime) {
        throw new AdminScheduleRequestError(400, "Shift start time must be before end time.");
    }

    if (effectiveFrom && effectiveTo && effectiveFrom > effectiveTo) {
        throw new AdminScheduleRequestError(400, "Shift effective start date must be on or before end date.");
    }

    await assertActiveBarberLocation(barberId, locationId, repository);

    return {
        barberId,
        locationId,
        dayOfWeek,
        startTime,
        endTime,
        effectiveFrom: effectiveFrom ?? null,
        effectiveTo: effectiveTo ?? null,
    };
}

async function normalizeShiftOverridePayload(
    payload: Record<string, unknown>,
    repository: AdminScheduleRepository,
): Promise<Omit<AdminShiftOverrideRecord, "id">> {
    const barberId = asNonEmptyString(payload.barberId, "Barber is required.");
    const overrideType = asOverrideType(payload.overrideType);
    const overrideDate = asLocalDate(payload.overrideDate, "A valid override date is required.");
    const locationId = optionalString(payload.locationId) ?? null;
    let startTime: string | null = null;
    let endTime: string | null = null;

    await assertActiveBarber(barberId, repository);

    if (locationId) {
        await assertActiveBarberLocation(barberId, locationId, repository);
    }

    if (overrideType === "not_working") {
        if (payload.startTime || payload.endTime) {
            throw new AdminScheduleRequestError(400, "Not-working overrides must not include start or end times.");
        }
    } else {
        startTime = asQuarterHourTime(payload.startTime, "A valid override start time is required.");
        endTime = asQuarterHourTime(payload.endTime, "A valid override end time is required.");

        if (startTime >= endTime) {
            throw new AdminScheduleRequestError(400, "Override start time must be before end time.");
        }

        if (overrideType === "add" && !locationId) {
            throw new AdminScheduleRequestError(400, "Added shifts require a location.");
        }
    }

    return {
        barberId,
        locationId,
        overrideDate,
        overrideType,
        startTime,
        endTime,
        reason: optionalString(payload.reason) ?? null,
    };
}

async function normalizeBlockedTimePayload(
    user: SafeAdminUser,
    payload: Record<string, unknown>,
    repository: AdminScheduleRepository,
    existing?: AdminBlockedTimeRecord,
): Promise<Omit<AdminBlockedTimeRecord, "id">> {
    const scope = asBlockedTimeScope(payload.scope);
    const { barberId, locationId } = await resolveBlockedTimeScope(user, payload, scope, repository);
    const window = parseBlockedTimeWindow(payload);

    if (window.startTime >= window.endTime) {
        throw new AdminScheduleRequestError(400, "Blocked time start must be before end.");
    }

    return {
        scope,
        barberId,
        locationId,
        startTime: window.startTime,
        endTime: window.endTime,
        reason: optionalString(payload.reason) ?? null,
        createdByUserId: existing?.createdByUserId ?? user.id,
    };
}

async function resolveBlockedTimeScope(
    user: SafeAdminUser,
    payload: Record<string, unknown>,
    scope: AdminBlockedTimeScope,
    repository: AdminScheduleRepository,
) {
    if (scope !== "barber") {
        assertOwnerOrAdmin(user);
    }

    if (scope === "business") {
        if (optionalString(payload.barberId) || optionalString(payload.locationId)) {
            throw new AdminScheduleRequestError(400, "Business closures cannot include barber or location.");
        }

        return { barberId: null, locationId: null };
    }

    if (scope === "location") {
        const locationId = asNonEmptyString(payload.locationId, "Location closures require a location.");
        await assertActiveLocation(locationId, repository);

        if (optionalString(payload.barberId)) {
            throw new AdminScheduleRequestError(400, "Location closures cannot include a barber.");
        }

        return { barberId: null, locationId };
    }

    const barberId = resolveWritableBarberId(user, optionalString(payload.barberId));
    const locationId = optionalString(payload.locationId) ?? null;

    if (!barberId) {
        throw new AdminScheduleRequestError(400, "Barber blocked time requires a barber.");
    }

    await assertActiveBarber(barberId, repository);

    if (locationId) {
        await assertActiveBarberLocation(barberId, locationId, repository);
    }

    return { barberId, locationId };
}

function parseBlockedTimeWindow(payload: Record<string, unknown>) {
    if (payload.startTime instanceof Date && payload.endTime instanceof Date) {
        return { startTime: payload.startTime, endTime: payload.endTime };
    }

    const startDate = asLocalDate(payload.startDate, "A valid blocked start date is required.");
    const startTime = asQuarterHourTime(payload.startTime, "A valid blocked start time is required.");
    const endDate = asLocalDate(payload.endDate, "A valid blocked end date is required.");
    const endTime = asQuarterHourTime(payload.endTime, "A valid blocked end time is required.");

    return {
        startTime: localDateTimeToUtc(startDate, startTime, DEFAULT_TIME_ZONE),
        endTime: localDateTimeToUtc(endDate, endTime, DEFAULT_TIME_ZONE),
    };
}

async function assertNoShiftOverlap(
    shift: Omit<AdminShiftRecord, "id" | "active"> & { excludeShiftId?: string },
    repository: AdminScheduleRepository,
) {
    if (await repository.hasOverlappingShift(shift)) {
        throw new AdminScheduleRequestError(409, "This barber already has an overlapping active shift.");
    }
}

async function assertNoConfirmedBookingOverlap(
    blockedTime: Omit<AdminBlockedTimeRecord, "id"> & { excludeBlockedTimeId?: string },
    repository: AdminScheduleRepository,
) {
    if (await repository.hasConfirmedBookingOverlapForBlockedTime(blockedTime)) {
        throw new AdminScheduleRequestError(409, "Blocked time overlaps an existing confirmed booking.");
    }
}

async function assertActiveBarberLocation(
    barberId: string,
    locationId: string,
    repository: AdminScheduleRepository,
) {
    const barber = await assertActiveBarber(barberId, repository);
    await assertActiveLocation(locationId, repository);

    if (!barber.locationIds.includes(locationId)) {
        throw new AdminScheduleRequestError(400, "Barber is not assigned to this location.");
    }
}

async function assertActiveBarber(barberId: string, repository: AdminScheduleRepository) {
    const barber = await repository.findActiveBarber(barberId);

    if (!barber) {
        throw new AdminScheduleRequestError(400, "Barber is not available.");
    }

    return barber;
}

async function assertActiveLocation(locationId: string, repository: AdminScheduleRepository) {
    const location = await repository.findActiveLocation(locationId);

    if (!location) {
        throw new AdminScheduleRequestError(400, "Location is not available.");
    }

    return location;
}

function assertOwnerOrAdmin(user: SafeAdminUser) {
    if (user.role !== "owner" && user.role !== "admin") {
        throw new AdminScheduleRequestError(403, "Owner or admin access is required.");
    }
}

function assertCanMutateExistingBlockedTime(user: SafeAdminUser, blockedTime: AdminBlockedTimeRecord) {
    if (user.role === "owner" || user.role === "admin") {
        return;
    }

    const barberId = resolveWritableBarberId(user, blockedTime.barberId ?? undefined);

    if (blockedTime.scope !== "barber" || blockedTime.barberId !== barberId) {
        throw new AdminScheduleRequestError(403, "Barber accounts can only manage their own blocked time.");
    }
}

function actorScheduleScope(user: SafeAdminUser) {
    if (user.role === "owner" || user.role === "admin") {
        return {};
    }

    if (!user.barberId) {
        throw new AdminScheduleRequestError(403, "Barber account is not linked to a barber profile.");
    }

    return { barberId: user.barberId };
}

function resolveWritableBarberId(user: SafeAdminUser, requestedBarberId?: string) {
    if (user.role === "owner" || user.role === "admin") {
        return requestedBarberId;
    }

    if (!user.barberId) {
        throw new AdminScheduleRequestError(403, "Barber account is not linked to a barber profile.");
    }

    if (requestedBarberId && requestedBarberId !== user.barberId) {
        throw new AdminScheduleRequestError(403, "Barber accounts can only manage their own blocked time.");
    }

    return user.barberId;
}

function asDayOfWeek(value: unknown) {
    const dayOfWeek = typeof value === "string" ? Number(value) : value;

    if (!Number.isInteger(dayOfWeek) || Number(dayOfWeek) < 0 || Number(dayOfWeek) > 6) {
        throw new AdminScheduleRequestError(400, "A valid weekday is required.");
    }

    return Number(dayOfWeek);
}

function asOverrideType(value: unknown) {
    if (typeof value !== "string" || !VALID_OVERRIDE_TYPES.has(value as AdminShiftOverrideType)) {
        throw new AdminScheduleRequestError(400, "A valid override type is required.");
    }

    return value as AdminShiftOverrideType;
}

function asBlockedTimeScope(value: unknown) {
    if (typeof value !== "string" || !VALID_BLOCKED_SCOPES.has(value as AdminBlockedTimeScope)) {
        throw new AdminScheduleRequestError(400, "A valid blocked-time scope is required.");
    }

    return value as AdminBlockedTimeScope;
}

function asQuarterHourTime(value: unknown, message: string) {
    const time = asNonEmptyString(value, message);

    if (!/^\d{2}:\d{2}(?::\d{2})?$/.test(time)) {
        throw new AdminScheduleRequestError(400, message);
    }

    const normalized = time.slice(0, 5);
    const [hour, minute] = normalized.split(":").map(Number);

    if (hour > 23 || minute > 59 || minute % 15 !== 0) {
        throw new AdminScheduleRequestError(400, "Times must use 15-minute increments.");
    }

    return normalized;
}

function asLocalDate(value: unknown, message: string) {
    const localDate = asNonEmptyString(value, message);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
        throw new AdminScheduleRequestError(400, message);
    }

    return localDate;
}

function optionalLocalDate(value: unknown, message: string) {
    if (value === null || value === undefined || value === "") {
        return undefined;
    }

    return asLocalDate(value, message);
}

function asNonEmptyString(value: unknown, message: string) {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new AdminScheduleRequestError(400, message);
    }

    return value.trim();
}

function optionalString(value: unknown) {
    if (typeof value !== "string" || value.trim().length === 0) {
        return undefined;
    }

    return value.trim();
}
