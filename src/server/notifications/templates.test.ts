import { describe, expect, test } from "vitest";

import {
    buildBookingNotificationMessage,
    buildNotificationMetadata,
    type BookingNotificationContext,
} from "./templates.ts";

const context: BookingNotificationContext = {
    bookingId: "booking-1",
    status: "confirmed",
    source: "public",
    customerName: "Ada Lovelace",
    customerPhone: "+16475550199",
    customerEmail: "ada@example.com",
    barberName: "Sam To",
    barberPhone: "+16475550200",
    barberEmail: "sam@leasidefades.com",
    ownerAdminEmails: ["owner@leasidefades.com"],
    locationName: "Leaside Fades Eglinton",
    startTime: new Date("2026-05-04T14:00:00.000Z"),
    endTime: new Date("2026-05-04T14:30:00.000Z"),
    services: ["Men's Cut"],
    priceSummary: "$30",
};

describe("Phase 9 notification templates", () => {
    test("customer booking confirmation includes supplied management links", () => {
        const message = buildBookingNotificationMessage({
            eventType: "booking_confirmation",
            channel: "email",
            recipientType: "customer",
            context,
            managementUrls: {
                cancelUrl: "https://example.com/booking/cancel-token/cancel",
                rescheduleUrl: "https://example.com/booking/reschedule-token/reschedule",
            },
        });

        expect(message.subject).toBe("Your Leaside Fades booking is confirmed");
        expect(message.text).toContain("Monday, May 4, 2026");
        expect(message.text).toContain("10:00 AM");
        expect(message.text).toContain("Cancel: https://example.com/booking/cancel-token/cancel");
        expect(message.text).toContain("Reschedule: https://example.com/booking/reschedule-token/reschedule");
    });

    test("barber cancellation message is safe and does not include customer management links", () => {
        const message = buildBookingNotificationMessage({
            eventType: "cancellation_confirmation",
            channel: "sms",
            recipientType: "barber",
            context,
            managementUrls: {
                cancelUrl: "https://example.com/booking/cancel-token/cancel",
                rescheduleUrl: "https://example.com/booking/reschedule-token/reschedule",
            },
        });

        expect(message.text).toContain("Cancelled");
        expect(message.text).toContain("Ada Lovelace");
        expect(message.text).not.toContain("cancel-token");
        expect(message.text).not.toContain("reschedule-token");
    });

    test("barber cancellation email uses staff-facing subject", () => {
        const message = buildBookingNotificationMessage({
            eventType: "cancellation_confirmation",
            channel: "email",
            recipientType: "barber",
            context,
        });

        expect(message.subject).toBe("Leaside Fades booking cancelled");
        expect(message.text).toContain("Staff update - Cancelled");
    });

    test("barber reschedule email uses staff-facing subject", () => {
        const message = buildBookingNotificationMessage({
            eventType: "reschedule_confirmation",
            channel: "email",
            recipientType: "barber",
            context,
        });

        expect(message.subject).toBe("Leaside Fades booking rescheduled");
        expect(message.text).toContain("Staff update - Rescheduled");
    });

    test("owner/admin booking confirmation uses staff-facing wording without management links", () => {
        const message = buildBookingNotificationMessage({
            eventType: "booking_confirmation",
            channel: "email",
            recipientType: "admin",
            context,
            managementUrls: {
                cancelUrl: "https://example.com/booking/cancel-token/cancel",
                rescheduleUrl: "https://example.com/booking/reschedule-token/reschedule",
            },
        });

        expect(message.subject).toBe("New Leaside Fades booking");
        expect(message.text).toContain("Staff update - Confirmed");
        expect(message.text).toContain("Ada Lovelace");
        expect(message.text).toContain("Men's Cut");
        expect(message.text).toContain("Sam To");
        expect(message.text).not.toContain("cancel-token");
        expect(message.text).not.toContain("reschedule-token");
    });

    test("notification metadata records link presence without persisting raw urls", () => {
        const metadata = buildNotificationMetadata({
            eventType: "booking_confirmation",
            context,
            managementUrls: {
                cancelUrl: "https://example.com/booking/cancel-token/cancel",
                rescheduleUrl: "https://example.com/booking/reschedule-token/reschedule",
            },
        });

        expect(metadata).toMatchObject({
            eventType: "booking_confirmation",
            bookingSource: "public",
            serviceCount: 1,
            hasCancelUrl: true,
            hasRescheduleUrl: true,
        });
        expect(JSON.stringify(metadata)).not.toContain("cancel-token");
        expect(JSON.stringify(metadata)).not.toContain("reschedule-token");
    });

    test("customer reminders include appointment details but no management links", () => {
        const message = buildBookingNotificationMessage({
            eventType: "reminder_24h",
            channel: "email",
            recipientType: "customer",
            context,
            managementUrls: {
                cancelUrl: "https://example.com/booking/cancel-token/cancel",
                rescheduleUrl: "https://example.com/booking/reschedule-token/reschedule",
            },
        });

        expect(message.subject).toBe("Reminder: your Leaside Fades booking is tomorrow");
        expect(message.text).toContain("Monday, May 4, 2026");
        expect(message.text).toContain("10:00 AM");
        expect(message.text).toContain("Men's Cut");
        expect(message.text).toContain("Pay in shop.");
        expect(message.text).not.toContain("cancel-token");
        expect(message.text).not.toContain("reschedule-token");
    });

    test("2-hour customer sms reminders include appointment details but no management links", () => {
        const message = buildBookingNotificationMessage({
            eventType: "reminder_2h",
            channel: "sms",
            recipientType: "customer",
            context,
            managementUrls: {
                cancelUrl: "https://example.com/booking/cancel-token/cancel",
                rescheduleUrl: "https://example.com/booking/reschedule-token/reschedule",
            },
        });

        expect(message.subject).toBe("Reminder: your Leaside Fades booking is in 2 hours");
        expect(message.text).toContain("Monday, May 4, 2026");
        expect(message.text).toContain("10:00 AM");
        expect(message.text).toContain("Men's Cut");
        expect(message.text).toContain("Pay in shop.");
        expect(message.text).not.toContain("cancel-token");
        expect(message.text).not.toContain("reschedule-token");
    });
});
