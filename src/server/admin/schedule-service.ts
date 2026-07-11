import type { SafeAdminUser } from "../auth/index.ts";
import { localDateTimeToUtc, localDateToDayOfWeek, minutesToTime, timeToMinutes } from "../availability/time.ts";

export type AdminBlockedTimeScope = "barber" | "location" | "business";
export type AdminShiftOverrideType = "add" | "remove" | "not_working";

export interface AdminScheduleLocationOption {
    id: string;
    name: string;
    sortOrder: number;
}

export interface AdminScheduleBarberOption {
    id: string;
    slug?: string;
    displayName: string;
    profileImageUrl?: string | null;
    profileImagePathname?: string | null;
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

export interface AdminDayShiftPayload {
    barberId?: unknown;
    locationId?: unknown;
    date?: unknown;
    windows?: unknown;
}

export interface AdminDayShiftReplacement {
    barberId: string;
    locationId: string;
    date: string;
    windows: Array<{ startTime: string; endTime: string }>;
    shiftOverrides: AdminShiftOverrideRecord[];
}

export type AdminWeeklyScheduleBatchOperation =
    | { type: "create"; payload: Record<string, unknown> }
    | { type: "update"; shiftId: string; payload: Record<string, unknown> }
    | { type: "deactivate"; shiftId: string };

export interface AdminWeeklyScheduleBatchResult {
    applied: number;
    shifts: AdminShiftRecord[];
    deactivatedShiftIds: string[];
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
    withTransaction?<T>(callback: (transaction: AdminScheduleRepository) => Promise<T>): Promise<T>;
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

export const WEEKLY_SCHEDULE_BATCH_MAX_OPERATIONS = 100;

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

export async function applyWeeklyScheduleBatch(
    user: SafeAdminUser,
    operations: unknown,
    repository: AdminScheduleRepository,
    options: { now?: Date } = {},
): Promise<AdminWeeklyScheduleBatchResult> {
    assertOwnerOrAdmin(user);
    const batchOperations = normalizeWeeklyScheduleBatchOperations(operations);
    const applyOperations = (transaction: AdminScheduleRepository) =>
        applyWeeklyScheduleBatchOperations(user, batchOperations, transaction, options);

    if (repository.withTransaction) {
        return repository.withTransaction(applyOperations);
    }

    return applyOperations(repository);
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

export async function replaceAdminDayShift(
    user: SafeAdminUser,
    payload: AdminDayShiftPayload,
    repository: AdminScheduleRepository,
    _options: { now?: Date } = {},
): Promise<AdminDayShiftReplacement> {
    const barberId = resolveWritableShiftBarberId(
        user,
        asNonEmptyString(payload.barberId, "Barber is required."),
    );
    const locationId = asNonEmptyString(payload.locationId, "Location is required.");
    const date = asLocalDate(payload.date, "A valid shift date is required.");
    const desiredWindows = normalizeDayShiftWindows(payload.windows);

    await assertActiveBarberLocation(barberId, locationId, repository);

    const schedule = await repository.listSchedule({ barberId, from: date, to: date });
    const existingOverrides = schedule.shiftOverrides.filter(
        (override) =>
            override.barberId === barberId &&
            override.overrideDate === date &&
            (override.locationId === locationId ||
                (override.overrideType === "not_working" && override.locationId === null)),
    );

    for (const override of existingOverrides) {
        await repository.deleteShiftOverride(override.id);
    }

    const baseline = normalizeMinuteRanges(
        schedule.shifts
            .filter(
                (shift) =>
                    shift.active &&
                    shift.barberId === barberId &&
                    shift.locationId === locationId &&
                    shift.dayOfWeek === localDateToDayOfWeek(date) &&
                    shiftIsEffectiveOnDate(shift, date),
            )
            .map((shift) => ({ start: timeToMinutes(shift.startTime), end: timeToMinutes(shift.endTime) })),
    );
    const desired = normalizeMinuteRanges(
        desiredWindows.map((window) => ({
            start: timeToMinutes(window.startTime),
            end: timeToMinutes(window.endTime),
        })),
    );
    const addWindows = subtractMinuteRanges(desired, baseline);
    const removeWindows = subtractMinuteRanges(baseline, desired);
    const shiftOverrides: AdminShiftOverrideRecord[] = [];

    for (const window of addWindows) {
        shiftOverrides.push(
            await repository.createShiftOverride({
                barberId,
                locationId,
                overrideDate: date,
                overrideType: "add",
                startTime: minutesToTime(window.start),
                endTime: minutesToTime(window.end),
                reason: "One-day shift edit",
            }),
        );
    }

    for (const window of removeWindows) {
        shiftOverrides.push(
            await repository.createShiftOverride({
                barberId,
                locationId,
                overrideDate: date,
                overrideType: "remove",
                startTime: minutesToTime(window.start),
                endTime: minutesToTime(window.end),
                reason: "One-day shift edit",
            }),
        );
    }

    return {
        barberId,
        locationId,
        date,
        windows: desired.map((window) => ({
            startTime: minutesToTime(window.start),
            endTime: minutesToTime(window.end),
        })),
        shiftOverrides,
    };
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

async function applyWeeklyScheduleBatchOperations(
    user: SafeAdminUser,
    operations: AdminWeeklyScheduleBatchOperation[],
    repository: AdminScheduleRepository,
    options: { now?: Date },
): Promise<AdminWeeklyScheduleBatchResult> {
    const shifts: AdminShiftRecord[] = [];
    const deactivatedShiftIds: string[] = [];

    for (const [index, operation] of operations.entries()) {
        try {
            if (operation.type === "create") {
                shifts.push(await createAdminShift(user, operation.payload, repository, options));
            } else if (operation.type === "update") {
                shifts.push(await updateAdminShift(user, operation.shiftId, operation.payload, repository, options));
            } else {
                deactivatedShiftIds.push((await deactivateAdminShift(user, operation.shiftId, repository, options)).id);
            }
        } catch (error) {
            throw describeWeeklyScheduleBatchOperationError(error, index, operations.length);
        }
    }

    return { applied: operations.length, shifts, deactivatedShiftIds };
}

function normalizeWeeklyScheduleBatchOperations(value: unknown): AdminWeeklyScheduleBatchOperation[] {
    if (!Array.isArray(value) || value.length === 0) {
        throw new AdminScheduleRequestError(400, "At least one weekly schedule operation is required.");
    }

    if (value.length > WEEKLY_SCHEDULE_BATCH_MAX_OPERATIONS) {
        throw new AdminScheduleRequestError(
            400,
            `Weekly schedule saves support at most ${WEEKLY_SCHEDULE_BATCH_MAX_OPERATIONS} operations.`,
        );
    }

    return value.map((item, index) => {
        try {
            return normalizeWeeklyScheduleBatchOperation(item);
        } catch (error) {
            throw describeWeeklyScheduleBatchOperationError(error, index, value.length);
        }
    });
}

function normalizeWeeklyScheduleBatchOperation(value: unknown): AdminWeeklyScheduleBatchOperation {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new AdminScheduleRequestError(400, "A valid weekly schedule operation is required.");
    }

    const operation = value as Record<string, unknown>;

    if (operation.type === "create") {
        return { type: "create", payload: asShiftOperationPayload(operation.payload) };
    }

    if (operation.type === "update") {
        return {
            type: "update",
            shiftId: asNonEmptyString(operation.shiftId, "Shift is required."),
            payload: asShiftOperationPayload(operation.payload),
        };
    }

    if (operation.type === "deactivate") {
        return {
            type: "deactivate",
            shiftId: asNonEmptyString(operation.shiftId, "Shift is required."),
        };
    }

    throw new AdminScheduleRequestError(400, "A valid weekly schedule operation type is required.");
}

function asShiftOperationPayload(value: unknown) {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new AdminScheduleRequestError(400, "A valid shift payload is required.");
    }

    return value as Record<string, unknown>;
}

function describeWeeklyScheduleBatchOperationError(error: unknown, index: number, total: number): Error {
    const prefix = `Operation ${index + 1} of ${total}:`;

    if (error instanceof AdminScheduleRequestError) {
        // Never surface a per-op 404 from this endpoint: HTTP 404 must mean
        // "route not found" so the client's endpoint-missing fallback can't
        // mistake a stale/missing shift row for an old server and re-apply the
        // batch non-atomically. A vanished row is a concurrency conflict → 409.
        const status = error.status === 404 ? 409 : error.status;
        return new AdminScheduleRequestError(status, `${prefix} ${error.message}`);
    }

    if (error instanceof Error) {
        error.message = `${prefix} ${error.message}`;
        return error;
    }

    return new Error(`${prefix} ${String(error)}`);
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

function normalizeDayShiftWindows(value: unknown) {
    if (!Array.isArray(value)) {
        throw new AdminScheduleRequestError(400, "Shift windows are required.");
    }

    const windows = value.map((item) => {
        if (!item || typeof item !== "object") {
            throw new AdminScheduleRequestError(400, "Shift windows are invalid.");
        }

        const window = item as Record<string, unknown>;
        const startTime = asQuarterHourTime(window.startTime, "A valid shift start time is required.");
        const endTime = asQuarterHourTime(window.endTime, "A valid shift end time is required.");

        if (startTime >= endTime) {
            throw new AdminScheduleRequestError(400, "Shift start time must be before end time.");
        }

        return { startTime, endTime };
    });

    return normalizeMinuteRanges(
        windows.map((window) => ({
            start: timeToMinutes(window.startTime),
            end: timeToMinutes(window.endTime),
        })),
    ).map((range) => ({
        startTime: minutesToTime(range.start),
        endTime: minutesToTime(range.end),
    }));
}

function shiftIsEffectiveOnDate(shift: AdminShiftRecord, date: string) {
    return (!shift.effectiveFrom || shift.effectiveFrom <= date) && (!shift.effectiveTo || shift.effectiveTo >= date);
}

function normalizeMinuteRanges(ranges: Array<{ start: number; end: number }>) {
    return ranges
        .filter((range) => range.start < range.end)
        .sort((left, right) => left.start - right.start || left.end - right.end)
        .reduce<Array<{ start: number; end: number }>>((merged, range) => {
            const previous = merged[merged.length - 1];
            if (previous && range.start <= previous.end) {
                previous.end = Math.max(previous.end, range.end);
                return merged;
            }

            merged.push({ ...range });
            return merged;
        }, []);
}

function subtractMinuteRanges(
    sourceRanges: Array<{ start: number; end: number }>,
    blockedRanges: Array<{ start: number; end: number }>,
) {
    let remaining = sourceRanges.map((range) => ({ ...range }));

    for (const blocked of blockedRanges) {
        remaining = remaining.flatMap((range) => subtractMinuteRange(range, blocked));
    }

    return normalizeMinuteRanges(remaining);
}

function subtractMinuteRange(source: { start: number; end: number }, blocked: { start: number; end: number }) {
    if (blocked.start >= source.end || blocked.end <= source.start) {
        return [source];
    }

    const ranges: Array<{ start: number; end: number }> = [];
    if (blocked.start > source.start) {
        ranges.push({ start: source.start, end: blocked.start });
    }

    if (blocked.end < source.end) {
        ranges.push({ start: blocked.end, end: source.end });
    }

    return ranges;
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

function resolveWritableShiftBarberId(user: SafeAdminUser, requestedBarberId: string) {
    if (user.role === "owner" || user.role === "admin") {
        return requestedBarberId;
    }

    if (!user.barberId) {
        throw new AdminScheduleRequestError(403, "Barber account is not linked to a barber profile.");
    }

    if (requestedBarberId !== user.barberId) {
        throw new AdminScheduleRequestError(403, "Barber accounts can only edit their own shift.");
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
