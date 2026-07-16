import { describe, expect, test, vi } from "vitest";

import {
    dispatchBookingLifecycleNotification,
    dispatchBookingReminderNotification,
    type BookingLifecycleNotificationRepository,
} from "./dispatcher.ts";
import type {
    BookingNotificationAttempt,
    BookingNotificationContext,
    NotificationAttemptStatus,
    NotificationChannel,
    NotificationEventType,
    NotificationProviderSet,
} from "./types.ts";

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

class InMemoryNotificationRepository implements BookingLifecycleNotificationRepository {
    contexts = new Map([[context.bookingId, context]]);
    attempts: BookingNotificationAttempt[] = [];
    nextId = 1;

    async getBookingNotificationContext(bookingId: string) {
        return this.contexts.get(bookingId) ?? null;
    }

    async createPendingAttempt(input: Omit<BookingNotificationAttempt, "id" | "status" | "attemptCount">) {
        const existing = this.attempts.find((attempt) => attempt.idempotencyKey === input.idempotencyKey);

        if (existing) {
            existing.attemptCount += 1;
            if (existing.status === "failed") {
                Object.assign(existing, {
                    status: "pending" as const,
                    provider: null,
                    providerMessageId: null,
                    errorMessage: null,
                    lastAttemptAt: input.lastAttemptAt,
                    updatedAt: input.updatedAt,
                });
                return { action: "retry" as const, attempt: existing };
            }

            return { action: "duplicate" as const, attempt: existing };
        }

        const attempt: BookingNotificationAttempt = {
            ...input,
            id: `notification-${this.nextId++}`,
            status: "pending",
            attemptCount: 1,
        };
        this.attempts.push(attempt);
        return { action: "created" as const, attempt };
    }

    async createSkippedAttempt(input: Omit<BookingNotificationAttempt, "id" | "attemptCount">) {
        const existing = this.attempts.find((attempt) => attempt.idempotencyKey === input.idempotencyKey);

        if (existing) {
            existing.attemptCount += 1;
            if (existing.status === "failed" && input.status === "skipped") {
                Object.assign(existing, input, {
                    providerMessageId: null,
                    errorMessage: null,
                });
                return { duplicate: false as const, attempt: existing };
            }
            return { duplicate: true as const, attempt: existing };
        }

        const attempt: BookingNotificationAttempt = {
            ...input,
            id: `notification-${this.nextId++}`,
            attemptCount: 1,
        };
        this.attempts.push(attempt);
        return { duplicate: false as const, attempt };
    }

    async markAttemptSent(id: string, input: { provider: string; providerMessageId: string; sentAt: Date }) {
        this.update(id, "sent", {
            provider: input.provider,
            providerMessageId: input.providerMessageId,
            sentAt: input.sentAt,
        });
    }

    async markAttemptFailed(id: string, input: { provider: string; errorMessage: string }) {
        this.update(id, "failed", {
            provider: input.provider,
            errorMessage: input.errorMessage,
        });
    }

    private update(id: string, status: NotificationAttemptStatus, patch: Partial<BookingNotificationAttempt>) {
        const attempt = this.attempts.find((candidate) => candidate.id === id);

        if (!attempt) {
            throw new Error(`Missing attempt ${id}`);
        }

        Object.assign(attempt, patch, { status });
    }
}

function providers(options: { failChannel?: NotificationChannel } = {}): NotificationProviderSet {
    const calls: Array<{ channel: NotificationChannel; to: string; body: string }> = [];
    return {
        mode: "mock",
        calls,
        sms: {
            provider: "mock",
            async send(input) {
                calls.push({ channel: "sms", to: input.to, body: input.body });
                if (options.failChannel === "sms") {
                    throw new Error("SMS failed");
                }
                return { provider: "mock", providerMessageId: `sms-${input.idempotencyKey}` };
            },
        },
        email: {
            provider: "mock",
            async send(input) {
                calls.push({ channel: "email", to: input.to, body: input.text });
                if (options.failChannel === "email") {
                    throw new Error("Email failed");
                }
                return { provider: "mock", providerMessageId: `email-${input.idempotencyKey}` };
            },
        },
    } as NotificationProviderSet & { calls: typeof calls };
}

