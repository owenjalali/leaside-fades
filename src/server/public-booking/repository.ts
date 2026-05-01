import { and, asc, eq, gt, gte, inArray, lt, lte, or, sql, type SQL } from "drizzle-orm";

import type { AvailabilityData } from "../availability/index.ts";
import { getLocalDate, localDateTimeToUtc } from "../availability/time.ts";
import type {
    AvailabilityRepositoryRequest,
    BookingInsertInput,
    BookingRepository,
    BookingServiceSnapshot,
    CreateBookingRequest,
    CreatedBooking,
} from "../bookings/index.ts";
import type {
    CustomerBookingManagementRepository,
    CustomerManagedBookingRecord,
} from "./customer-management-service.ts";
import { createDatabaseClient } from "../db/client.ts";
import {
    barberLocations,
    barbers,
    blockedTimes,
    bookings,
    bookingServices,
    businessHours,
    customers,
    locations,
    serviceCategories,
    services,
    shiftOverrides,
    shifts,
} from "../db/schema.ts";
import type { AvailabilityLookupRepository, PublicAvailabilityLookupRequest } from "./service.ts";

type DatabaseExecutor = ReturnType<typeof createDatabaseClient>["db"] | Record<string, unknown>;

export interface PublicCatalogLocation {
    id: string;
    slug: string;
    name: string;
    addressLine1: string;
    city: string;
    province: string;
    postalCode: string;
    phoneDisplay: string;
    timezone: string;
    sortOrder: number;
}

export interface PublicCatalogService {
    id: string;
    categoryId: string;
    slug: string;
    name: string;
    durationMinutes: number;
    priceCents: number;
    priceType: "fixed" | "from";
    displayPrice: string;
    description: string | null;
    sortOrder: number;
    isFeatured: boolean;
}

export interface PublicCatalogServiceCategory {
    id: string;
    slug: string;
    name: string;
    sortOrder: number;
    services: PublicCatalogService[];
}

export interface PublicCatalogBarber {
    id: string;
    slug: string;
    displayName: string;
    sortOrder: number;
    locationIds: string[];
}

export interface PublicBookingCatalog {
    locations: PublicCatalogLocation[];
    serviceCategories: PublicCatalogServiceCategory[];
    barbers: PublicCatalogBarber[];
}

interface CatalogRows {
    locations: PublicCatalogLocation[];
    categories: Omit<PublicCatalogServiceCategory, "services">[];
    services: PublicCatalogService[];
    barbers: Omit<PublicCatalogBarber, "locationIds">[];
    barberLocations: { barberId: string; locationId: string }[];
}

type AvailabilityRows = {
    businessHours: AvailabilityData["businessHours"];
    barbers: AvailabilityData["barbers"];
    barberLocations: AvailabilityData["barberLocations"];
    services: AvailabilityData["services"];
    shifts: Array<
        AvailabilityData["shifts"][number] & {
            effectiveFrom?: string | Date | null;
            effectiveTo?: string | Date | null;
        }
    >;
    shiftOverrides: AvailabilityData["shiftOverrides"];
    bookings: AvailabilityData["bookings"];
    blockedTimes: AvailabilityData["blockedTimes"];
};

let databaseClient: ReturnType<typeof createDatabaseClient> | null = null;

export function getPublicBookingDatabase() {
    if (!databaseClient) {
        databaseClient = createDatabaseClient();
    }

    return databaseClient.db;
}

