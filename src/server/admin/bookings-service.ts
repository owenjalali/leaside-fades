import { getAvailableSlots } from "../availability/index.ts";
import { getLocalDate, localDateTimeToUtc } from "../availability/time.ts";
import {
    BookingCreationError,
    createBooking,
    type BookingRepository,
    type BookingServiceSnapshot,
    type CreateBookingCustomerInput,
    type CreateBookingRequest,
} from "../bookings/index.ts";
import type { SafeAdminUser } from "../auth/index.ts";
import {
    dispatchBookingNotificationSafely,
    type BookingLifecycleNotificationDispatcher,
    type NotificationAttemptStatus,
    type NotificationChannel,
    type NotificationEventType,
    type NotificationRecipientType,
} from "../notifications/index.ts";

export type AdminBookingStatus = "confirmed" | "cancelled" | "completed" | "no_show";
export type AdminBookingSource = "public" | "manual" | "walk_in" | "imported";

export interface AdminBookingRecord {
    id: string;
    barberId: string;
    barberName: string;
    locationId: string;
    locationName: string;
    customerName: string;
    customerEmail: string | null;
    customerPhone: string | null;
    status: AdminBookingStatus;
    source: AdminBookingSource;
    startTime: Date;
    endTime: Date;
    totalDurationMinutes: number;
    services: string[];
}

export interface AdminBookingDetailRecord extends AdminBookingRecord {
    serviceIds: string[];
    serviceDetails: BookingServiceSnapshot[];
    customerNotes: string | null;
    internalNotes: string | null;
}

export interface AdminCalendarLocationOption {
    id: string;
    name: string;
    sortOrder: number;
}

export interface AdminCalendarBarberOption {
    id: string;
    slug?: string;
    displayName: string;
    locationIds: string[];
    sortOrder: number;
}

export interface AdminCalendarServiceOption {
    id: string;
    name: string;
    durationMinutes: number;
    displayPrice: string;
    priceCents: number;
    priceType: "fixed" | "from";
    sortOrder: number;
}

export interface AdminCalendarOptions {
    locations: AdminCalendarLocationOption[];
    barbers: AdminCalendarBarberOption[];
    services: AdminCalendarServiceOption[];
}

export interface AdminBookingFilters {
    from?: string;
    to?: string;
    locationId?: string;
    barberId?: string;
    status?: AdminBookingStatus | "";
    limit?: number;
}

export interface AdminBookingQueryScope {
    barberId?: string;
    locationId?: string;
    status?: AdminBookingStatus;
    from?: Date;
    to?: Date;
    limit: number;
}

export interface AdminDashboardBookingScope {
    barberId?: string;
    status?: AdminBookingStatus;
    from: Date;
    to: Date;
    limit: number;
}

export interface AdminDashboardActivityScope {
    barberId?: string;
    limit: number;
}

export interface AdminDashboardActivityRecord {
    id: string;
    bookingId: string;
    eventType: NotificationEventType | "no_show";
    status: NotificationAttemptStatus | AdminBookingStatus;
    channel: NotificationChannel | "calendar";
    recipientType: NotificationRecipientType | "shop";
    recipientLabel: string;
    customerName: string;
    barberId: string;
    barberName: string;
    locationName: string;
    appointmentStatus: AdminBookingStatus;
    appointmentSource: AdminBookingSource;
    appointmentStartTime: Date;
    appointmentEndTime: Date;
    services: string[];
    createdAt: Date;
    updatedAt: Date;
    sentAt: Date | null;
    scheduledFor: Date | null;
    errorMessage: string | null;
}

export interface AdminDashboardSnapshot {
    todayBookings: AdminBookingRecord[];
    upcomingBookings: AdminBookingRecord[];
    activity: AdminDashboardActivityRecord[];
}

export interface AdminAvailabilityLookupRequest {
    locationId: string;
    serviceIds: string[];
    date: string;
    barberId?: string;
    minimumNoticeMinutes?: number;
    now?: Date;
    timeZone?: string;
}

export interface AdminManualBookingPayload {
    locationId?: unknown;
    serviceIds?: unknown;
    barberId?: unknown;
    startTime?: unknown;
    customer?: {
        name?: unknown;
        firstName?: unknown;
        lastName?: unknown;
        phone?: unknown;
        phoneE164?: unknown;
        email?: unknown;
        notes?: unknown;
    };
    customerNotes?: unknown;
    internalNotes?: unknown;
}

