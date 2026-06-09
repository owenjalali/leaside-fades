import { describe, expect, test } from "vitest";

import type { AvailabilityData } from "../availability/index.ts";
import type {
    BookingRepository,
    BookingServiceSnapshot,
    CreateBookingRequest,
    CreatedBooking,
} from "../bookings/index.ts";
import {
    AdminAuthorizationError,
    AdminBookingRequestError,
    cancelAdminBooking,
    completeAdminBooking,
    createAdminManualBooking,
    createAdminWalkInBooking,
    editAdminBooking,
    getAdminAvailability,
    getAdminBookingDetail,
    getAdminCalendarOptions,
    getAdminDashboard,
    listAdminBookings,
    markAdminBookingNoShow,
    rescheduleAdminBooking,
    type AdminBookingManagementRepository,
    type AdminBookingRecord,
    type AdminBookingsRepository,
    type AdminCalendarOptionsRepository,
    type AdminDashboardActivityRecord,
    type AdminSchedulerJobRunSummary,
} from "./bookings-service.ts";
import type { BookingLifecycleNotificationDispatcher } from "../notifications/index.ts";

const barberAId = "11111111-1111-1111-1111-111111111111";
const barberBId = "22222222-2222-2222-2222-222222222222";
const locationAId = "33333333-3333-3333-3333-333333333333";
const locationBId = "44444444-4444-4444-4444-444444444444";
const serviceId = "55555555-5555-5555-5555-555555555555";
const serviceBId = "66666666-6666-6666-6666-666666666666";
const now = new Date("2026-05-01T13:00:00.000Z");

const bookings: AdminBookingRecord[] = [
    {
        id: "booking-a",
        barberId: barberAId,
        barberName: "Sam To",
        locationId: locationAId,
        locationName: "Leaside Fades Eglinton",
        customerName: "Ada Lovelace",
        customerEmail: "ada@example.com",
        customerPhone: "+16475550199",
        status: "confirmed",
        source: "public",
        startTime: new Date("2026-04-27T16:00:00.000Z"),
        endTime: new Date("2026-04-27T16:30:00.000Z"),
        totalDurationMinutes: 30,
        services: ["Men's Cut"],
    },
    {
        id: "booking-b",
        barberId: barberBId,
        barberName: "Laura Nguyen",
        locationId: locationBId,
        locationName: "Leaside Fades Millwood",
        customerName: "Grace Hopper",
        customerEmail: "grace@example.com",
        customerPhone: "+16475550200",
        status: "confirmed",
        source: "manual",
        startTime: new Date("2026-04-27T17:00:00.000Z"),
        endTime: new Date("2026-04-27T17:45:00.000Z"),
        totalDurationMinutes: 45,
        services: ["Bald Fade"],
    },
];

class InMemoryAdminBookingsRepository implements AdminBookingsRepository {
    calls: Array<{ barberId?: string; limit: number }> = [];

    async listBookingsForAdminScope(scope: { barberId?: string; limit: number }) {
        this.calls.push(scope);
        return scope.barberId
            ? bookings.filter((booking) => booking.barberId === scope.barberId)
            : bookings;
    }
}

describe("Phase 5A admin booking role enforcement", () => {
    test("owner and admin users can see all bookings", async () => {
        const ownerRepository = new InMemoryAdminBookingsRepository();
        const adminRepository = new InMemoryAdminBookingsRepository();

        await expect(
            listAdminBookings(
                { id: "owner", email: "owner@example.com", displayName: "Owner", role: "owner", barberId: null },
                ownerRepository,
            ),
        ).resolves.toEqual(bookings);
        await expect(
            listAdminBookings(
                { id: "admin", email: "admin@example.com", displayName: "Admin", role: "admin", barberId: null },
                adminRepository,
            ),
        ).resolves.toEqual(bookings);
        expect(ownerRepository.calls[0]).toEqual({ limit: 100 });
        expect(adminRepository.calls[0]).toEqual({ limit: 100 });
    });

    test("barber users can see only their own bookings", async () => {
        const repository = new InMemoryAdminBookingsRepository();

        const result = await listAdminBookings(
            {
                id: "barber-user",
                email: "sam@example.com",
                displayName: "Sam",
                role: "barber",
                barberId: barberAId,
            },
            repository,
        );

        expect(result.map((booking) => booking.id)).toEqual(["booking-a"]);
        expect(repository.calls[0]).toEqual({ barberId: barberAId, limit: 100 });
    });

    test("barber users cannot see another barber's bookings", async () => {
        const repository = new InMemoryAdminBookingsRepository();

        const result = await listAdminBookings(
            {
                id: "barber-user",
                email: "laura@example.com",
                displayName: "Laura",
                role: "barber",
                barberId: barberBId,
            },
            repository,
        );

        expect(result).toHaveLength(1);
        expect(result[0].barberId).toBe(barberBId);
    });

    test("barber users without barberId are rejected with no booking lookup", async () => {
        const repository = new InMemoryAdminBookingsRepository();

        await expect(
            listAdminBookings(
                {
                    id: "broken-barber",
                    email: "broken@example.com",
                    displayName: "Broken",
                    role: "barber",
                    barberId: null,
                },
                repository,
            ),
        ).rejects.toMatchObject({
            name: "AdminAuthorizationError",
            status: 403,
            message: "Barber account is not linked to a barber profile.",
        } satisfies Partial<AdminAuthorizationError>);
        expect(repository.calls).toEqual([]);
    });
});

function utc(localHour: number, localMinute = 0, localDate = "2026-05-04") {
    const [year, month, day] = localDate.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day, localHour + 4, localMinute));
}

function baseAvailability(overrides: Partial<AvailabilityData> = {}): AvailabilityData {
    return {
        businessHours: [
            {
                locationId: locationAId,
                dayOfWeek: 1,
                openTime: "10:00",
                closeTime: "19:00",
            },
        ],
        barbers: [
            { id: barberAId, active: true, sortOrder: 1 },
            { id: barberBId, active: true, sortOrder: 2 },
        ],
        barberLocations: [
            { barberId: barberAId, locationId: locationAId },
            { barberId: barberBId, locationId: locationAId },
        ],
        services: [
            { id: serviceId, durationMinutes: 30, active: true },
            { id: serviceBId, durationMinutes: 15, active: true },
        ],
        shifts: [
            {
                barberId: barberAId,
                locationId: locationAId,
                dayOfWeek: 1,
                startTime: "10:00",
                endTime: "19:00",
                active: true,
            },
            {
                barberId: barberBId,
                locationId: locationAId,
                dayOfWeek: 1,
                startTime: "10:00",
                endTime: "19:00",
                active: true,
            },
        ],
        shiftOverrides: [],
        bookings: [],
        blockedTimes: [],
        ...overrides,
    };
}

const serviceSnapshot: BookingServiceSnapshot = {
    serviceId,
    serviceName: "Men's Cut",
    categoryName: "Hair & Styling (Men)",
    durationMinutes: 30,
    priceCents: 3000,
    priceType: "fixed",
    displayPrice: "$30",
    sortOrder: 10,
};

const serviceSnapshotB: BookingServiceSnapshot = {
    serviceId: serviceBId,
    serviceName: "Beard Trim",
    categoryName: "Hair & Styling (Men)",
    durationMinutes: 15,
    priceCents: 1500,
    priceType: "fixed",
    displayPrice: "$15",
    sortOrder: 20,
};

