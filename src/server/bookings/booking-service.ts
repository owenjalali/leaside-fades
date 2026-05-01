import { getAvailableSlots, type AvailableSlot, type AvailabilityData } from "../availability/index.ts";
import { addMinutes, getLocalDate, localDateTimeToUtc } from "../availability/time.ts";
import {
    BookingCreationError,
    type BookingRepository,
    type BookingManagementTokens,
    type BookingServiceSnapshot,
    type CreateBookingRequest,
    type CreateBookingResult,
} from "./types.ts";
import {
    generateBookingManagementToken,
    hashBookingManagementToken,
} from "./tokens.ts";

const DEFAULT_TIME_ZONE = "America/Toronto";

export async function createBooking(
    request: CreateBookingRequest,
    repository: BookingRepository,
): Promise<CreateBookingResult> {
    try {
        return await repository.withTransaction(async (transaction) =>
            createBookingInTransaction(request, transaction),
        );
    } catch (error) {
        if (error instanceof BookingCreationError) {
            throw error;
        }

        if (isDatabaseConflictError(error)) {
            throw unavailableSlotError();
        }

        throw error;
    }
}

async function createBookingInTransaction(
    request: CreateBookingRequest,
    transaction: BookingRepository,
) {
    validateRequestShape(request);

    const timeZone = request.timeZone ?? DEFAULT_TIME_ZONE;
    const localDate = getLocalDate(request.startTime, timeZone);
    const availabilityData = await transaction.loadAvailabilityData(request, localDate);
    const availability = getAvailabilityOrThrow(request, availabilityData, localDate, timeZone);
    const requestedSlot = await selectRequestedSlot({
        request,
        availabilityData,
        slots: availability.barberSlots.flatMap((barberSlot) => barberSlot.slots),
        transaction,
        localDate,
        timeZone,
    });

    await assertSlotStillOpen(transaction, requestedSlot, request.excludeBookingId);

    const snapshots = await transaction.loadServiceSnapshots(request.serviceIds);
    assertSnapshotCoverage(request.serviceIds, snapshots);
    const source = request.source ?? "public";
    const customerManagementTokens = maybeCreateCustomerManagementTokens(request, source);

    const customer = await transaction.createCustomer(request.customer);
    const booking = await transaction.insertBooking({
        customerId: customer.id,
        barberId: requestedSlot.barberId,
        locationId: requestedSlot.locationId,
        status: "confirmed",
        source,
        startTime: requestedSlot.startTime,
        endTime: requestedSlot.endTime,
        totalDurationMinutes: requestedSlot.totalDurationMinutes,
        customerNotes: request.customerNotes ?? null,
        internalNotes: request.internalNotes ?? null,
        cancellationTokenHash: customerManagementTokens
            ? hashBookingManagementToken(customerManagementTokens.cancellationToken)
            : null,
        rescheduleTokenHash: customerManagementTokens
            ? hashBookingManagementToken(customerManagementTokens.rescheduleToken)
            : null,
    });

    await transaction.insertBookingServices(booking.id, snapshots);

    return {
        booking,
        bookingServices: snapshots,
        customerManagementTokens,
    };
}

function maybeCreateCustomerManagementTokens(
    request: CreateBookingRequest,
    source: CreateBookingRequest["source"],
): BookingManagementTokens | undefined {
    if (source === "walk_in") {
        return undefined;
    }

    const shouldGenerate = request.generateCustomerManagementTokens ?? source === "public";

    if (!shouldGenerate) {
        return undefined;
    }

    return {
        cancellationToken: generateBookingManagementToken(),
        rescheduleToken: generateBookingManagementToken(),
    };
}

function validateRequestShape(request: CreateBookingRequest) {
    const source = request.source ?? "public";

    if (!request.locationId) {
        throw new BookingCreationError("INVALID_REQUEST", "Location is required.");
    }

    if (request.serviceIds.length === 0) {
        throw new BookingCreationError("INVALID_REQUEST", "At least one service is required.");
    }

    if (!(request.startTime instanceof Date) || Number.isNaN(request.startTime.getTime())) {
        throw new BookingCreationError("INVALID_REQUEST", "A valid appointment start time is required.");
    }

    if (!request.customer.firstName || (source === "public" && !request.customer.lastName)) {
        throw new BookingCreationError("INVALID_REQUEST", "Customer first and last name are required.");
    }

    if (source === "public" && (!request.customer.phoneE164 || !request.customer.email)) {
        throw new BookingCreationError("INVALID_REQUEST", "Customer phone and email are required.");
    }
}