describe("Phase 9 notification dispatcher", () => {
    test("sends customer and assigned staff notifications for a public booking confirmation", async () => {
        const repository = new InMemoryNotificationRepository();
        const providerSet = providers() as NotificationProviderSet & {
            calls: Array<{ channel: NotificationChannel; to: string; body: string }>;
        };

        const result = await dispatchBookingLifecycleNotification({
            eventType: "booking_confirmation",
            bookingId: context.bookingId,
            repository,
            providers: providerSet,
            managementUrls: {
                cancelUrl: "https://example.com/booking/cancel-token/cancel",
                rescheduleUrl: "https://example.com/booking/reschedule-token/reschedule",
            },
            now: new Date("2026-05-01T12:00:00.000Z"),
        });

        expect(result.map((item) => item.status).sort()).toEqual([
            "sent",
            "sent",
        ]);
        expect(repository.attempts.map((attempt) => `${attempt.recipientType}:${attempt.channel}`).sort()).toEqual([
            "barber:email",
            "customer:email",
        ]);
        expect(providerSet.calls.map((call) => call.to).sort()).toEqual([
            "ada@example.com",
            "sam@leasidefades.com",
        ]);
        expect(repository.attempts).toHaveLength(2);
        expect(JSON.stringify(repository.attempts)).not.toContain("cancel-token");
        expect(JSON.stringify(repository.attempts)).not.toContain("reschedule-token");
    });

    test("prevents duplicate sends with idempotency keys", async () => {
        const repository = new InMemoryNotificationRepository();
        const providerSet = providers() as NotificationProviderSet & { calls: Array<{ channel: NotificationChannel }> };

        await dispatchBookingLifecycleNotification({
            eventType: "cancellation_confirmation",
            bookingId: context.bookingId,
            repository,
            providers: providerSet,
        });
        const second = await dispatchBookingLifecycleNotification({
            eventType: "cancellation_confirmation",
            bookingId: context.bookingId,
            repository,
            providers: providerSet,
        });

        expect(providerSet.calls).toHaveLength(2);
        expect(second.map((item) => item.status).sort()).toEqual(["duplicate", "duplicate"]);
        expect(repository.attempts.map((attempt) => `${attempt.recipientType}:${attempt.channel}`).sort()).toEqual([
            "barber:email",
            "customer:email",
        ]);
        expect(repository.attempts.every((attempt) => attempt.attemptCount === 2)).toBe(true);
    });

    test("logs skipped attempts for missing customer and barber contacts", async () => {
        const repository = new InMemoryNotificationRepository();
        repository.contexts.set(context.bookingId, {
            ...context,
            customerPhone: null,
            customerEmail: null,
            barberPhone: null,
            barberEmail: null,
            ownerAdminEmails: [],
        });

        const result = await dispatchBookingLifecycleNotification({
            eventType: "booking_confirmation",
            bookingId: context.bookingId,
            repository,
            providers: providers(),
        });

        expect(result.map((item) => item.status).sort()).toEqual([
            "skipped",
            "skipped",
        ]);
        expect(repository.attempts.map((attempt) => attempt.status).sort()).toEqual([
            "skipped",
            "skipped",
        ]);
        expect(repository.attempts.map((attempt) => `${attempt.recipientType}:${attempt.channel}`).sort()).toEqual([
            "barber:email",
            "customer:email",
        ]);
    });

    test("logs provider failures without throwing", async () => {
        const repository = new InMemoryNotificationRepository();

        const result = await dispatchBookingLifecycleNotification({
            eventType: "booking_confirmation",
            bookingId: context.bookingId,
            repository,
            providers: providers({ failChannel: "email" }),
        });

        expect(result.map((item) => item.status).sort()).toEqual([
            "failed",
            "failed",
        ]);
        expect(repository.attempts.filter((attempt) => attempt.status === "failed")).toHaveLength(2);
    });

    test("retries failed lifecycle notification attempts on later dispatches", async () => {
        const repository = new InMemoryNotificationRepository();
        const failedProviderSet = providers({ failChannel: "email" }) as NotificationProviderSet & {
            calls: Array<{ channel: NotificationChannel }>;
        };
        const recoveredProviderSet = providers() as NotificationProviderSet & {
            calls: Array<{ channel: NotificationChannel }>;
        };

        await dispatchBookingLifecycleNotification({
            eventType: "booking_confirmation",
            bookingId: context.bookingId,
            repository,
            providers: failedProviderSet,
        });
        const retry = await dispatchBookingLifecycleNotification({
            eventType: "booking_confirmation",
            bookingId: context.bookingId,
            repository,
            providers: recoveredProviderSet,
        });

        expect(retry.map((item) => item.status).sort()).toEqual([
            "sent",
            "sent",
        ]);
        expect(recoveredProviderSet.calls.map((call) => call.channel).sort()).toEqual(["email", "email"]);
        expect(repository.attempts.every((attempt) => attempt.status === "sent")).toBe(true);
        expect(repository.attempts.every((attempt) => attempt.attemptCount === 2)).toBe(true);
    });

    test("creates lifecycle notification attempts for contacted walk-ins but not imported bookings", async () => {
        const repository = new InMemoryNotificationRepository();
        repository.contexts.set("walk-in-booking", { ...context, bookingId: "walk-in-booking", source: "walk_in" });
        repository.contexts.set("imported-booking", { ...context, bookingId: "imported-booking", source: "imported" });
        const providerSet = providers() as NotificationProviderSet & {
            calls: Array<{ channel: NotificationChannel }>;
        };

        const walkInResult = await dispatchBookingLifecycleNotification({
            eventType: "booking_confirmation",
            bookingId: "walk-in-booking",
            repository,
            providers: providerSet,
        });
        const importedResult = await dispatchBookingLifecycleNotification({
            eventType: "booking_confirmation",
            bookingId: "imported-booking",
            repository,
            providers: providerSet,
        });

        expect(walkInResult.map((item) => item.status).sort()).toEqual(["sent", "sent"]);
        expect(providerSet.calls.map((call) => call.channel).sort()).toEqual(["email", "email"]);
        expect(importedResult).toEqual([]);
        expect(repository.attempts.map((attempt) => attempt.bookingId)).toEqual([
            "walk-in-booking",
            "walk-in-booking",
        ]);
    });

    test("uses the rescheduled start time in reschedule idempotency keys", async () => {
        const repository = new InMemoryNotificationRepository();

        await dispatchBookingLifecycleNotification({
            eventType: "reschedule_confirmation",
            bookingId: context.bookingId,
            repository,
            providers: providers(),
        });
        repository.contexts.set(context.bookingId, {
            ...context,
            startTime: new Date("2026-05-04T15:00:00.000Z"),
            endTime: new Date("2026-05-04T15:30:00.000Z"),
        });
        await dispatchBookingLifecycleNotification({
            eventType: "reschedule_confirmation",
            bookingId: context.bookingId,
            repository,
            providers: providers(),
        });

        const rescheduleKeys = repository.attempts
            .filter((attempt) => attempt.eventType === ("reschedule_confirmation" satisfies NotificationEventType))
            .map((attempt) => attempt.idempotencyKey);
        expect(new Set(rescheduleKeys).size).toBe(4);
    });
});

