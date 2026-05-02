import { and, asc, eq, gte, inArray, lt, sql } from "drizzle-orm";

import { createDatabaseClient } from "../db/client.ts";
import {
    barbers,
    bookings,
    bookingServices,
    customers,
    locations,
    notifications,
    users,
} from "../db/schema.ts";
import type { BookingLifecycleNotificationRepository } from "./dispatcher.ts";
import type {
    BookingNotificationAttempt,
    BookingNotificationContext,
} from "./types.ts";
import type { BookingReminderNotificationRepository } from "./reminders.ts";

type DatabaseExecutor = ReturnType<typeof createDatabaseClient>["db"] | Record<string, unknown>;

let databaseClient: ReturnType<typeof createDatabaseClient> | null = null;

export function getNotificationDatabase() {
    if (!databaseClient) {
        databaseClient = createDatabaseClient();
    }

    return databaseClient.db;
}

export function createDrizzleNotificationRepository(
    database: DatabaseExecutor = getNotificationDatabase(),
): BookingLifecycleNotificationRepository & BookingReminderNotificationRepository {
    return new DrizzleNotificationRepository(database);
}

class DrizzleNotificationRepository
    implements BookingLifecycleNotificationRepository, BookingReminderNotificationRepository
{
    private readonly database: DatabaseExecutor;

    constructor(database: DatabaseExecutor) {
        this.database = database;
    }

    async getBookingNotificationContext(bookingId: string): Promise<BookingNotificationContext | null> {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const [booking] = await db
            .select({
                bookingId: bookings.id,
                status: bookings.status,
                source: bookings.source,
                customerFirstName: customers.firstName,
                customerLastName: customers.lastName,
                customerPhone: customers.phoneE164,
                customerEmail: customers.email,
                barberName: barbers.displayName,
                barberPhone: barbers.phoneE164,
                barberEmail: barbers.email,
                locationName: locations.name,
                startTime: bookings.startTime,
                endTime: bookings.endTime,
            })
            .from(bookings)
            .innerJoin(customers, eq(bookings.customerId, customers.id))
            .innerJoin(barbers, eq(bookings.barberId, barbers.id))
            .innerJoin(locations, eq(bookings.locationId, locations.id))
            .where(eq(bookings.id, bookingId))
            .limit(1);

        if (!booking) {
            return null;
        }

        const services = await db
            .select({
                name: bookingServices.serviceName,
                priceCents: bookingServices.priceCents,
                priceType: bookingServices.priceType,
            })
            .from(bookingServices)
            .where(eq(bookingServices.bookingId, bookingId))
            .orderBy(asc(bookingServices.sortOrder), asc(bookingServices.serviceName));
        const ownerAdminRows = await db
            .select({ email: users.email })
            .from(users)
            .where(and(eq(users.active, true), inArray(users.role, ["owner", "admin"])))
            .orderBy(asc(users.email));

        return {
            bookingId: booking.bookingId,
            status: booking.status,
            source: booking.source,
            customerName: `${booking.customerFirstName} ${booking.customerLastName}`.trim(),
            customerPhone: booking.customerPhone,
            customerEmail: booking.customerEmail,
            barberName: booking.barberName,
            barberPhone: booking.barberPhone,
            barberEmail: booking.barberEmail,
            ownerAdminEmails: Array.from(new Set(ownerAdminRows.map((row) => row.email))),
            locationName: booking.locationName,
            startTime: booking.startTime,
            endTime: booking.endTime,
            services: services.map((service) => service.name),
            priceSummary: formatPriceSummary(services),
        };
    }

    async listReminderCandidates(input: { startFrom: Date; startTo: Date }) {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];

        return db
            .select({
                bookingId: bookings.id,
                startTime: bookings.startTime,
            })
            .from(bookings)
            .where(
                and(
                    eq(bookings.status, "confirmed"),
                    inArray(bookings.source, ["public", "manual", "walk_in"]),
                    gte(bookings.startTime, input.startFrom),
                    lt(bookings.startTime, input.startTo),
                ),
            )
            .orderBy(asc(bookings.startTime), asc(bookings.id));
    }

    async createPendingAttempt(input: Omit<BookingNotificationAttempt, "id" | "status" | "attemptCount">) {
        return this.insertPendingAttempt(input);
    }

    async createSkippedAttempt(input: Omit<BookingNotificationAttempt, "id" | "attemptCount">) {
        return this.insertAttempt(input);
    }

    async markAttemptSent(
        id: string,
        input: { provider: string; providerMessageId: string; sentAt: Date },
    ) {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        await db
            .update(notifications)
            .set({
                status: "sent",
                provider: input.provider,
                providerMessageId: input.providerMessageId,
                sentAt: input.sentAt,
                updatedAt: input.sentAt,
            })
            .where(eq(notifications.id, id));
    }

    async markAttemptFailed(id: string, input: { provider: string; errorMessage: string }) {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        await db
            .update(notifications)
            .set({
                status: "failed",
                provider: input.provider,
                errorMessage: input.errorMessage,
                updatedAt: new Date(),
            })
            .where(eq(notifications.id, id));
    }

    private async insertPendingAttempt(
        input: Omit<BookingNotificationAttempt, "id" | "status" | "attemptCount">,
    ) {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const [created] = await db
            .insert(notifications)
            .values({
                bookingId: input.bookingId,
                recipientType: input.recipientType,
                recipientPhone: input.recipientPhone,
                recipientEmail: input.recipientEmail,
                channel: input.channel,
                eventType: input.eventType,
                status: "pending",
                provider: input.provider,
                idempotencyKey: input.idempotencyKey,
                providerMessageId: input.providerMessageId,
                errorMessage: input.errorMessage,
                metadata: input.metadata,
                attemptCount: 1,
                scheduledFor: input.scheduledFor,
                sentAt: input.sentAt,
                lastAttemptAt: input.lastAttemptAt,
                createdAt: input.createdAt,
                updatedAt: input.updatedAt,
            })
            .onConflictDoNothing({ target: notifications.idempotencyKey })
            .returning(notificationReturningFields);

        if (created) {
            return { action: "created" as const, attempt: mapNotificationAttempt(created) };
        }

        const [retry] = await db
            .update(notifications)
            .set({
                status: "pending",
                provider: null,
                providerMessageId: null,
                errorMessage: null,
                metadata: input.metadata,
                scheduledFor: input.scheduledFor,
                sentAt: null,
                attemptCount: sql`${notifications.attemptCount} + 1`,
                lastAttemptAt: input.lastAttemptAt,
                updatedAt: input.updatedAt,
            })
            .where(
                and(
                    eq(notifications.idempotencyKey, input.idempotencyKey),
                    eq(notifications.status, "failed"),
                ),
            )
            .returning(notificationReturningFields);

        if (retry) {
            return { action: "retry" as const, attempt: mapNotificationAttempt(retry) };
        }

        const [duplicate] = await db
            .update(notifications)
            .set({
                attemptCount: sql`${notifications.attemptCount} + 1`,
                lastAttemptAt: input.lastAttemptAt,
                updatedAt: input.updatedAt,
            })
            .where(eq(notifications.idempotencyKey, input.idempotencyKey))
            .returning(notificationReturningFields);

        return { action: "duplicate" as const, attempt: mapNotificationAttempt(duplicate) };
    }

    private async insertAttempt(input: Omit<BookingNotificationAttempt, "id" | "attemptCount">) {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const [created] = await db
            .insert(notifications)
            .values({
                bookingId: input.bookingId,
                recipientType: input.recipientType,
                recipientPhone: input.recipientPhone,
                recipientEmail: input.recipientEmail,
                channel: input.channel,
                eventType: input.eventType,
                status: input.status,
                provider: input.provider,
                idempotencyKey: input.idempotencyKey,
                providerMessageId: input.providerMessageId,
                errorMessage: input.errorMessage,
                metadata: input.metadata,
                attemptCount: 1,
                scheduledFor: input.scheduledFor,
                sentAt: input.sentAt,
                lastAttemptAt: input.lastAttemptAt,
                createdAt: input.createdAt,
                updatedAt: input.updatedAt,
            })
            .onConflictDoNothing({ target: notifications.idempotencyKey })
            .returning(notificationReturningFields);

        if (created) {
            return { duplicate: false, attempt: mapNotificationAttempt(created) };
        }

        const [duplicate] = await db
            .update(notifications)
            .set({
                attemptCount: sql`${notifications.attemptCount} + 1`,
                lastAttemptAt: input.lastAttemptAt,
                updatedAt: input.updatedAt,
            })
            .where(eq(notifications.idempotencyKey, input.idempotencyKey))
            .returning(notificationReturningFields);

        return { duplicate: true, attempt: mapNotificationAttempt(duplicate) };
    }
}