class InMemoryPhase6Repository
    implements AdminBookingsRepository, AdminCalendarOptionsRepository, AdminBookingManagementRepository, BookingRepository
{
    bookings: Array<
        AdminBookingRecord & {
            customerId?: string;
            serviceIds?: string[];
            serviceDetails?: BookingServiceSnapshot[];
            customerNotes?: string | null;
            internalNotes?: string | null;
        }
    > = bookings.map((booking) => ({ ...booking, serviceIds: [serviceId] }));
    customers: CreateBookingRequest["customer"][] = [];
    bookingServices: Array<BookingServiceSnapshot & { bookingId: string }> = [];
    availabilityData: AvailabilityData = baseAvailability();
    activityRecords: AdminDashboardActivityRecord[] | null = null;
    schedulerJobRunSummary: AdminSchedulerJobRunSummary | null = null;
    listCalls: any[] = [];
    transactionCount = 0;

    async listBookingsForAdminScope(scope: any) {
        this.listCalls.push(scope);
        return this.bookings
            .filter((booking) => {
                const startsAfterFrom = !scope.from || booking.startTime >= scope.from;
                const startsBeforeTo = !scope.to || booking.startTime < scope.to;
                return (
                    (!scope.barberId || booking.barberId === scope.barberId) &&
                    (!scope.locationId || booking.locationId === scope.locationId) &&
                    (!scope.status || booking.status === scope.status) &&
                    startsAfterFrom &&
                    startsBeforeTo
                );
            })
            .slice(0, scope.limit);
    }

    async listDashboardBookingsForAdminScope(scope: any) {
        return this.listBookingsForAdminScope(scope);
    }

    async getLatestDashboardRevenueDateForAdminScope(scope: { barberId?: string; now: Date }) {
        const candidates = this.bookings
            .filter((booking) => !scope.barberId || booking.barberId === scope.barberId)
            .filter((booking) => booking.serviceDetails && booking.serviceDetails.length > 0)
            .filter((booking) => booking.status === "completed" || (booking.status === "confirmed" && booking.startTime <= scope.now))
            .sort((a, b) => b.startTime.getTime() - a.startTime.getTime());

        return candidates[0]?.startTime ?? null;
    }

    async getDashboardRevenueDateRangeForAdminScope(scope: { barberId?: string; now: Date }) {
        const candidates = this.bookings
            .filter((booking) => !scope.barberId || booking.barberId === scope.barberId)
            .filter((booking) => booking.status === "completed" || (booking.status === "confirmed" && booking.startTime <= scope.now))
            .sort((a, b) => a.startTime.getTime() - b.startTime.getTime());

        return {
            earliest: candidates[0]?.startTime ?? null,
            latest: candidates[candidates.length - 1]?.startTime ?? null,
        };
    }

    async listDashboardActivityForAdminScope(scope: any): Promise<AdminDashboardActivityRecord[]> {
        if (this.activityRecords) {
            return this.activityRecords
                .filter((activity) => !scope.barberId || activity.barberId === scope.barberId)
                .slice(0, scope.limit);
        }

        return this.bookings
            .filter((booking) => !scope.barberId || booking.barberId === scope.barberId)
            .slice(0, scope.limit)
            .map((booking) => ({
                id: `${booking.id}:activity`,
                bookingId: booking.id,
                eventType: booking.status === "no_show" ? "no_show" : "booking_confirmation",
                status: booking.status === "no_show" ? "no_show" : "sent",
                channel: booking.status === "no_show" ? "calendar" : "sms",
                recipientType: booking.status === "no_show" ? "shop" : "customer",
                recipientLabel: booking.status === "no_show" ? "Calendar" : "Customer SMS ***0199",
                customerName: booking.customerName,
                barberId: booking.barberId,
                barberName: booking.barberName,
                locationName: booking.locationName,
                appointmentStatus: booking.status,
                appointmentSource: booking.source,
                appointmentStartTime: booking.startTime,
                appointmentEndTime: booking.endTime,
                services: booking.services,
                createdAt: booking.startTime,
                updatedAt: booking.endTime,
                sentAt: booking.status === "no_show" ? null : booking.startTime,
                scheduledFor: null,
                errorMessage: null,
                provider: booking.status === "no_show" ? null : "mock",
                providerMessageId: booking.status === "no_show" ? null : `${booking.id}:provider`,
                attemptCount: booking.status === "no_show" ? 0 : 1,
                lastAttemptAt: booking.status === "no_show" ? null : booking.startTime,
            }));
    }

    async getSchedulerJobRunSummary() {
        return this.schedulerJobRunSummary;
    }

    async getBookingByIdForAdminScope(scope: { bookingId: string; barberId?: string }) {
        const booking = this.bookings.find(
            (candidate) =>
                candidate.id === scope.bookingId &&
                (!scope.barberId || candidate.barberId === scope.barberId),
        );

        return booking
            ? {
                  ...booking,
                  serviceIds: booking.serviceIds ?? [serviceId],
                  serviceDetails: booking.serviceDetails ?? [serviceSnapshot],
                  customerNotes: booking.customerNotes ?? null,
                  internalNotes: booking.internalNotes ?? null,
              }
            : null;
    }

    async listCalendarOptions(scope: { barberId?: string }) {
        return {
            locations: [
                { id: locationAId, name: "Leaside Fades Eglinton", sortOrder: 10 },
                { id: locationBId, name: "Leaside Fades Millwood", sortOrder: 20 },
            ],
            barbers: [
                { id: barberAId, displayName: "Sam To", locationIds: [locationAId], sortOrder: 10 },
                { id: barberBId, displayName: "Laura Nguyen", locationIds: [locationAId], sortOrder: 20 },
            ].filter((barber) => !scope.barberId || barber.id === scope.barberId),
            services: [
                {
                    id: serviceId,
                    name: "Men's Cut",
                    durationMinutes: 30,
                    displayPrice: "$30",
                    priceCents: 3000,
                    priceType: "fixed" as const,
                    sortOrder: 10,
                },
                {
                    id: serviceBId,
                    name: "Beard Trim",
                    durationMinutes: 15,
                    displayPrice: "$15",
                    priceCents: 1500,
                    priceType: "fixed" as const,
                    sortOrder: 20,
                },
            ],
        };
    }

    async withTransaction<T>(callback: (transaction: BookingRepository) => Promise<T>): Promise<T> {
        this.transactionCount += 1;
        return callback(this);
    }

    async loadAvailabilityData(request: CreateBookingRequest) {
        return {
            ...this.availabilityData,
            bookings: (this.availabilityData.bookings ?? []).filter(
                (booking: any) => !(request.excludeBookingId && booking.id === request.excludeBookingId),
            ),
        };
    }

    async loadServiceSnapshots(serviceIds: string[]) {
        return serviceIds
            .map((requestedServiceId) =>
                requestedServiceId === serviceId
                    ? serviceSnapshot
                    : requestedServiceId === serviceBId
                      ? serviceSnapshotB
                      : null,
            )
            .filter((snapshot): snapshot is BookingServiceSnapshot => Boolean(snapshot));
    }

    async countConfirmedBookingsByBarber() {
        return {};
    }

    async hasConfirmedBookingOverlap(barberId: string, startTime: Date, endTime: Date, excludeBookingId?: string) {
        return this.bookings.some(
            (booking) =>
                booking.id !== excludeBookingId &&
                booking.barberId === barberId &&
                booking.status === "confirmed" &&
                startTime < booking.endTime &&
                endTime > booking.startTime,
        );
    }

    async hasBlockedTimeOverlap() {
        return false;
    }

    async createCustomer(customer: CreateBookingRequest["customer"]) {
        this.customers.push(customer);
        return { id: `customer-${this.customers.length}` };
    }

    async insertBooking(input: any): Promise<CreatedBooking> {
        const customer = this.customers[this.customers.length - 1];
        const created = {
            id: `manual-${this.bookings.length + 1}`,
            barberName: input.barberId === barberAId ? "Sam To" : "Laura Nguyen",
            locationName: "Leaside Fades Eglinton",
            customerName: `${customer?.firstName} ${customer?.lastName}`.trim(),
            customerEmail: customer?.email ?? null,
            customerPhone: customer?.phoneE164 ?? null,
            services: [serviceSnapshot.serviceName],
            serviceIds: [serviceId],
            serviceDetails: [serviceSnapshot],
            ...input,
        };
        this.bookings.push(created);
        return created;
    }

    async insertBookingServices(bookingId: string, snapshots: BookingServiceSnapshot[]) {
        this.bookingServices.push(...snapshots.map((snapshot) => ({ ...snapshot, bookingId })));
    }

    async cancelBookingForAdminScope(input: {
        bookingId: string;
        barberId?: string;
        cancelledAt: Date;
        cancelledByUserId: string;
    }) {
        const booking = this.bookings.find(
            (candidate) =>
                candidate.id === input.bookingId &&
                (!input.barberId || candidate.barberId === input.barberId),
        );

        if (!booking) {
            return null;
        }

        if (booking.status === "completed" || booking.status === "no_show") {
            return { ...booking, mutable: false as const };
        }

        booking.status = "cancelled";
        return { ...booking, mutable: true as const };
    }

    async markBookingNoShowForAdminScope(input: {
        bookingId: string;
        barberId?: string;
        markedAt: Date;
    }) {
        const booking = this.bookings.find(
            (candidate) =>
                candidate.id === input.bookingId &&
                (!input.barberId || candidate.barberId === input.barberId),
        );

        if (!booking) {
            return null;
        }

        if (booking.status !== "confirmed" || booking.startTime > input.markedAt) {
            return { ...booking, mutable: false as const };
        }

        booking.status = "no_show";
        return { ...booking, mutable: true as const };
    }

    async completeBookingForAdminScope(input: {
        bookingId: string;
        barberId?: string;
        completedAt: Date;
    }) {
        const booking = this.bookings.find(
            (candidate) =>
                candidate.id === input.bookingId &&
                (!input.barberId || candidate.barberId === input.barberId),
        );

        if (!booking) {
            return null;
        }

        if (booking.status !== "confirmed" || booking.startTime > input.completedAt) {
            return { ...booking, mutable: false as const };
        }

        booking.status = "completed";
        return { ...booking, mutable: true as const };
    }

    async updateBookingScheduleForAdminScope(input: {
        bookingId: string;
        barberId?: string;
        nextBarberId: string;
        locationId: string;
        startTime: Date;
        endTime: Date;
        totalDurationMinutes: number;
    }) {
        const booking = this.bookings.find(
            (candidate) =>
                candidate.id === input.bookingId &&
                (!input.barberId || candidate.barberId === input.barberId),
        );

        if (!booking) {
            return null;
        }

        booking.barberId = input.nextBarberId;
        booking.locationId = input.locationId;
        booking.startTime = input.startTime;
        booking.endTime = input.endTime;
        booking.totalDurationMinutes = input.totalDurationMinutes;
        return booking;
    }

    async updateBookingAppointmentForAdminScope(input: {
        bookingId: string;
        barberId?: string;
        nextBarberId: string;
        locationId: string;
        startTime: Date;
        endTime: Date;
        totalDurationMinutes: number;
        customer: CreateBookingRequest["customer"];
        customerNotes: string | null;
        internalNotes: string | null;
        serviceSnapshots: BookingServiceSnapshot[];
    }) {
        const booking = this.bookings.find(
            (candidate) =>
                candidate.id === input.bookingId &&
                (!input.barberId || candidate.barberId === input.barberId),
        );

        if (!booking) {
            return null;
        }

        booking.barberId = input.nextBarberId;
        booking.locationId = input.locationId;
        booking.startTime = input.startTime;
        booking.endTime = input.endTime;
        booking.totalDurationMinutes = input.totalDurationMinutes;
        booking.customerName = `${input.customer.firstName} ${input.customer.lastName}`.trim();
        booking.customerEmail = input.customer.email;
        booking.customerPhone = input.customer.phoneE164;
        booking.customerNotes = input.customerNotes;
        booking.internalNotes = input.internalNotes;
        booking.serviceIds = input.serviceSnapshots.map((snapshot) => snapshot.serviceId).filter(Boolean) as string[];
        booking.services = input.serviceSnapshots.map((snapshot) => snapshot.serviceName);
        booking.serviceDetails = input.serviceSnapshots;
        this.bookingServices = this.bookingServices.filter((snapshot) => snapshot.bookingId !== input.bookingId);
        this.bookingServices.push(
            ...input.serviceSnapshots.map((snapshot) => ({ ...snapshot, bookingId: input.bookingId })),
        );
        return {
            ...booking,
            serviceIds: booking.serviceIds,
            serviceDetails: booking.serviceDetails,
            customerNotes: booking.customerNotes ?? null,
            internalNotes: booking.internalNotes ?? null,
        };
    }
}