export async function loadPublicBookingCatalog(
    database: DatabaseExecutor = getPublicBookingDatabase(),
): Promise<PublicBookingCatalog> {
    const db = database as ReturnType<typeof createDatabaseClient>["db"];

    const [locationRows, categoryRows, serviceRows, barberRows, barberLocationRows] =
        await Promise.all([
            db
                .select({
                    id: locations.id,
                    slug: locations.slug,
                    name: locations.name,
                    addressLine1: locations.addressLine1,
                    city: locations.city,
                    province: locations.province,
                    postalCode: locations.postalCode,
                    phoneDisplay: locations.phoneDisplay,
                    timezone: locations.timezone,
                    sortOrder: locations.sortOrder,
                })
                .from(locations)
                .where(eq(locations.active, true))
                .orderBy(asc(locations.sortOrder), asc(locations.name)),
            db
                .select({
                    id: serviceCategories.id,
                    slug: serviceCategories.slug,
                    name: serviceCategories.name,
                    sortOrder: serviceCategories.sortOrder,
                })
                .from(serviceCategories)
                .orderBy(asc(serviceCategories.sortOrder), asc(serviceCategories.name)),
            db
                .select({
                    id: services.id,
                    categoryId: services.categoryId,
                    slug: services.slug,
                    name: services.name,
                    durationMinutes: services.durationMinutes,
                    priceCents: services.priceCents,
                    priceType: services.priceType,
                    displayPrice: services.displayPrice,
                    description: services.description,
                    sortOrder: services.sortOrder,
                    isFeatured: services.isFeatured,
                })
                .from(services)
                .where(eq(services.active, true))
                .orderBy(asc(services.sortOrder), asc(services.name)),
            db
                .select({
                    id: barbers.id,
                    slug: barbers.slug,
                    displayName: barbers.displayName,
                    sortOrder: barbers.sortOrder,
                })
                .from(barbers)
                .where(eq(barbers.active, true))
                .orderBy(asc(barbers.sortOrder), asc(barbers.displayName)),
            db.select().from(barberLocations),
        ]);

    return formatCatalog({
        locations: locationRows,
        categories: categoryRows,
        services: serviceRows,
        barbers: barberRows,
        barberLocations: barberLocationRows,
    });
}

export function formatCatalog(rows: CatalogRows): PublicBookingCatalog {
    const serviceCategoriesWithServices = rows.categories
        .map((category) => ({
            ...category,
            services: rows.services
                .filter((service) => service.categoryId === category.id)
                .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
        }))
        .filter((category) => category.services.length > 0)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));

    const publicBarbers = rows.barbers
        .map((barber) => ({
            ...barber,
            locationIds: rows.barberLocations
                .filter((assignment) => assignment.barberId === barber.id)
                .map((assignment) => assignment.locationId),
        }))
        .filter((barber) => barber.locationIds.length > 0)
        .sort((a, b) => a.sortOrder - b.sortOrder || a.displayName.localeCompare(b.displayName));

    return {
        locations: [...rows.locations].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name)),
        serviceCategories: serviceCategoriesWithServices,
        barbers: publicBarbers,
    };
}

export function createDrizzleBookingRepository(
    database: DatabaseExecutor = getPublicBookingDatabase(),
    options: { sequentialAvailabilityQueries?: boolean } = {},
): BookingRepository & AvailabilityLookupRepository {
    return new DrizzleBookingRepository(database, options);
}

export function createDrizzleCustomerBookingManagementRepository(
    database: DatabaseExecutor = getPublicBookingDatabase(),
): CustomerBookingManagementRepository {
    return new DrizzleCustomerBookingManagementRepository(database);
}

class DrizzleBookingRepository implements BookingRepository, AvailabilityLookupRepository {
    private readonly database: DatabaseExecutor;
    private readonly sequentialAvailabilityQueries: boolean;

    constructor(
        database: DatabaseExecutor,
        options: { sequentialAvailabilityQueries?: boolean } = {},
    ) {
        this.database = database;
        this.sequentialAvailabilityQueries = options.sequentialAvailabilityQueries ?? false;
    }

    async withTransaction<T>(callback: (transaction: BookingRepository) => Promise<T>): Promise<T> {
        const db = this.database as { transaction?: (callback: (tx: DatabaseExecutor) => Promise<T>) => Promise<T> };

        if (typeof db.transaction === "function") {
            return db.transaction((tx) =>
                callback(new DrizzleBookingRepository(tx, { sequentialAvailabilityQueries: true })),
            );
        }

        return callback(this);
    }

