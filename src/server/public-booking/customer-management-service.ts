import { getAvailableSlots, type AvailabilityData, type AvailableSlot } from "../availability/index.ts";
import { getLocalDate, localDateTimeToUtc } from "../availability/time.ts";
import {
    hashBookingManagementToken,
    type BookingRepository,
    type BookingServiceSnapshot,
    type CreateBookingRequest,
} from "../bookings/index.ts";
import {
    dispatchBookingNotificationSafely,
    type BookingLifecycleNotificationDispatcher,
} from "../notifications/index.ts";
import { formatPriceSummary } from "./repository.ts";

export type CustomerManagedBookingStatus = "confirmed" | "cancelled" | "completed" | "no_show";
export type CustomerManagedBookingSource = "public" | "manual" | "walk_in" | "imported";

export interface CustomerManagedBookingRecord {
    id: string;
    locationId: string;
    locationName: string;
    barberId: string;
    barberName: string;
    customerName: string;
    customerEmail: string | null;
    customerPhone: string | null;
    status: CustomerManagedBookingStatus;
    source: CustomerManagedBookingSource;
    startTime: Date;
    endTime: Date;
    totalDurationMinutes: number;
    serviceIds: string[];
    serviceDetails: BookingServiceSnapshot[];
}

export interface CustomerManagedBookingSummary {
    id: string;
    locationId: string;
    locationName: string;
    barberId: string;
    barberName: string;
    customerName: string;
    customerEmail: string | null;
    customerPhone: string | null;
    status: CustomerManagedBookingStatus;
    source: CustomerManagedBookingSource;
    startTime: string;
    endTime: string;
    totalDurationMinutes: number;
    services: BookingServiceSnapshot[];
    priceSummary: string;
    paymentLabel: "Pay in shop.";
    canCancel: boolean;
    canReschedule: boolean;
}

export interface CustomerBookingManagementRepository extends BookingRepository {
    findCustomerManagedBookingByTokenHash(input: {
        tokenHash: string;
        tokenType?: "cancellation" | "reschedule";
    }): Promise<CustomerManagedBookingRecord | null>;
    cancelCustomerManagedBooking(input: {
        bookingId: string;
        tokenHash: string;
        cancelledAt: Date;
    }): Promise<(CustomerManagedBookingRecord & { mutable: boolean }) | null>;
    updateCustomerManagedBookingSchedule(input: {
        bookingId: string;
        tokenHash: string;
        barberId: string;
        locationId: string;
        startTime: Date;
        endTime: Date;
        totalDurationMinutes: number;
        updatedAt: Date;
    }): Promise<CustomerManagedBookingRecord | null>;
}

export class CustomerBookingLinkError extends Error {
    readonly status = 404;

    constructor() {
        super("Booking link is invalid or expired.");
        this.name = "CustomerBookingLinkError";
    }
}

export class CustomerBookingRequestError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = "CustomerBookingRequestError";
        this.status = status;
    }
}

const DEFAULT_TIME_ZONE = "America/Toronto";

export async function getCustomerManagedBooking(
    rawToken: string,
    repository: CustomerBookingManagementRepository,
) {
    const { booking } = await findBookingForToken(rawToken, repository);
    return serializeCustomerManagedBooking(booking);
}

export async function cancelCustomerManagedBooking(
    rawToken: string,
    repository: CustomerBookingManagementRepository,
    options: { now?: Date; notificationDispatcher?: BookingLifecycleNotificationDispatcher } = {},
) {
    const { booking, tokenHash } = await findBookingForToken(rawToken, repository, "cancellation");
    const cancelled = await repository.cancelCustomerManagedBooking({
        bookingId: booking.id,
        tokenHash,
        cancelledAt: options.now ?? new Date(),
    });

    if (!cancelled) {
        throw invalidLinkError();
    }

    if (!cancelled.mutable) {
        throw new CustomerBookingRequestError(409, "Completed or no-show bookings cannot be cancelled.");
    }

    const summary = serializeCustomerManagedBooking(cancelled);
    await dispatchLifecycleNotification(options.notificationDispatcher, {
        eventType: "cancellation_confirmation",
        bookingId: cancelled.id,
    });
    return summary;
}

