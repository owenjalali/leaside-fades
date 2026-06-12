import { and, asc, desc, eq, gte, inArray, lt, lte, ne, type SQL } from "drizzle-orm";

import type { AvailabilityData } from "../availability/index.ts";
import type {
    AvailabilityRepositoryRequest,
    BookingInsertInput,
    BookingRepository,
    BookingServiceSnapshot,
    CreateBookingRequest,
} from "../bookings/index.ts";
import { createDatabaseClient } from "../db/client.ts";
import {
    barberLocations,
    barbers,
    bookings,
    bookingServices,
    customers,
    locations,
    notifications,
    schedulerJobRuns,
    serviceCategories,
    services,
} from "../db/schema.ts";
import {
    createDrizzleBookingRepository,
} from "../public-booking/repository.ts";
import type {
    AdminBookingDetailRecord,
    AdminBookingManagementRepository,
    AdminBookingQueryScope,
    AdminBookingRecord,
    AdminCalendarOptions,
    AdminDashboardActivityRecord,
    AdminDashboardActivityScope,
    AdminDashboardBookingScope,
    AdminSchedulerJobRunRecord,
    AdminSchedulerJobRunStatus,
} from "./bookings-service.ts";

type DatabaseExecutor = ReturnType<typeof createDatabaseClient>["db"] | Record<string, unknown>;

let databaseClient: ReturnType<typeof createDatabaseClient> | null = null;

export function getAdminDatabase() {
    if (!databaseClient) {
        databaseClient = createDatabaseClient();
    }

    return databaseClient.db;
}

export function createDrizzleAdminBookingsRepository(
    database: DatabaseExecutor = getAdminDatabase(),
): AdminBookingManagementRepository {
    return new DrizzleAdminBookingsRepository(database);
}

class DrizzleAdminBookingsRepository implements AdminBookingManagementRepository {
    private readonly database: DatabaseExecutor;
    private readonly bookingRepository: BookingRepository & {
        loadAvailabilityData(
            request: CreateBookingRequest | AvailabilityRepositoryRequest,
            localDate: string,
        ): Promise<AvailabilityData>;
    };

    constructor(
        database: DatabaseExecutor,
        options: { sequentialAvailabilityQueries?: boolean } = {},
    ) {
        this.database = database;
        this.bookingRepository = createDrizzleBookingRepository(database, options) as BookingRepository & {
            loadAvailabilityData(
                request: CreateBookingRequest | AvailabilityRepositoryRequest,
                localDate: string,
            ): Promise<AvailabilityData>;
        };
    }

    async withTransaction<T>(callback: (transaction: BookingRepository) => Promise<T>): Promise<T> {
        const db = this.database as { transaction?: (callback: (tx: DatabaseExecutor) => Promise<T>) => Promise<T> };

        if (typeof db.transaction === "function") {
            return db.transaction((tx) =>
                callback(new DrizzleAdminBookingsRepository(tx, { sequentialAvailabilityQueries: true })),
            );
        }

        return callback(this);
    }

    async listBookingsForAdminScope(scope: AdminBookingQueryScope) {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const bookingRows = await db
            .select({
                id: bookings.id,
                barberId: bookings.barberId,
                barberName: barbers.displayName,
                locationId: bookings.locationId,
                locationName: locations.name,
                customerFirstName: customers.firstName,
                customerLastName: customers.lastName,
                customerEmail: customers.email,
                customerPhone: customers.phoneE164,
                status: bookings.status,
                source: bookings.source,
                startTime: bookings.startTime,
                endTime: bookings.endTime,
                totalDurationMinutes: bookings.totalDurationMinutes,
            })
            .from(bookings)
            .innerJoin(customers, eq(bookings.customerId, customers.id))
            .innerJoin(barbers, eq(bookings.barberId, barbers.id))
            .innerJoin(locations, eq(bookings.locationId, locations.id))
            .where(
                compactAnd(
                    scope.barberId ? eq(bookings.barberId, scope.barberId) : undefined,
                    scope.locationId ? eq(bookings.locationId, scope.locationId) : undefined,
                    scope.status ? eq(bookings.status, scope.status) : undefined,
                    scope.from ? gte(bookings.startTime, scope.from) : undefined,
                    scope.to ? lt(bookings.startTime, scope.to) : undefined,
                ),
            )
            .orderBy(desc(bookings.startTime))
            .limit(scope.limit);

        return this.attachServiceNames(bookingRows);
    }