export interface AdminWalkInBookingPayload {
    locationId?: unknown;
    serviceIds?: unknown;
    barberId?: unknown;
    startTime?: unknown;
    customerName?: unknown;
    customer?: {
        name?: unknown;
        firstName?: unknown;
        lastName?: unknown;
        phone?: unknown;
        phoneE164?: unknown;
        email?: unknown;
        notes?: unknown;
    };
    internalNotes?: unknown;
}

export interface AdminRescheduleBookingPayload {
    locationId?: unknown;
    barberId?: unknown;
    startTime?: unknown;
    [key: string]: unknown;
}

export interface AdminBookingsRepository {
    listBookingsForAdminScope(scope: AdminBookingQueryScope): Promise<AdminBookingRecord[]>;
}

export interface AdminCalendarOptionsRepository {
    listCalendarOptions(scope: { barberId?: string }): Promise<AdminCalendarOptions>;
}

export type AdminAvailabilityRepository = Pick<BookingRepository, "loadAvailabilityData">;

export interface AdminDashboardRepository {
    listDashboardBookingsForAdminScope(scope: AdminDashboardBookingScope): Promise<AdminBookingRecord[]>;
    listDashboardActivityForAdminScope(scope: AdminDashboardActivityScope): Promise<AdminDashboardActivityRecord[]>;
}

export interface AdminBookingManagementRepository
    extends AdminBookingsRepository,
        AdminCalendarOptionsRepository,
        AdminDashboardRepository,
        BookingRepository {
    getBookingByIdForAdminScope(scope: {
        bookingId: string;
        barberId?: string;
    }): Promise<AdminBookingDetailRecord | null>;
    cancelBookingForAdminScope(input: {
        bookingId: string;
        barberId?: string;
        cancelledAt: Date;
        cancelledByUserId: string;
    }): Promise<(AdminBookingRecord & { mutable: boolean }) | null>;
    markBookingNoShowForAdminScope(input: {
        bookingId: string;
        barberId?: string;
        markedAt: Date;
        markedByUserId: string;
    }): Promise<(AdminBookingRecord & { mutable: boolean }) | null>;
    updateBookingScheduleForAdminScope(input: {
        bookingId: string;
        barberId?: string;
        nextBarberId: string;
        locationId: string;
        startTime: Date;
        endTime: Date;
        totalDurationMinutes: number;
        updatedAt: Date;
    }): Promise<AdminBookingRecord | null>;
}

export class AdminAuthorizationError extends Error {
    readonly status = 403;

    constructor(message: string) {
        super(message);
        this.name = "AdminAuthorizationError";
    }
}

export class AdminBookingRequestError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = "AdminBookingRequestError";
        this.status = status;
    }
}

interface AdminBookingMutationOptions {
    now?: Date;
    notificationDispatcher?: BookingLifecycleNotificationDispatcher;
}

const DEFAULT_TIME_ZONE = "America/Toronto";
const VALID_STATUSES = new Set<AdminBookingStatus>([
    "confirmed",
    "cancelled",
    "completed",
    "no_show",
]);
const RESCHEDULE_SERVICE_CHANGE_FIELDS = new Set([
    "serviceId",
    "serviceIds",
    "services",
    "bookingService",
    "bookingServices",
    "serviceDetail",
    "serviceDetails",
    "serviceSnapshot",
    "serviceSnapshots",
    "snapshots",
    "duration",
    "durationMinutes",
    "totalDuration",
    "totalDurationMinutes",
    "price",
    "priceCents",
    "priceType",
    "displayPrice",
    "categoryId",
    "categoryName",
]);
const RESCHEDULE_SERVICE_CHANGE_MESSAGE =
    "Service changes are not supported during reschedule. Cancel and recreate the booking to change services.";

export async function listAdminBookings(
    user: SafeAdminUser,
    repository: AdminBookingsRepository,
    options: AdminBookingFilters = {},
) {
    const hasExplicitPhase6Filters =
        options.from !== undefined ||
        options.to !== undefined ||
        options.locationId !== undefined ||
        options.barberId !== undefined ||
        options.status !== undefined ||
        options.limit !== undefined;
    const scope = buildActorBookingScope(user, {
        ...options,
        limit: options.limit ?? (hasExplicitPhase6Filters ? 250 : 100),
    });

    return repository.listBookingsForAdminScope(scope);
}