function dashboardActivityFixture(
    overrides: Partial<AdminDashboardActivityRecord> = {},
): AdminDashboardActivityRecord {
    return {
        id: "activity-fixture",
        bookingId: "booking-fixture",
        eventType: "booking_confirmation",
        status: "sent",
        channel: "email",
        recipientType: "customer",
        recipientLabel: "Customer Email a***@example.com",
        customerName: "Ada Lovelace",
        barberId: barberAId,
        barberName: "Sam To",
        locationName: "Leaside Fades Eglinton",
        appointmentStatus: "confirmed",
        appointmentSource: "public",
        appointmentStartTime: new Date("2026-05-03T19:00:00.000Z"),
        appointmentEndTime: new Date("2026-05-03T19:30:00.000Z"),
        services: ["Men's Cut"],
        createdAt: new Date("2026-05-03T13:55:00.000Z"),
        updatedAt: new Date("2026-05-03T13:55:00.000Z"),
        sentAt: null,
        scheduledFor: null,
        errorMessage: null,
        provider: "mock",
        providerMessageId: null,
        attemptCount: 1,
        lastAttemptAt: new Date("2026-05-03T13:55:00.000Z"),
        ...overrides,
    };
}

function schedulerJobRunFixture(overrides: Partial<NonNullable<AdminSchedulerJobRunSummary["latest"]>> = {}) {
    const finishedAt = overrides.finishedAt ?? new Date("2026-05-20T17:00:00.000Z");
    const startedAt = overrides.startedAt ?? new Date(finishedAt.getTime() - 150);

    return {
        id: "scheduler-run",
        jobName: "booking_reminders",
        trigger: "http",
        status: "success",
        startedAt,
        finishedAt,
        durationMs: finishedAt.getTime() - startedAt.getTime(),
        result: { scanned: 0, totalAttempts: 0, sent: 0, failed: 0, skipped: 0, duplicate: 0 },
        errorMessage: null,
        createdAt: finishedAt,
        updatedAt: finishedAt,
        ...overrides,
    } as NonNullable<AdminSchedulerJobRunSummary["latest"]>;
}

function snapshotWithPrice(priceCents: number): BookingServiceSnapshot {
    return {
        ...serviceSnapshot,
        priceCents,
        displayPrice: `$${Math.round(priceCents / 100)}`,
    };
}

function dashboardBookingFixture(
    overrides: Partial<
        AdminBookingRecord & {
            serviceIds: string[];
            serviceDetails: BookingServiceSnapshot[];
        }
    > = {},
): AdminBookingRecord & { serviceIds: string[]; serviceDetails: BookingServiceSnapshot[] } {
    const startTime = overrides.startTime ?? new Date("2026-05-03T16:00:00.000Z");
    const endTime = overrides.endTime ?? new Date(startTime.getTime() + 30 * 60_000);

    return {
        id: "dashboard-booking",
        barberId: barberAId,
        barberName: "Sam To",
        locationId: locationAId,
        locationName: "Leaside Fades Eglinton",
        customerName: "Dashboard Client",
        customerEmail: "dashboard@example.com",
        customerPhone: "+16475550199",
        status: "confirmed",
        source: "public",
        startTime,
        endTime,
        totalDurationMinutes: 30,
        services: ["Men's Cut"],
        serviceIds: [serviceId],
        serviceDetails: [serviceSnapshot],
        ...overrides,
    };
}