    async listDashboardBookingsForAdminScope(scope: AdminDashboardBookingScope) {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const bookingQuery = db
            .select({
                id: bookings.id,
                barberId: bookings.barberId,
                barberName: barbers.displayName,
                locationId: bookings.locationId,
                locationName: locations.name,
                customerFirstName: customers.firstName,
                customerLastName: customers.lastName,
                customerEmail: customers.email,
                customerPhone: customers.phoneE164,
                status: bookings.status,
                source: bookings.source,
                startTime: bookings.startTime,
                endTime: bookings.endTime,
                totalDurationMinutes: bookings.totalDurationMinutes,
            })
            .from(bookings)
            .innerJoin(customers, eq(bookings.customerId, customers.id))
            .innerJoin(barbers, eq(bookings.barberId, barbers.id))
            .innerJoin(locations, eq(bookings.locationId, locations.id))
            .where(
                compactAnd(
                    scope.barberId ? eq(bookings.barberId, scope.barberId) : undefined,
                    scope.status ? eq(bookings.status, scope.status) : undefined,
                    gte(bookings.startTime, scope.from),
                    lt(bookings.startTime, scope.to),
                ),
            )
            .orderBy(asc(bookings.startTime), asc(bookings.id));
        const bookingRows = scope.limit === undefined ? await bookingQuery : await bookingQuery.limit(scope.limit);

        return this.attachServiceNames(bookingRows);
    }

    async getLatestDashboardRevenueDateForAdminScope(scope: { barberId?: string; now: Date }) {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const [latest] = await db
            .select({
                startTime: bookings.startTime,
            })
            .from(bookings)
            .innerJoin(bookingServices, eq(bookingServices.bookingId, bookings.id))
            .where(
                compactAnd(
                    scope.barberId ? eq(bookings.barberId, scope.barberId) : undefined,
                    inArray(bookings.status, ["confirmed", "completed"]),
                    lte(bookings.startTime, scope.now),
                ),
            )
            .orderBy(desc(bookings.startTime))
            .limit(1);

        return latest?.startTime ?? null;
    }

    async getDashboardRevenueDateRangeForAdminScope(scope: { barberId?: string; now: Date }) {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const revenueRangeWhere = () => compactAnd(
            scope.barberId ? eq(bookings.barberId, scope.barberId) : undefined,
            inArray(bookings.status, ["confirmed", "completed"]),
            lte(bookings.startTime, scope.now),
        );
        const [earliest] = await db
            .select({
                startTime: bookings.startTime,
            })
            .from(bookings)
            .where(revenueRangeWhere())
            .orderBy(asc(bookings.startTime))
            .limit(1);
        const [latest] = await db
            .select({
                startTime: bookings.startTime,
            })
            .from(bookings)
            .where(revenueRangeWhere())
            .orderBy(desc(bookings.startTime))
            .limit(1);

        return {
            earliest: earliest?.startTime ?? null,
            latest: latest?.startTime ?? null,
        };
    }