export async function getAdminBookingDetail(
    user: SafeAdminUser,
    bookingId: string,
    repository: Pick<AdminBookingManagementRepository, "getBookingByIdForAdminScope">,
) {
    const scope = buildActorScope(user);
    const booking = await repository.getBookingByIdForAdminScope({
        bookingId: asNonEmptyString(bookingId, "Booking is required."),
        barberId: scope.barberId,
    });

    if (!booking) {
        throw new AdminBookingRequestError(404, "Booking was not found.");
    }

    return booking;
}

export async function getAdminCalendarOptions(
    user: SafeAdminUser,
    repository: AdminCalendarOptionsRepository,
) {
    return repository.listCalendarOptions(buildActorScope(user));
}

export async function getAdminDashboard(
    user: SafeAdminUser,
    repository: AdminDashboardRepository,
    options: { now?: Date } = {},
): Promise<AdminDashboardSnapshot> {
    const now = options.now ?? new Date();
    const actorScope = buildActorScope(user);
    const today = getLocalDate(now, DEFAULT_TIME_ZONE);
    const todayStart = localDateTimeToUtc(today, "00:00", DEFAULT_TIME_ZONE);
    const tomorrowStart = localDateTimeToUtc(nextLocalDate(today), "00:00", DEFAULT_TIME_ZONE);
    const upcomingEnd = localDateTimeToUtc(addLocalDays(today, 8), "00:00", DEFAULT_TIME_ZONE);

    const [todayBookings, upcomingBookings, activity] = await Promise.all([
        repository.listDashboardBookingsForAdminScope({
            ...actorScope,
            status: "confirmed",
            from: todayStart,
            to: tomorrowStart,
            limit: 24,
        }),
        repository.listDashboardBookingsForAdminScope({
            ...actorScope,
            status: "confirmed",
            from: now,
            to: upcomingEnd,
            limit: 12,
        }),
        repository.listDashboardActivityForAdminScope({
            ...actorScope,
            limit: 50,
        }),
    ]);

    return { todayBookings, upcomingBookings, activity };
}

export async function getAdminAvailability(
    user: SafeAdminUser,
    request: AdminAvailabilityLookupRequest,
    repository: AdminAvailabilityRepository,
) {
    const scopedRequest: AdminAvailabilityLookupRequest = {
        ...request,
        barberId: resolveWritableBarberId(user, request.barberId, { allowOwnerAdminAny: true }),
    };

    validateAvailabilityRequest(scopedRequest);

    const timeZone = scopedRequest.timeZone ?? DEFAULT_TIME_ZONE;
    const availabilityData = await repository.loadAvailabilityData(scopedRequest, scopedRequest.date);
    const availability = getAvailableSlots(
        {
            ...scopedRequest,
            minimumNoticeMinutes: scopedRequest.minimumNoticeMinutes ?? 0,
            timeZone,
        },
        availabilityData,
    );

    const barberSlots = availability.barberSlots
        .map((barberAvailability) => ({
            barberId: barberAvailability.barberId,
            locationId: barberAvailability.locationId,
            slots: barberAvailability.slots.map((slot) => ({
                barberId: slot.barberId,
                locationId: slot.locationId,
                startTime: slot.startTime.toISOString(),
                endTime: slot.endTime.toISOString(),
                totalDurationMinutes: slot.totalDurationMinutes,
            })),
        }))
        .filter((barberAvailability) => barberAvailability.slots.length > 0);

    return {
        date: availability.date,
        locationId: availability.locationId,
        timeZone: availability.timeZone,
        totalDurationMinutes: availability.totalDurationMinutes,
        barberSlots,
        emptyMessage:
            barberSlots.length === 0
                ? "No available times for this date. Try another date or barber."
                : undefined,
    };
}

export async function createAdminManualBooking(
    user: SafeAdminUser,
    payload: AdminManualBookingPayload,
    repository: BookingRepository,
    options: AdminBookingMutationOptions = {},
) {
    const request = buildManualBookingRequest(user, payload, options);

    const booking = await createAdminBookingFromRequest(request, repository);
    await dispatchLifecycleNotification(options.notificationDispatcher, {
        eventType: "booking_confirmation",
        bookingId: booking.id,
    });
    return booking;
}