    async loadAvailabilityData(
        request: PublicAvailabilityLookupRequest | CreateBookingRequest | AvailabilityRepositoryRequest,
        localDate: string,
    ): Promise<AvailabilityData> {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const timeZone = request.timeZone ?? "America/Toronto";
        const dayOfWeek = getLocalDayOfWeek(localDate);
        const dayStart = localDateTimeToUtc(localDate, "00:00", timeZone);
        const dayEnd = localDateTimeToUtc(nextLocalDate(localDate), "00:00", timeZone);

        const assignedBarbers = await db
            .select({
                id: barbers.id,
                active: barbers.active,
                sortOrder: barbers.sortOrder,
                locationId: barberLocations.locationId,
            })
            .from(barberLocations)
            .innerJoin(barbers, eq(barberLocations.barberId, barbers.id))
            .where(
                compactAnd(
                    eq(barberLocations.locationId, request.locationId),
                    eq(barbers.active, true),
                    request.barberId ? eq(barbers.id, request.barberId) : undefined,
                ),
            )
            .orderBy(asc(barbers.sortOrder), asc(barbers.displayName));

        const barberIds = assignedBarbers.map((barber) => barber.id);

        const loadBusinessHourRows = () =>
            db
                .select({
                    locationId: businessHours.locationId,
                    dayOfWeek: businessHours.dayOfWeek,
                    openTime: businessHours.openTime,
                    closeTime: businessHours.closeTime,
                    closed: businessHours.closed,
                })
                .from(businessHours)
                .where(eq(businessHours.locationId, request.locationId));
        const loadServiceRows = () =>
            db
                .select({
                    id: services.id,
                    durationMinutes: services.durationMinutes,
                    active: services.active,
                })
                .from(services)
                .where(compactAnd(inArray(services.id, request.serviceIds), eq(services.active, true)));
        const loadShiftRows = () =>
            barberIds.length === 0
                ? Promise.resolve([])
                : db
                      .select({
                          barberId: shifts.barberId,
                          locationId: shifts.locationId,
                          dayOfWeek: shifts.dayOfWeek,
                          startTime: shifts.startTime,
                          endTime: shifts.endTime,
                          active: shifts.active,
                          effectiveFrom: shifts.effectiveFrom,
                          effectiveTo: shifts.effectiveTo,
                      })
                      .from(shifts)
                      .where(
                          compactAnd(
                              eq(shifts.locationId, request.locationId),
                              eq(shifts.dayOfWeek, dayOfWeek),
                              eq(shifts.active, true),
                              inArray(shifts.barberId, barberIds),
                              or(sql`${shifts.effectiveFrom} is null`, lte(shifts.effectiveFrom, localDate)),
                              or(sql`${shifts.effectiveTo} is null`, gte(shifts.effectiveTo, localDate)),
                          ),
                      );
        const loadShiftOverrideRows = () =>
            barberIds.length === 0
                ? Promise.resolve([])
                : db
                      .select({
                          barberId: shiftOverrides.barberId,
                          overrideDate: shiftOverrides.overrideDate,
                          overrideType: shiftOverrides.overrideType,
                          locationId: shiftOverrides.locationId,
                          startTime: shiftOverrides.startTime,
                          endTime: shiftOverrides.endTime,
                      })
                      .from(shiftOverrides)
                      .where(
                          compactAnd(
                              inArray(shiftOverrides.barberId, barberIds),
                              eq(shiftOverrides.overrideDate, localDate),
                          ),
                      );
        const loadBookingRows = () =>
            barberIds.length === 0
                ? Promise.resolve([])
                : db
                      .select({
                          id: bookings.id,
                          barberId: bookings.barberId,
                          locationId: bookings.locationId,
                          status: bookings.status,
                          startTime: bookings.startTime,
                          endTime: bookings.endTime,
                      })
                      .from(bookings)
                      .where(
                          compactAnd(
                              inArray(bookings.barberId, barberIds),
                              eq(bookings.status, "confirmed"),
                              lt(bookings.startTime, dayEnd),
                              gt(bookings.endTime, dayStart),
                          ),
                      );
        const loadBlockedTimeRows = () =>
            db
                .select({
                    scope: blockedTimes.scope,
                    startTime: blockedTimes.startTime,
                    endTime: blockedTimes.endTime,
                    barberId: blockedTimes.barberId,
                    locationId: blockedTimes.locationId,
                })
                .from(blockedTimes)
                .where(
                    compactAnd(
                        lt(blockedTimes.startTime, dayEnd),
                        gt(blockedTimes.endTime, dayStart),
                        or(
                            eq(blockedTimes.scope, "business"),
                            eq(blockedTimes.locationId, request.locationId),
                            barberIds.length > 0 ? inArray(blockedTimes.barberId, barberIds) : undefined,
                        ),
                    ),
                );

        const [businessHourRows, serviceRows, shiftRows, shiftOverrideRows, bookingRows, blockedTimeRows] =
            this.sequentialAvailabilityQueries
                ? [
                      await loadBusinessHourRows(),
                      await loadServiceRows(),
                      await loadShiftRows(),
                      await loadShiftOverrideRows(),
                      await loadBookingRows(),
                      await loadBlockedTimeRows(),
                  ]
                : await Promise.all([
                      loadBusinessHourRows(),
                      loadServiceRows(),
                      loadShiftRows(),
                      loadShiftOverrideRows(),
                      loadBookingRows(),
                      loadBlockedTimeRows(),
                  ]);

        return buildAvailabilityData({
            businessHours: businessHourRows,
            barbers: assignedBarbers.map((barber) => ({
                id: barber.id,
                active: barber.active,
                sortOrder: barber.sortOrder,
            })),
            barberLocations: assignedBarbers.map((barber) => ({
                barberId: barber.id,
                locationId: barber.locationId,
            })),
            services: serviceRows,
            shifts: shiftRows,
            shiftOverrides: shiftOverrideRows,
            bookings: bookingRows,
            blockedTimes: blockedTimeRows,
        });
    }