    async listDashboardActivityForAdminScope(scope: AdminDashboardActivityScope) {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const notificationRows = await db
            .select({
                id: notifications.id,
                bookingId: notifications.bookingId,
                eventType: notifications.eventType,
                status: notifications.status,
                channel: notifications.channel,
                recipientType: notifications.recipientType,
                recipientPhone: notifications.recipientPhone,
                recipientEmail: notifications.recipientEmail,
                provider: notifications.provider,
                providerMessageId: notifications.providerMessageId,
                attemptCount: notifications.attemptCount,
                lastAttemptAt: notifications.lastAttemptAt,
                errorMessage: notifications.errorMessage,
                sentAt: notifications.sentAt,
                scheduledFor: notifications.scheduledFor,
                createdAt: notifications.createdAt,
                updatedAt: notifications.updatedAt,
                barberId: bookings.barberId,
                barberName: barbers.displayName,
                locationName: locations.name,
                customerFirstName: customers.firstName,
                customerLastName: customers.lastName,
                appointmentStatus: bookings.status,
                appointmentSource: bookings.source,
                appointmentStartTime: bookings.startTime,
                appointmentEndTime: bookings.endTime,
            })
            .from(notifications)
            .innerJoin(bookings, eq(notifications.bookingId, bookings.id))
            .innerJoin(customers, eq(bookings.customerId, customers.id))
            .innerJoin(barbers, eq(bookings.barberId, barbers.id))
            .innerJoin(locations, eq(bookings.locationId, locations.id))
            .where(
                compactAnd(
                    ne(notifications.recipientType, "admin"),
                    scope.barberId ? eq(bookings.barberId, scope.barberId) : undefined,
                ),
            )
            .orderBy(desc(notifications.createdAt), desc(notifications.updatedAt))
            .limit(scope.limit);
        const noShowRows = await db
            .select({
                bookingId: bookings.id,
                barberId: bookings.barberId,
                barberName: barbers.displayName,
                locationName: locations.name,
                customerFirstName: customers.firstName,
                customerLastName: customers.lastName,
                appointmentStatus: bookings.status,
                appointmentSource: bookings.source,
                appointmentStartTime: bookings.startTime,
                appointmentEndTime: bookings.endTime,
                updatedAt: bookings.updatedAt,
            })
            .from(bookings)
            .innerJoin(customers, eq(bookings.customerId, customers.id))
            .innerJoin(barbers, eq(bookings.barberId, barbers.id))
            .innerJoin(locations, eq(bookings.locationId, locations.id))
            .where(
                compactAnd(
                    eq(bookings.status, "no_show"),
                    scope.barberId ? eq(bookings.barberId, scope.barberId) : undefined,
                ),
            )
            .orderBy(desc(bookings.updatedAt))
            .limit(Math.min(scope.limit, 12));
        const serviceDetails = await this.loadBookingServiceDetails([
            ...new Set([
                ...notificationRows.map((row) => row.bookingId),
                ...noShowRows.map((row) => row.bookingId),
            ]),
        ]);
        const notificationActivity = notificationRows.map<AdminDashboardActivityRecord>((row) => ({
            id: row.id,
            bookingId: row.bookingId,
            eventType: row.eventType,
            status: row.status,
            channel: row.channel,
            recipientType: row.recipientType,
            recipientLabel: safeRecipientLabel(row),
            customerName: `${row.customerFirstName} ${row.customerLastName}`.trim(),
            barberId: row.barberId,
            barberName: row.barberName,
            locationName: row.locationName,
            appointmentStatus: row.appointmentStatus,
            appointmentSource: row.appointmentSource,
            appointmentStartTime: row.appointmentStartTime,
            appointmentEndTime: row.appointmentEndTime,
            services: serviceDetails[row.bookingId]?.map((service) => service.serviceName) ?? [],
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
            sentAt: row.sentAt,
            scheduledFor: row.scheduledFor,
            errorMessage: row.errorMessage,
            provider: row.provider,
            providerMessageId: row.providerMessageId,
            attemptCount: row.attemptCount,
            lastAttemptAt: row.lastAttemptAt,
        }));
        const noShowActivity = noShowRows.map<AdminDashboardActivityRecord>((row) => ({
            id: `${row.bookingId}:no-show`,
            bookingId: row.bookingId,
            eventType: "no_show",
            status: "no_show",
            channel: "calendar",
            recipientType: "shop",
            recipientLabel: "Calendar",
            customerName: `${row.customerFirstName} ${row.customerLastName}`.trim(),
            barberId: row.barberId,
            barberName: row.barberName,
            locationName: row.locationName,
            appointmentStatus: row.appointmentStatus,
            appointmentSource: row.appointmentSource,
            appointmentStartTime: row.appointmentStartTime,
            appointmentEndTime: row.appointmentEndTime,
            services: serviceDetails[row.bookingId]?.map((service) => service.serviceName) ?? [],
            createdAt: row.updatedAt,
            updatedAt: row.updatedAt,
            sentAt: null,
            scheduledFor: null,
            errorMessage: null,
            provider: null,
            providerMessageId: null,
            attemptCount: 0,
            lastAttemptAt: null,
        }));

        return [...notificationActivity, ...noShowActivity]
            .sort((left, right) => right.createdAt.getTime() - left.createdAt.getTime())
            .slice(0, scope.limit);
    }