export async function createAdminWalkInBooking(
    user: SafeAdminUser,
    payload: AdminWalkInBookingPayload,
    repository: BookingRepository,
    options: AdminBookingMutationOptions = {},
) {
    const request = buildWalkInBookingRequest(user, payload, options);

    return createAdminBookingFromRequest(request, repository);
}

async function createAdminBookingFromRequest(
    request: CreateBookingRequest,
    repository: BookingRepository,
) {
    try {
        const result = await createBooking(request, repository);

        return {
            ...result.booking,
            customerName: `${request.customer.firstName} ${request.customer.lastName}`.trim(),
            customerEmail: request.customer.email,
            customerPhone: request.customer.phoneE164,
            startTime: result.booking.startTime,
            endTime: result.booking.endTime,
            services: result.bookingServices.map((service) => service.serviceName),
            serviceDetails: result.bookingServices,
        };
    } catch (error) {
        if (error instanceof BookingCreationError) {
            throw new AdminBookingRequestError(
                error.code === "UNAVAILABLE_SLOT" ? 409 : 400,
                error.message,
            );
        }

        throw error;
    }
}

export async function cancelAdminBooking(
    user: SafeAdminUser,
    bookingId: string,
    repository: Pick<AdminBookingManagementRepository, "cancelBookingForAdminScope">,
    options: AdminBookingMutationOptions = {},
) {
    const scope = buildActorScope(user);
    const booking = await repository.cancelBookingForAdminScope({
        bookingId: asNonEmptyString(bookingId, "Booking is required."),
        barberId: scope.barberId,
        cancelledAt: options.now ?? new Date(),
        cancelledByUserId: user.id,
    });

    if (!booking) {
        throw new AdminBookingRequestError(404, "Booking was not found.");
    }

    if (!booking.mutable) {
        throw new AdminBookingRequestError(409, "Completed or no-show bookings cannot be cancelled.");
    }

    const cancelled = withoutMutableFlag(booking);
    await dispatchLifecycleNotification(options.notificationDispatcher, {
        eventType: "cancellation_confirmation",
        bookingId: cancelled.id,
    });
    return cancelled;
}

export async function markAdminBookingNoShow(
    user: SafeAdminUser,
    bookingId: string,
    repository: Pick<AdminBookingManagementRepository, "markBookingNoShowForAdminScope">,
    options: { now?: Date } = {},
) {
    const scope = buildActorScope(user);
    const markedAt = options.now ?? new Date();
    const booking = await repository.markBookingNoShowForAdminScope({
        bookingId: asNonEmptyString(bookingId, "Booking is required."),
        barberId: scope.barberId,
        markedAt,
        markedByUserId: user.id,
    });

    if (!booking) {
        throw new AdminBookingRequestError(404, "Booking was not found.");
    }

    if (!booking.mutable) {
        throw new AdminBookingRequestError(
            409,
            "Only current or past confirmed bookings can be marked no-show.",
        );
    }

    return withoutMutableFlag(booking);
}

export async function rescheduleAdminBooking(
    user: SafeAdminUser,
    bookingId: string,
    payload: AdminRescheduleBookingPayload,
    repository: AdminBookingManagementRepository,
    options: AdminBookingMutationOptions = {},
) {
    assertNoServiceChangeFields(payload);

    const booking = await repository.withTransaction(async (transaction) => {
        const tx = transaction as AdminBookingManagementRepository;
        return rescheduleAdminBookingInTransaction(user, bookingId, payload, tx, options);
    });

    await dispatchLifecycleNotification(options.notificationDispatcher, {
        eventType: "reschedule_confirmation",
        bookingId: booking.id,
        occurrenceKey: booking.startTime.toISOString(),
    });

    return booking;
}

function assertNoServiceChangeFields(payload: AdminRescheduleBookingPayload) {
    const serviceChangeFields = Object.keys(payload ?? {}).filter((field) =>
        RESCHEDULE_SERVICE_CHANGE_FIELDS.has(field),
    );

    if (serviceChangeFields.length > 0) {
        throw new AdminBookingRequestError(400, RESCHEDULE_SERVICE_CHANGE_MESSAGE);
    }
}

