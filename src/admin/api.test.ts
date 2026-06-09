import { afterEach, describe, expect, test, vi } from "vitest";

import {
    ADMIN_AUTH_EXPIRED_EVENT,
    AdminApiError,
    acceptAdminInvite,
    completeAdminBooking,
    fetchAdminCalendarOptions,
    fetchAdminDashboard,
    fetchAdminSession,
    requestAdminPasswordReset,
    resetAdminPassword,
    loginAdmin,
} from "./api";

function jsonResponse(status: number, body: Record<string, unknown>) {
    return new Response(JSON.stringify(body), {
        status,
        headers: {
            "Content-Type": "application/json",
        },
    });
}

describe("admin api client", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    test("sends admin requests with same-origin credentials", async () => {
        const fetchMock = vi.fn(async () =>
            jsonResponse(200, {
                locations: [],
                barbers: [],
                services: [],
            }),
        );
        vi.stubGlobal("fetch", fetchMock);

        await fetchAdminCalendarOptions();

        expect(fetchMock).toHaveBeenCalledWith(
            "/api/admin/calendar/options",
            expect.objectContaining({
                credentials: "same-origin",
            }),
        );
    });

    test("dispatches an auth-expired event for protected admin 401s", async () => {
        const dispatchEvent = vi.fn();
        const fetchMock = vi.fn(async () => jsonResponse(401, { message: "Authentication required." }));

        vi.stubGlobal("fetch", fetchMock);
        vi.stubGlobal("window", { dispatchEvent });

        await expect(fetchAdminCalendarOptions()).rejects.toBeInstanceOf(AdminApiError);
        await expect(fetchAdminCalendarOptions()).rejects.toMatchObject({
            status: 401,
            message: "Authentication required.",
        });

        expect(dispatchEvent).toHaveBeenCalledWith(
            expect.objectContaining({
                type: ADMIN_AUTH_EXPIRED_EVENT,
            }),
        );
    });

    test("does not treat session checks or invalid login attempts as active-workspace expiry", async () => {
        const dispatchEvent = vi.fn();
        const fetchMock = vi.fn(async () => jsonResponse(401, { message: "Authentication required." }));

        vi.stubGlobal("fetch", fetchMock);
        vi.stubGlobal("window", { dispatchEvent });

        await expect(fetchAdminSession()).rejects.toMatchObject({ status: 401 });
        await expect(loginAdmin("owner@example.com", "wrong-password")).rejects.toMatchObject({
            status: 401,
        });

        expect(dispatchEvent).not.toHaveBeenCalled();
    });

    test("calls account recovery endpoints without triggering active-workspace expiry", async () => {
        const dispatchEvent = vi.fn();
        const fetchMock = vi.fn(async () => jsonResponse(200, { message: "ok", user: { id: "user-1" } }));

        vi.stubGlobal("fetch", fetchMock);
        vi.stubGlobal("window", { dispatchEvent });

        await requestAdminPasswordReset("owner@example.com");
        await resetAdminPassword("reset-token", "new-password");
        await acceptAdminInvite("invite-token", "setup-password");

        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            "/api/admin/auth/forgot-password",
            expect.objectContaining({
                method: "POST",
                credentials: "same-origin",
                body: JSON.stringify({ email: "owner@example.com" }),
            }),
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            "/api/admin/auth/reset-password",
            expect.objectContaining({
                method: "POST",
                credentials: "same-origin",
                body: JSON.stringify({ token: "reset-token", password: "new-password" }),
            }),
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            3,
            "/api/admin/auth/accept-invite",
            expect.objectContaining({
                method: "POST",
                credentials: "same-origin",
                body: JSON.stringify({ token: "invite-token", password: "setup-password" }),
            }),
        );
        expect(dispatchEvent).not.toHaveBeenCalled();
    });

    test("serializes dashboard period filters and completion mutations", async () => {
        const fetchMock = vi.fn(async () =>
            jsonResponse(200, {
                generatedAt: "2026-06-09T14:00:00.000Z",
                todayBookings: [],
                upcomingBookings: [],
                activity: [],
                notificationDeliveryMode: "mock",
                upcomingReminders: [],
                revenue: {
                    period: "month",
                    anchorDate: "2026-06-09",
                    periodStart: "2026-06-01",
                    periodEnd: "2026-06-30",
                    bucketGranularity: "day",
                    totalCents: 0,
                    appointmentCount: 0,
                    completedAppointmentCount: 0,
                    pastConfirmedAppointmentCount: 0,
                    pricedAppointmentCount: 0,
                    unpricedAppointmentCount: 0,
                    fromPriceAppointmentCount: 0,
                    averageRevenueCents: 0,
                    series: [],
                },
                upcomingAppointments: { confirmedCount: 0, cancelledCount: 0, dailySeries: [] },
                notificationHealth: {
                    sentCount: 0,
                    scheduledCount: 0,
                    skippedCount: 0,
                    failedActiveCount: 0,
                    failedHistoricalCount: 0,
                    deliverySuccessRate: 0,
                    reminderQueueCount: 0,
                    reminderScheduler: {
                        state: "unknown",
                        latestRunAt: null,
                        latestStatus: null,
                        lastSuccessAt: null,
                        lastFailureAt: null,
                        minutesSinceLastSuccess: null,
                        staleAfterMinutes: 90,
                        trigger: null,
                        durationMs: null,
                        errorMessage: null,
                        latestResult: null,
                        message: "No reminder scheduler runs recorded yet.",
                    },
                },
                booking: { id: "booking-a", status: "completed" },
            }),
        );
        vi.stubGlobal("fetch", fetchMock);

        await fetchAdminDashboard({ period: "month", anchorDate: "2026-06-09" });
        await completeAdminBooking("booking-a");

        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            "/api/admin/dashboard?period=month&anchorDate=2026-06-09",
            expect.objectContaining({
                credentials: "same-origin",
            }),
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            "/api/admin/bookings/booking-a/complete",
            expect.objectContaining({
                method: "POST",
                credentials: "same-origin",
            }),
        );
    });
});
