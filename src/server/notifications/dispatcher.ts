import { createHash } from "node:crypto";

import {
    buildBookingNotificationMessage,
    buildNotificationMetadata,
} from "./templates.ts";
import type {
    BookingLifecycleDispatchInput,
    BookingLifecycleDispatchResult,
    BookingNotificationAttempt,
    BookingNotificationContext,
    BookingReminderDispatchInput,
    NotificationAttemptStatus,
    NotificationChannel,
    NotificationEventType,
    NotificationProviderSet,
    NotificationRecipientType,
} from "./types.ts";

export interface BookingLifecycleNotificationRepository {
    getBookingNotificationContext(bookingId: string): Promise<BookingNotificationContext | null>;
    createPendingAttempt(
        input: Omit<BookingNotificationAttempt, "id" | "status" | "attemptCount">,
    ): Promise<{ action: "created" | "retry" | "duplicate"; attempt: BookingNotificationAttempt }>;
    createSkippedAttempt(
        input: Omit<BookingNotificationAttempt, "id" | "attemptCount">,
    ): Promise<{ duplicate: boolean; attempt: BookingNotificationAttempt }>;
    markAttemptSent(
        id: string,
        input: { provider: string; providerMessageId: string; sentAt: Date },
    ): Promise<void>;
    markAttemptFailed(
        id: string,
        input: { provider: string; errorMessage: string },
    ): Promise<void>;
}

export interface DispatchBookingLifecycleNotificationInput
    extends BookingLifecycleDispatchInput {
    repository: BookingLifecycleNotificationRepository;
    providers: NotificationProviderSet;
    now?: Date;
}

export interface DispatchBookingReminderNotificationInput
    extends BookingReminderDispatchInput {
    repository: BookingLifecycleNotificationRepository;
    providers: NotificationProviderSet;
    now?: Date;
    canStartProviderCall?: () => boolean;
}

interface RecipientPlan {
    recipientType: NotificationRecipientType;
    channel: NotificationChannel;
    recipientPhone: string | null;
    recipientEmail: string | null;
    contact: string | null;
}

export async function dispatchBookingLifecycleNotification(
    input: DispatchBookingLifecycleNotificationInput,
): Promise<BookingLifecycleDispatchResult[]> {
    const context = await input.repository.getBookingNotificationContext(input.bookingId);

    if (!context || context.source === "imported") {
        return [];
    }

    const now = input.now ?? new Date();
    const results: BookingLifecycleDispatchResult[] = [];

    for (const recipient of lifecycleRecipientPlans(context)) {
        results.push(await dispatchRecipient({ ...input, context, recipient, now }));
    }

    return results;
}

export async function dispatchBookingReminderNotification(
    input: DispatchBookingReminderNotificationInput,
): Promise<BookingLifecycleDispatchResult[]> {
    const context = await input.repository.getBookingNotificationContext(input.bookingId);

    if (!context || !isReminderEligible(context) || !sameInstant(context.startTime, input.expectedStartTime)) {
        return [];
    }

    const now = input.now ?? new Date();
    const results: BookingLifecycleDispatchResult[] = [];

    for (const recipient of customerReminderRecipientPlans(context)) {
        results.push(
            await dispatchRecipient({
                ...input,
                context,
                recipient,
                now,
                scheduledFor: input.scheduledFor,
            }),
        );
    }

    return results;
}