export async function getCustomerRescheduleAvailability(
    rawToken: string,
    query: {
        date?: unknown;
        locationId?: unknown;
        barberId?: unknown;
        now?: Date;
        timeZone?: string;
    },
    repository: CustomerBookingManagementRepository,
) {
    const { booking } = await findBookingForToken(rawToken, repository, "reschedule");
    assertBookingCanReschedule(booking);

    const serviceIds = activeServiceIdsForReschedule(booking);
    const date = asLocalDate(query.date, "A valid local date is required.");
    const locationId = optionalString(query.locationId) ?? booking.locationId;
    const barberId = optionalString(query.barberId);
    const timeZone = query.timeZone ?? DEFAULT_TIME_ZONE;
    const request = {
        locationId,
        serviceIds,
        barberId,
        now: query.now,
        timeZone,
        excludeBookingId: booking.id,
    };
    const availabilityData = await repository.loadAvailabilityData(request, date);
    const availability = getAvailableSlots(
        {
            locationId,
            serviceIds,
            barberId,
            date,
            now: query.now,
            timeZone,
        },
        availabilityData,
    );

    return serializeAvailability(availability);
}

export async function rescheduleCustomerManagedBooking(
    rawToken: string,
    payload: {
        locationId?: unknown;
        barberId?: unknown;
        startTime?: unknown;
    },
    repository: CustomerBookingManagementRepository,
    options: { now?: Date; notificationDispatcher?: BookingLifecycleNotificationDispatcher } = {},
) {
    const summary = await repository.withTransaction(async (transaction) => {
        const tx = transaction as CustomerBookingManagementRepository;
        return rescheduleCustomerManagedBookingInTransaction(rawToken, payload, tx, options);
    });

    await dispatchLifecycleNotification(options.notificationDispatcher, {
        eventType: "reschedule_confirmation",
        bookingId: summary.id,
        occurrenceKey: summary.startTime,
    });

    return summary;
}

async function rescheduleCustomerManagedBookingInTransaction(
    rawToken: string,
    payload: {
        locationId?: unknown;
        barberId?: unknown;
        startTime?: unknown;
    },
    repository: CustomerBookingManagementRepository,
    options: { now?: Date },
) {
    const { booking, tokenHash } = await findBookingForToken(rawToken, repository, "reschedule");
    assertBookingCanReschedule(booking);

    const serviceIds = activeServiceIdsForReschedule(booking);
    const locationId = asNonEmptyString(payload.locationId, "Location is required.");
    const barberId = optionalString(payload.barberId);
    const startTime = parseDate(payload.startTime, "A valid appointment start time is required.");
    const timeZone = DEFAULT_TIME_ZONE;
    const localDate = getLocalDate(startTime, timeZone);
    const availabilityRequest: CreateBookingRequest = {
        locationId,
        serviceIds,
        barberId,
        startTime,
        customer: {
            firstName: firstNameFromCustomerName(booking.customerName),
            lastName: lastNameFromCustomerName(booking.customerName),
            phoneE164: booking.customerPhone,
            email: booking.customerEmail,
        },
        source: "public",
        excludeBookingId: booking.id,
        now: options.now,
        timeZone,
    };
    const availabilityData = await repository.loadAvailabilityData(availabilityRequest, localDate);
    const availability = getAvailableSlots(
        {
            locationId,
            serviceIds,
            barberId,
            date: localDate,
            now: options.now,
            timeZone,
        },
        availabilityData,
    );
    const requestedSlot = await selectRequestedSlot({
        availabilityData,
        repository,
        locationId,
        serviceIds,
        requestedStart: startTime,
        barberId,
        localDate,
        timeZone,
        slots: availability.barberSlots.flatMap((barberSlot) => barberSlot.slots),
    });

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
        throw unavailableSlotError();
    }

    const updated = await repository.updateCustomerManagedBookingSchedule({
        bookingId: booking.id,
        tokenHash,
        barberId: requestedSlot.barberId,
        locationId: requestedSlot.locationId,
        startTime: requestedSlot.startTime,
        endTime: requestedSlot.endTime,
        totalDurationMinutes: requestedSlot.totalDurationMinutes,
        updatedAt: options.now ?? new Date(),
    });

    if (!updated) {
        throw invalidLinkError();
    }

    return serializeCustomerManagedBooking(updated);
}

async function findBookingForToken(
    rawToken: string,
    repository: CustomerBookingManagementRepository,
    tokenType?: "cancellation" | "reschedule",
) {
    const token = typeof rawToken === "string" ? rawToken.trim() : "";

    if (!token) {
        throw invalidLinkError();
    }

    const tokenHash = hashBookingManagementToken(token);
    const booking = await repository.findCustomerManagedBookingByTokenHash({
        tokenHash,
        tokenType,
    });

    if (!booking) {
        throw invalidLinkError();
    }

    return { booking, tokenHash };
}