describe("Phase 6 admin calendar and booking management service", () => {
    test("owner filters bookings by date, location, barber, and status inside admin scope", async () => {
        const repository = new InMemoryPhase6Repository();

        const result = await listAdminBookings(
            { id: "owner", email: "owner@example.com", displayName: "Owner", role: "owner", barberId: null },
            repository,
            {
                from: "2026-04-27",
                to: "2026-04-27",
                locationId: locationAId,
                barberId: barberAId,
                status: "confirmed",
            },
        );

        expect(result.map((booking) => booking.id)).toEqual(["booking-a"]);
        expect(repository.listCalls[0]).toMatchObject({
            barberId: barberAId,
            locationId: locationAId,
            status: "confirmed",
            limit: 250,
        });
        expect(repository.listCalls[0].from.toISOString()).toBe("2026-04-27T04:00:00.000Z");
        expect(repository.listCalls[0].to.toISOString()).toBe("2026-04-28T04:00:00.000Z");
    });

    test("barber users are scoped to their own barber id even when filters ask for another barber", async () => {
        const repository = new InMemoryPhase6Repository();

        await expect(
            listAdminBookings(
                {
                    id: "barber-user",
                    email: "sam@example.com",
                    displayName: "Sam",
                    role: "barber",
                    barberId: barberAId,
                },
                repository,
                { barberId: barberBId },
            ),
        ).rejects.toMatchObject({ status: 403 });
        expect(repository.listCalls).toEqual([]);
    });

    test("booking detail is visible to owner/admin and only the owning barber", async () => {
        const repository = new InMemoryPhase6Repository();

        await expect(
            getAdminBookingDetail(
                { id: "owner", email: "owner@example.com", displayName: "Owner", role: "owner", barberId: null },
                "booking-a",
                repository,
            ),
        ).resolves.toMatchObject({ id: "booking-a", serviceDetails: [serviceSnapshot] });
        await expect(
            getAdminBookingDetail(
                { id: "barber", email: "sam@example.com", displayName: "Sam", role: "barber", barberId: barberAId },
                "booking-a",
                repository,
            ),
        ).resolves.toMatchObject({ id: "booking-a" });
        await expect(
            getAdminBookingDetail(
                { id: "barber", email: "sam@example.com", displayName: "Sam", role: "barber", barberId: barberAId },
                "booking-b",
                repository,
            ),
        ).rejects.toMatchObject({ status: 404 });
    });

    test("calendar options and admin availability are barber scoped", async () => {
        const repository = new InMemoryPhase6Repository();

        const options = await getAdminCalendarOptions(
            { id: "barber", email: "sam@example.com", displayName: "Sam", role: "barber", barberId: barberAId },
            repository,
        );
        expect(options.barbers.map((barber) => barber.id)).toEqual([barberAId]);

        await expect(
            getAdminAvailability(
                { id: "barber", email: "sam@example.com", displayName: "Sam", role: "barber", barberId: barberAId },
                {
                    locationId: locationAId,
                    serviceIds: [serviceId],
                    date: "2026-05-04",
                    barberId: barberBId,
                    now,
                },
                repository,
            ),
        ).rejects.toMatchObject({ status: 403 });
    });

    test("manual booking requires an explicit in-scope barber and creates a manual source booking transactionally", async () => {
        const repository = new InMemoryPhase6Repository();
        const dispatched: Parameters<BookingLifecycleNotificationDispatcher>[0][] = [];

        await expect(
            createAdminManualBooking(
                { id: "barber", email: "sam@example.com", displayName: "Sam", role: "barber", barberId: barberAId },
                {
                    locationId: locationAId,
                    serviceIds: [serviceId],
                    barberId: barberBId,
                    startTime: utc(10).toISOString(),
                    customer: {
                        firstName: "Manual",
                        lastName: "Customer",
                        phone: "+16475550123",
                        email: "manual@example.com",
                    },
                },
                repository,
            ),
        ).rejects.toMatchObject({ status: 403 });

        const created = await createAdminManualBooking(
            { id: "barber", email: "sam@example.com", displayName: "Sam", role: "barber", barberId: barberAId },
            {
                locationId: locationAId,
                serviceIds: [serviceId],
                barberId: barberAId,
                startTime: utc(10).toISOString(),
                customer: {
                    firstName: "Manual",
                    lastName: "Customer",
                    phone: "+16475550123",
                    email: "manual@example.com",
                },
                internalNotes: "Walk-in",
            },
            repository,
            {
                now,
                notificationDispatcher: async (input) => {
                    dispatched.push(input);
                    return [];
                },
            },
        );

        expect(created).toMatchObject({ source: "manual", barberId: barberAId });
        expect(repository.transactionCount).toBe(1);
        expect(repository.bookingServices).toHaveLength(1);
        expect(dispatched).toEqual([
            expect.objectContaining({
                eventType: "booking_confirmation",
                bookingId: created.id,
            }),
        ]);
    });

    test("staff-created manual booking accepts name-only contact and bypasses public minimum notice", async () => {
        const repository = new InMemoryPhase6Repository();
        const dispatched: Parameters<BookingLifecycleNotificationDispatcher>[0][] = [];

        const created = await createAdminManualBooking(
            { id: "barber", email: "sam@example.com", displayName: "Sam", role: "barber", barberId: barberAId },
            {
                locationId: locationAId,
                serviceIds: [serviceId],
                barberId: barberAId,
                startTime: utc(10).toISOString(),
                customer: {
                    name: "Counter Client",
                },
            },
            repository,
            {
                now: new Date("2026-05-04T13:55:00.000Z"),
                notificationDispatcher: async (input) => {
                    dispatched.push(input);
                    return [];
                },
            },
        );

        expect(created).toMatchObject({
            source: "manual",
            customerName: "Counter Client",
            customerEmail: null,
            customerPhone: null,
        });
        expect(repository.customers[0]).toMatchObject({
            firstName: "Counter",
            lastName: "Client",
            phoneE164: null,
            email: null,
        });
        expect(dispatched).toEqual([
            expect.objectContaining({
                eventType: "booking_confirmation",
                bookingId: created.id,
            }),
        ]);
    });

    test("dashboard returns owner-wide activity and barber-scoped activity", async () => {
        const repository = new InMemoryPhase6Repository();

        const ownerDashboard = await getAdminDashboard(
            { id: "owner", email: "owner@example.com", displayName: "Owner", role: "owner", barberId: null },
            repository,
            { now: new Date("2026-04-27T15:00:00.000Z") },
        );
        const barberDashboard = await getAdminDashboard(
            { id: "barber", email: "sam@example.com", displayName: "Sam", role: "barber", barberId: barberAId },
            repository,
            { now: new Date("2026-04-27T15:00:00.000Z") },
        );

        expect(ownerDashboard.todayBookings.map((booking) => booking.id)).toEqual(["booking-a", "booking-b"]);
        expect(ownerDashboard.activity.map((item) => item.bookingId).sort()).toEqual(["booking-a", "booking-b"]);
        expect(barberDashboard.todayBookings.map((booking) => booking.id)).toEqual(["booking-a"]);
        expect(barberDashboard.activity.map((item) => item.bookingId)).toEqual(["booking-a"]);
    });

    test("dashboard aggregates tracked revenue from service snapshots by selected period", async () => {
        const repository = new InMemoryPhase6Repository();
        repository.bookings = [
            dashboardBookingFixture({
                id: "public-past-confirmed-included",
                source: "public",
                status: "confirmed",
                startTime: new Date("2026-04-27T16:00:00.000Z"),
                serviceDetails: [snapshotWithPrice(3000)],
            }),
            dashboardBookingFixture({
                id: "future-confirmed-excluded",
                source: "public",
                status: "confirmed",
                startTime: new Date("2026-05-04T16:00:00.000Z"),
                serviceDetails: [snapshotWithPrice(6000)],
            }),
            dashboardBookingFixture({
                id: "manual-completed",
                source: "manual",
                status: "completed",
                startTime: new Date("2026-04-28T16:00:00.000Z"),
                serviceDetails: [snapshotWithPrice(4500)],
            }),
            dashboardBookingFixture({
                id: "walk-in-completed-from-price",
                source: "walk_in",
                status: "completed",
                startTime: new Date("2026-04-29T16:00:00.000Z"),
                serviceDetails: [{ ...snapshotWithPrice(1500), priceType: "from", displayPrice: "from $15" }],
            }),
            dashboardBookingFixture({
                id: "imported-completed",
                source: "imported",
                status: "completed",
                startTime: new Date("2026-04-30T16:00:00.000Z"),
                serviceDetails: [snapshotWithPrice(3500)],
            }),
            dashboardBookingFixture({
                id: "cancelled-excluded",
                status: "cancelled",
                startTime: new Date("2026-05-01T16:00:00.000Z"),
                serviceDetails: [snapshotWithPrice(9900)],
            }),
            dashboardBookingFixture({
                id: "no-show-excluded",
                status: "no_show",
                startTime: new Date("2026-05-02T16:00:00.000Z"),
                serviceDetails: [snapshotWithPrice(9900)],
            }),
            dashboardBookingFixture({
                id: "missing-price-snapshot",
                status: "completed",
                startTime: new Date("2026-05-02T17:00:00.000Z"),
                serviceDetails: [],
            }),
            dashboardBookingFixture({
                id: "outside-window",
                status: "completed",
                startTime: new Date("2026-04-26T16:00:00.000Z"),
                serviceDetails: [snapshotWithPrice(8800)],
            }),
        ];

        const dashboard = await getAdminDashboard(
            { id: "owner", email: "owner@example.com", displayName: "Owner", role: "owner", barberId: null },
            repository,
            { now: new Date("2026-05-03T14:00:00.000Z"), dashboardAnchorDate: "2026-05-03" },
        );

        expect(dashboard.revenue).toMatchObject({
            totalCents: 12500,
            appointmentCount: 5,
            completedAppointmentCount: 4,
            pastConfirmedAppointmentCount: 1,
            pricedAppointmentCount: 4,
            unpricedAppointmentCount: 1,
            fromPriceAppointmentCount: 1,
            averageRevenueCents: 3125,
            period: "week",
            anchorDate: "2026-05-03",
            periodStart: "2026-04-27",
            periodEnd: "2026-05-03",
            bucketGranularity: "day",
        });
        expect(dashboard.revenue.series).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ key: "2026-04-27", totalCents: 3000, appointmentCount: 1, pastConfirmedAppointmentCount: 1 }),
                expect.objectContaining({ key: "2026-04-28", label: "Apr 28", totalCents: 4500, completedAppointmentCount: 1 }),
                expect.objectContaining({ key: "2026-04-29", totalCents: 1500, completedAppointmentCount: 1, fromPriceAppointmentCount: 1 }),
                expect.objectContaining({ key: "2026-04-30", totalCents: 3500, completedAppointmentCount: 1 }),
                expect.objectContaining({ key: "2026-05-02", totalCents: 0, appointmentCount: 1, completedAppointmentCount: 1, unpricedAppointmentCount: 1 }),
            ]),
        );

        const monthlyDashboard = await getAdminDashboard(
            { id: "owner", email: "owner@example.com", displayName: "Owner", role: "owner", barberId: null },
            repository,
            { now: new Date("2026-05-03T14:00:00.000Z"), dashboardPeriod: "month", dashboardAnchorDate: "2026-04-15" },
        );
        expect(monthlyDashboard.revenue).toMatchObject({
            period: "month",
            anchorDate: "2026-04-15",
            periodStart: "2026-04-01",
            periodEnd: "2026-04-30",
            bucketGranularity: "day",
            totalCents: 21300,
            appointmentCount: 5,
            pricedAppointmentCount: 5,
        });
        expect(monthlyDashboard.revenue.series).toHaveLength(30);

        const annualDashboard = await getAdminDashboard(
            { id: "owner", email: "owner@example.com", displayName: "Owner", role: "owner", barberId: null },
            repository,
            { now: new Date("2026-05-03T14:00:00.000Z"), dashboardPeriod: "year", dashboardAnchorDate: "2026-06-09" },
        );
        expect(annualDashboard.revenue).toMatchObject({
            period: "year",
            anchorDate: "2026-06-09",
            periodStart: "2026-01-01",
            periodEnd: "2026-12-31",
            bucketGranularity: "month",
            totalCents: 21300,
            appointmentCount: 6,
            pricedAppointmentCount: 5,
        });
        expect(annualDashboard.revenue.series).toHaveLength(12);
        expect(annualDashboard.revenue.series).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ key: "2026-04", label: "Apr", totalCents: 21300, pricedAppointmentCount: 5 }),
            ]),
        );
    });

    test("dashboard defaults revenue anchor to the latest reportable appointment date", async () => {
        const repository = new InMemoryPhase6Repository();
        repository.bookings = [
            dashboardBookingFixture({
                id: "completed-history",
                status: "completed",
                startTime: new Date("2026-05-01T16:00:00.000Z"),
                serviceDetails: [snapshotWithPrice(8000)],
            }),
            dashboardBookingFixture({
                id: "latest-past-confirmed",
                status: "confirmed",
                startTime: new Date("2026-05-18T16:00:00.000Z"),
                serviceDetails: [snapshotWithPrice(3000)],
            }),
            dashboardBookingFixture({
                id: "future-confirmed-not-revenue-yet",
                status: "confirmed",
                startTime: new Date("2026-06-16T16:00:00.000Z"),
                serviceDetails: [snapshotWithPrice(3000)],
            }),
        ];

        const dashboard = await getAdminDashboard(
            { id: "owner", email: "owner@example.com", displayName: "Owner", role: "owner", barberId: null },
            repository,
            { now: new Date("2026-06-09T19:00:00.000Z") },
        );

        expect(dashboard.revenue).toMatchObject({
            period: "week",
            anchorDate: "2026-05-18",
            periodStart: "2026-05-12",
            periodEnd: "2026-05-18",
            totalCents: 3000,
            appointmentCount: 1,
            pastConfirmedAppointmentCount: 1,
            completedAppointmentCount: 0,
        });
    });

    test("dashboard all-time revenue spans every happened appointment in history", async () => {
        const repository = new InMemoryPhase6Repository();
        repository.bookings = [
            dashboardBookingFixture({
                id: "completed-last-year",
                status: "completed",
                startTime: new Date("2025-12-31T17:00:00.000Z"),
                serviceDetails: [snapshotWithPrice(10000)],
            }),
            dashboardBookingFixture({
                id: "completed-unpriced",
                status: "completed",
                startTime: new Date("2026-04-20T16:00:00.000Z"),
                serviceDetails: [],
            }),
            dashboardBookingFixture({
                id: "past-confirmed-this-year",
                status: "confirmed",
                startTime: new Date("2026-05-18T16:00:00.000Z"),
                serviceDetails: [snapshotWithPrice(3000)],
            }),
            dashboardBookingFixture({
                id: "future-confirmed-excluded",
                status: "confirmed",
                startTime: new Date("2026-06-16T16:00:00.000Z"),
                serviceDetails: [snapshotWithPrice(5000)],
            }),
            dashboardBookingFixture({
                id: "cancelled-excluded",
                status: "cancelled",
                startTime: new Date("2026-03-01T17:00:00.000Z"),
                serviceDetails: [snapshotWithPrice(9000)],
            }),
            dashboardBookingFixture({
                id: "no-show-excluded",
                status: "no_show",
                startTime: new Date("2026-03-02T17:00:00.000Z"),
                serviceDetails: [snapshotWithPrice(9000)],
            }),
        ];

        const dashboard = await getAdminDashboard(
            { id: "owner", email: "owner@example.com", displayName: "Owner", role: "owner", barberId: null },
            repository,
            { now: new Date("2026-06-09T19:00:00.000Z"), dashboardPeriod: "all-time" },
        );

        expect(dashboard.revenue).toMatchObject({
            period: "all-time",
            anchorDate: "2026-05-18",
            periodStart: "2025-12-31",
            periodEnd: "2026-05-18",
            bucketGranularity: "month",
            totalCents: 13000,
            appointmentCount: 3,
            completedAppointmentCount: 2,
            pastConfirmedAppointmentCount: 1,
            pricedAppointmentCount: 2,
            unpricedAppointmentCount: 1,
            averageRevenueCents: 6500,
        });
        expect(dashboard.revenue.series.map((point) => point.key)).toEqual([
            "2025-12",
            "2026-01",
            "2026-02",
            "2026-03",
            "2026-04",
            "2026-05",
        ]);
        expect(dashboard.revenue.series).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ key: "2025-12", label: "Dec 2025", totalCents: 10000, completedAppointmentCount: 1 }),
                expect.objectContaining({ key: "2026-04", label: "Apr 2026", totalCents: 0, unpricedAppointmentCount: 1 }),
                expect.objectContaining({ key: "2026-05", label: "May 2026", totalCents: 3000, pastConfirmedAppointmentCount: 1 }),
            ]),
        );
    });

    test("dashboard all-time revenue fetches more than the bounded chart default", async () => {
        const repository = new InMemoryPhase6Repository();
        repository.bookings = Array.from({ length: 501 }, (_, index) =>
            dashboardBookingFixture({
                id: `historical-completed-${index}`,
                status: "completed",
                startTime: new Date("2026-01-01T17:00:00.000Z"),
                serviceDetails: [snapshotWithPrice(1000)],
            }),
        );

        const dashboard = await getAdminDashboard(
            { id: "owner", email: "owner@example.com", displayName: "Owner", role: "owner", barberId: null },
            repository,
            { now: new Date("2026-06-09T19:00:00.000Z"), dashboardPeriod: "all-time" },
        );

        expect(dashboard.revenue).toMatchObject({
            period: "all-time",
            appointmentCount: 501,
            pricedAppointmentCount: 501,
            totalCents: 501000,
        });
    });

    test("dashboard revenue remains scoped for barber users", async () => {
        const repository = new InMemoryPhase6Repository();
        repository.bookings = [
            dashboardBookingFixture({
                id: "sam-completed",
                barberId: barberAId,
                status: "completed",
                startTime: new Date("2026-05-01T16:00:00.000Z"),
                serviceDetails: [snapshotWithPrice(3000)],
            }),
            dashboardBookingFixture({
                id: "laura-completed",
                barberId: barberBId,
                status: "completed",
                startTime: new Date("2026-05-01T17:00:00.000Z"),
                serviceDetails: [snapshotWithPrice(4500)],
            }),
        ];

        const dashboard = await getAdminDashboard(
            { id: "barber", email: "sam@example.com", displayName: "Sam", role: "barber", barberId: barberAId },
            repository,
            { now: new Date("2026-05-03T14:00:00.000Z") },
        );

        expect(dashboard.revenue).toMatchObject({
            totalCents: 3000,
            completedAppointmentCount: 1,
            pricedAppointmentCount: 1,
        });
    });

    test("dashboard aggregates upcoming appointment status counts by current appointment date", async () => {
        const repository = new InMemoryPhase6Repository();
        repository.bookings = [
            dashboardBookingFixture({
                id: "today-confirmed",
                status: "confirmed",
                startTime: new Date("2026-05-03T16:00:00.000Z"),
            }),
            dashboardBookingFixture({
                id: "rescheduled-confirmed",
                status: "confirmed",
                startTime: new Date("2026-05-04T16:00:00.000Z"),
            }),
            dashboardBookingFixture({
                id: "same-day-cancelled",
                status: "cancelled",
                startTime: new Date("2026-05-04T17:00:00.000Z"),
            }),
            dashboardBookingFixture({
                id: "next-week-confirmed",
                status: "confirmed",
                startTime: new Date("2026-05-09T16:00:00.000Z"),
            }),
            dashboardBookingFixture({
                id: "outside-window",
                status: "confirmed",
                startTime: new Date("2026-05-10T16:00:00.000Z"),
            }),
        ];

        const dashboard = await getAdminDashboard(
            { id: "owner", email: "owner@example.com", displayName: "Owner", role: "owner", barberId: null },
            repository,
            { now: new Date("2026-05-03T14:00:00.000Z") },
        );

        expect(dashboard.upcomingAppointments).toMatchObject({
            confirmedCount: 3,
            cancelledCount: 1,
        });
        expect(dashboard.upcomingAppointments.dailySeries).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ date: "2026-05-03", confirmedCount: 1, cancelledCount: 0 }),
                expect.objectContaining({ date: "2026-05-04", confirmedCount: 1, cancelledCount: 1 }),
                expect.objectContaining({ date: "2026-05-09", confirmedCount: 1, cancelledCount: 0 }),
            ]),
        );
    });

    test("dashboard summarizes notification health without letting failed rows dominate activity", async () => {
        const repository = new InMemoryPhase6Repository();
        repository.bookings = [
            dashboardBookingFixture({
                id: "future-contacted",
                status: "confirmed",
                startTime: new Date("2026-05-05T19:00:00.000Z"),
                customerPhone: "+16475550199",
                customerEmail: "future@example.com",
            }),
        ];
        repository.activityRecords = [
            dashboardActivityFixture({ id: "sent", status: "sent" }),
            dashboardActivityFixture({ id: "skipped", status: "skipped" }),
            dashboardActivityFixture({
                id: "pending-reminder",
                status: "pending",
                scheduledFor: new Date("2026-05-04T19:00:00.000Z"),
            }),
            dashboardActivityFixture({
                id: "active-failure",
                status: "failed",
                eventType: "reminder_24h",
                channel: "sms",
                appointmentStatus: "confirmed",
                appointmentStartTime: new Date("2026-05-05T19:00:00.000Z"),
                errorMessage: "The destination phone number is unreachable.",
            }),
            dashboardActivityFixture({
                id: "historical-failure",
                status: "failed",
                eventType: "reminder_2h",
                appointmentStatus: "confirmed",
                appointmentStartTime: new Date("2026-05-02T19:00:00.000Z"),
            }),
        ];

        const dashboard = await getAdminDashboard(
            { id: "owner", email: "owner@example.com", displayName: "Owner", role: "owner", barberId: null },
            repository,
            { now: new Date("2026-05-03T14:00:00.000Z") },
        );

        expect(dashboard.notificationHealth).toMatchObject({
            sentCount: 1,
            scheduledCount: 1,
            skippedCount: 1,
            failedActiveCount: 1,
            failedHistoricalCount: 1,
            deliverySuccessRate: 50,
        });
        expect(dashboard.notificationHealth.reminderQueueCount).toBeGreaterThan(0);
    });

    test("dashboard reports reminder scheduler heartbeat state", async () => {
        const repository = new InMemoryPhase6Repository();
        const currentTime = new Date("2026-05-20T17:30:00.000Z");
        const successRun = schedulerJobRunFixture({
            id: "scheduler-success",
            status: "success",
            finishedAt: new Date("2026-05-20T17:05:00.000Z"),
            result: { scanned: 1, sent: 0, failed: 0 },
        });
        repository.schedulerJobRunSummary = {
            latest: successRun,
            latestSuccess: successRun,
            latestFailure: null,
        };

        const healthyDashboard = await getAdminDashboard(
            { id: "owner", email: "owner@example.com", displayName: "Owner", role: "owner", barberId: null },
            repository,
            { now: currentTime, reminderSchedulerStaleAfterMinutes: 90 },
        );

        expect(healthyDashboard.notificationHealth.reminderScheduler).toMatchObject({
            state: "healthy",
            latestStatus: "success",
            minutesSinceLastSuccess: 25,
            latestResult: { scanned: 1, sent: 0, failed: 0 },
        });

        repository.schedulerJobRunSummary = {
            latest: schedulerJobRunFixture({
                id: "scheduler-stale",
                status: "success",
                finishedAt: new Date("2026-05-20T15:00:00.000Z"),
            }),
            latestSuccess: schedulerJobRunFixture({
                id: "scheduler-stale",
                status: "success",
                finishedAt: new Date("2026-05-20T15:00:00.000Z"),
            }),
            latestFailure: null,
        };

        const staleDashboard = await getAdminDashboard(
            { id: "owner", email: "owner@example.com", displayName: "Owner", role: "owner", barberId: null },
            repository,
            { now: currentTime, reminderSchedulerStaleAfterMinutes: 90 },
        );

        expect(staleDashboard.notificationHealth.reminderScheduler).toMatchObject({
            state: "stale",
            minutesSinceLastSuccess: 150,
        });

        const failureRun = schedulerJobRunFixture({
            id: "scheduler-failure",
            status: "failure",
            finishedAt: new Date("2026-05-20T17:20:00.000Z"),
            errorMessage: "Unauthorized",
        });
        repository.schedulerJobRunSummary = {
            latest: failureRun,
            latestSuccess: successRun,
            latestFailure: failureRun,
        };

        const failingDashboard = await getAdminDashboard(
            { id: "owner", email: "owner@example.com", displayName: "Owner", role: "owner", barberId: null },
            repository,
            { now: currentTime, reminderSchedulerStaleAfterMinutes: 90 },
        );

        expect(failingDashboard.notificationHealth.reminderScheduler).toMatchObject({
            state: "failing",
            latestStatus: "failure",
            errorMessage: "Unauthorized",
        });
    });

    test("dashboard classifies failed notification activity as active only while still actionable", async () => {
        const repository = new InMemoryPhase6Repository();
        const currentTime = new Date("2026-05-03T14:00:00.000Z");
        repository.activityRecords = [
            dashboardActivityFixture({
                id: "future-provider-config-failure",
                bookingId: "future-booking",
                status: "failed",
                eventType: "booking_confirmation",
                channel: "email",
                recipientLabel: "Customer Email a***@example.com",
                appointmentStatus: "confirmed",
                appointmentStartTime: new Date("2026-05-03T19:00:00.000Z"),
                appointmentEndTime: new Date("2026-05-03T19:30:00.000Z"),
                provider: "resend",
                errorMessage:
                    "The leasidefades.com domain is not verified. Please, add and verify your domain on https://resend.com/domains",
            }),
            dashboardActivityFixture({
                id: "past-provider-config-failure",
                bookingId: "past-booking",
                status: "failed",
                eventType: "reminder_2h",
                channel: "email",
                recipientLabel: "Customer Email b***@example.com",
                appointmentStatus: "confirmed",
                appointmentStartTime: new Date("2026-05-02T19:00:00.000Z"),
                appointmentEndTime: new Date("2026-05-02T19:30:00.000Z"),
                provider: "resend",
                errorMessage:
                    "The leasidefades.com domain is not verified. Please, add and verify your domain on https://resend.com/domains",
            }),
            dashboardActivityFixture({
                id: "future-provider-rejected-failure",
                bookingId: "future-sms-booking",
                status: "failed",
                eventType: "reminder_24h",
                channel: "sms",
                recipientLabel: "Customer SMS ***0199",
                appointmentStatus: "confirmed",
                appointmentStartTime: new Date("2026-05-04T19:00:00.000Z"),
                appointmentEndTime: new Date("2026-05-04T19:30:00.000Z"),
                provider: "twilio",
                errorMessage: "The destination phone number is unreachable.",
            }),
        ];

        const dashboard = await getAdminDashboard(
            { id: "owner", email: "owner@example.com", displayName: "Owner", role: "owner", barberId: null },
            repository,
            { now: currentTime },
        );

        expect(dashboard.activity).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: "future-provider-config-failure",
                    isActiveFailure: true,
                    failureCategory: "provider_config",
                    failureSummary: "Email provider configuration issue",
                }),
                expect.objectContaining({
                    id: "past-provider-config-failure",
                    isActiveFailure: false,
                    failureCategory: "provider_config",
                    failureSummary: "Email provider configuration issue",
                }),
                expect.objectContaining({
                    id: "future-provider-rejected-failure",
                    isActiveFailure: true,
                    failureCategory: "provider_rejected",
                    failureSummary: "The destination phone number is unreachable.",
                }),
            ]),
        );
    });

    test("manual booking rejects overlapping confirmed bookings", async () => {
        const repository = new InMemoryPhase6Repository();
        repository.availabilityData = baseAvailability({
            bookings: [
                {
                    id: "existing",
                    barberId: barberAId,
                    locationId: locationAId,
                    status: "confirmed",
                    startTime: utc(10),
                    endTime: utc(10, 30),
                } as any,
            ],
        });

        await expect(
            createAdminManualBooking(
                { id: "owner", email: "owner@example.com", displayName: "Owner", role: "owner", barberId: null },
                {
                    locationId: locationAId,
                    serviceIds: [serviceId],
                    barberId: barberAId,
                    startTime: utc(10, 15).toISOString(),
                    customer: {
                        firstName: "Overlap",
                        lastName: "Customer",
                        phone: "+16475550123",
                        email: "overlap@example.com",
                    },
                },
                repository,
                { now },
            ),
        ).rejects.toMatchObject({ status: 409 });
    });

    test("staff-created manual bookings can use grey off-shift times without changing public availability", async () => {
        const repository = new InMemoryPhase6Repository();
        const publicAvailabilityBefore = await getAdminAvailability(
            { id: "owner", email: "owner@example.com", displayName: "Owner", role: "owner", barberId: null },
            {
                locationId: locationAId,
                serviceIds: [serviceId],
                date: "2026-05-04",
                barberId: barberAId,
                now,
            },
            repository,
        );

        expect(publicAvailabilityBefore.barberSlots[0]?.slots.map((slot) => slot.startTime)).not.toContain(
            utc(9).toISOString(),
        );

        await expect(
            createAdminManualBooking(
                { id: "owner", email: "owner@example.com", displayName: "Owner", role: "owner", barberId: null },
                {
                    locationId: locationAId,
                    serviceIds: [serviceId],
                    barberId: barberAId,
                    startTime: utc(9).toISOString(),
                    customer: {
                        name: "Grey Slot Client",
                        phone: "+16475550123",
                        email: "grey@example.com",
                    },
                },
                repository,
                { now },
            ),
        ).resolves.toMatchObject({
            barberId: barberAId,
            startTime: utc(9),
            endTime: utc(9, 30),
        });

        const publicAvailabilityAfter = await getAdminAvailability(
            { id: "owner", email: "owner@example.com", displayName: "Owner", role: "owner", barberId: null },
            {
                locationId: locationAId,
                serviceIds: [serviceId],
                date: "2026-05-04",
                barberId: barberAId,
                now,
            },
            repository,
        );
        expect(publicAvailabilityAfter.barberSlots[0]?.slots.map((slot) => slot.startTime)).not.toContain(
            utc(9).toISOString(),
        );
    });

    test("edit updates customer contact, notes, service snapshots, and schedule while preserving source/status", async () => {
        const repository = new InMemoryPhase6Repository();
        const dispatched: Parameters<BookingLifecycleNotificationDispatcher>[0][] = [];
        repository.bookings[0] = {
            ...repository.bookings[0],
            source: "imported",
            customerEmail: null,
            customerPhone: null,
            customerNotes: "old customer notes",
            internalNotes: "old internal notes",
            serviceIds: [serviceId],
            serviceDetails: [serviceSnapshot],
        };

        await expect(
            editAdminBooking(
                { id: "owner", email: "owner@example.com", displayName: "Owner", role: "owner", barberId: null },
                "booking-a",
                {
                    locationId: locationAId,
                    barberId: barberAId,
                    startTime: utc(9).toISOString(),
                    serviceIds: [serviceId, serviceBId],
                    customer: {
                        name: "Ada Edited",
                        phone: "(647) 555-0123",
                        email: "edited@example.com",
                        notes: "new customer notes",
                    },
                    internalNotes: "front desk edit",
                },
                repository,
                {
                    now,
                    notificationDispatcher: async (input) => {
                        dispatched.push(input);
                        return [];
                    },
                },
            ),
        ).resolves.toMatchObject({
            id: "booking-a",
            status: "confirmed",
            source: "imported",
            customerName: "Ada Edited",
            customerEmail: "edited@example.com",
            customerPhone: "+16475550123",
            customerNotes: "new customer notes",
            internalNotes: "front desk edit",
            startTime: utc(9),
            endTime: utc(9, 45),
            totalDurationMinutes: 45,
            services: ["Men's Cut", "Beard Trim"],
            serviceIds: [serviceId, serviceBId],
        });
        expect(repository.bookingServices.filter((snapshot) => snapshot.bookingId === "booking-a")).toHaveLength(2);
        expect(dispatched).toEqual([
            expect.objectContaining({
                eventType: "reschedule_confirmation",
                bookingId: "booking-a",
                occurrenceKey: "2026-05-04T13:00:00.000Z",
            }),
        ]);
    });

    test("barber can edit own booking but cannot edit another barber booking", async () => {
        const repository = new InMemoryPhase6Repository();

        await expect(
            editAdminBooking(
                { id: "barber", email: "sam@example.com", displayName: "Sam", role: "barber", barberId: barberAId },
                "booking-b",
                {
                    locationId: locationAId,
                    barberId: barberBId,
                    startTime: utc(9).toISOString(),
                    serviceIds: [serviceId],
                    customer: { name: "Blocked Edit" },
                    internalNotes: "",
                },
                repository,
                { now },
            ),
        ).rejects.toMatchObject({ status: 403 });

        await expect(
            editAdminBooking(
                { id: "barber", email: "sam@example.com", displayName: "Sam", role: "barber", barberId: barberAId },
                "booking-a",
                {
                    locationId: locationAId,
                    barberId: barberAId,
                    startTime: utc(9).toISOString(),
                    serviceIds: [serviceId],
                    customer: { name: "Own Edit", phone: "", email: "" },
                    internalNotes: "own note",
                },
                repository,
                { now },
            ),
        ).resolves.toMatchObject({
            id: "booking-a",
            customerName: "Own Edit",
            customerPhone: null,
            customerEmail: null,
            internalNotes: "own note",
        });
    });

    test("cancellation is idempotent for cancelled bookings and rejects completed bookings", async () => {
        const repository = new InMemoryPhase6Repository();
        const dispatched: Parameters<BookingLifecycleNotificationDispatcher>[0][] = [];
        repository.bookings.push({
            ...bookings[0],
            id: "completed-booking",
            status: "completed",
            serviceIds: [serviceId],
        });

        await expect(
            cancelAdminBooking(
                { id: "owner", email: "owner@example.com", displayName: "Owner", role: "owner", barberId: null },
                "booking-a",
                repository,
                {
                    now,
                    notificationDispatcher: async (input) => {
                        dispatched.push(input);
                        return [];
                    },
                },
            ),
        ).resolves.toMatchObject({ status: "cancelled" });
        await expect(
            cancelAdminBooking(
                { id: "owner", email: "owner@example.com", displayName: "Owner", role: "owner", barberId: null },
                "booking-a",
                repository,
                { now },
            ),
        ).resolves.toMatchObject({ status: "cancelled" });
        await expect(
            cancelAdminBooking(
                { id: "owner", email: "owner@example.com", displayName: "Owner", role: "owner", barberId: null },
                "completed-booking",
                repository,
                { now },
            ),
        ).rejects.toBeInstanceOf(AdminBookingRequestError);
        expect(dispatched).toEqual([
            expect.objectContaining({
                eventType: "cancellation_confirmation",
                bookingId: "booking-a",
            }),
        ]);
    });

    test.each([
        ["serviceIds", [serviceId]],
        ["services", ["Bald Fade"]],
        ["bookingServices", [serviceSnapshot]],
        ["serviceDetails", [serviceSnapshot]],
        ["serviceSnapshots", [serviceSnapshot]],
        ["duration", 60],
        ["durationMinutes", 60],
        ["totalDurationMinutes", 60],
        ["price", "$60"],
        ["priceCents", 6000],
        ["priceType", "fixed"],
        ["displayPrice", "$60"],
    ])("reschedule rejects service-changing field %s", async (field, value) => {
        const repository = new InMemoryPhase6Repository();
        const originalStart = repository.bookings[0].startTime;

        await expect(
            rescheduleAdminBooking(
                { id: "owner", email: "owner@example.com", displayName: "Owner", role: "owner", barberId: null },
                "booking-a",
                {
                    locationId: locationAId,
                    barberId: barberAId,
                    startTime: utc(10).toISOString(),
                    [field]: value,
                } as any,
                repository,
                { now },
            ),
        ).rejects.toMatchObject({
            status: 400,
            message:
                "Service changes are not supported during reschedule. Cancel and recreate the booking to change services.",
        });
        expect(repository.bookings[0].startTime).toEqual(originalStart);
    });

    test("reschedule still succeeds for valid time, location, and barber changes", async () => {
        const repository = new InMemoryPhase6Repository();
        const dispatched: Parameters<BookingLifecycleNotificationDispatcher>[0][] = [];
        repository.availabilityData = baseAvailability({
            businessHours: [
                {
                    locationId: locationBId,
                    dayOfWeek: 1,
                    openTime: "10:00",
                    closeTime: "19:00",
                },
            ],
            barberLocations: [{ barberId: barberBId, locationId: locationBId }],
            shifts: [
                {
                    barberId: barberBId,
                    locationId: locationBId,
                    dayOfWeek: 1,
                    startTime: "10:00",
                    endTime: "19:00",
                    active: true,
                },
            ],
        });

        await expect(
            rescheduleAdminBooking(
                { id: "owner", email: "owner@example.com", displayName: "Owner", role: "owner", barberId: null },
                "booking-a",
                {
                    locationId: locationBId,
                    barberId: barberBId,
                    startTime: utc(12).toISOString(),
                },
                repository,
                {
                    now,
                    notificationDispatcher: async (input) => {
                        dispatched.push(input);
                        return [];
                    },
                },
            ),
        ).resolves.toMatchObject({
            id: "booking-a",
            barberId: barberBId,
            locationId: locationBId,
            startTime: utc(12),
            endTime: utc(12, 30),
        });
        expect(dispatched).toEqual([
            expect.objectContaining({
                eventType: "reschedule_confirmation",
                bookingId: "booking-a",
                occurrenceKey: "2026-05-04T16:00:00.000Z",
            }),
        ]);
    });

    test("reschedule can move a staff-managed booking into grey off-shift time", async () => {
        const repository = new InMemoryPhase6Repository();

        await expect(
            rescheduleAdminBooking(
                { id: "owner", email: "owner@example.com", displayName: "Owner", role: "owner", barberId: null },
                "booking-a",
                {
                    locationId: locationAId,
                    barberId: barberAId,
                    startTime: utc(9).toISOString(),
                },
                repository,
                { now },
            ),
        ).resolves.toMatchObject({
            id: "booking-a",
            startTime: utc(9),
            endTime: utc(9, 30),
        });
    });

    test("reschedule excludes the booking being moved but rejects other overlaps", async () => {
        const repository = new InMemoryPhase6Repository();
        repository.bookings[0] = {
            ...repository.bookings[0],
            startTime: utc(10),
            endTime: utc(10, 30),
        };
        repository.bookings.push({
            ...bookings[1],
            id: "blocking-booking",
            barberId: barberAId,
            locationId: locationAId,
            status: "confirmed",
            startTime: utc(11),
            endTime: utc(11, 30),
            serviceIds: [serviceId],
        });
        repository.availabilityData = baseAvailability({
            bookings: repository.bookings.map((booking) => ({
                id: booking.id,
                barberId: booking.barberId,
                locationId: booking.locationId,
                status: booking.status,
                startTime: booking.startTime,
                endTime: booking.endTime,
            })) as any,
        });

        await expect(
            rescheduleAdminBooking(
                { id: "owner", email: "owner@example.com", displayName: "Owner", role: "owner", barberId: null },
                "booking-a",
                {
                    locationId: locationAId,
                    barberId: barberAId,
                    startTime: utc(10, 15).toISOString(),
                },
                repository,
                { now },
            ),
        ).resolves.toMatchObject({
            id: "booking-a",
            startTime: utc(10, 15),
            endTime: utc(10, 45),
        });

        await expect(
            rescheduleAdminBooking(
                { id: "owner", email: "owner@example.com", displayName: "Owner", role: "owner", barberId: null },
                "booking-a",
                {
                    locationId: locationAId,
                    barberId: barberAId,
                    startTime: utc(11, 15).toISOString(),
                },
                repository,
                { now },
            ),
        ).rejects.toMatchObject({ status: 409 });
    });
});