const notificationReturningFields = {
    id: notifications.id,
    bookingId: notifications.bookingId,
    recipientType: notifications.recipientType,
    recipientPhone: notifications.recipientPhone,
    recipientEmail: notifications.recipientEmail,
    channel: notifications.channel,
    eventType: notifications.eventType,
    status: notifications.status,
    provider: notifications.provider,
    idempotencyKey: notifications.idempotencyKey,
    providerMessageId: notifications.providerMessageId,
    errorMessage: notifications.errorMessage,
    metadata: notifications.metadata,
    attemptCount: notifications.attemptCount,
    scheduledFor: notifications.scheduledFor,
    sentAt: notifications.sentAt,
    lastAttemptAt: notifications.lastAttemptAt,
    createdAt: notifications.createdAt,
    updatedAt: notifications.updatedAt,
};

function mapNotificationAttempt(row: any): BookingNotificationAttempt {
    return {
        id: row.id,
        bookingId: row.bookingId,
        recipientType: row.recipientType,
        recipientPhone: row.recipientPhone,
        recipientEmail: row.recipientEmail,
        channel: row.channel,
        eventType: row.eventType,
        status: row.status,
        provider: row.provider,
        idempotencyKey: row.idempotencyKey,
        providerMessageId: row.providerMessageId,
        errorMessage: row.errorMessage,
        metadata: row.metadata ?? {},
        attemptCount: row.attemptCount,
        scheduledFor: row.scheduledFor,
        sentAt: row.sentAt,
        lastAttemptAt: row.lastAttemptAt,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

function formatPriceSummary(
    services: Array<{ priceCents: number; priceType: "fixed" | "from" }>,
) {
    const totalCents = services.reduce((total, service) => total + service.priceCents, 0);
    const hasFromPrice = services.some((service) => service.priceType === "from");
    return `${hasFromPrice ? "from " : ""}${formatCents(totalCents)}`;
}

function formatCents(cents: number) {
    const dollars = cents / 100;
    return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}
