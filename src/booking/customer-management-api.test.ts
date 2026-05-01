import { afterEach, describe, expect, test, vi } from "vitest";

import {
    cancelCustomerBooking,
    fetchCustomerBooking,
    fetchCustomerRescheduleAvailability,
    rescheduleCustomerBooking,
} from "./customer-management-api";

describe("customer booking management API client", () => {
    afterEach(() => {
        vi.unstubAllGlobals();
    });

    test("fetches, cancels, checks availability, and reschedules by token", async () => {
        const fetchMock = vi.fn().mockResolvedValue({
            ok: true,
            json: async () => ({ booking: { id: "booking-1" }, barberSlots: [] }),
        });
        vi.stubGlobal("fetch", fetchMock);

        await fetchCustomerBooking("manage-token");
        await cancelCustomerBooking("manage-token");
        await fetchCustomerRescheduleAvailability({
            token: "manage-token",
            locationId: "location-a",
            barberId: "barber-a",
            date: "2026-05-04",
        });
        await rescheduleCustomerBooking("manage-token", {
            locationId: "location-a",
            barberId: "barber-a",
            startTime: "2026-05-04T14:00:00.000Z",
        });

        expect(fetchMock).toHaveBeenNthCalledWith(
            1,
            "/api/booking/manage/manage-token",
            expect.objectContaining({ headers: expect.any(Object) }),
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            2,
            "/api/booking/manage/manage-token/cancel",
            expect.objectContaining({ method: "POST" }),
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            3,
            "/api/booking/manage/manage-token/availability?locationId=location-a&date=2026-05-04&barberId=barber-a",
            expect.objectContaining({ headers: expect.any(Object) }),
        );
        expect(fetchMock).toHaveBeenNthCalledWith(
            4,
            "/api/booking/manage/manage-token/reschedule",
            expect.objectContaining({
                method: "POST",
                body: JSON.stringify({
                    locationId: "location-a",
                    barberId: "barber-a",
                    startTime: "2026-05-04T14:00:00.000Z",
                }),
            }),
        );
    });
});