    async loadServiceSnapshots(serviceIds: string[]): Promise<BookingServiceSnapshot[]> {
        if (serviceIds.length === 0) {
            return [];
        }

        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const rows = await db
            .select({
                serviceId: services.id,
                serviceName: services.name,
                categoryName: serviceCategories.name,
                durationMinutes: services.durationMinutes,
                priceCents: services.priceCents,
                priceType: services.priceType,
                displayPrice: services.displayPrice,
                sortOrder: services.sortOrder,
            })
            .from(services)
            .innerJoin(serviceCategories, eq(services.categoryId, serviceCategories.id))
            .where(compactAnd(inArray(services.id, serviceIds), eq(services.active, true)))
            .orderBy(asc(services.sortOrder), asc(services.name));

        return rows;
    }

    async countConfirmedBookingsByBarber(
        barberIds: string[],
        startOfDay: Date,
        endOfDay: Date,
    ): Promise<Record<string, number>> {
        if (barberIds.length === 0) {
            return {};
        }

        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const rows = await db
            .select({
                barberId: bookings.barberId,
                count: sql<number>`count(*)::int`,
            })
            .from(bookings)
            .where(
                compactAnd(
                    inArray(bookings.barberId, barberIds),
                    eq(bookings.status, "confirmed"),
                    gte(bookings.startTime, startOfDay),
                    lt(bookings.startTime, endOfDay),
                ),
            )
            .groupBy(bookings.barberId);

        return rows.reduce<Record<string, number>>((counts, row) => {
            counts[row.barberId] = Number(row.count);
            return counts;
        }, {});
    }

    async hasConfirmedBookingOverlap(
        barberId: string,
        startTime: Date,
        endTime: Date,
        excludeBookingId?: string,
    ): Promise<boolean> {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const rows = await db
            .select({ id: bookings.id })
            .from(bookings)
            .where(
                compactAnd(
                    eq(bookings.barberId, barberId),
                    eq(bookings.status, "confirmed"),
                    lt(bookings.startTime, endTime),
                    gt(bookings.endTime, startTime),
                    excludeBookingId ? sql`${bookings.id} <> ${excludeBookingId}` : undefined,
                ),
            )
            .limit(1);

        return rows.length > 0;
    }

    async hasBlockedTimeOverlap(
        barberId: string,
        locationId: string,
        startTime: Date,
        endTime: Date,
    ): Promise<boolean> {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const rows = await db
            .select({ id: blockedTimes.id })
            .from(blockedTimes)
            .where(
                compactAnd(
                    lt(blockedTimes.startTime, endTime),
                    gt(blockedTimes.endTime, startTime),
                    or(
                        eq(blockedTimes.scope, "business"),
                        eq(blockedTimes.locationId, locationId),
                        eq(blockedTimes.barberId, barberId),
                    ),
                ),
            )
            .limit(1);

        return rows.length > 0;
    }

    async createCustomer(customer: CreateBookingRequest["customer"]) {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const [created] = await db
            .insert(customers)
            .values({
                firstName: customer.firstName,
                lastName: customer.lastName,
                phoneE164: customer.phoneE164,
                email: customer.email,
                notes: customer.notes ?? null,
            })
            .returning({ id: customers.id });

        return created;
    }

