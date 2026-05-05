import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import type { AvailabilityData } from "../availability/index.ts";
import type {
    BookingRepository,
    BookingServiceSnapshot,
    CreateBookingRequest,
    CreatedBooking,
} from "../bookings/index.ts";
import {
    createPublicBooking,
    getPublicAvailability,
    PublicBookingRequestError,
} from "./service.ts";
import type { BookingLifecycleNotificationDispatcher } from "../notifications/index.ts";

const locationId = "11111111-1111-1111-1111-111111111111";
const barberId = "22222222-2222-2222-2222-222222222222";
const serviceId = "33333333-3333-3333-3333-333333333333";
const now = new Date(Date.UTC(2026, 4, 3, 14));

beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(now);
});

afterEach(() => {
    vi.useRealTimers();
});

function utc(hour: number, minute = 0) {
    return new Date(Date.UTC(2026, 4, 4, hour, minute));
}

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
        barbers: [{ id: barberId, active: true, sortOrder: 10 }],
        barberLocations: [{ barberId, locationId }],
        services: [{ id: serviceId, durationMinutes: 30, active: true }],
        shifts: [
            {
                barberId,
                locationId,
                dayOfWeek: 1,
                startTime: "10:00",
                endTime: "12:00",
                active: true,
            },
        ],
        bookings: [],
        blockedTimes: [],
        ...overrides,
    };
}

const snapshot: BookingServiceSnapshot = {
    serviceId,
    serviceName: "Men's Cut",
    categoryName: "Hair & Styling (Men)",
    durationMinutes: 30,
    priceCents: 3000,
    priceType: "fixed",
    displayPrice: "$30",
    sortOrder: 10,
};

class InMemoryBookingRepository implements BookingRepository {
    bookings: CreatedBooking[] = [];

    constructor(private availabilityData = baseAvailability()) {}

    async withTransaction<T>(callback: (transaction: BookingRepository) => Promise<T>): Promise<T> {
        return callback(this);
    }

    async loadAvailabilityData() {
        return this.availabilityData;
    }

    async loadServiceSnapshots() {
        return [snapshot];
    }

    async countConfirmedBookingsByBarber() {
        return { [barberId]: 0 };
    }

    async hasConfirmedBookingOverlap() {
        return false;
    }

    async hasBlockedTimeOverlap() {
        return false;
    }

    async createCustomer() {
        return { id: "44444444-4444-4444-4444-444444444444" };
    }

    async insertBooking(booking: Parameters<BookingRepository["insertBooking"]>[0]) {
        const created = {
            id: "55555555-5555-5555-5555-555555555555",
            ...booking,
        };
        this.bookings.push(created);
        return created;
    }

    async insertBookingServices() {}
}

describe("Phase 4 public booking service", () => {
    test("returns real availability generated from repository data", async () => {
        const result = await getPublicAvailability(
            {
                locationId,
                serviceIds: [serviceId],
                date: "2026-05-04",
                now: new Date(Date.UTC(2026, 4, 3, 14)),
            },
            new InMemoryBookingRepository(),
        );

        expect(result.totalDurationMinutes).toBe(30);
        expect(result.barberSlots).toHaveLength(1);
        expect(result.barberSlots[0].barberId).toBe(barberId);
        expect(result.barberSlots[0].slots[0]).toMatchObject({
            barberId,
            locationId,
            startTime: "2026-05-04T14:00:00.000Z",
            endTime: "2026-05-04T14:30:00.000Z",
        });
    });

    test("returns an empty availability result when real shifts do not exist", async () => {
        const result = await getPublicAvailability(
            {
                locationId,
                serviceIds: [serviceId],
                date: "2026-05-04",
                now: new Date(Date.UTC(2026, 4, 3, 14)),
            },
            new InMemoryBookingRepository(baseAvailability({ shifts: [] })),
        );

        expect(result.barberSlots).toEqual([]);
        expect(result.emptyMessage).toBe("No available times for this date. Try another date or barber.");
    });

    test("creates a booking through the existing booking service and returns safe confirmation details", async () => {
        const repository = new InMemoryBookingRepository();
        const dispatched: Parameters<BookingLifecycleNotificationDispatcher>[0][] = [];

        const result = await createPublicBooking(
            {
                locationId,
                serviceIds: [serviceId],
                startTime: utc(14).toISOString(),
                customer: {
                    firstName: "Ada",
                    lastName: "Lovelace",
                    phone: "647-555-0199",
                    email: "ADA@EXAMPLE.COM",
                    notes: "Low fade, please",
                },
            },
            repository,
            {
                notificationDispatcher: async (input) => {
                    dispatched.push(input);
                    return [];
                },
            },
        );

        expect(repository.bookings).toHaveLength(1);
        expect(result).toMatchObject({
            id: "55555555-5555-5555-5555-555555555555",
            locationId,
            barberId,
            startTime: "2026-05-04T14:00:00.000Z",
            endTime: "2026-05-04T14:30:00.000Z",
            totalDurationMinutes: 30,
            paymentLabel: "Pay in shop.",
            priceSummary: "$30",
        });
        expect(result.customer.email).toBe("ada@example.com");
        expect(result.customer.phoneE164).toBe("+16475550199");
        expect(result.services).toEqual([snapshot]);
        expect(result.cancelUrl).toMatch(/^\/booking\/[A-Za-z0-9_-]{40,}\/cancel$/);
        expect(result.rescheduleUrl).toMatch(/^\/booking\/[A-Za-z0-9_-]{40,}\/reschedule$/);
        expect(repository.bookings[0].cancellationTokenHash).toBeTruthy();
        expect(repository.bookings[0].rescheduleTokenHash).toBeTruthy();
        expect(result.cancelUrl).not.toContain(repository.bookings[0].cancellationTokenHash ?? "");
        expect(result.rescheduleUrl).not.toContain(repository.bookings[0].rescheduleTokenHash ?? "");
        expect(dispatched).toEqual([
            expect.objectContaining({
                eventType: "booking_confirmation",
                bookingId: result.id,
                managementUrls: {
                    cancelUrl: result.cancelUrl,
                    rescheduleUrl: result.rescheduleUrl,
                },
            }),
        ]);
    });

    test("booking still succeeds when notification delivery fails after mutation", async () => {
        const repository = new InMemoryBookingRepository();

        await expect(
            createPublicBooking(
                {
                    locationId,
                    serviceIds: [serviceId],
                    startTime: utc(14).toISOString(),
                    customer: {
                        firstName: "Ada",
                        lastName: "Lovelace",
                        phone: "647-555-0199",
                        email: "ada@example.com",
                    },
                },
                repository,
                {
                    notificationDispatcher: async () => {
                        throw new Error("Notification provider is down");
                    },
                },
            ),
        ).resolves.toMatchObject({ id: "55555555-5555-5555-5555-555555555555" });
        expect(repository.bookings).toHaveLength(1);
    });

    test("rejects missing customer details before calling the booking service", async () => {
        await expect(
            createPublicBooking(
                {
                    locationId,
                    serviceIds: [serviceId],
                    startTime: utc(14).toISOString(),
                    customer: {
                        firstName: "",
                        lastName: "Lovelace",
                        phone: "647-555-0199",
                        email: "ada@example.com",
                    },
                },
                new InMemoryBookingRepository(),
                {
                    notificationDispatcher: async () => {
                        throw new Error("Notifications should not be attempted.");
                    },
                },
            ),
        ).rejects.toMatchObject({
            name: "PublicBookingRequestError",
            status: 400,
            message: "Customer first and last name are required.",
        } satisfies Partial<PublicBookingRequestError>);
    });
});