async function rescheduleAdminBookingInTransaction(
    user: SafeAdminUser,
    bookingId: string,
    payload: AdminRescheduleBookingPayload,
    repository: AdminBookingManagementRepository,
    options: { now?: Date },
) {
    const nextBarberId = resolveWritableBarberId(
        user,
        asNonEmptyString(payload.barberId, "Barber is required."),
    );
    if (!nextBarberId) {
        throw new AdminBookingRequestError(400, "Barber is required.");
    }
    const booking = await getAdminBookingDetail(user, bookingId, repository);

    if (booking.status !== "confirmed") {
        throw new AdminBookingRequestError(409, "Only confirmed bookings can be rescheduled.");
    }

    if (booking.serviceIds.length === 0 || booking.serviceIds.length !== booking.serviceDetails.length) {
        throw new AdminBookingRequestError(
            400,
            "This booking cannot be rescheduled because one or more services are inactive.",
        );
    }

    const nextLocationId = asNonEmptyString(payload.locationId, "Location is required.");
    const startTime = parseDate(payload.startTime, "A valid appointment start time is required.");
    const timeZone = DEFAULT_TIME_ZONE;
    const localDate = getLocalDate(startTime, timeZone);
    const request: CreateBookingRequest = {
        locationId: nextLocationId,
        serviceIds: booking.serviceIds,
        barberId: nextBarberId,
        startTime,
        source: "manual",
        excludeBookingId: booking.id,
        customer: {
            firstName: firstNameFromCustomerName(booking.customerName),
            lastName: lastNameFromCustomerName(booking.customerName),
            phoneE164: booking.customerPhone,
            email: booking.customerEmail,
        },
        now: options.now,
        timeZone,
    };

    const availabilityData = await repository.loadAvailabilityData(request, localDate);
    const availability = getAvailableSlots(
        {
            locationId: nextLocationId,
            serviceIds: booking.serviceIds,
            barberId: nextBarberId,
            date: localDate,
            now: options.now,
            timeZone,
        },
        availabilityData,
    );
    const requestedSlot = availability.barberSlots
        .flatMap((barberSlots) => barberSlots.slots)
        .find(
            (slot) =>
                slot.barberId === nextBarberId &&
                slot.locationId === nextLocationId &&
                slot.startTime.getTime() === startTime.getTime(),
        );

    if (!requestedSlot) {
        throw new AdminBookingRequestError(409, "The requested appointment slot is not available.");
    }

    const hasBookingOverlap = await repository.hasConfirmedBookingOverlap(
        requestedSlot.barberId,
        requestedSlot.startTime,
        requestedSlot.endTime,
        booking.id,
    );
    const hasBlockedOverlap = await repository.hasBlockedTimeOverlap(
        requestedSlot.barberId,
        requestedSlot.locationId,
        requestedSlot.startTime,
        requestedSlot.endTime,
    );

    if (hasBookingOverlap || hasBlockedOverlap) {
        throw new AdminBookingRequestError(409, "The requested appointment slot is not available.");
    }

    const updated = await repository.updateBookingScheduleForAdminScope({
        bookingId: booking.id,
        barberId: buildActorScope(user).barberId,
        nextBarberId,
        locationId: nextLocationId,
        startTime: requestedSlot.startTime,
        endTime: requestedSlot.endTime,
        totalDurationMinutes: requestedSlot.totalDurationMinutes,
        updatedAt: options.now ?? new Date(),
    });

    if (!updated) {
        throw new AdminBookingRequestError(404, "Booking was not found.");
    }

    return updated;
}

function buildActorBookingScope(user: SafeAdminUser, filters: AdminBookingFilters): AdminBookingQueryScope {
    const actorScope = buildActorScope(user);
    const requestedBarberId = optionalString(filters.barberId);

    if (actorScope.barberId && requestedBarberId && requestedBarberId !== actorScope.barberId) {
        throw new AdminAuthorizationError("Barber accounts can only access their own calendar.");
    }

    return {
        ...actorScope,
        barberId: actorScope.barberId ?? requestedBarberId,
        locationId: optionalString(filters.locationId),
        status: parseStatus(filters.status),
        from: filters.from ? localDateStart(filters.from) : undefined,
        to: filters.to ? localDateStart(nextLocalDate(filters.to)) : undefined,
        limit: clampLimit(filters.limit),
    };
}

function buildActorScope(user: SafeAdminUser) {
    if (user.role === "owner" || user.role === "admin") {
        return {};
    }

    if (!user.barberId) {
        throw new AdminAuthorizationError("Barber account is not linked to a barber profile.");
    }

    return { barberId: user.barberId };
}

