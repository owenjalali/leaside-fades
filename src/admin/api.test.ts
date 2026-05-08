import { afterEach, describe, expect, test, vi } from "vitest";

import {
    ADMIN_AUTH_EXPIRED_EVENT,
    AdminApiError,
    fetchAdminCalendarOptions,
    fetchAdminSession,
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
});
