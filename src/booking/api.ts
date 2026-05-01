import type {
    BookingAvailability,
    BookingCatalog,
    BookingConfirmation,
    CustomerDetails,
} from "./types";
import { formatPhoneForSubmit } from "./booking-utils";

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(url, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...options?.headers,
        },
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
        throw new Error(
            typeof payload.message === "string" ? payload.message : "Booking service is unavailable.",
        );
    }

    return payload as T;
}

export function fetchBookingCatalog() {
    return requestJson<BookingCatalog>("/api/booking/catalog");
}

export function fetchBookingAvailability({
    locationId,
    serviceIds,
    date,
    barberId,
}: {
    locationId: string;
    serviceIds: string[];
    date: string;
    barberId?: string;
}) {
    const params = new URLSearchParams({
        locationId,
        serviceIds: serviceIds.join(","),
        date,
    });

    if (barberId) {
        params.set("barberId", barberId);
    }

    return requestJson<BookingAvailability>(`/api/booking/availability?${params.toString()}`);
}

export function submitPublicBooking({
    locationId,
    serviceIds,
    barberId,
    startTime,
    customer,
}: {
    locationId: string;
    serviceIds: string[];
    barberId?: string;
    startTime: string;
    customer: CustomerDetails;
}) {
    return requestJson<BookingConfirmation>("/api/booking/bookings", {
        method: "POST",
        body: JSON.stringify({
            locationId,
            serviceIds,
            barberId,
            startTime,
            customer: {
                firstName: customer.firstName,
                lastName: customer.lastName,
                phone: formatPhoneForSubmit(customer),
                email: customer.email,
                notes: customer.notes,
            },
            customerNotes: customer.notes,
        }),
    });
}
