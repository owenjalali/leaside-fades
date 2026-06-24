import { describe, expect, test } from "vitest";

import {
    clearSlotIfUnavailable,
    formatPhoneForSubmit,
    formatPhoneNumber,
    getWeekDates,
    getStepFromPath,
    isCustomerDetailsComplete,
    resetBookingSelectionsForLocation,
    isValidEmail,
    summarizeConfirmationServices,
    summarizeSelectedServices,
} from "./booking-utils";
import type { BookingService, BookingSlot } from "./types";

const cut: BookingService = {
    id: "cut",
    categoryId: "men",
    slug: "mens-cut",
    name: "Men's Cut",
    durationMinutes: 30,
    priceCents: 3000,
    priceType: "fixed",
    displayPrice: "$30",
    description: null,
    sortOrder: 10,
    isFeatured: false,
};

const color: BookingService = {
    ...cut,
    id: "color",
    slug: "womens-color",
    name: "Women's Color",
    durationMinutes: 60,
    priceCents: 8000,
    priceType: "from",
    displayPrice: "from $80",
};

describe("booking wizard utilities", () => {
    test("maps /book routes to wizard steps", () => {
        expect(getStepFromPath("/book")).toBe("location");
        expect(getStepFromPath("/book/services")).toBe("services");
        expect(getStepFromPath("/book/confirm")).toBe("confirm");
        expect(getStepFromPath("/not-booking")).toBe("location");
    });

    test("summarizes selected service duration and pricing", () => {
        expect(summarizeSelectedServices([cut])).toEqual({
            totalDurationMinutes: 30,
            priceSummary: "$30",
        });

        expect(summarizeSelectedServices([cut, color])).toEqual({
            totalDurationMinutes: 90,
            priceSummary: "from $110",
        });
    });

    test("requires complete customer details", () => {
        expect(
            isCustomerDetailsComplete({
                firstName: "Ada",
                lastName: "Lovelace",
                phoneCountryCode: "+1",
                phone: "647-555-0199",
                email: "ada@example.com",
                notes: "",
            }),
        ).toBe(true);

        expect(
            isCustomerDetailsComplete({
                firstName: "Ada",
                lastName: "",
                phoneCountryCode: "+1",
                phone: "647-555-0199",
                email: "ada@example.com",
                notes: "",
            }),
        ).toBe(false);

        expect(
            isCustomerDetailsComplete({
                firstName: "Ada",
                lastName: "Lovelace",
                phoneCountryCode: "+1",
                phone: "(647) 555-0199",
                email: "ada.example.com",
                notes: "",
            }),
        ).toBe(false);
    });

    test("validates and formats contact fields", () => {
        expect(isValidEmail("ada@example.com")).toBe(true);
        expect(isValidEmail("ada.example.com")).toBe(false);
        expect(formatPhoneNumber("6475550199")).toBe("(647) 555-0199");
        expect(
            formatPhoneForSubmit({
                phoneCountryCode: "+1",
                phone: "(647) 555-0199",
            }),
        ).toBe("+16475550199");
    });

    test("builds a Sunday-start visible week from a local date", () => {
        expect(getWeekDates("2026-04-29")).toEqual([
            "2026-04-26",
            "2026-04-27",
            "2026-04-28",
            "2026-04-29",
            "2026-04-30",
            "2026-05-01",
            "2026-05-02",
        ]);
    });

    test("summarizes booking confirmation service snapshots", () => {
        expect(
            summarizeConfirmationServices([
                { serviceName: "Men's Cut" },
                { serviceName: "Beard Trim" },
            ]),
        ).toBe("Men's Cut, Beard Trim");
    });

    test("clears a selected slot when refreshed availability no longer contains it", () => {
        const selectedSlot: BookingSlot = {
            barberId: "sam",
            locationId: "eglinton",
            startTime: "2026-05-04T13:00:00.000Z",
            endTime: "2026-05-04T13:30:00.000Z",
            totalDurationMinutes: 30,
        };

        expect(clearSlotIfUnavailable(selectedSlot, [selectedSlot])).toBe(selectedSlot);
        expect(clearSlotIfUnavailable(selectedSlot, [])).toBeNull();
        expect(clearSlotIfUnavailable({ ...selectedSlot, barberId: "laura" }, [selectedSlot])).toBeNull();
    });

    test("changing location clears incompatible barber and slot selections", () => {
        const selectedSlot: BookingSlot = {
            barberId: "sam",
            locationId: "eglinton",
            startTime: "2026-05-04T13:00:00.000Z",
            endTime: "2026-05-04T13:30:00.000Z",
            totalDurationMinutes: 30,
        };

        expect(
            resetBookingSelectionsForLocation({
                nextLocationId: "millwood",
                selectedBarberId: "sam",
                selectedSlot,
                barbers: [
                    { id: "sam", locationIds: ["eglinton"] },
                    { id: "laura", locationIds: ["eglinton", "millwood"] },
                ],
            }),
        ).toEqual({ selectedBarberId: undefined, selectedSlot: null });

        expect(
            resetBookingSelectionsForLocation({
                nextLocationId: "millwood",
                selectedBarberId: "laura",
                selectedSlot: { ...selectedSlot, barberId: "laura", locationId: "millwood" },
                barbers: [
                    { id: "laura", locationIds: ["eglinton", "millwood"] },
                ],
            }),
        ).toEqual({
            selectedBarberId: "laura",
            selectedSlot: { ...selectedSlot, barberId: "laura", locationId: "millwood" },
        });
    });
});
