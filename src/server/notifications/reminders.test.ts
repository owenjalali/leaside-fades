import { describe, expect, test } from "vitest";

import {
    runBookingReminderJob,
    type BookingReminderCandidate,
    type BookingReminderNotificationRepository,
} from "./reminders.ts";
import type {
    BookingNotificationAttempt,
    BookingNotificationContext,
    NotificationAttemptStatus,
    NotificationChannel,
    NotificationProviderSet,
} from "./types.ts";

const baseContext: BookingNotificationContext = {
    bookingId: "booking-24h",
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

class InMemoryReminderRepository implements BookingReminderNotificationRepository {
    candidates: BookingReminderCandidate[] = [];
    contexts = new Map<string, BookingNotificationContext>();
    attempts: BookingNotificationAttempt[] = [];
    nextId = 1;

    async listReminderCandidates(input: { startFrom: Date; startTo: Date }) {
        return this.candidates.filter(
            (candidate) =>
                candidate.startTime.getTime() >= input.startFrom.getTime() &&
                candidate.startTime.getTime() < input.startTo.getTime(),
        );
    }

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
                return { provider: "mock", providerMessageId: `email-${input.idempotencyKey}` };
            },
        },
    } as NotificationProviderSet & { calls: typeof calls };
}

function setupRepository() {
    const repository = new InMemoryReminderRepository();
    const booking24h = {
        ...baseContext,
        bookingId: "booking-24h",
        startTime: new Date("2026-05-04T14:00:00.000Z"),
        endTime: new Date("2026-05-04T14:30:00.000Z"),
    };
    const booking2h = {
        ...baseContext,
        bookingId: "booking-2h",
        startTime: new Date("2026-05-03T16:00:00.000Z"),
        endTime: new Date("2026-05-03T16:30:00.000Z"),
    };
    const outsideWindow = {
        ...baseContext,
        bookingId: "outside-window",
        startTime: new Date("2026-05-04T16:00:00.000Z"),
        endTime: new Date("2026-05-04T16:30:00.000Z"),
    };

    repository.candidates = [
        { bookingId: booking24h.bookingId, startTime: booking24h.startTime },
        { bookingId: booking2h.bookingId, startTime: booking2h.startTime },
        { bookingId: outsideWindow.bookingId, startTime: outsideWindow.startTime },
    ];
    repository.contexts.set(booking24h.bookingId, booking24h);
    repository.contexts.set(booking2h.bookingId, booking2h);
    repository.contexts.set(outsideWindow.bookingId, outsideWindow);

    return repository;
}

describe("Phase 10 reminder job", () => {
    test("sends due 24-hour and 2-hour reminders within the configured window", async () => {
        const repository = setupRepository();
        const providerSet = providers() as NotificationProviderSet & { calls: Array<{ channel: NotificationChannel }> };

        const result = await runBookingReminderJob({
            repository,
            providers: providerSet,
            now: new Date("2026-05-03T14:00:00.000Z"),
            lookBackMinutes: 60,
            lookAheadMinutes: 15,
        });

        expect(result).toEqual({
            scanned: 2,
            totalAttempts: 4,
            sent: 4,
            failed: 0,
            skipped: 0,
            duplicate: 0,
        });
        expect(providerSet.calls.map((call) => call.channel).sort()).toEqual([
            "email",
            "email",
            "sms",
            "sms",
        ]);
        expect(repository.attempts.map((attempt) => attempt.eventType).sort()).toEqual([
            "reminder_24h",
            "reminder_24h",
            "reminder_2h",
            "reminder_2h",
        ]);
        expect(repository.attempts.every((attempt) => attempt.scheduledFor?.toISOString() === "2026-05-03T14:00:00.000Z")).toBe(true);
    });

    test("does not duplicate reminders on repeated job runs", async () => {
        const repository = setupRepository();
        const providerSet = providers() as NotificationProviderSet & { calls: Array<{ channel: NotificationChannel }> };
        const now = new Date("2026-05-03T14:00:00.000Z");

        await runBookingReminderJob({ repository, providers: providerSet, now });
        const second = await runBookingReminderJob({ repository, providers: providerSet, now });

        expect(second).toMatchObject({
            scanned: 2,
            totalAttempts: 4,
            sent: 0,
            failed: 0,
            skipped: 0,
            duplicate: 4,
        });
        expect(providerSet.calls).toHaveLength(4);
        expect(repository.attempts.every((attempt) => attempt.attemptCount === 2)).toBe(true);
    });

    test("logs failed reminder sends without failing the job", async () => {
        const repository = setupRepository();

        const result = await runBookingReminderJob({
            repository,
            providers: providers({ failChannel: "sms" }),
            now: new Date("2026-05-03T14:00:00.000Z"),
        });

        expect(result).toMatchObject({
            scanned: 2,
            totalAttempts: 4,
            sent: 2,
            failed: 2,
        });
        expect(repository.attempts.filter((attempt) => attempt.status === "failed")).toHaveLength(2);
    });

    test("retries failed reminder sends on the next run without resending successful channels", async () => {
        const repository = setupRepository();
        const failedProviderSet = providers({ failChannel: "sms" }) as NotificationProviderSet & {
            calls: Array<{ channel: NotificationChannel }>;
        };
        const recoveredProviderSet = providers() as NotificationProviderSet & {
            calls: Array<{ channel: NotificationChannel }>;
        };
        const now = new Date("2026-05-03T14:00:00.000Z");

        await runBookingReminderJob({
            repository,
            providers: failedProviderSet,
            now,
        });
        const retry = await runBookingReminderJob({
            repository,
            providers: recoveredProviderSet,
            now,
        });

        expect(retry).toMatchObject({
            scanned: 2,
            totalAttempts: 4,
            sent: 2,
            failed: 0,
            skipped: 0,
            duplicate: 2,
        });
        expect(recoveredProviderSet.calls.map((call) => call.channel)).toEqual(["sms", "sms"]);
        expect(repository.attempts.filter((attempt) => attempt.channel === "sms").every((attempt) => attempt.status === "sent")).toBe(true);
        expect(repository.attempts.every((attempt) => attempt.attemptCount === 2)).toBe(true);
    });
});