    async getSchedulerJobRunSummary(input: { jobName: string }) {
        try {
            const [latest, latestSuccess, latestFailure] = await Promise.all([
                this.getLatestSchedulerJobRun(input.jobName),
                this.getLatestSchedulerJobRun(input.jobName, "success"),
                this.getLatestSchedulerJobRun(input.jobName, "failure"),
            ]);

            return {
                latest,
                latestSuccess,
                latestFailure,
            };
        } catch (error) {
            if (isMissingSchedulerJobRunsTable(error)) {
                return null;
            }

            throw error;
        }
    }

    async getBookingByIdForAdminScope(scope: { bookingId: string; barberId?: string }) {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const [booking] = await db
            .select({
                id: bookings.id,
                barberId: bookings.barberId,
                barberName: barbers.displayName,
                locationId: bookings.locationId,
                locationName: locations.name,
                customerFirstName: customers.firstName,
                customerLastName: customers.lastName,
                customerEmail: customers.email,
                customerPhone: customers.phoneE164,
                status: bookings.status,
                source: bookings.source,
                startTime: bookings.startTime,
                endTime: bookings.endTime,
                totalDurationMinutes: bookings.totalDurationMinutes,
                customerNotes: bookings.customerNotes,
                internalNotes: bookings.internalNotes,
            })
            .from(bookings)
            .innerJoin(customers, eq(bookings.customerId, customers.id))
            .innerJoin(barbers, eq(bookings.barberId, barbers.id))
            .innerJoin(locations, eq(bookings.locationId, locations.id))
            .where(
                compactAnd(
                    eq(bookings.id, scope.bookingId),
                    scope.barberId ? eq(bookings.barberId, scope.barberId) : undefined,
                ),
            )
            .limit(1);

        if (!booking) {
            return null;
        }

        const serviceDetails = await this.loadBookingServiceDetails([booking.id]);

        return {
            id: booking.id,
            barberId: booking.barberId,
            barberName: booking.barberName,
            locationId: booking.locationId,
            locationName: booking.locationName,
            customerName: `${booking.customerFirstName} ${booking.customerLastName}`.trim(),
            customerEmail: booking.customerEmail,
            customerPhone: booking.customerPhone,
            status: booking.status,
            source: booking.source,
            startTime: booking.startTime,
            endTime: booking.endTime,
            totalDurationMinutes: booking.totalDurationMinutes,
            services: serviceDetails[booking.id]?.map((service) => service.serviceName) ?? [],
            serviceIds:
                serviceDetails[booking.id]
                    ?.map((service) => service.serviceId)
                    .filter((serviceId): serviceId is string => Boolean(serviceId)) ?? [],
            serviceDetails: serviceDetails[booking.id] ?? [],
            customerNotes: booking.customerNotes,
            internalNotes: booking.internalNotes,
        } satisfies AdminBookingDetailRecord;
    }