    async insertBooking(booking: BookingInsertInput): Promise<CreatedBooking> {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const [created] = await db
            .insert(bookings)
            .values({
                customerId: booking.customerId,
                barberId: booking.barberId,
                locationId: booking.locationId,
                status: booking.status,
                source: booking.source,
                startTime: booking.startTime,
                endTime: booking.endTime,
                totalDurationMinutes: booking.totalDurationMinutes,
                customerNotes: booking.customerNotes ?? null,
                internalNotes: booking.internalNotes ?? null,
                cancellationTokenHash: booking.cancellationTokenHash ?? null,
                rescheduleTokenHash: booking.rescheduleTokenHash ?? null,
            })
            .returning({
                id: bookings.id,
                customerId: bookings.customerId,
                barberId: bookings.barberId,
                locationId: bookings.locationId,
                status: bookings.status,
                source: bookings.source,
                startTime: bookings.startTime,
                endTime: bookings.endTime,
                totalDurationMinutes: bookings.totalDurationMinutes,
                customerNotes: bookings.customerNotes,
                internalNotes: bookings.internalNotes,
                cancellationTokenHash: bookings.cancellationTokenHash,
                rescheduleTokenHash: bookings.rescheduleTokenHash,
            });

        return {
            ...created,
            status: "confirmed",
            source: booking.source,
        };
    }

    async insertBookingServices(
        bookingId: string,
        snapshots: BookingServiceSnapshot[],
    ): Promise<void> {
        if (snapshots.length === 0) {
            return;
        }

        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        await db.insert(bookingServices).values(
            snapshots.map((snapshot) => ({
                bookingId,
                serviceId: snapshot.serviceId,
                serviceName: snapshot.serviceName,
                categoryName: snapshot.categoryName,
                durationMinutes: snapshot.durationMinutes,
                priceCents: snapshot.priceCents,
                priceType: snapshot.priceType,
                displayPrice: snapshot.displayPrice,
                sortOrder: snapshot.sortOrder,
            })),
        );
    }
}

class DrizzleCustomerBookingManagementRepository implements CustomerBookingManagementRepository {
    private readonly database: DatabaseExecutor;
    private readonly bookingRepository: BookingRepository & AvailabilityLookupRepository;

    constructor(
        database: DatabaseExecutor,
        options: { sequentialAvailabilityQueries?: boolean } = {},
    ) {
        this.database = database;
        this.bookingRepository = createDrizzleBookingRepository(database, options);
    }

    async withTransaction<T>(callback: (transaction: BookingRepository) => Promise<T>): Promise<T> {
        const db = this.database as { transaction?: (callback: (tx: DatabaseExecutor) => Promise<T>) => Promise<T> };

        if (typeof db.transaction === "function") {
            return db.transaction((tx) =>
                callback(new DrizzleCustomerBookingManagementRepository(tx, { sequentialAvailabilityQueries: true })),
            );
        }

        return callback(this);
    }

    async findCustomerManagedBookingByTokenHash(input: {
        tokenHash: string;
        tokenType?: "cancellation" | "reschedule";
    }) {
        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const [booking] = await db
            .select({
                id: bookings.id,
                locationId: bookings.locationId,
                locationName: locations.name,
                barberId: bookings.barberId,
                barberName: barbers.displayName,
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
            .where(customerTokenCondition(input.tokenHash, input.tokenType))
            .limit(1);

        if (!booking) {
            return null;
        }

        const serviceDetails = await this.loadBookingServiceDetails([booking.id]);

        return {
            id: booking.id,
            locationId: booking.locationId,
            locationName: booking.locationName,
            barberId: booking.barberId,
            barberName: booking.barberName,
            customerName: `${booking.customerFirstName} ${booking.customerLastName}`.trim(),
            customerEmail: booking.customerEmail,
            customerPhone: booking.customerPhone,
            status: booking.status,
            source: booking.source,
            startTime: booking.startTime,
            endTime: booking.endTime,
            totalDurationMinutes: booking.totalDurationMinutes,
            serviceIds:
                serviceDetails[booking.id]
                    ?.map((service) => service.serviceId)
                    .filter((serviceId): serviceId is string => Boolean(serviceId)) ?? [],
            serviceDetails: serviceDetails[booking.id] ?? [],
        } satisfies CustomerManagedBookingRecord;
    }

    async cancelCustomerManagedBooking(input: {
        bookingId: string;
        tokenHash: string;
        cancelledAt: Date;
    }) {
        const existing = await this.findCustomerManagedBookingByTokenHash({
            tokenHash: input.tokenHash,
            tokenType: "cancellation",
        });

        if (!existing || existing.id !== input.bookingId) {
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
                    updatedAt: input.cancelledAt,
                })
                .where(
                    compactAnd(
                        eq(bookings.id, input.bookingId),
                        eq(bookings.cancellationTokenHash, input.tokenHash),
                    ),
                );
        }

        const updated = await this.findCustomerManagedBookingByTokenHash({
            tokenHash: input.tokenHash,
            tokenType: "cancellation",
        });

        return updated ? { ...updated, mutable: true } : null;
    }