describe("Phase 10 reminder dispatcher", () => {
    test("sends reminders only to customer sms and email recipients", async () => {
        const repository = new InMemoryNotificationRepository();
        const providerSet = providers() as NotificationProviderSet & { calls: Array<{ channel: NotificationChannel }> };

        const result = await dispatchBookingReminderNotification({
            eventType: "reminder_24h",
            bookingId: context.bookingId,
            repository,
            providers: providerSet,
            scheduledFor: new Date("2026-05-03T14:00:00.000Z"),
            expectedStartTime: context.startTime,
            now: new Date("2026-05-03T14:05:00.000Z"),
        });

        expect(result.map((item) => item.status).sort()).toEqual(["sent", "sent"]);
        expect(providerSet.calls.map((call) => call.channel).sort()).toEqual(["email", "sms"]);
        expect(repository.attempts).toHaveLength(2);
        expect(repository.attempts.every((attempt) => attempt.recipientType === "customer")).toBe(true);
        expect(repository.attempts.every((attempt) => attempt.scheduledFor?.toISOString() === "2026-05-03T14:00:00.000Z")).toBe(true);
    });

    test("records intentionally paused Twilio as skipped without calling it", async () => {
        const repository = new InMemoryNotificationRepository();
        const providerSet = providers() as NotificationProviderSet & {
            calls: Array<{ channel: NotificationChannel }>;
        };
        const pausedSend = vi.fn(async () => {
            throw new Error("Paused Twilio must not be called");
        });
        providerSet.sms = {
            provider: "twilio",
            deliveryState: "paused",
            pauseReason: "provider_paused",
            send: pausedSend,
        };

        const result = await dispatchBookingReminderNotification({
            eventType: "reminder_24h",
            bookingId: context.bookingId,
            repository,
            providers: providerSet,
            scheduledFor: new Date("2026-05-03T14:00:00.000Z"),
            expectedStartTime: context.startTime,
        });

        expect(result).toContainEqual(expect.objectContaining({
            channel: "sms",
            status: "skipped",
            provider: "twilio",
            skipReason: "provider_paused",
        }));
        expect(result).toContainEqual(expect.objectContaining({ channel: "email", status: "sent" }));
        expect(pausedSend).not.toHaveBeenCalled();
        expect(repository.attempts.find((attempt) => attempt.channel === "sms")).toMatchObject({
            status: "skipped",
            provider: "twilio",
            errorMessage: null,
            metadata: expect.objectContaining({ skipReason: "provider_paused" }),
        });
    });

    test("reconciles a prior failed Twilio row when SMS is paused", async () => {
        const repository = new InMemoryNotificationRepository();
        const failedProviderSet = providers({ failChannel: "sms" });

        await dispatchBookingReminderNotification({
            eventType: "reminder_24h",
            bookingId: context.bookingId,
            repository,
            providers: failedProviderSet,
            scheduledFor: new Date("2026-05-03T14:00:00.000Z"),
            expectedStartTime: context.startTime,
        });

        const pausedProviderSet = providers();
        const pausedSend = vi.fn(async () => {
            throw new Error("Paused Twilio must not be called");
        });
        pausedProviderSet.sms = {
            provider: "twilio",
            deliveryState: "paused",
            pauseReason: "provider_paused",
            send: pausedSend,
        };
        const result = await dispatchBookingReminderNotification({
            eventType: "reminder_24h",
            bookingId: context.bookingId,
            repository,
            providers: pausedProviderSet,
            scheduledFor: new Date("2026-05-03T14:00:00.000Z"),
            expectedStartTime: context.startTime,
        });

        expect(result).toContainEqual(expect.objectContaining({
            channel: "sms",
            status: "skipped",
            provider: "twilio",
            skipReason: "provider_paused",
        }));
        expect(pausedSend).not.toHaveBeenCalled();
        expect(repository.attempts.find((attempt) => attempt.channel === "sms")).toMatchObject({
            status: "skipped",
            provider: "twilio",
            providerMessageId: null,
            errorMessage: null,
            attemptCount: 2,
            metadata: expect.objectContaining({ skipReason: "provider_paused" }),
        });
    });

    test("prevents duplicate reminder sends for the same booking occurrence", async () => {
        const repository = new InMemoryNotificationRepository();
        const providerSet = providers() as NotificationProviderSet & { calls: Array<{ channel: NotificationChannel }> };

        await dispatchBookingReminderNotification({
            eventType: "reminder_2h",
            bookingId: context.bookingId,
            repository,
            providers: providerSet,
            scheduledFor: new Date("2026-05-04T12:00:00.000Z"),
            expectedStartTime: context.startTime,
        });
        const second = await dispatchBookingReminderNotification({
            eventType: "reminder_2h",
            bookingId: context.bookingId,
            repository,
            providers: providerSet,
            scheduledFor: new Date("2026-05-04T12:00:00.000Z"),
            expectedStartTime: context.startTime,
        });

        expect(providerSet.calls).toHaveLength(2);
        expect(second.map((item) => item.status).sort()).toEqual(["duplicate", "duplicate"]);
        expect(repository.attempts.every((attempt) => attempt.attemptCount === 2)).toBe(true);
    });

    test("retries failed reminder channels without resending successful ones", async () => {
        const repository = new InMemoryNotificationRepository();
        const failedProviderSet = providers({ failChannel: "sms" }) as NotificationProviderSet & {
            calls: Array<{ channel: NotificationChannel }>;
        };
        const recoveredProviderSet = providers() as NotificationProviderSet & {
            calls: Array<{ channel: NotificationChannel }>;
        };

        await dispatchBookingReminderNotification({
            eventType: "reminder_24h",
            bookingId: context.bookingId,
            repository,
            providers: failedProviderSet,
            scheduledFor: new Date("2026-05-03T14:00:00.000Z"),
            expectedStartTime: context.startTime,
        });
        const retry = await dispatchBookingReminderNotification({
            eventType: "reminder_24h",
            bookingId: context.bookingId,
            repository,
            providers: recoveredProviderSet,
            scheduledFor: new Date("2026-05-03T14:00:00.000Z"),
            expectedStartTime: context.startTime,
        });

        expect(retry.map((item) => item.status).sort()).toEqual(["duplicate", "sent"]);
        expect(recoveredProviderSet.calls.map((call) => call.channel)).toEqual(["sms"]);
        expect(repository.attempts.filter((attempt) => attempt.channel === "sms").every((attempt) => attempt.status === "sent")).toBe(true);
        expect(repository.attempts.every((attempt) => attempt.attemptCount === 2)).toBe(true);
    });

    test("skips stale reminder candidates after a booking is rescheduled", async () => {
        const repository = new InMemoryNotificationRepository();
        repository.contexts.set(context.bookingId, {
            ...context,
            startTime: new Date("2026-05-04T15:00:00.000Z"),
            endTime: new Date("2026-05-04T15:30:00.000Z"),
        });
        const providerSet = providers() as NotificationProviderSet & { calls: Array<{ channel: NotificationChannel }> };

        const result = await dispatchBookingReminderNotification({
            eventType: "reminder_24h",
            bookingId: context.bookingId,
            repository,
            providers: providerSet,
            scheduledFor: new Date("2026-05-03T14:00:00.000Z"),
            expectedStartTime: context.startTime,
        });

        expect(result).toEqual([]);
        expect(providerSet.calls).toEqual([]);
        expect(repository.attempts).toEqual([]);
    });

    test("sends reminder attempts for contacted walk-ins", async () => {
        const repository = new InMemoryNotificationRepository();
        repository.contexts.set("walk-in-booking", { ...context, bookingId: "walk-in-booking", source: "walk_in" });
        const providerSet = providers() as NotificationProviderSet & { calls: Array<{ channel: NotificationChannel }> };

        const result = await dispatchBookingReminderNotification({
            eventType: "reminder_2h",
            bookingId: "walk-in-booking",
            repository,
            providers: providerSet,
            scheduledFor: new Date("2026-05-04T12:00:00.000Z"),
            expectedStartTime: context.startTime,
        });

        expect(result.map((item) => item.status).sort()).toEqual(["sent", "sent"]);
        expect(providerSet.calls.map((call) => call.channel).sort()).toEqual(["email", "sms"]);
        expect(repository.attempts.every((attempt) => attempt.bookingId === "walk-in-booking")).toBe(true);
    });

    test("does not create reminder attempts for cancelled or imported bookings", async () => {
        const repository = new InMemoryNotificationRepository();
        const ineligibleBookings: BookingNotificationContext[] = [
            { ...context, bookingId: "cancelled-booking", status: "cancelled" },
            { ...context, bookingId: "completed-booking", status: "completed" },
            { ...context, bookingId: "no-show-booking", status: "no_show" },
            { ...context, bookingId: "imported-booking", source: "imported" },
        ];
        for (const booking of ineligibleBookings) {
            repository.contexts.set(booking.bookingId, booking);
        }

        for (const booking of ineligibleBookings) {
            const result = await dispatchBookingReminderNotification({
                eventType: "reminder_2h",
                bookingId: booking.bookingId,
                repository,
                providers: providers(),
                scheduledFor: new Date("2026-05-04T12:00:00.000Z"),
                expectedStartTime: booking.startTime,
            });

            expect(result).toEqual([]);
        }

        expect(repository.attempts).toEqual([]);
    });

    test("logs skipped reminder attempts for missing or invalid customer contacts", async () => {
        const repository = new InMemoryNotificationRepository();
        repository.contexts.set(context.bookingId, {
            ...context,
            customerPhone: "555-0199",
            customerEmail: "not-an-email",
        });
        const providerSet = providers() as NotificationProviderSet & { calls: Array<{ channel: NotificationChannel }> };

        const result = await dispatchBookingReminderNotification({
            eventType: "reminder_24h",
            bookingId: context.bookingId,
            repository,
            providers: providerSet,
            scheduledFor: new Date("2026-05-03T14:00:00.000Z"),
            expectedStartTime: context.startTime,
        });

        expect(result.map((item) => item.status).sort()).toEqual(["skipped", "skipped"]);
        expect(providerSet.calls).toEqual([]);
        expect(repository.attempts.map((attempt) => attempt.status).sort()).toEqual([
            "skipped",
            "skipped",
        ]);
        expect(repository.attempts.map((attempt) => attempt.metadata.skipReason).sort()).toEqual([
            "invalid_recipient_email",
            "invalid_recipient_phone",
        ]);
    });
});