    private async getLatestSchedulerJobRun(jobName: string, status?: AdminSchedulerJobRunStatus) {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const [row] = await db
            .select({
                id: schedulerJobRuns.id,
                jobName: schedulerJobRuns.jobName,
                trigger: schedulerJobRuns.trigger,
                status: schedulerJobRuns.status,
                startedAt: schedulerJobRuns.startedAt,
                finishedAt: schedulerJobRuns.finishedAt,
                durationMs: schedulerJobRuns.durationMs,
                result: schedulerJobRuns.result,
                errorMessage: schedulerJobRuns.errorMessage,
                createdAt: schedulerJobRuns.createdAt,
                updatedAt: schedulerJobRuns.updatedAt,
            })
            .from(schedulerJobRuns)
            .where(
                compactAnd(
                    eq(schedulerJobRuns.jobName, jobName),
                    status ? eq(schedulerJobRuns.status, status) : undefined,
                ),
            )
            .orderBy(desc(schedulerJobRuns.startedAt))
            .limit(1);

        return row ? mapSchedulerJobRun(row) : null;
    }

    async listCalendarOptions(): Promise<AdminCalendarOptions>;
    async listCalendarOptions(scope: { barberId?: string }): Promise<AdminCalendarOptions>;
    async listCalendarOptions(scope: { barberId?: string } = {}) {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const [locationRows, barberRows, barberLocationRows, serviceRows] = await Promise.all([
            db
                .select({
                    id: locations.id,
                    name: locations.name,
                    sortOrder: locations.sortOrder,
                })
                .from(locations)
                .where(eq(locations.active, true))
                .orderBy(asc(locations.sortOrder), asc(locations.name)),
            db
                .select({
                    id: barbers.id,
                    slug: barbers.slug,
                    displayName: barbers.displayName,
                    profileImageUrl: barbers.profileImageUrl,
                    profileImagePathname: barbers.profileImagePathname,
                    sortOrder: barbers.sortOrder,
                })
                .from(barbers)
                .where(
                    compactAnd(
                        eq(barbers.active, true),
                        scope.barberId ? eq(barbers.id, scope.barberId) : undefined,
                    ),
                )
                .orderBy(asc(barbers.sortOrder), asc(barbers.displayName)),
            db.select().from(barberLocations),
            db
                .select({
                    id: services.id,
                    name: services.name,
                    durationMinutes: services.durationMinutes,
                    displayPrice: services.displayPrice,
                    priceCents: services.priceCents,
                    priceType: services.priceType,
                    sortOrder: services.sortOrder,
                })
                .from(services)
                .where(eq(services.active, true))
                .orderBy(asc(services.sortOrder), asc(services.name)),
        ]);

        const barberIds = new Set(barberRows.map((barber) => barber.id));

        return {
            locations: locationRows,
            barbers: barberRows.map((barber) => ({
                ...barber,
                locationIds: barberLocationRows
                    .filter((assignment) => assignment.barberId === barber.id && barberIds.has(assignment.barberId))
                    .map((assignment) => assignment.locationId),
            })),
            services: serviceRows,
        };
    }

    async loadAvailabilityData(request: CreateBookingRequest | AvailabilityRepositoryRequest, localDate: string) {
        const data = await this.bookingRepository.loadAvailabilityData(request, localDate);

        if (!request.excludeBookingId) {
            return data;
        }

        return {
            ...data,
            bookings: (data.bookings ?? []).filter(
                (booking) => (booking as { id?: string }).id !== request.excludeBookingId,
            ),
        };
    }

    async loadServiceSnapshots(serviceIds: string[]) {
        return this.bookingRepository.loadServiceSnapshots(serviceIds);
    }

    async countConfirmedBookingsByBarber(barberIds: string[], startOfDay: Date, endOfDay: Date) {
        return this.bookingRepository.countConfirmedBookingsByBarber(barberIds, startOfDay, endOfDay);
    }

    async hasConfirmedBookingOverlap(
        barberId: string,
        startTime: Date,
        endTime: Date,
        excludeBookingId?: string,
    ) {
        return this.bookingRepository.hasConfirmedBookingOverlap(
            barberId,
            startTime,
            endTime,
            excludeBookingId,
        );
    }