    async updateCustomerManagedBookingSchedule(input: {
        bookingId: string;
        tokenHash: string;
        barberId: string;
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
                barberId: input.barberId,
                locationId: input.locationId,
                startTime: input.startTime,
                endTime: input.endTime,
                totalDurationMinutes: input.totalDurationMinutes,
                updatedAt: input.updatedAt,
            })
            .where(
                compactAnd(
                    eq(bookings.id, input.bookingId),
                    eq(bookings.rescheduleTokenHash, input.tokenHash),
                    eq(bookings.status, "confirmed"),
                ),
            )
            .returning({ id: bookings.id });

        if (!updated) {
            return null;
        }

        return this.findCustomerManagedBookingByTokenHash({
            tokenHash: input.tokenHash,
            tokenType: "reschedule",
        });
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

    private async loadBookingServiceDetails(bookingIds: string[]) {
        if (bookingIds.length === 0) {
            return {};
        }

        const db = this.database as ReturnType<typeof createDatabaseClient>["db"];
        const rows = await db
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

        return rows.reduce<Record<string, BookingServiceSnapshot[]>>((details, row) => {
            details[row.bookingId] ??= [];
            details[row.bookingId].push({
                serviceId: row.serviceId,
                serviceName: row.serviceName,
                categoryName: row.categoryName,
                durationMinutes: row.durationMinutes,
                priceCents: row.priceCents,
                priceType: row.priceType,
                displayPrice: row.displayPrice,
                sortOrder: row.sortOrder,
            });
            return details;
        }, {});
    }
}

export function buildAvailabilityData(rows: AvailabilityRows): AvailabilityData {
    return {
        businessHours: rows.businessHours.map((row) => ({
            ...row,
            openTime: normalizeTime(row.openTime),
            closeTime: normalizeTime(row.closeTime),
        })),
        barbers: rows.barbers,
        barberLocations: rows.barberLocations,
        services: rows.services,
        shifts: rows.shifts.map((row) => ({
            ...row,
            startTime: normalizeTime(row.startTime),
            endTime: normalizeTime(row.endTime),
            effectiveFrom: normalizeDate(row.effectiveFrom),
            effectiveTo: normalizeDate(row.effectiveTo),
        })),
        shiftOverrides: rows.shiftOverrides?.map((row) => ({
            ...row,
            overrideDate: normalizeDate(row.overrideDate) ?? row.overrideDate,
            startTime: row.startTime ? normalizeTime(row.startTime) : row.startTime,
            endTime: row.endTime ? normalizeTime(row.endTime) : row.endTime,
        })),
        bookings: rows.bookings,
        blockedTimes: rows.blockedTimes,
    };
}

export function formatPriceSummary(
    servicesToPrice: Array<{ priceCents: number; priceType: "fixed" | "from" }>,
) {
    const totalCents = servicesToPrice.reduce((total, service) => total + service.priceCents, 0);
    const hasFromPrice = servicesToPrice.some((service) => service.priceType === "from");
    return `${hasFromPrice ? "from " : ""}${formatCents(totalCents)}`;
}

function compactAnd(...conditions: Array<SQL | undefined>) {
    return and(...conditions.filter(Boolean) as SQL[]);
}

function customerTokenCondition(
    tokenHash: string,
    tokenType?: "cancellation" | "reschedule",
) {
    if (tokenType === "cancellation") {
        return eq(bookings.cancellationTokenHash, tokenHash);
    }

    if (tokenType === "reschedule") {
        return eq(bookings.rescheduleTokenHash, tokenHash);
    }

    return or(
        eq(bookings.cancellationTokenHash, tokenHash),
        eq(bookings.rescheduleTokenHash, tokenHash),
    );
}

function normalizeTime(value: string) {
    return value.slice(0, 5);
}

function normalizeDate(value?: string | Date | null) {
    if (!value) {
        return value ?? null;
    }

    if (value instanceof Date) {
        return getLocalDate(value, "UTC");
    }

    return value.slice(0, 10);
}

function getLocalDayOfWeek(localDate: string) {
    const [year, month, day] = localDate.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function nextLocalDate(localDate: string) {
    const [year, month, day] = localDate.split("-").map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + 1));
    return getLocalDate(date, "UTC");
}

function formatCents(cents: number) {
    const dollars = cents / 100;
    return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}
