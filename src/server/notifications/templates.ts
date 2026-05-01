import type {
    BookingNotificationContext,
    NotificationChannel,
    NotificationEventType,
    NotificationManagementUrls,
    NotificationMessage,
    NotificationRecipientType,
} from "./types.ts";

export type { BookingNotificationContext } from "./types.ts";

interface BuildNotificationMessageInput {
    eventType: NotificationEventType;
    channel: NotificationChannel;
    recipientType: NotificationRecipientType;
    context: BookingNotificationContext;
    managementUrls?: NotificationManagementUrls;
}

interface BuildNotificationMetadataInput {
    eventType: NotificationEventType;
    context: BookingNotificationContext;
    managementUrls?: NotificationManagementUrls;
    skipReason?: string;
}

const TIME_ZONE = "America/Toronto";

export function buildBookingNotificationMessage(
    input: BuildNotificationMessageInput,
): NotificationMessage {
    const appointment = formatAppointment(input.context.startTime);
    const services = input.context.services.join(", ") || "service";
    const baseSummary =
        `${input.context.customerName} - ${services} with ${input.context.barberName} ` +
        `at ${input.context.locationName} on ${appointment}.`;

    if (input.eventType === "booking_confirmation") {
        return messageForBookingConfirmation(input, baseSummary);
    }

    if (input.eventType === "cancellation_confirmation") {
        return {
            subject: "Your Leaside Fades booking was cancelled",
            text: `${recipientPrefix(input.recipientType)}Cancelled: ${baseSummary}`,
        };
    }

    if (input.eventType === "reminder_24h" || input.eventType === "reminder_2h") {
        return messageForReminder(input, baseSummary);
    }

    return {
        subject: "Your Leaside Fades booking was rescheduled",
        text: `${recipientPrefix(input.recipientType)}Rescheduled: ${baseSummary}`,
    };
}

export function buildNotificationMetadata(input: BuildNotificationMetadataInput) {
    return {
        eventType: input.eventType,
        bookingStatus: input.context.status,
        bookingSource: input.context.source,
        serviceCount: input.context.services.length,
        appointmentStartTime: input.context.startTime.toISOString(),
        hasCancelUrl: Boolean(input.managementUrls?.cancelUrl),
        hasRescheduleUrl: Boolean(input.managementUrls?.rescheduleUrl),
        skipReason: input.skipReason,
    };
}

function messageForReminder(
    input: BuildNotificationMessageInput,
    baseSummary: string,
): NotificationMessage {
    const subject =
        input.eventType === "reminder_24h"
            ? "Reminder: your Leaside Fades booking is tomorrow"
            : "Reminder: your Leaside Fades booking is in 2 hours";
    const lines = [`${recipientPrefix(input.recipientType)}Reminder: ${baseSummary}`, "Pay in shop."];

    if (input.channel === "email") {
        return {
            subject,
            text: lines.join("\n"),
            html: lines.map((line) => `<p>${escapeHtml(line)}</p>`).join(""),
        };
    }

    return {
        subject,
        text: lines.join(" "),
    };
}

function messageForBookingConfirmation(
    input: BuildNotificationMessageInput,
    baseSummary: string,
): NotificationMessage {
    const subject =
        input.recipientType === "customer"
            ? "Your Leaside Fades booking is confirmed"
            : "New Leaside Fades booking";
    const lines = [`${recipientPrefix(input.recipientType)}Confirmed: ${baseSummary}`, "Pay in shop."];

    if (input.recipientType === "customer") {
        if (input.managementUrls?.cancelUrl) {
            lines.push(`Cancel: ${input.managementUrls.cancelUrl}`);
        }

        if (input.managementUrls?.rescheduleUrl) {
            lines.push(`Reschedule: ${input.managementUrls.rescheduleUrl}`);
        }
    }

    if (input.channel === "email") {
        return {
            subject,
            text: lines.join("\n"),
            html: lines.map((line) => `<p>${escapeHtml(line)}</p>`).join(""),
        };
    }

    return {
        subject,
        text: lines.join(" "),
    };
}

function recipientPrefix(recipientType: NotificationRecipientType) {
    return recipientType === "customer" ? "" : "Staff update - ";
}

function formatAppointment(value: Date) {
    const date = new Intl.DateTimeFormat("en-US", {
        timeZone: TIME_ZONE,
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
    }).format(value);
    const time = new Intl.DateTimeFormat("en-US", {
        timeZone: TIME_ZONE,
        hour: "numeric",
        minute: "2-digit",
    }).format(value);

    return `${date} at ${time}`;
}

function escapeHtml(value: string) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}