async function selectRequestedSlot({
    availabilityData,
    repository,
    locationId,
    requestedStart,
    barberId,
    localDate,
    timeZone,
    slots,
}: {
    availabilityData: AvailabilityData;
    repository: CustomerBookingManagementRepository;
    locationId: string;
    serviceIds: string[];
    requestedStart: Date;
    barberId?: string;
    localDate: string;
    timeZone: string;
    slots: AvailableSlot[];
}) {
    const requestedStartMs = requestedStart.getTime();
    const validSlots = slots.filter(
        (slot) =>
            slot.locationId === locationId &&
            slot.startTime.getTime() === requestedStartMs &&
            (!barberId || slot.barberId === barberId),
    );

    if (validSlots.length === 0) {
        throw unavailableSlotError();
    }

    if (barberId) {
        return validSlots[0];
    }

    const barberIds = validSlots.map((slot) => slot.barberId);
    const bookingCounts = await repository.countConfirmedBookingsByBarber(
        barberIds,
        localDateTimeToUtc(localDate, "00:00", timeZone),
        localDateTimeToUtc(nextLocalDate(localDate), "00:00", timeZone),
    );

    return validSlots.sort((a, b) => {
        const barberA = availabilityData.barbers.find((candidate) => candidate.id === a.barberId);
        const barberB = availabilityData.barbers.find((candidate) => candidate.id === b.barberId);

        return (
            (barberA?.sortOrder ?? 0) - (barberB?.sortOrder ?? 0) ||
            (bookingCounts[a.barberId] ?? 0) - (bookingCounts[b.barberId] ?? 0) ||
            a.barberId.localeCompare(b.barberId)
        );
    })[0];
}

function assertBookingCanReschedule(booking: CustomerManagedBookingRecord) {
    if (booking.status !== "confirmed") {
        throw new CustomerBookingRequestError(409, "Only confirmed bookings can be rescheduled.");
    }
}

function activeServiceIdsForReschedule(booking: CustomerManagedBookingRecord) {
    if (booking.serviceIds.length === 0 || booking.serviceIds.length !== booking.serviceDetails.length) {
        throw new CustomerBookingRequestError(
            409,
            "This booking cannot be rescheduled because one or more services are inactive.",
        );
    }

    return booking.serviceIds;
}

function serializeCustomerManagedBooking(
    booking: CustomerManagedBookingRecord,
): CustomerManagedBookingSummary {
    const isConfirmed = booking.status === "confirmed";

    return {
        id: booking.id,
        locationId: booking.locationId,
        locationName: booking.locationName,
        barberId: booking.barberId,
        barberName: booking.barberName,
        customerName: booking.customerName,
        customerEmail: booking.customerEmail,
        customerPhone: booking.customerPhone,
        status: booking.status,
        source: booking.source,
        startTime: booking.startTime.toISOString(),
        endTime: booking.endTime.toISOString(),
        totalDurationMinutes: booking.totalDurationMinutes,
        services: booking.serviceDetails,
        priceSummary: formatPriceSummary(booking.serviceDetails),
        paymentLabel: "Pay in shop.",
        canCancel: isConfirmed,
        canReschedule: isConfirmed,
    };
}

function serializeAvailability(availability: ReturnType<typeof getAvailableSlots>) {
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

function asNonEmptyString(value: unknown, message: string) {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new CustomerBookingRequestError(400, message);
    }

    return value.trim();
}

function optionalString(value: unknown) {
    if (typeof value !== "string" || value.trim().length === 0) {
        return undefined;
    }

    return value.trim();
}

function asLocalDate(value: unknown, message: string) {
    const date = asNonEmptyString(value, message);

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        throw new CustomerBookingRequestError(400, message);
    }

    return date;
}

function parseDate(value: unknown, message: string) {
    const raw = asNonEmptyString(value, message);
    const parsed = new Date(raw);

    if (Number.isNaN(parsed.getTime())) {
        throw new CustomerBookingRequestError(400, message);
    }

    return parsed;
}

function firstNameFromCustomerName(customerName: string) {
    return customerName.trim().split(/\s+/)[0] || "Customer";
}

function lastNameFromCustomerName(customerName: string) {
    const parts = customerName.trim().split(/\s+/);
    return parts.length > 1 ? parts.slice(1).join(" ") : "Customer";
}

function nextLocalDate(localDate: string) {
    const [year, month, day] = localDate.split("-").map(Number);
    return getLocalDate(new Date(Date.UTC(year, month - 1, day + 1)), "UTC");
}

function unavailableSlotError() {
    return new CustomerBookingRequestError(409, "The requested appointment slot is not available.");
}

function invalidLinkError() {
    return new CustomerBookingLinkError();
}

async function dispatchLifecycleNotification(
    dispatcher: BookingLifecycleNotificationDispatcher | undefined,
    input: Parameters<BookingLifecycleNotificationDispatcher>[0],
) {
    try {
        await (dispatcher ?? dispatchBookingNotificationSafely)(input);
    } catch (error) {
        console.error("[notifications] customer booking dispatch failed", error);
    }
}
