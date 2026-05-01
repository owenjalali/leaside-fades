import { describe, expect, test } from "vitest";

import type { AvailabilityData } from "../availability/index.ts";
import {
    hashBookingManagementToken,
} from "../bookings/tokens.ts";
import type {
    BookingRepository,
    BookingServiceSnapshot,
    CreateBookingRequest,
} from "../bookings/index.ts";
import {
    cancelCustomerManagedBooking,
    CustomerBookingLinkError,
    getCustomerManagedBooking,
    getCustomerRescheduleAvailability,
    rescheduleCustomerManagedBooking,
    type CustomerBookingManagementRepository,
    type CustomerManagedBookingRecord,
} from "./customer-management-service.ts";
import type { BookingLifecycleNotificationDispatcher } from "../notifications/index.ts";

const locationId = "location-eglinton";
const barberId = "barber-sam";
const otherBarberId = "barber-laura";
const serviceId = "service-cut";
const cancellationToken = "cancel-token";
const rescheduleToken = "reschedule-token";
const now = new Date("2026-05-01T13:00:00.000Z");

function utc(localHour: number, localMinute = 0) {
    return new Date(Date.UTC(2026, 4, 4, localHour + 4, localMinute));
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

function baseAvailability(overrides: Partial<AvailabilityData> = {}): AvailabilityData {
    return {
        businessHours: [
            {
                locationId,
                dayOfWeek: 1,
                openTime: "10:00",
                closeTime: "19:00",
            },
        ],
        barbers: [
            { id: barberId, active: true, sortOrder: 10 },
            { id: otherBarberId, active: true, sortOrder: 20 },
        ],
        barberLocations: [
            { barberId, locationId },
            { barberId: otherBarberId, locationId },
        ],
        services: [{ id: serviceId, durationMinutes: 30, active: true }],
        shifts: [
            {
                barberId,
                locationId,
                dayOfWeek: 1,
                startTime: "10:00",
                endTime: "19:00",
                active: true,
            },
            {
                barberId: otherBarberId,
                locationId,
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

function booking(overrides: Partial<CustomerManagedBookingRecord> = {}): CustomerManagedBookingRecord {
    return {
        id: "booking-1",
        locationId,
        locationName: "Leaside Fades Eglinton",
        barberId,
        barberName: "Sam To",
        customerName: "Ada Lovelace",
        customerEmail: "ada@example.com",
        customerPhone: "+16475550199",
        status: "confirmed",
        source: "public",
        startTime: utc(10),
        endTime: utc(10, 30),
        totalDurationMinutes: 30,
        serviceIds: [serviceId],
        serviceDetails: [serviceSnapshot],
        ...overrides,
    };
}

class InMemoryCustomerManagementRepository
    implements CustomerBookingManagementRepository, BookingRepository
{
    bookings: CustomerManagedBookingRecord[] = [booking()];
    tokenHashes = new Map<string, { bookingId: string; tokenType: "cancellation" | "reschedule" }>([
        [hashBookingManagementToken(cancellationToken), { bookingId: "booking-1", tokenType: "cancellation" }],
        [hashBookingManagementToken(rescheduleToken), { bookingId: "booking-1", tokenType: "reschedule" }],
    ]);
    availabilityData: AvailabilityData = baseAvailability({
        bookings: [
            {
                id: "booking-1",
                barberId,
                locationId,
                status: "confirmed",
                startTime: utc(10),
                endTime: utc(10, 30),
            } as any,
        ],
    });
    lastAvailabilityRequest: CreateBookingRequest | null = null;
    lastNotification: Parameters<BookingLifecycleNotificationDispatcher>[0] | null = null;
    transactionCount = 0;

    async withTransaction<T>(callback: (transaction: BookingRepository) => Promise<T>): Promise<T> {
        this.transactionCount += 1;
        return callback(this);
    }

    async findCustomerManagedBookingByTokenHash(input: {
        tokenHash: string;
        tokenType?: "cancellation" | "reschedule";
    }) {
        const token = this.tokenHashes.get(input.tokenHash);

        if (!token || (input.tokenType && token.tokenType !== input.tokenType)) {
            return null;
        }

        return this.bookings.find((candidate) => candidate.id === token.bookingId) ?? null;
    }

    async cancelCustomerManagedBooking(input: {
        bookingId: string;
        tokenHash: string;
        cancelledAt: Date;
    }) {
        const token = this.tokenHashes.get(input.tokenHash);
        const target = this.bookings.find((candidate) => candidate.id === input.bookingId);

        if (!target || token?.tokenType !== "cancellation") {
            return null;
        }

        if (target.status === "completed" || target.status === "no_show") {
            return { ...target, mutable: false as const };
        }

        if (target.status !== "cancelled") {
            target.status = "cancelled";
        }

        return { ...target, mutable: true as const };
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
        const token = this.tokenHashes.get(input.tokenHash);
        const target = this.bookings.find((candidate) => candidate.id === input.bookingId);

        if (!target || token?.tokenType !== "reschedule" || target.status !== "confirmed") {
            return null;
        }

        target.barberId = input.barberId;
        target.locationId = input.locationId;
        target.startTime = input.startTime;
        target.endTime = input.endTime;
        target.totalDurationMinutes = input.totalDurationMinutes;
        return target;
    }

    async loadAvailabilityData(request: CreateBookingRequest) {
        this.lastAvailabilityRequest = request;
        return {
            ...this.availabilityData,
            bookings: (this.availabilityData.bookings ?? []).filter(
                (candidate: any) => candidate.id !== request.excludeBookingId,
            ),
        };
    }

    async loadServiceSnapshots() {
        return [serviceSnapshot];
    }

    async countConfirmedBookingsByBarber() {
        return {};
    }

    async hasConfirmedBookingOverlap(barberToCheck: string, startTime: Date, endTime: Date, excludeBookingId?: string) {
        return this.bookings.some(
            (candidate) =>
                candidate.id !== excludeBookingId &&
                candidate.barberId === barberToCheck &&
                candidate.status === "confirmed" &&
                startTime < candidate.endTime &&
                endTime > candidate.startTime,
        );
    }

    async hasBlockedTimeOverlap() {
        return false;
    }

    async createCustomer(): Promise<{ id: string }> {
        throw new Error("Customer creation is not used by customer management.");
    }

    async insertBooking(): Promise<any> {
        throw new Error("Booking insert is not used by customer management.");
    }

    async insertBookingServices() {
        throw new Error("Service insert is not used by customer management.");
    }
}

describe("Phase 8 customer booking management service", () => {
    test("returns a safe booking summary for either customer management token", async () => {
        const repository = new InMemoryCustomerManagementRepository();

        await expect(getCustomerManagedBooking(cancellationToken, repository)).resolves.toMatchObject({
            id: "booking-1",
            status: "confirmed",
            services: [serviceSnapshot],
            priceSummary: "$30",
            canCancel: true,
            canReschedule: true,
        });
        await expect(getCustomerManagedBooking(rescheduleToken, repository)).resolves.toMatchObject({
            id: "booking-1",
        });
        await expect(getCustomerManagedBooking("bad-token", repository)).rejects.toBeInstanceOf(
            CustomerBookingLinkError,
        );
    });

    test("cancels with only the cancellation token and treats reused cancellation safely", async () => {
        const repository = new InMemoryCustomerManagementRepository();
        const dispatched: Parameters<BookingLifecycleNotificationDispatcher>[0][] = [];

        await expect(
            cancelCustomerManagedBooking(rescheduleToken, repository, { now }),
        ).rejects.toMatchObject({ status: 404 });
        await expect(
            cancelCustomerManagedBooking(cancellationToken, repository, {
                now,
                notificationDispatcher: async (input) => {
                    dispatched.push(input);
                    return [];
                },
            }),
        ).resolves.toMatchObject({
            id: "booking-1",
            status: "cancelled",
        });
        await expect(cancelCustomerManagedBooking(cancellationToken, repository, { now })).resolves.toMatchObject({
            id: "booking-1",
            status: "cancelled",
        });
        expect(dispatched).toEqual([
            expect.objectContaining({
                eventType: "cancellation_confirmation",
                bookingId: "booking-1",
            }),
        ]);
    });

    test("reschedules with only the reschedule token while excluding the booking's own old slot", async () => {
        const repository = new InMemoryCustomerManagementRepository();

        await expect(
            rescheduleCustomerManagedBooking(
                cancellationToken,
                {
                    locationId,
                    barberId,
                    startTime: utc(10, 15).toISOString(),
                },
                repository,
                { now },
            ),
        ).rejects.toMatchObject({ status: 404 });
        repository.transactionCount = 0;

        await expect(
            getCustomerRescheduleAvailability(
                rescheduleToken,
                {
                    locationId,
                    barberId,
                    date: "2026-05-04",
                    now,
                },
                repository,
            ),
        ).resolves.toMatchObject({
            totalDurationMinutes: 30,
            barberSlots: expect.any(Array),
        });
        expect(repository.lastAvailabilityRequest?.excludeBookingId).toBe("booking-1");

        await expect(
            rescheduleCustomerManagedBooking(
                rescheduleToken,
                {
                    locationId,
                    barberId,
                    startTime: utc(10, 15).toISOString(),
                },
                repository,
                {
                    now,
                    notificationDispatcher: async (input) => {
                        repository.lastNotification = input;
                        return [];
                    },
                },
            ),
        ).resolves.toMatchObject({
            id: "booking-1",
            status: "confirmed",
            startTime: "2026-05-04T14:15:00.000Z",
            endTime: "2026-05-04T14:45:00.000Z",
            services: [serviceSnapshot],
        });
        expect(repository.transactionCount).toBe(1);
        expect(repository.lastNotification).toMatchObject({
            eventType: "reschedule_confirmation",
            bookingId: "booking-1",
            occurrenceKey: "2026-05-04T14:15:00.000Z",
        });
    });

    test("customer mutation still succeeds when notification delivery fails after mutation", async () => {
        const repository = new InMemoryCustomerManagementRepository();

        await expect(
            cancelCustomerManagedBooking(cancellationToken, repository, {
                now,
                notificationDispatcher: async () => {
                    throw new Error("Notification provider is down");
                },
            }),
        ).resolves.toMatchObject({ id: "booking-1", status: "cancelled" });
        expect(repository.bookings[0].status).toBe("cancelled");
    });

    test("reschedule rejects unavailable slots and confirmed booking overlaps", async () => {
        const repository = new InMemoryCustomerManagementRepository();
        repository.bookings.push(
            booking({
                id: "blocking-booking",
                startTime: utc(11),
                endTime: utc(11, 30),
            }),
        );
        repository.availabilityData = baseAvailability({
            bookings: [
                {
                    id: "booking-1",
                    barberId,
                    locationId,
                    status: "confirmed",
                    startTime: utc(10),
                    endTime: utc(10, 30),
                } as any,
                {
                    id: "blocking-booking",
                    barberId,
                    locationId,
                    status: "confirmed",
                    startTime: utc(11),
                    endTime: utc(11, 30),
                } as any,
            ],
        });

        await expect(
            rescheduleCustomerManagedBooking(
                rescheduleToken,
                {
                    locationId,
                    barberId,
                    startTime: utc(9).toISOString(),
                },
                repository,
                { now },
            ),
        ).rejects.toMatchObject({ status: 409 });
        await expect(
            rescheduleCustomerManagedBooking(
                rescheduleToken,
                {
                    locationId,
                    barberId,
                    startTime: utc(11, 15).toISOString(),
                },
                repository,
                { now },
            ),
        ).rejects.toMatchObject({ status: 409 });
    });
});