function buildManualBookingRequest(
    user: SafeAdminUser,
    payload: AdminManualBookingPayload,
    options: { now?: Date },
): CreateBookingRequest {
    const barberId = resolveWritableBarberId(
        user,
        asNonEmptyString(payload.barberId, "Barber is required."),
    );
    if (!barberId) {
        throw new AdminBookingRequestError(400, "Barber is required.");
    }
    const customerPayload = payload.customer ?? {};
    const customer = normalizeCustomer(customerPayload);

    return {
        locationId: asNonEmptyString(payload.locationId, "Location is required."),
        serviceIds: asStringArray(payload.serviceIds, "At least one service is required."),
        barberId,
        startTime: parseDate(payload.startTime, "A valid appointment start time is required."),
        source: "manual",
        customer,
        customerNotes: optionalString(payload.customerNotes) ?? customer.notes ?? null,
        internalNotes: optionalString(payload.internalNotes) ?? null,
        minimumNoticeMinutes: 0,
        now: options.now,
        timeZone: DEFAULT_TIME_ZONE,
    };
}

function buildWalkInBookingRequest(
    user: SafeAdminUser,
    payload: AdminWalkInBookingPayload,
    options: { now?: Date },
): CreateBookingRequest {
    const barberId = resolveWritableBarberId(
        user,
        asNonEmptyString(payload.barberId, "Barber is required."),
    );
    if (!barberId) {
        throw new AdminBookingRequestError(400, "Barber is required.");
    }
    const customer = normalizeWalkInCustomer(payload);

    return {
        locationId: asNonEmptyString(payload.locationId, "Location is required."),
        serviceIds: asStringArray(payload.serviceIds, "At least one service is required."),
        barberId,
        startTime: parseDate(payload.startTime, "A valid appointment start time is required."),
        source: "walk_in",
        customer,
        customerNotes: customer.notes ?? null,
        internalNotes: optionalString(payload.internalNotes) ?? null,
        minimumNoticeMinutes: 0,
        now: options.now,
        timeZone: DEFAULT_TIME_ZONE,
    };
}

function resolveWritableBarberId(
    user: SafeAdminUser,
    requestedBarberId?: string,
    options: { allowOwnerAdminAny?: boolean } = {},
) {
    if (user.role === "owner" || user.role === "admin") {
        return options.allowOwnerAdminAny ? optionalString(requestedBarberId) : requestedBarberId;
    }

    if (!user.barberId) {
        throw new AdminAuthorizationError("Barber account is not linked to a barber profile.");
    }

    if (requestedBarberId && requestedBarberId !== user.barberId) {
        throw new AdminAuthorizationError("Barber accounts can only manage their own appointments.");
    }

    return user.barberId;
}

function validateAvailabilityRequest(request: AdminAvailabilityLookupRequest) {
    asNonEmptyString(request.locationId, "Location is required.");
    asStringArray(request.serviceIds, "At least one service is required.");

    if (!/^\d{4}-\d{2}-\d{2}$/.test(request.date)) {
        throw new AdminBookingRequestError(400, "A valid local date is required.");
    }
}

function normalizeCustomer(customer: AdminManualBookingPayload["customer"]): CreateBookingCustomerInput {
    const nameParts = normalizeCustomerName(customer);
    const email = optionalString(customer?.email)?.toLowerCase() ?? null;

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new AdminBookingRequestError(400, "A valid customer email is required.");
    }

    return {
        firstName: nameParts.firstName,
        lastName: nameParts.lastName,
        phoneE164: optionalPhone(customer?.phoneE164 ?? customer?.phone),
        email,
        notes: optionalString(customer?.notes) ?? null,
    };
}

function normalizeCustomerName(customer: AdminManualBookingPayload["customer"]) {
    const explicitFirstName = optionalString(customer?.firstName);
    const explicitLastName = optionalString(customer?.lastName);

    if (explicitFirstName) {
        return {
            firstName: explicitFirstName,
            lastName: explicitLastName ?? "",
        };
    }

    const rawName = asNonEmptyString(customer?.name, "Customer name is required.");
    const [firstName, ...rest] = rawName.trim().split(/\s+/);

    return {
        firstName,
        lastName: rest.join(" "),
    };
}