async function dispatchRecipient(input: {
    eventType: NotificationEventType;
    bookingId: string;
    managementUrls?: DispatchBookingLifecycleNotificationInput["managementUrls"];
    occurrenceKey?: string;
    scheduledFor?: Date | null;
    repository: BookingLifecycleNotificationRepository;
    providers: NotificationProviderSet;
    context: BookingNotificationContext;
    recipient: RecipientPlan;
    now: Date;
    canStartProviderCall?: () => boolean;
}): Promise<BookingLifecycleDispatchResult> {
    const idempotencyKey = buildIdempotencyKey({
        bookingId: input.bookingId,
        eventType: input.eventType,
        channel: input.recipient.channel,
        recipientType: input.recipient.recipientType,
        contact: input.recipient.contact,
        occurrenceKey: input.occurrenceKey ?? occurrenceKeyForEvent(input.eventType, input.context),
    });
    const baseAttempt = {
        bookingId: input.bookingId,
        recipientType: input.recipient.recipientType,
        recipientPhone: input.recipient.recipientPhone,
        recipientEmail: input.recipient.recipientEmail,
        channel: input.recipient.channel,
        eventType: input.eventType,
        provider: null,
        idempotencyKey,
        providerMessageId: null,
        errorMessage: null,
        metadata: buildNotificationMetadata({
            eventType: input.eventType,
            context: input.context,
            managementUrls: input.managementUrls,
        }),
        scheduledFor: input.scheduledFor ?? null,
        sentAt: null,
        lastAttemptAt: input.now,
        createdAt: input.now,
        updatedAt: input.now,
    };
    const skipReason = skipReasonForRecipient(input.recipient);

    if (skipReason) {
        const { duplicate, attempt } = await input.repository.createSkippedAttempt({
            ...baseAttempt,
            status: "skipped",
            metadata: {
                ...baseAttempt.metadata,
                skipReason,
            },
        });

        return resultForAttempt(attempt, duplicate ? "duplicate" : "skipped");
    }

    const provider =
        input.recipient.channel === "sms" ? input.providers.sms : input.providers.email;

    if (provider.deliveryState === "paused") {
        const providerSkipReason = provider.pauseReason ?? "provider_paused";
        const { duplicate, attempt } = await input.repository.createSkippedAttempt({
            ...baseAttempt,
            status: "skipped",
            provider: provider.provider,
            metadata: {
                ...baseAttempt.metadata,
                skipReason: providerSkipReason,
            },
        });

        return {
            ...resultForAttempt(attempt, duplicate ? "duplicate" : "skipped"),
            provider: provider.provider,
            skipReason: providerSkipReason,
        };
    }

    if (input.canStartProviderCall && !input.canStartProviderCall()) {
        return {
            idempotencyKey,
            channel: input.recipient.channel,
            recipientType: input.recipient.recipientType,
            provider: provider.provider,
            status: "deferred",
        };
    }

    const { action, attempt } = await input.repository.createPendingAttempt(baseAttempt);

    if (action === "duplicate") {
        return resultForAttempt(attempt, "duplicate");
    }

    const message = buildBookingNotificationMessage({
        eventType: input.eventType,
        channel: input.recipient.channel,
        recipientType: input.recipient.recipientType,
        context: input.context,
        managementUrls: input.managementUrls,
    });

    try {
        const sendResult =
            input.recipient.channel === "sms"
                ? await input.providers.sms.send({
                      idempotencyKey,
                      to: input.recipient.contact ?? "",
                      body: message.text,
                  })
                : await input.providers.email.send({
                      idempotencyKey,
                      to: input.recipient.contact ?? "",
                      subject: message.subject ?? "Leaside Fades booking update",
                      text: message.text,
                      html: message.html,
                  });

        await input.repository.markAttemptSent(attempt.id, {
            provider: sendResult.provider,
            providerMessageId: sendResult.providerMessageId,
            sentAt: input.now,
        });
        return {
            ...resultForAttempt({ ...attempt, status: "sent" }, "sent"),
            provider: sendResult.provider,
        };
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Notification delivery failed.";
        await input.repository.markAttemptFailed(attempt.id, {
            provider: provider.provider,
            errorMessage,
        });
        return {
            ...resultForAttempt({ ...attempt, status: "failed" }, "failed"),
            provider: provider.provider,
            errorMessage,
        };
    }
}

// Lifecycle events are email-only to keep Twilio spend on the reminders that
// actually prevent no-shows; the barber copy covers cancellations and
// reschedules too so staff never lose visibility after losing their SMS copy.
function lifecycleRecipientPlans(context: BookingNotificationContext): RecipientPlan[] {
    return [
        {
            recipientType: "customer",
            channel: "email",
            recipientPhone: null,
            recipientEmail: context.customerEmail,
            contact: context.customerEmail,
        },
        {
            recipientType: "barber",
            channel: "email",
            recipientPhone: null,
            recipientEmail: context.barberEmail,
            contact: context.barberEmail,
        },
    ];
}

function customerReminderRecipientPlans(context: BookingNotificationContext): RecipientPlan[] {
    return [
        {
            recipientType: "customer",
            channel: "sms",
            recipientPhone: context.customerPhone,
            recipientEmail: null,
            contact: context.customerPhone,
        },
        {
            recipientType: "customer",
            channel: "email",
            recipientPhone: null,
            recipientEmail: context.customerEmail,
            contact: context.customerEmail,
        },
    ];
}

function skipReasonForRecipient(recipient: RecipientPlan) {
    if (!recipient.contact) {
        return "missing_recipient_contact";
    }

    if (recipient.channel === "sms" && !/^\+\d{10,15}$/.test(recipient.contact)) {
        return "invalid_recipient_phone";
    }

    if (recipient.channel === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient.contact)) {
        return "invalid_recipient_email";
    }

    return null;
}

function occurrenceKeyForEvent(
    eventType: NotificationEventType,
    context: BookingNotificationContext,
) {
    return eventType === "reschedule_confirmation" || isReminderEvent(eventType)
        ? context.startTime.toISOString()
        : "stable";
}

function isReminderEligible(context: BookingNotificationContext) {
    return (
        context.status === "confirmed" &&
        (context.source === "public" || context.source === "manual" || context.source === "walk_in")
    );
}

function sameInstant(left: Date, right: Date) {
    return left.getTime() === right.getTime();
}

function isReminderEvent(eventType: NotificationEventType) {
    return eventType === "reminder_24h" || eventType === "reminder_2h";
}

function buildIdempotencyKey(input: {
    bookingId: string;
    eventType: string;
    channel: NotificationChannel;
    recipientType: NotificationRecipientType;
    contact: string | null;
    occurrenceKey: string;
}) {
    const contactHash = createHash("sha256")
        .update(input.contact ?? "missing")
        .digest("hex")
        .slice(0, 16);
    return [
        "booking",
        input.bookingId,
        input.eventType,
        input.channel,
        input.recipientType,
        input.occurrenceKey,
        contactHash,
    ].join(":");
}

function resultForAttempt(
    attempt: BookingNotificationAttempt,
    status: NotificationAttemptStatus | "duplicate",
): BookingLifecycleDispatchResult {
    return {
        idempotencyKey: attempt.idempotencyKey,
        channel: attempt.channel,
        recipientType: attempt.recipientType,
        notificationId: attempt.id,
        status,
    };
}
