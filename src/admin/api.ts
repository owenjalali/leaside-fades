import { buildAdminBookingQuery, buildAdminScheduleQuery } from "./admin-utils";
import type {
    AdminAvailability,
    AdminBookingDetail,
    AdminBookingFilters,
    AdminBookingSummary,
    AdminCalendarOptions,
    AdminDashboardSnapshot,
    AdminSchedule,
    AdminScheduleFilters,
    AdminSessionResponse,
} from "./types";

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
        throw new Error(typeof payload.message === "string" ? payload.message : "Admin service is unavailable.");
    }

    return payload as T;
}

export function loginAdmin(email: string, password: string) {
    return requestJson<AdminSessionResponse>("/api/admin/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
    });
}

export async function logoutAdmin() {
    await fetch("/api/admin/auth/logout", { method: "POST" });
}

export function fetchAdminSession() {
    return requestJson<AdminSessionResponse>("/api/admin/auth/session");
}

export function fetchAdminCalendarOptions() {
    return requestJson<AdminCalendarOptions>("/api/admin/calendar/options");
}

export function fetchAdminBookings(filters: AdminBookingFilters) {
    const query = buildAdminBookingQuery(filters);
    return requestJson<{ bookings: AdminBookingSummary[] }>(
        `/api/admin/bookings${query ? `?${query}` : ""}`,
    );
}

export function fetchAdminDashboard() {
    return requestJson<AdminDashboardSnapshot>("/api/admin/dashboard");
}

export function fetchAdminBookingDetail(bookingId: string) {
    return requestJson<{ booking: AdminBookingDetail }>(`/api/admin/bookings/${bookingId}`);
}

export function fetchAdminAvailability(input: {
    locationId: string;
    serviceIds: string[];
    date: string;
    barberId?: string;
}) {
    const params = new URLSearchParams({
        locationId: input.locationId,
        serviceIds: input.serviceIds.join(","),
        date: input.date,
    });

    if (input.barberId) {
        params.set("barberId", input.barberId);
    }

    return requestJson<AdminAvailability>(`/api/admin/availability?${params.toString()}`);
}

export function createManualBooking(input: Record<string, unknown>) {
    return requestJson<{ booking: AdminBookingDetail }>("/api/admin/bookings", {
        method: "POST",
        body: JSON.stringify(input),
    });
}

export function createWalkInBooking(input: Record<string, unknown>) {
    return requestJson<{ booking: AdminBookingDetail }>("/api/admin/bookings/walk-in", {
        method: "POST",
        body: JSON.stringify(input),
    });
}

export function cancelAdminBooking(bookingId: string) {
    return requestJson<{ booking: AdminBookingSummary }>(`/api/admin/bookings/${bookingId}/cancel`, {
        method: "POST",
    });
}

export function markAdminBookingNoShow(bookingId: string) {
    return requestJson<{ booking: AdminBookingSummary }>(`/api/admin/bookings/${bookingId}/no-show`, {
        method: "POST",
    });
}

export function rescheduleAdminBooking(bookingId: string, input: Record<string, unknown>) {
    return requestJson<{ booking: AdminBookingSummary }>(
        `/api/admin/bookings/${bookingId}/reschedule`,
        {
            method: "POST",
            body: JSON.stringify(input),
        },
    );
}

export function fetchAdminSchedule(filters: AdminScheduleFilters = {}) {
    const query = buildAdminScheduleQuery(filters);
    return requestJson<AdminSchedule>(`/api/admin/schedule${query ? `?${query}` : ""}`);
}

export function createAdminShift(input: Record<string, unknown>) {
    return requestJson<{ shift: AdminSchedule["shifts"][number] }>("/api/admin/schedule/shifts", {
        method: "POST",
        body: JSON.stringify(input),
    });
}

export function updateAdminShift(shiftId: string, input: Record<string, unknown>) {
    return requestJson<{ shift: AdminSchedule["shifts"][number] }>(`/api/admin/schedule/shifts/${shiftId}`, {
        method: "POST",
        body: JSON.stringify(input),
    });
}

export function deactivateAdminShift(shiftId: string) {
    return requestJson<{ shift: AdminSchedule["shifts"][number] }>(
        `/api/admin/schedule/shifts/${shiftId}/deactivate`,
        { method: "POST" },
    );
}

export function createAdminShiftOverride(input: Record<string, unknown>) {
    return requestJson<{ shiftOverride: AdminSchedule["shiftOverrides"][number] }>(
        "/api/admin/schedule/shift-overrides",
        {
            method: "POST",
            body: JSON.stringify(input),
        },
    );
}

export function updateAdminShiftOverride(overrideId: string, input: Record<string, unknown>) {
    return requestJson<{ shiftOverride: AdminSchedule["shiftOverrides"][number] }>(
        `/api/admin/schedule/shift-overrides/${overrideId}`,
        {
            method: "POST",
            body: JSON.stringify(input),
        },
    );
}

export function deleteAdminShiftOverride(overrideId: string) {
    return requestJson<{ deleted: true }>(`/api/admin/schedule/shift-overrides/${overrideId}/delete`, {
        method: "POST",
    });
}

export function createAdminBlockedTime(input: Record<string, unknown>) {
    return requestJson<{ blockedTime: AdminSchedule["blockedTimes"][number] }>(
        "/api/admin/schedule/blocked-times",
        {
            method: "POST",
            body: JSON.stringify(input),
        },
    );
}

export function updateAdminBlockedTime(blockedTimeId: string, input: Record<string, unknown>) {
    return requestJson<{ blockedTime: AdminSchedule["blockedTimes"][number] }>(
        `/api/admin/schedule/blocked-times/${blockedTimeId}`,
        {
            method: "POST",
            body: JSON.stringify(input),
        },
    );
}

export function deleteAdminBlockedTime(blockedTimeId: string) {
    return requestJson<{ deleted: true }>(`/api/admin/schedule/blocked-times/${blockedTimeId}/delete`, {
        method: "POST",
    });
}
