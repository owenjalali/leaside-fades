import { getAvailableSlots, type AvailabilityData } from "../availability/index.ts";
import { BookingCreationError, createBooking, type BookingRepository } from "../bookings/index.ts";
import {
    dispatchBookingNotificationSafely,
    type BookingLifecycleNotificationDispatcher,
} from "../notifications/index.ts";
import { formatPriceSummary } from "./repository.ts";

const DEFAULT_TIME_ZONE = "America/Toronto";
const EMPTY_AVAILABILITY_MESSAGE = "No available times for this date. Try another date or barber.";
const ISO_DATE_TIME_WITH_ZONE_PATTERN =
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;

export interface PublicAvailabilityLookupRequest {
    locationId: string;
    serviceIds: string[];
    date: string;
    barberId?: string;
    now?: Date;
    timeZone?: string;
}

export interface AvailabilityLookupRepository {
    loadAvailabilityData(
        request: PublicAvailabilityLookupRequest,
        localDate: string,
    ): Promise<AvailabilityData>;
}

export interface PublicBookingPayload {
    locationId?: unknown;
    serviceIds?: unknown;
    barberId?: unknown;
    startTime?: unknown;
    customer?: {
        firstName?: unknown;
        lastName?: unknown;
        phone?: unknown;
        phoneE164?: unknown;
        email?: unknown;
        notes?: unknown;
    };
    customerNotes?: unknown;
}

export class PublicBookingRequestError extends Error {
    readonly status: number;

    constructor(message: string, status = 400) {
        super(message);
        this.name = "PublicBookingRequestError";
        this.status = status;
    }
}

interface PublicBookingOptions {
    notificationDispatcher?: BookingLifecycleNotificationDispatcher;
}

export async function getPublicAvailability(
    request: PublicAvailabilityLookupRequest,
    repository: AvailabilityLookupRepository,
) {
    validateAvailabilityRequest(request);

    const timeZone = request.timeZone ?? DEFAULT_TIME_ZONE;
    const availabilityData = await repository.loadAvailabilityData(request, request.date);
    const availability = getAvailableSlots(
        {
            locationId: request.locationId,
            serviceIds: request.serviceIds,
            date: request.date,
            barberId: request.barberId,
            now: request.now,
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
        emptyMessage: barberSlots.length === 0 ? EMPTY_AVAILABILITY_MESSAGE : undefined,
    };
}

export async function createPublicBooking(
    payload: PublicBookingPayload,
    repository: BookingRepository,
    options: PublicBookingOptions = {},
) {
    const request = buildCreateBookingRequest(payload);

    try {
        const result = await createBooking(request, repository);
        const response = {
            id: result.booking.id,
            locationId: result.booking.locationId,
            barberId: result.booking.barberId,
            startTime: result.booking.startTime.toISOString(),
            endTime: result.booking.endTime.toISOString(),
            totalDurationMinutes: result.booking.totalDurationMinutes,
            services: result.bookingServices,
            priceSummary: formatPriceSummary(result.bookingServices),
            paymentLabel: "Pay in shop.",
            customer: request.customer,
            cancelUrl: result.customerManagementTokens
                ? `/booking/${result.customerManagementTokens.cancellationToken}/cancel`
                : undefined,
            rescheduleUrl: result.customerManagementTokens
                ? `/booking/${result.customerManagementTokens.rescheduleToken}/reschedule`
                : undefined,
        };

        await dispatchLifecycleNotification(options.notificationDispatcher, {
            eventType: "booking_confirmation",
            bookingId: result.booking.id,
            managementUrls: {
                cancelUrl: response.cancelUrl,
                rescheduleUrl: response.rescheduleUrl,
            },
        });

        return response;
    } catch (error) {
        if (error instanceof BookingCreationError) {
            throw new PublicBookingRequestError(
                error.message,
                error.code === "UNAVAILABLE_SLOT" ? 409 : 400,
            );
        }

        throw error;
    }
}

async function dispatchLifecycleNotification(
    dispatcher: BookingLifecycleNotificationDispatcher | undefined,
    input: Parameters<BookingLifecycleNotificationDispatcher>[0],
) {
    try {
        await (dispatcher ?? dispatchBookingNotificationSafely)(input);
    } catch (error) {
        console.error("[notifications] public booking dispatch failed", error);
    }
}

function buildCreateBookingRequest(payload: PublicBookingPayload) {
    const locationId = asNonEmptyString(payload.locationId, "Location is required.");
    const serviceIds = asStringArray(payload.serviceIds, "At least one service is required.");
    const barberId = optionalString(payload.barberId);
    const startTime = parseStartTime(payload.startTime);
    const customer = payload.customer ?? {};
    const firstName = asNonEmptyString(
        customer.firstName,
        "Customer first and last name are required.",
    );
    const lastName = asNonEmptyString(
        customer.lastName,
        "Customer first and last name are required.",
    );
    const email = normalizeEmail(customer.email);
    const phoneE164 = normalizePhone(customer.phoneE164 ?? customer.phone);
    const notes = optionalString(customer.notes);
    const customerNotes = optionalString(payload.customerNotes) ?? notes ?? null;

    return {
        locationId,
        serviceIds,
        barberId,
        startTime,
        customer: {
            firstName,
            lastName,
            phoneE164,
            email,
            notes: notes ?? null,
        },
        customerNotes,
        timeZone: DEFAULT_TIME_ZONE,
    };
}

function validateAvailabilityRequest(request: PublicAvailabilityLookupRequest) {
    asNonEmptyString(request.locationId, "Location is required.");
    asStringArray(request.serviceIds, "At least one service is required.");

    if (!/^\d{4}-\d{2}-\d{2}$/.test(request.date)) {
        throw new PublicBookingRequestError("A valid local date is required.");
    }
}

function asNonEmptyString(value: unknown, message: string) {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new PublicBookingRequestError(message);
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
        throw new PublicBookingRequestError(message);
    }

    const strings = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);

    if (strings.length === 0) {
        throw new PublicBookingRequestError(message);
    }

    return strings.map((item) => item.trim());
}

function parseStartTime(value: unknown) {
    const raw = asNonEmptyString(value, "A valid appointment start time is required.");

    if (!ISO_DATE_TIME_WITH_ZONE_PATTERN.test(raw)) {
        throw new PublicBookingRequestError("A valid appointment start time is required.");
    }

    const date = new Date(raw);

    if (Number.isNaN(date.getTime())) {
        throw new PublicBookingRequestError("A valid appointment start time is required.");
    }

    return date;
}

function normalizeEmail(value: unknown) {
    const email = asNonEmptyString(value, "Customer phone and email are required.").toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new PublicBookingRequestError("A valid customer email is required.");
    }

    return email;
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

    throw new PublicBookingRequestError("A valid customer phone number is required.");
}