    async hasBlockedTimeOverlap(barberId: string, locationId: string, startTime: Date, endTime: Date) {
        return this.bookingRepository.hasBlockedTimeOverlap(barberId, locationId, startTime, endTime);
    }

    async createCustomer(customer: CreateBookingRequest["customer"]) {
        return this.bookingRepository.createCustomer(customer);
    }

    async insertBooking(booking: BookingInsertInput) {
        return this.bookingRepository.insertBooking(booking);
    }

    async insertBookingServices(bookingId: string, snapshots: BookingServiceSnapshot[]) {
        return this.bookingRepository.insertBookingServices(bookingId, snapshots);
    }

    async cancelBookingForAdminScope(input: {
        bookingId: string;
        barberId?: string;
        cancelledAt: Date;
        cancelledByUserId: string;
    }) {
        const existing = await this.getBookingByIdForAdminScope({
            bookingId: input.bookingId,
            barberId: input.barberId,
        });

        if (!existing) {
            return null;
        }

        if (existing.status === "completed" || existing.status === "no_show") {
            return { ...existing, mutable: false };
        }

        if (existing.status !== "cancelled") {
            const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
            await db
                .update(bookings)
                .set({
                    status: "cancelled",
                    cancelledAt: input.cancelledAt,
                    cancelledByUserId: input.cancelledByUserId,
                    updatedAt: input.cancelledAt,
                })
                .where(
                    compactAnd(
                        eq(bookings.id, input.bookingId),
                        input.barberId ? eq(bookings.barberId, input.barberId) : undefined,
                    ),
                );
        }

        const updated = await this.getBookingByIdForAdminScope({
            bookingId: input.bookingId,
            barberId: input.barberId,
        });

        return updated ? { ...updated, mutable: true } : null;
    }

    async markBookingNoShowForAdminScope(input: {
        bookingId: string;
        barberId?: string;
        markedAt: Date;
        markedByUserId: string;
    }) {
        const existing = await this.getBookingByIdForAdminScope({
            bookingId: input.bookingId,
            barberId: input.barberId,
        });

        if (!existing) {
            return null;
        }

        if (existing.status !== "confirmed" || existing.startTime > input.markedAt) {
            return { ...existing, mutable: false };
        }

        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        await db
            .update(bookings)
            .set({
                status: "no_show",
                updatedAt: input.markedAt,
            })
            .where(
                compactAnd(
                    eq(bookings.id, input.bookingId),
                    input.barberId ? eq(bookings.barberId, input.barberId) : undefined,
                    eq(bookings.status, "confirmed"),
                    lte(bookings.startTime, input.markedAt),
                ),
            );

        const updated = await this.getBookingByIdForAdminScope({
            bookingId: input.bookingId,
            barberId: input.barberId,
        });

        return updated ? { ...updated, mutable: true } : null;
    }

    async completeBookingForAdminScope(input: {
        bookingId: string;
        barberId?: string;
        completedAt: Date;
    }) {
        const existing = await this.getBookingByIdForAdminScope({
            bookingId: input.bookingId,
            barberId: input.barberId,
        });

        if (!existing) {
            return null;
        }

        if (existing.status !== "confirmed" || existing.startTime > input.completedAt) {
            return { ...existing, mutable: false };
        }

        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const [completed] = await db
            .update(bookings)
            .set({
                status: "completed",
                updatedAt: input.completedAt,
            })
            .where(
                compactAnd(
                    eq(bookings.id, input.bookingId),
                    input.barberId ? eq(bookings.barberId, input.barberId) : undefined,
                    eq(bookings.status, "confirmed"),
                    lte(bookings.startTime, input.completedAt),
                ),
            )
            .returning({ id: bookings.id });

        if (!completed) {
            const latest = await this.getBookingByIdForAdminScope({
                bookingId: input.bookingId,
                barberId: input.barberId,
            });
            return latest ? { ...latest, mutable: false } : null;
        }

        const updated = await this.getBookingByIdForAdminScope({
            bookingId: input.bookingId,
            barberId: input.barberId,
        });

        return updated ? { ...updated, mutable: true } : null;
    }