function normalizeWalkInCustomer(payload: AdminWalkInBookingPayload): CreateBookingCustomerInput {
    const customerPayload = payload.customer ?? {};
    const rawName =
        optionalString(payload.customerName) ??
        optionalString(customerPayload.name) ??
        [optionalString(customerPayload.firstName), optionalString(customerPayload.lastName)]
            .filter(Boolean)
            .join(" ");
    const customerName = asNonEmptyString(rawName, "Customer name is required.");
    const [firstName, ...rest] = customerName.trim().split(/\s+/);
    const email = optionalString(customerPayload.email)?.toLowerCase() ?? null;

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new AdminBookingRequestError(400, "A valid customer email is required.");
    }

    return {
        firstName,
        lastName: rest.join(" "),
        phoneE164: optionalPhone(customerPayload.phoneE164 ?? customerPayload.phone),
        email,
        notes: optionalString(customerPayload.notes) ?? null,
    };
}

function parseStatus(status: AdminBookingFilters["status"]) {
    const value = optionalString(status);

    if (!value) {
        return undefined;
    }

    if (!VALID_STATUSES.has(value as AdminBookingStatus)) {
        throw new AdminBookingRequestError(400, "Booking status filter is invalid.");
    }

    return value as AdminBookingStatus;
}

function asNonEmptyString(value: unknown, message: string) {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new AdminBookingRequestError(400, message);
    }

    return value.trim();
}

function optionalString(value: unknown) {
    if (typeof value !== "string" || value.trim().length === 0) {
        return undefined;
    }

    return value.trim();
}

function asStringArray(value: unknown, message: string) {
    if (!Array.isArray(value)) {
        throw new AdminBookingRequestError(400, message);
    }

    const strings = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);

    if (strings.length === 0) {
        throw new AdminBookingRequestError(400, message);
    }

    return strings.map((item) => item.trim());
}

function parseDate(value: unknown, message: string) {
    const raw = asNonEmptyString(value, message);
    const parsed = new Date(raw);

    if (Number.isNaN(parsed.getTime())) {
        throw new AdminBookingRequestError(400, message);
    }

    return parsed;
}

function normalizePhone(value: unknown) {
    const raw = asNonEmptyString(value, "Customer phone and email are required.");
    const compact = raw.replace(/[^\d+]/g, "");

    if (/^\+\d{10,15}$/.test(compact)) {
        return compact;
    }

    const digits = compact.replace(/\D/g, "");

    if (digits.length === 10) {
        return `+1${digits}`;
    }

    if (digits.length === 11 && digits.startsWith("1")) {
        return `+${digits}`;
    }

    throw new AdminBookingRequestError(400, "A valid customer phone number is required.");
}

function optionalPhone(value: unknown) {
    if (typeof value !== "string" || value.trim().length === 0) {
        return null;
    }

    return normalizePhone(value);
}

function localDateStart(localDate: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
        throw new AdminBookingRequestError(400, "A valid local date is required.");
    }

    return localDateTimeToUtc(localDate, "00:00", DEFAULT_TIME_ZONE);
}

function nextLocalDate(localDate: string) {
    return addLocalDays(localDate, 1);
}

function addLocalDays(localDate: string, days: number) {
    const [year, month, day] = localDate.split("-").map(Number);
    return getLocalDate(new Date(Date.UTC(year, month - 1, day + days)), "UTC");
}

function clampLimit(limit?: number) {
    if (!Number.isFinite(limit)) {
        return 250;
    }

    return Math.max(1, Math.min(500, Number(limit)));
}

function firstNameFromCustomerName(customerName: string) {
    return customerName.trim().split(/\s+/)[0] || "Customer";
}

function lastNameFromCustomerName(customerName: string) {
    const parts = customerName.trim().split(/\s+/);
    return parts.length > 1 ? parts.slice(1).join(" ") : "Customer";
}

function withoutMutableFlag<T extends { mutable: boolean }>(booking: T) {
    const { mutable: _mutable, ...rest } = booking;
    return rest;
}

async function dispatchLifecycleNotification(
    dispatcher: BookingLifecycleNotificationDispatcher | undefined,
    input: Parameters<BookingLifecycleNotificationDispatcher>[0],
) {
    try {
        await (dispatcher ?? dispatchBookingNotificationSafely)(input);
    } catch (error) {
        console.error("[notifications] admin booking dispatch failed", error);
    }
}
