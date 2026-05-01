import type {
    CustomerManagedBooking,
    CustomerRescheduleAvailability,
} from "./customer-management-types";

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
            typeof payload.message === "string" ? payload.message : "Booking link is unavailable.",
        );
    }

    return payload as T;
}

export async function fetchCustomerBooking(token: string) {
    const payload = await requestJson<{ booking: CustomerManagedBooking }>(
        `/api/booking/manage/${encodeURIComponent(token)}`,
    );
    return payload.booking;
}

export async function cancelCustomerBooking(token: string) {
    const payload = await requestJson<{ booking: CustomerManagedBooking }>(
        `/api/booking/manage/${encodeURIComponent(token)}/cancel`,
        { method: "POST" },
    );
    return payload.booking;
}

export function fetchCustomerRescheduleAvailability(input: {
    token: string;
    locationId: string;
    date: string;
    barberId?: string;
}) {
    const params = new URLSearchParams({
        locationId: input.locationId,
        date: input.date,
    });

    if (input.barberId) {
        params.set("barberId", input.barberId);
    }

    return requestJson<CustomerRescheduleAvailability>(
        `/api/booking/manage/${encodeURIComponent(input.token)}/availability?${params.toString()}`,
    );
}

export async function rescheduleCustomerBooking(
    token: string,
    input: {
        locationId: string;
        startTime: string;
        barberId?: string;
    },
) {
    const payload = await requestJson<{ booking: CustomerManagedBooking }>(
        `/api/booking/manage/${encodeURIComponent(token)}/reschedule`,
        {
            method: "POST",
            body: JSON.stringify(input),
        },
    );
    return payload.booking;
}
