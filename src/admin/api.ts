import { buildAdminBookingQuery, buildAdminScheduleQuery, type WeeklyScheduleSaveOperation } from "./admin-utils";
import type {
    AdminAvailability,
    AdminBookingDetail,
    AdminBookingEditPayload,
    AdminBookingFilters,
    AdminBookingSummary,
    AdminCalendarOptions,
    AdminDashboardPeriod,
    AdminDashboardSnapshot,
    AdminDayShiftReplacePayload,
    AdminSchedule,
    AdminScheduleFilters,
    AdminSessionResponse,
    AdminTeamBarber,
    AdminTeamBarberCreatePayload,
    AdminTeamProfileImageUpload,
    AdminWeeklyScheduleBatchResult,
    SafeAdminUser,
} from "./types";

export const ADMIN_AUTH_EXPIRED_EVENT = "leaside-admin-auth-expired";

export class AdminApiError extends Error {
    readonly status: number;

    constructor(message: string, status: number) {
        super(message);
        this.name = "AdminApiError";
        this.status = status;
    }
}

async function requestJson<T>(url: string, options?: RequestInit): Promise<T> {
    const response = await fetch(url, {
        ...options,
        credentials: "same-origin",
        headers: {
            "Content-Type": "application/json",
            ...options?.headers,
        },
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
        const message = typeof payload.message === "string" ? payload.message : "Admin service is unavailable.";
        if (response.status === 401 && shouldNotifyAuthExpired(url)) {
            notifyAdminAuthExpired(message);
        }

        throw new AdminApiError(message, response.status);
    }

    return payload as T;
}

export function loginAdmin(email: string, password: string) {
    return requestJson<AdminSessionResponse>("/api/admin/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
    });
}

export function requestAdminPasswordReset(email: string) {
    return requestJson<{ message: string }>("/api/admin/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
    });
}

export function resetAdminPassword(token: string, password: string) {
    return requestJson<AdminSessionResponse>("/api/admin/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
    });
}

export function acceptAdminInvite(token: string, password: string) {
    return requestJson<AdminSessionResponse>("/api/admin/auth/accept-invite", {
        method: "POST",
        body: JSON.stringify({ token, password }),
    });
}

export async function logoutAdmin() {
    await fetch("/api/admin/auth/logout", { method: "POST", credentials: "same-origin" });
}

export function fetchAdminSession() {
    return requestJson<AdminSessionResponse>("/api/admin/auth/session");
}

export function fetchAdminCalendarOptions() {
    return requestJson<AdminCalendarOptions>("/api/admin/calendar/options");
}

export function fetchAdminTeamBarbers() {
    return requestJson<{ barbers: AdminTeamBarber[] }>("/api/admin/team/barbers");
}

export async function uploadAdminBarberProfileImage(file: File) {
    const params = new URLSearchParams({ filename: file.name || "profile-image" });
    const response = await fetch(`/api/admin/team/profile-image?${params.toString()}`, {
        method: "POST",
        credentials: "same-origin",
        headers: {
            "Content-Type": file.type,
        },
        body: file,
    });
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
        const message = typeof payload.message === "string" ? payload.message : "Profile image upload failed.";
        if (response.status === 401) {
            notifyAdminAuthExpired(message);
        }

        throw new AdminApiError(message, response.status);
    }

    return payload as AdminTeamProfileImageUpload;
}

export function createAdminTeamBarber(input: AdminTeamBarberCreatePayload) {
    return requestJson<{ barber: AdminTeamBarber; user: SafeAdminUser }>("/api/admin/team/barbers", {
        method: "POST",
        body: JSON.stringify(input),
    });
}

export function deactivateAdminTeamBarber(barberId: string) {
    return requestJson<{ barberId: string; deactivatedUserIds: string[] }>(
        `/api/admin/team/barbers/${barberId}/deactivate`,
        { method: "POST" },
    );
}

export function fetchAdminBookings(filters: AdminBookingFilters) {
    const query = buildAdminBookingQuery(filters);
    return requestJson<{ bookings: AdminBookingSummary[] }>(
        `/api/admin/bookings${query ? `?${query}` : ""}`,
    );
}

export function fetchAdminDashboard(input: { period?: AdminDashboardPeriod; anchorDate?: string } = {}) {
    const params = new URLSearchParams();

    if (input.period) {
        params.set("period", input.period);
    }

    if (input.anchorDate) {
        params.set("anchorDate", input.anchorDate);
    }

    const query = params.toString();
    return requestJson<AdminDashboardSnapshot>(`/api/admin/dashboard${query ? `?${query}` : ""}`);
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

export function completeAdminBooking(bookingId: string) {
    return requestJson<{ booking: AdminBookingSummary }>(`/api/admin/bookings/${bookingId}/complete`, {
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

export function editAdminBooking(bookingId: string, input: AdminBookingEditPayload) {
    return requestJson<{ booking: AdminBookingDetail }>(`/api/admin/bookings/${bookingId}/edit`, {
        method: "POST",
        body: JSON.stringify(input),
    });
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

export function applyWeeklyScheduleBatch(operations: WeeklyScheduleSaveOperation[]) {
    return requestJson<AdminWeeklyScheduleBatchResult>("/api/admin/schedule/weekly-batch", {
        method: "POST",
        body: JSON.stringify({ operations }),
    });
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

export function replaceAdminDayShift(input: AdminDayShiftReplacePayload) {
    return requestJson<{ dayShift: AdminDayShiftReplacePayload & { shiftOverrides: AdminSchedule["shiftOverrides"] } }>(
        "/api/admin/schedule/day-shifts",
        {
            method: "POST",
            body: JSON.stringify(input),
        },
    );
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

function shouldNotifyAuthExpired(url: string) {
    return (
        !url.includes("/api/admin/auth/login") &&
        !url.includes("/api/admin/auth/session") &&
        !url.includes("/api/admin/auth/forgot-password") &&
        !url.includes("/api/admin/auth/reset-password") &&
        !url.includes("/api/admin/auth/accept-invite")
    );
}

function notifyAdminAuthExpired(message: string) {
    if (typeof window === "undefined") return;

    const event =
        typeof CustomEvent === "function"
            ? new CustomEvent(ADMIN_AUTH_EXPIRED_EVENT, { detail: { message } })
            : new Event(ADMIN_AUTH_EXPIRED_EVENT);
    window.dispatchEvent(event);
}