    async updateBookingScheduleForAdminScope(input: {
        bookingId: string;
        barberId?: string;
        nextBarberId: string;
        locationId: string;
        startTime: Date;
        endTime: Date;
        totalDurationMinutes: number;
        updatedAt: Date;
    }) {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const [updated] = await db
            .update(bookings)
            .set({
                barberId: input.nextBarberId,
                locationId: input.locationId,
                startTime: input.startTime,
                endTime: input.endTime,
                totalDurationMinutes: input.totalDurationMinutes,
                updatedAt: input.updatedAt,
            })
            .where(
                compactAnd(
                    eq(bookings.id, input.bookingId),
                    input.barberId ? eq(bookings.barberId, input.barberId) : undefined,
                    eq(bookings.status, "confirmed"),
                ),
            )
            .returning({ id: bookings.id });

        if (!updated) {
            return null;
        }

        return this.getBookingByIdForAdminScope({ bookingId: input.bookingId });
    }

    async updateBookingAppointmentForAdminScope(input: {
        bookingId: string;
        barberId?: string;
        nextBarberId: string;
        locationId: string;
        startTime: Date;
        endTime: Date;
        totalDurationMinutes: number;
        customer: {
            firstName: string;
            lastName: string;
            phoneE164: string | null;
            email: string | null;
            notes?: string | null;
        };
        customerNotes: string | null;
        internalNotes: string | null;
        serviceSnapshots: BookingServiceSnapshot[];
        updatedAt: Date;
    }) {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const [existing] = await db
            .select({
                id: bookings.id,
                customerId: bookings.customerId,
            })
            .from(bookings)
            .where(
                compactAnd(
                    eq(bookings.id, input.bookingId),
                    input.barberId ? eq(bookings.barberId, input.barberId) : undefined,
                    eq(bookings.status, "confirmed"),
                ),
            )
            .limit(1);

        if (!existing) {
            return null;
        }

        await db
            .update(customers)
            .set({
                firstName: input.customer.firstName,
                lastName: input.customer.lastName,
                phoneE164: input.customer.phoneE164,
                email: input.customer.email,
                notes: input.customer.notes ?? null,
                updatedAt: input.updatedAt,
            })
            .where(eq(customers.id, existing.customerId));

        const [updated] = await db
            .update(bookings)
            .set({
                barberId: input.nextBarberId,
                locationId: input.locationId,
                startTime: input.startTime,
                endTime: input.endTime,
                totalDurationMinutes: input.totalDurationMinutes,
                customerNotes: input.customerNotes,
                internalNotes: input.internalNotes,
                updatedAt: input.updatedAt,
            })
            .where(eq(bookings.id, input.bookingId))
            .returning({ id: bookings.id });

        if (!updated) {
            return null;
        }

        await db.delete(bookingServices).where(eq(bookingServices.bookingId, input.bookingId));
        await this.insertBookingServices(input.bookingId, input.serviceSnapshots);

        return this.getBookingByIdForAdminScope({ bookingId: input.bookingId });
    }

    private async attachServiceNames(
        bookingRows: Array<{
            id: string;
            barberId: string;
            barberName: string;
            locationId: string;
            locationName: string;
            customerFirstName: string;
            customerLastName: string;
            customerEmail: string | null;
            customerPhone: string | null;
            status: AdminBookingRecord["status"];
            source: AdminBookingRecord["source"];
            startTime: Date;
            endTime: Date;
            totalDurationMinutes: number;
        }>,
    ): Promise<AdminBookingRecord[]> {
        const serviceDetails = await this.loadBookingServiceDetails(bookingRows.map((booking) => booking.id));

        return bookingRows.map<AdminBookingRecord>((booking) => ({
            id: booking.id,
            barberId: booking.barberId,
            barberName: booking.barberName,
            locationId: booking.locationId,
            locationName: booking.locationName,
            customerName: `${booking.customerFirstName} ${booking.customerLastName}`.trim(),
            customerEmail: booking.customerEmail,
            customerPhone: booking.customerPhone,
            status: booking.status,
            source: booking.source,
            startTime: booking.startTime,
            endTime: booking.endTime,
            totalDurationMinutes: booking.totalDurationMinutes,
            services: serviceDetails[booking.id]?.map((service) => service.serviceName) ?? [],
            serviceDetails: serviceDetails[booking.id] ?? [],
        }));
    }

