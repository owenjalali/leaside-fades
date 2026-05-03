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
    createAdminManualBooking,
    createAdminWalkInBooking,
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
} from "./bookings-service.ts";
import type { BookingLifecycleNotificationDispatcher } from "../notifications/index.ts";

const barberAId = "11111111-1111-1111-1111-111111111111";
const barberBId = "22222222-2222-2222-2222-222222222222";
const locationAId = "33333333-3333-3333-3333-333333333333";
const locationBId = "44444444-4444-4444-4444-444444444444";
const serviceId = "55555555-5555-5555-5555-555555555555";
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
        services: [{ id: serviceId, durationMinutes: 30, active: true }],
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

class InMemoryPhase6Repository
    implements AdminBookingsRepository, AdminCalendarOptionsRepository, AdminBookingManagementRepository, BookingRepository
{
    bookings: Array<
        AdminBookingRecord & {
            customerId?: string;
            serviceIds?: string[];
            customerNotes?: string | null;
            internalNotes?: string | null;
        }
    > = bookings.map((booking) => ({ ...booking, serviceIds: [serviceId] }));
    customers: CreateBookingRequest["customer"][] = [];
    bookingServices: Array<BookingServiceSnapshot & { bookingId: string }> = [];
    availabilityData: AvailabilityData = baseAvailability();
    activityRecords: AdminDashboardActivityRecord[] | null = null;
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
                  serviceDetails: [serviceSnapshot],
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
        return serviceIds.map(() => serviceSnapshot);
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
            customerName: `${customer?.firstName} ${customer?.lastName}`,
            customerEmail: customer?.email ?? "",
            customerPhone: customer?.phoneE164 ?? "",
            services: ["Men's Cut"],
            serviceIds: [serviceId],
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

    test("walk-in still rejects overlap, outside shift, and blocked time", async () => {
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
                    startTime: utc(9).toISOString(),
                    customerName: "Early",
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
});