function getAvailabilityOrThrow(
    request: CreateBookingRequest,
    data: AvailabilityData,
    localDate: string,
    timeZone: string,
) {
    try {
        return getAvailableSlots(
            {
                locationId: request.locationId,
                serviceIds: request.serviceIds,
                date: localDate,
                barberId: request.barberId,
                minimumNoticeMinutes: request.minimumNoticeMinutes,
                now: request.now,
                timeZone,
            },
            data,
        );
    } catch (error) {
        throw new BookingCreationError(
            "INVALID_REQUEST",
            error instanceof Error ? error.message : "Booking request is invalid.",
        );
    }
}

async function selectRequestedSlot({
    request,
    availabilityData,
    slots,
    transaction,
    localDate,
    timeZone,
}: {
    request: CreateBookingRequest;
    availabilityData: AvailabilityData;
    slots: AvailableSlot[];
    transaction: BookingRepository;
    localDate: string;
    timeZone: string;
}) {
    const requestedStartMs = request.startTime.getTime();
    const validSlots = slots.filter(
        (slot) =>
            slot.locationId === request.locationId &&
            slot.startTime.getTime() === requestedStartMs &&
            (!request.barberId || slot.barberId === request.barberId),
    );

    if (validSlots.length === 0) {
        throw unavailableSlotError();
    }

    if (request.barberId) {
        return validSlots[0];
    }

    const barberIds = validSlots.map((slot) => slot.barberId);
    const bookingCounts = await transaction.countConfirmedBookingsByBarber(
        barberIds,
        localDateTimeToUtc(localDate, "00:00", timeZone),
        localDateTimeToUtc(nextLocalDate(localDate), "00:00", timeZone),
    );

    return validSlots.sort((a, b) => {
        const barberA = availabilityData.barbers.find((barber) => barber.id === a.barberId);
        const barberB = availabilityData.barbers.find((barber) => barber.id === b.barberId);

        return (
            (barberA?.sortOrder ?? 0) - (barberB?.sortOrder ?? 0) ||
            (bookingCounts[a.barberId] ?? 0) - (bookingCounts[b.barberId] ?? 0) ||
            a.barberId.localeCompare(b.barberId)
        );
    })[0];
}

async function assertSlotStillOpen(
    transaction: BookingRepository,
    slot: AvailableSlot,
    excludeBookingId?: string,
) {
    const hasBookingOverlap = await transaction.hasConfirmedBookingOverlap(
        slot.barberId,
        slot.startTime,
        slot.endTime,
        excludeBookingId,
    );
    const hasBlockedOverlap = await transaction.hasBlockedTimeOverlap(
        slot.barberId,
        slot.locationId,
        slot.startTime,
        slot.endTime,
    );

    if (hasBookingOverlap || hasBlockedOverlap) {
        throw unavailableSlotError();
    }
}

function assertSnapshotCoverage(
    serviceIds: string[],
    snapshots: BookingServiceSnapshot[],
) {
    if (snapshots.length !== serviceIds.length) {
        throw new BookingCreationError(
            "INVALID_REQUEST",
            "Every selected service must have a booking snapshot.",
        );
    }
}

function unavailableSlotError() {
    return new BookingCreationError(
        "UNAVAILABLE_SLOT",
        "The requested appointment slot is not available.",
    );
}

function isDatabaseConflictError(error: unknown) {
    if (!error || typeof error !== "object") {
        return false;
    }

    const code = "code" in error ? (error as { code?: unknown }).code : undefined;
    return code === "23P01" || code === "23505";
}

function nextLocalDate(localDate: string) {
    const [year, month, day] = localDate.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return getLocalDate(addMinutes(date, 24 * 60), "UTC");
}