    private async loadBookingServiceDetails(bookingIds: string[]) {
        if (bookingIds.length === 0) {
            return {};
        }

        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const serviceRows = await db
            .select({
                bookingId: bookingServices.bookingId,
                serviceId: bookingServices.serviceId,
                serviceName: bookingServices.serviceName,
                categoryName: bookingServices.categoryName,
                durationMinutes: bookingServices.durationMinutes,
                priceCents: bookingServices.priceCents,
                priceType: bookingServices.priceType,
                displayPrice: bookingServices.displayPrice,
                sortOrder: bookingServices.sortOrder,
            })
            .from(bookingServices)
            .where(inArray(bookingServices.bookingId, bookingIds))
            .orderBy(asc(bookingServices.sortOrder), asc(bookingServices.serviceName));

        return serviceRows.reduce<Record<string, BookingServiceSnapshot[]>>((servicesByBooking, row) => {
            servicesByBooking[row.bookingId] ??= [];
            servicesByBooking[row.bookingId].push({
                serviceId: row.serviceId,
                serviceName: row.serviceName,
                categoryName: row.categoryName,
                durationMinutes: row.durationMinutes,
                priceCents: row.priceCents,
                priceType: row.priceType,
                displayPrice: row.displayPrice,
                sortOrder: row.sortOrder,
            });
            return servicesByBooking;
        }, {});
    }
}

function compactAnd(...conditions: Array<SQL | undefined>) {
    return and(...conditions.filter(Boolean) as SQL[]);
}

function mapSchedulerJobRun(row: {
    id: string;
    jobName: string;
    trigger: string;
    status: string;
    startedAt: Date;
    finishedAt: Date;
    durationMs: number;
    result: Record<string, unknown> | null;
    errorMessage: string | null;
    createdAt: Date;
    updatedAt: Date;
}): AdminSchedulerJobRunRecord {
    return {
        id: row.id,
        jobName: row.jobName,
        trigger: row.trigger,
        status: row.status as AdminSchedulerJobRunStatus,
        startedAt: row.startedAt,
        finishedAt: row.finishedAt,
        durationMs: row.durationMs,
        result: row.result,
        errorMessage: row.errorMessage,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

function isMissingSchedulerJobRunsTable(error: unknown) {
    const maybeError = error as { code?: string; message?: string };

    return (
        maybeError.code === "42P01" ||
        /relation .*scheduler_job_runs.* does not exist/i.test(maybeError.message ?? "")
    );
}

function safeRecipientLabel(row: {
    recipientType: string;
    channel: string;
    recipientPhone: string | null;
    recipientEmail: string | null;
}) {
    const target =
        row.channel === "sms"
            ? maskPhone(row.recipientPhone)
            : maskEmail(row.recipientEmail);
    const recipient =
        row.recipientType === "barber"
            ? "Staff"
            : row.recipientType === "customer"
              ? "Customer"
              : "Admin";

    return target ? `${recipient} ${row.channel.toUpperCase()} ${target}` : `${recipient} ${row.channel.toUpperCase()}`;
}

function maskPhone(value: string | null) {
    if (!value) return "";
    const digits = value.replace(/\D/g, "");
    return digits.length >= 4 ? `***${digits.slice(-4)}` : "***";
}

function maskEmail(value: string | null) {
    if (!value) return "";
    const [localPart, domain] = value.split("@");
    if (!localPart || !domain) return "***";
    return `${localPart.slice(0, 1)}***@${domain}`;
}