describe("Phase 7.5 walk-in and no-show booking operations", () => {
    test("barber creates own walk-in with name only, walk_in source, and staff notice bypass", async () => {
        const repository = new InMemoryPhase6Repository();
        const dispatched: Parameters<BookingLifecycleNotificationDispatcher>[0][] = [];

        const created = await createAdminWalkInBooking(
            { id: "barber", email: "sam@example.com", displayName: "Sam", role: "barber", barberId: barberAId },
            {
                locationId: locationAId,
                serviceIds: [serviceId],
                barberId: barberAId,
                startTime: utc(10).toISOString(),
                customerName: "Jeff",
            },
            repository,
            {
                now: new Date("2026-05-04T13:55:00.000Z"),
                notificationDispatcher: async (input) => {
                    dispatched.push(input);
                    return [];
                },
            },
        );

        expect(created).toMatchObject({
            source: "walk_in",
            barberId: barberAId,
            customerName: "Jeff",
            customerEmail: null,
            customerPhone: null,
        });
        expect(repository.customers[0]).toMatchObject({
            firstName: "Jeff",
            lastName: "",
            phoneE164: null,
            email: null,
        });
        expect(dispatched).toEqual([{ eventType: "booking_confirmation", bookingId: created.id }]);
    });

    test("allows a Saturday 5 PM walk-in inside a matching location shift", async () => {
        const repository = new InMemoryPhase6Repository();
        const dispatched: Parameters<BookingLifecycleNotificationDispatcher>[0][] = [];
        repository.availabilityData = baseAvailability({
            businessHours: [
                {
                    locationId: locationBId,
                    dayOfWeek: 6,
                    openTime: "10:00",
                    closeTime: "19:00",
                },
            ],
            barberLocations: [{ barberId: barberBId, locationId: locationBId }],
            shifts: [
                {
                    barberId: barberBId,
                    locationId: locationBId,
                    dayOfWeek: 6,
                    startTime: "15:00",
                    endTime: "19:00",
                    active: true,
                },
            ],
            bookings: [],
            blockedTimes: [],
        });

        const created = await createAdminWalkInBooking(
            { id: "owner", email: "owner@example.com", displayName: "Owner", role: "owner", barberId: null },
            {
                locationId: locationBId,
                serviceIds: [serviceId],
                barberId: barberBId,
                startTime: utc(17, 0, "2026-05-02").toISOString(),
                customerName: "Laura Five",
                customer: {
                    phone: "+16475550123",
                    email: "laura-five@example.com",
                },
            },
            repository,
            {
                now: new Date("2026-05-02T18:00:00.000Z"),
                notificationDispatcher: async (input) => {
                    dispatched.push(input);
                    return [];
                },
            },
        );

        expect(created).toMatchObject({
            source: "walk_in",
            barberId: barberBId,
            locationId: locationBId,
            startTime: utc(17, 0, "2026-05-02"),
            endTime: utc(17, 30, "2026-05-02"),
            customerName: "Laura Five",
            customerPhone: "+16475550123",
            customerEmail: "laura-five@example.com",
        });
        expect(dispatched).toEqual([{ eventType: "booking_confirmation", bookingId: created.id }]);
    });

    test("walk-in rejects invalid optional contact fields", async () => {
        await expect(
            createAdminWalkInBooking(
                { id: "owner", email: "owner@example.com", displayName: "Owner", role: "owner", barberId: null },
                {
                    locationId: locationAId,
                    serviceIds: [serviceId],
                    barberId: barberAId,
                    startTime: utc(10).toISOString(),
                    customerName: "Invalid Email",
                    customer: { email: "not-an-email" },
                },
                new InMemoryPhase6Repository(),
                { now },
            ),
        ).rejects.toMatchObject({ status: 400 });

        await expect(
            createAdminWalkInBooking(
                { id: "owner", email: "owner@example.com", displayName: "Owner", role: "owner", barberId: null },
                {
                    locationId: locationAId,
                    serviceIds: [serviceId],
                    barberId: barberAId,
                    startTime: utc(10).toISOString(),
                    customerName: "Invalid Phone",
                    customer: { phone: "123" },
                },
                new InMemoryPhase6Repository(),
                { now },
            ),
        ).rejects.toMatchObject({ status: 400 });
    });

    test("booking mutation still succeeds when notification delivery fails after mutation", async () => {
        const repository = new InMemoryPhase6Repository();

        await expect(
            cancelAdminBooking(
                { id: "owner", email: "owner@example.com", displayName: "Owner", role: "owner", barberId: null },
                "booking-a",
                repository,
                {
                    now,
                    notificationDispatcher: async () => {
                        throw new Error("Notification provider is down");
                    },
                },
            ),
        ).resolves.toMatchObject({ id: "booking-a", status: "cancelled" });
        expect(repository.bookings.find((booking) => booking.id === "booking-a")?.status).toBe("cancelled");
    });

    test("barber walk-in cannot spoof another barber and owner can create for any barber", async () => {
        const repository = new InMemoryPhase6Repository();

        await expect(
            createAdminWalkInBooking(
                { id: "barber", email: "sam@example.com", displayName: "Sam", role: "barber", barberId: barberAId },
                {
                    locationId: locationAId,
                    serviceIds: [serviceId],
                    barberId: barberBId,
                    startTime: utc(10).toISOString(),
                    customerName: "Spoof",
                },
                repository,
                { now },
            ),
        ).rejects.toMatchObject({ status: 403 });

        await expect(
            createAdminWalkInBooking(
                { id: "owner", email: "owner@example.com", displayName: "Owner", role: "owner", barberId: null },
                {
                    locationId: locationAId,
                    serviceIds: [serviceId],
                    barberId: barberBId,
                    startTime: utc(10).toISOString(),
                    customerName: "Owner Walkin",
                },
                repository,
                { now },
            ),
        ).resolves.toMatchObject({ source: "walk_in", barberId: barberBId });
    });

    test("walk-in still rejects overlap, blocked time, and appointments that do not fit in the admin day", async () => {
        const overlappingRepository = new InMemoryPhase6Repository();
        overlappingRepository.availabilityData = baseAvailability({
            bookings: [
                {
                    id: "existing",
                    barberId: barberAId,
                    locationId: locationAId,
                    status: "confirmed",
                    startTime: utc(10),
                    endTime: utc(10, 30),
                } as any,
            ],
        });

        await expect(
            createAdminWalkInBooking(
                { id: "owner", email: "owner@example.com", displayName: "Owner", role: "owner", barberId: null },
                {
                    locationId: locationAId,
                    serviceIds: [serviceId],
                    barberId: barberAId,
                    startTime: utc(10, 15).toISOString(),
                    customerName: "Overlap",
                },
                overlappingRepository,
                { now },
            ),
        ).rejects.toMatchObject({ status: 409 });

        await expect(
            createAdminWalkInBooking(
                { id: "owner", email: "owner@example.com", displayName: "Owner", role: "owner", barberId: null },
                {
                    locationId: locationAId,
                    serviceIds: [serviceId],
                    barberId: barberAId,
                    startTime: utc(23, 45).toISOString(),
                    customerName: "Too Late",
                },
                new InMemoryPhase6Repository(),
                { now },
            ),
        ).rejects.toMatchObject({ status: 409 });

        const blockedRepository = new InMemoryPhase6Repository();
        blockedRepository.availabilityData = baseAvailability({
            blockedTimes: [
                {
                    scope: "barber",
                    barberId: barberAId,
                    locationId: locationAId,
                    startTime: utc(10),
                    endTime: utc(10, 30),
                },
            ],
        });

        await expect(
            createAdminWalkInBooking(
                { id: "owner", email: "owner@example.com", displayName: "Owner", role: "owner", barberId: null },
                {
                    locationId: locationAId,
                    serviceIds: [serviceId],
                    barberId: barberAId,
                    startTime: utc(10).toISOString(),
                    customerName: "Blocked",
                },
                blockedRepository,
                { now },
            ),
        ).rejects.toMatchObject({ status: 409 });
    });

    test("no-show is permission scoped and only allowed for current or past confirmed bookings", async () => {
        const repository = new InMemoryPhase6Repository();
        repository.bookings[0] = {
            ...repository.bookings[0],
            startTime: new Date("2026-05-04T14:00:00.000Z"),
            endTime: new Date("2026-05-04T14:30:00.000Z"),
        };
        repository.bookings.push({
            ...bookings[0],
            id: "future-booking",
            startTime: new Date("2026-05-05T14:00:00.000Z"),
            endTime: new Date("2026-05-05T14:30:00.000Z"),
            serviceIds: [serviceId],
        });
        repository.bookings.push({
            ...bookings[0],
            id: "cancelled-booking",
            status: "cancelled",
            startTime: new Date("2026-05-04T13:00:00.000Z"),
            endTime: new Date("2026-05-04T13:30:00.000Z"),
            serviceIds: [serviceId],
        });

        await expect(
            markAdminBookingNoShow(
                { id: "barber", email: "sam@example.com", displayName: "Sam", role: "barber", barberId: barberBId },
                "booking-a",
                repository,
                { now: new Date("2026-05-04T14:30:00.000Z") },
            ),
        ).rejects.toMatchObject({ status: 404 });

        await expect(
            markAdminBookingNoShow(
                { id: "owner", email: "owner@example.com", displayName: "Owner", role: "owner", barberId: null },
                "future-booking",
                repository,
                { now: new Date("2026-05-04T14:30:00.000Z") },
            ),
        ).rejects.toMatchObject({ status: 409 });

        await expect(
            markAdminBookingNoShow(
                { id: "owner", email: "owner@example.com", displayName: "Owner", role: "owner", barberId: null },
                "cancelled-booking",
                repository,
                { now: new Date("2026-05-04T14:30:00.000Z") },
            ),
        ).rejects.toMatchObject({ status: 409 });

        await expect(
            markAdminBookingNoShow(
                { id: "barber", email: "sam@example.com", displayName: "Sam", role: "barber", barberId: barberAId },
                "booking-a",
                repository,
                { now: new Date("2026-05-04T14:30:00.000Z") },
            ),
        ).resolves.toMatchObject({ id: "booking-a", status: "no_show" });
    });

    test("completion is permission scoped and only allowed for current or past confirmed bookings", async () => {
        const repository = new InMemoryPhase6Repository();
        repository.bookings[0] = {
            ...repository.bookings[0],
            startTime: new Date("2026-05-04T14:00:00.000Z"),
            endTime: new Date("2026-05-04T14:30:00.000Z"),
        };
        repository.bookings.push({
            ...bookings[0],
            id: "future-booking",
            startTime: new Date("2026-05-05T14:00:00.000Z"),
            endTime: new Date("2026-05-05T14:30:00.000Z"),
            serviceIds: [serviceId],
        });
        repository.bookings.push({
            ...bookings[0],
            id: "cancelled-booking",
            status: "cancelled",
            startTime: new Date("2026-05-04T13:00:00.000Z"),
            endTime: new Date("2026-05-04T13:30:00.000Z"),
            serviceIds: [serviceId],
        });
        repository.bookings.push({
            ...bookings[0],
            id: "no-show-booking",
            status: "no_show",
            startTime: new Date("2026-05-04T12:00:00.000Z"),
            endTime: new Date("2026-05-04T12:30:00.000Z"),
            serviceIds: [serviceId],
        });

        await expect(
            completeAdminBooking(
                { id: "barber", email: "sam@example.com", displayName: "Sam", role: "barber", barberId: barberBId },
                "booking-a",
                repository,
                { now: new Date("2026-05-04T14:30:00.000Z") },
            ),
        ).rejects.toMatchObject({ status: 404 });

        await expect(
            completeAdminBooking(
                { id: "owner", email: "owner@example.com", displayName: "Owner", role: "owner", barberId: null },
                "future-booking",
                repository,
                { now: new Date("2026-05-04T14:30:00.000Z") },
            ),
        ).rejects.toMatchObject({ status: 409 });

        await expect(
            completeAdminBooking(
                { id: "owner", email: "owner@example.com", displayName: "Owner", role: "owner", barberId: null },
                "cancelled-booking",
                repository,
                { now: new Date("2026-05-04T14:30:00.000Z") },
            ),
        ).rejects.toMatchObject({ status: 409 });

        await expect(
            completeAdminBooking(
                { id: "owner", email: "owner@example.com", displayName: "Owner", role: "owner", barberId: null },
                "no-show-booking",
                repository,
                { now: new Date("2026-05-04T14:30:00.000Z") },
            ),
        ).rejects.toMatchObject({ status: 409 });

        await expect(
            completeAdminBooking(
                { id: "barber", email: "sam@example.com", displayName: "Sam", role: "barber", barberId: barberAId },
                "booking-a",
                repository,
                { now: new Date("2026-05-04T14:30:00.000Z") },
            ),
        ).resolves.toMatchObject({ id: "booking-a", status: "completed" });
    });
});
