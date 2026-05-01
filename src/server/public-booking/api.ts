import {
    createDrizzleBookingRepository,
    createDrizzleCustomerBookingManagementRepository,
    loadPublicBookingCatalog,
} from "./repository.ts";
import {
    createPublicBooking,
    getPublicAvailability,
    PublicBookingRequestError,
    type PublicAvailabilityLookupRequest,
    type PublicBookingPayload,
} from "./service.ts";
import {
    cancelCustomerManagedBooking,
    CustomerBookingLinkError,
    CustomerBookingRequestError,
    getCustomerManagedBooking,
    getCustomerRescheduleAvailability,
    rescheduleCustomerManagedBooking,
} from "./customer-management-service.ts";

export async function getPublicBookingCatalog() {
    return loadPublicBookingCatalog();
}

export async function getPublicBookingAvailability(query: Record<string, unknown>) {
    return getPublicAvailability(parseAvailabilityQuery(query), createDrizzleBookingRepository());
}

export async function createPublicBookingFromBody(body: PublicBookingPayload) {
    return createPublicBooking(body, createDrizzleBookingRepository());
}

export async function getCustomerManagedBookingFromToken(token: string) {
    return getCustomerManagedBooking(token, createDrizzleCustomerBookingManagementRepository());
}

export async function cancelCustomerManagedBookingFromToken(token: string) {
    return cancelCustomerManagedBooking(token, createDrizzleCustomerBookingManagementRepository());
}

export async function getCustomerManagedBookingAvailability(
    token: string,
    query: Record<string, unknown>,
) {
    return getCustomerRescheduleAvailability(
        token,
        {
            date: query.date,
            locationId: query.locationId,
            barberId:
                typeof query.barberId === "string" && query.barberId.trim()
                    ? query.barberId
                    : undefined,
        },
        createDrizzleCustomerBookingManagementRepository(),
    );
}

export async function rescheduleCustomerManagedBookingFromBody(
    token: string,
    body: Record<string, unknown>,
) {
    return rescheduleCustomerManagedBooking(
        token,
        {
            locationId: body.locationId,
            barberId:
                typeof body.barberId === "string" && body.barberId.trim()
                    ? body.barberId
                    : undefined,
            startTime: body.startTime,
        },
        createDrizzleCustomerBookingManagementRepository(),
    );
}

export function toPublicBookingHttpError(error: unknown) {
    if (
        error instanceof PublicBookingRequestError ||
        error instanceof CustomerBookingRequestError ||
        error instanceof CustomerBookingLinkError
    ) {
        return {
            status: error.status,
            body: {
                message: error.message,
            },
        };
    }

    return {
        status: 500,
        body: {
            message: "Booking service is currently unavailable.",
        },
    };
}

function parseAvailabilityQuery(query: Record<string, unknown>): PublicAvailabilityLookupRequest {
    const rawServiceIds = query.serviceIds;
    const serviceIds =
        typeof rawServiceIds === "string"
            ? rawServiceIds.split(",").map((serviceId) => serviceId.trim()).filter(Boolean)
            : Array.isArray(rawServiceIds)
              ? rawServiceIds.filter((serviceId): serviceId is string => typeof serviceId === "string")
              : [];

    return {
        locationId: typeof query.locationId === "string" ? query.locationId : "",
        serviceIds,
        date: typeof query.date === "string" ? query.date : "",
        barberId: typeof query.barberId === "string" && query.barberId.trim() ? query.barberId : undefined,
    };
}
