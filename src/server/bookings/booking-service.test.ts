import { beforeEach, describe, expect, test } from "vitest";

import { createBooking } from "./booking-service";
import { BookingCreationError } from "./types";
import type {
    BookingRepository,
    BookingServiceSnapshot,
    CreateBookingRequest,
    CreatedBooking,
} from "./types";
import type { AvailabilityData } from "../availability";

const locationId = "location-eglinton";
const barberAId = "barber-a";
const barberBId = "barber-b";
const barberCId = "barber-c";
const haircutId = "service-haircut";
const beardId = "service-beard";
const defaultNow = new Date("2026-05-01T13:00:00.000Z");

function utc(localHour: number, localMinute = 0, localDate = "2026-05-04") {
    const [year, month, day] = localDate.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day, localHour + 4, localMinute));
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
        barbers: [
            { id: barberAId, active: true, sortOrder: 1 },
            { id: barberBId, active: true, sortOrder: 2 },
            { id: barberCId, active: true, sortOrder: 2 },
        ],
        barberLocations: [
            { barberId: barberAId, locationId },
            { barberId: barberBId, locationId },
            { barberId: barberCId, locationId },
        ],
        services: [
            { id: haircutId, durationMinutes: 30, active: true },
            { id: beardId, durationMinutes: 15, active: true },
        ],
        shifts: [
            {
                barberId: barberAId,
                locationId,
                dayOfWeek: 1,
                startTime: "10:00",
                endTime: "19:00",
                active: true,
            },
            {
                barberId: barberBId,
                locationId,
                dayOfWeek: 1,
                startTime: "10:00",
                endTime: "19:00",
                active: true,
            },
            {
                barberId: barberCId,
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

const serviceSnapshots: BookingServiceSnapshot[] = [
    {
        serviceId: haircutId,
        serviceName: "Men's Cut",
        categoryName: "Hair & Styling (Men)",
        durationMinutes: 30,
        priceCents: 3000,
        priceType: "fixed",
        displayPrice: "$30",
        sortOrder: 20,
    },
    {
        serviceId: beardId,
        serviceName: "Beard Trim",
        categoryName: "Hair & Styling (Men)",
        durationMinutes: 15,
        priceCents: 1500,
        priceType: "fixed",
        displayPrice: "$15",
        sortOrder: 80,
    },
];

function request(overrides: Partial<CreateBookingRequest> = {}): CreateBookingRequest {
    return {
        locationId,
        serviceIds: [haircutId],
        startTime: utc(10),
        barberId: barberAId,
        now: defaultNow,
        customer: {
            firstName: "Owen",
            lastName: "Jones",
            phoneE164: "+14165551212",
            email: "owen@example.com",
        },
        customerNotes: "Skin fade, please.",
        ...overrides,
    };
}

function expectBookingError(error: unknown, code: BookingCreationError["code"]) {
    expect(error).toBeInstanceOf(BookingCreationError);
    expect((error as BookingCreationError).code).toBe(code);
}

class InMemoryBookingRepository implements BookingRepository {
    availabilityData: AvailabilityData;
    serviceSnapshots: BookingServiceSnapshot[];
    bookings: CreatedBooking[] = [];
    bookingServices: BookingServiceSnapshot[] = [];
    customers: CreateBookingRequest["customer"][] = [];
    failOnServiceInsert = false;
    transactionCount = 0;

    constructor({
        availabilityData = baseAvailability(),
        snapshots = serviceSnapshots,
    }: {
        availabilityData?: AvailabilityData;
        snapshots?: BookingServiceSnapshot[];
    } = {}) {
        this.availabilityData = availabilityData;
        this.serviceSnapshots = snapshots;
    }

    async withTransaction<T>(callback: (transaction: BookingRepository) => Promise<T>): Promise<T> {
        this.transactionCount += 1;
        const bookingSnapshot = [...this.bookings];
        const serviceSnapshot = [...this.bookingServices];
        const customerSnapshot = [...this.customers];

        try {
            return await callback(this);
        } catch (error) {
            this.bookings = bookingSnapshot;
            this.bookingServices = serviceSnapshot;
            this.customers = customerSnapshot;
            throw error;
        }
    }

    async loadAvailabilityData() {
        return this.availabilityData;
    }

    async loadServiceSnapshots(serviceIds: string[]) {
        return serviceIds.map((serviceId) => {
            const snapshot = this.serviceSnapshots.find(
                (candidate) => candidate.serviceId === serviceId,
            );

            if (!snapshot) {
                throw new BookingCreationError(
                    "INVALID_REQUEST",
                    `Service "${serviceId}" is not available.`,
                );
            }

            return snapshot;
        });
    }

    async countConfirmedBookingsByBarber(barberIds: string[], startOfDay: Date, endOfDay: Date) {
        return Object.fromEntries(
            barberIds.map((barberId) => [
                barberId,
                (this.availabilityData.bookings ?? []).filter(
                    (booking) =>
                        booking.barberId === barberId &&
                        booking.status === "confirmed" &&
                        booking.startTime >= startOfDay &&
                        booking.startTime < endOfDay,
                ).length,
            ]),
        );
    }

    async hasConfirmedBookingOverlap(barberId: string, startTime: Date, endTime: Date) {
        return (this.availabilityData.bookings ?? []).some(
            (booking) =>
                booking.barberId === barberId &&
                booking.status === "confirmed" &&
                startTime < booking.endTime &&
                endTime > booking.startTime,
        );
    }

    async hasBlockedTimeOverlap(barberId: string, selectedLocationId: string, startTime: Date, endTime: Date) {
        return (this.availabilityData.blockedTimes ?? []).some((blockedTime) => {
            const overlaps = startTime < blockedTime.endTime && endTime > blockedTime.startTime;

            if (!overlaps) {
                return false;
            }

            if (blockedTime.scope === "business") {
                return true;
            }

            if (blockedTime.scope === "location") {
                return blockedTime.locationId === selectedLocationId;
            }

            return (
                blockedTime.barberId === barberId &&
                (!blockedTime.locationId || blockedTime.locationId === selectedLocationId)
            );
        });
    }

    async createCustomer(customer: CreateBookingRequest["customer"]) {
        this.customers.push(customer);
        return { id: `customer-${this.customers.length}` };
    }

    async insertBooking(booking: Parameters<BookingRepository["insertBooking"]>[0]) {
        const createdBooking = {
            id: `booking-${this.bookings.length + 1}`,
            ...booking,
        };
        this.bookings.push(createdBooking);
        this.availabilityData = {
            ...this.availabilityData,
            bookings: [
                ...(this.availabilityData.bookings ?? []),
                {
                    barberId: createdBooking.barberId,
                    locationId: createdBooking.locationId,
                    status: createdBooking.status,
                    startTime: createdBooking.startTime,
                    endTime: createdBooking.endTime,
                },
            ],
        };
        return createdBooking;
    }

    async insertBookingServices(bookingId: string, snapshots: BookingServiceSnapshot[]) {
        if (this.failOnServiceInsert) {
            throw new Error("snapshot insert failed");
        }

        this.bookingServices.push(
            ...snapshots.map((snapshot) => ({
                ...snapshot,
                bookingId,
            })),
        );
    }
}

describe("Phase 3 booking creation service", () => {
    let repository: InMemoryBookingRepository;

    beforeEach(() => {
        repository = new InMemoryBookingRepository();
    });

    test("creates a confirmed booking for a specific available barber with service snapshots", async () => {
        const result = await createBooking(request(), repository);

        expect(repository.transactionCount).toBe(1);
        expect(result.booking).toMatchObject({
            id: "booking-1",
            customerId: "customer-1",
            barberId: barberAId,
            locationId,
            status: "confirmed",
            source: "public",
            totalDurationMinutes: 30,
            customerNotes: "Skin fade, please.",
        });
        expect(result.booking.startTime.toISOString()).toBe("2026-05-04T14:00:00.000Z");
        expect(result.booking.endTime.toISOString()).toBe("2026-05-04T14:30:00.000Z");
        expect(result.bookingServices).toEqual([serviceSnapshots[0]]);
        expect(repository.bookingServices).toEqual([
            { ...serviceSnapshots[0], bookingId: "booking-1" },
        ]);
    });

    test("generates customer management token hashes for public bookings by default", async () => {
        const result = await createBooking(request(), repository);

        expect(result.customerManagementTokens?.cancellationToken).toMatch(/^[A-Za-z0-9_-]{40,}$/);
        expect(result.customerManagementTokens?.rescheduleToken).toMatch(/^[A-Za-z0-9_-]{40,}$/);
        expect(repository.bookings[0].cancellationTokenHash).toBeTruthy();
        expect(repository.bookings[0].rescheduleTokenHash).toBeTruthy();
        expect(repository.bookings[0].cancellationTokenHash).not.toBe(
            result.customerManagementTokens?.cancellationToken,
        );
        expect(repository.bookings[0].rescheduleTokenHash).not.toBe(
            result.customerManagementTokens?.rescheduleToken,
        );
    });

    test("does not generate customer management tokens for walk-in bookings", async () => {
        const result = await createBooking(request({ source: "walk_in" }), repository);

        expect(result.customerManagementTokens).toBeUndefined();
        expect(repository.bookings[0].cancellationTokenHash).toBeNull();
        expect(repository.bookings[0].rescheduleTokenHash).toBeNull();
    });

    test("stacks selected services and writes immutable service snapshots in request order", async () => {
        const result = await createBooking(request({ serviceIds: [beardId, haircutId] }), repository);

        expect(result.booking.totalDurationMinutes).toBe(45);
        expect(result.booking.endTime.toISOString()).toBe("2026-05-04T14:45:00.000Z");
        expect(result.bookingServices).toEqual([serviceSnapshots[1], serviceSnapshots[0]]);
    });

    test("rejects a requested start time that is not in recalculated availability", async () => {
        await expect(createBooking(request({ startTime: utc(9) }), repository)).rejects.toSatisfy(
            (error) => {
                expectBookingError(error, "UNAVAILABLE_SLOT");
                expect((error as Error).message).toMatch(/not available/i);
                return true;
            },
        );
    });

    test("rejects inactive or missing services with a clear invalid request error", async () => {
        repository.availabilityData = baseAvailability({
            services: [{ id: haircutId, durationMinutes: 30, active: false }],
        });

        await expect(createBooking(request(), repository)).rejects.toSatisfy((error) => {
            expectBookingError(error, "INVALID_REQUEST");
            expect((error as Error).message).toMatch(/service/i);
            return true;
        });
    });

    test("rejects inactive, unassigned, or missing selected barbers as unavailable", async () => {
        await expect(
            createBooking(request({ barberId: "barber-not-assigned" }), repository),
        ).rejects.toSatisfy((error) => {
            expectBookingError(error, "UNAVAILABLE_SLOT");
            return true;
        });
    });

    test("rejects slots outside business hours, inside minimum notice, and beyond max window", async () => {
        await expect(createBooking(request({ startTime: utc(19) }), repository)).rejects.toSatisfy(
            (error) => {
                expectBookingError(error, "UNAVAILABLE_SLOT");
                return true;
            },
        );

        await expect(
            createBooking(
                request({
                    startTime: utc(10, 15, "2026-05-01"),
                    now: new Date("2026-05-01T14:00:00.000Z"),
                }),
                repository,
            ),
        ).rejects.toSatisfy((error) => {
            expectBookingError(error, "UNAVAILABLE_SLOT");
            return true;
        });

        await expect(
            createBooking(
                request({
                    startTime: utc(10, 0, "2026-06-01"),
                    now: new Date("2026-05-01T13:00:00.000Z"),
                }),
                repository,
            ),
        ).rejects.toSatisfy((error) => {
            expectBookingError(error, "INVALID_REQUEST");
            expect((error as Error).message).toMatch(/30 days/);
            return true;
        });
    });

    test("rejects overlapping confirmed bookings but allows adjacent bookings and ignores cancelled bookings", async () => {
        repository.availabilityData = baseAvailability({
            bookings: [
                {
                    barberId: barberAId,
                    locationId,
                    status: "confirmed",
                    startTime: utc(11),
                    endTime: utc(11, 30),
                },
                {
                    barberId: barberAId,
                    locationId,
                    status: "cancelled",
                    startTime: utc(12),
                    endTime: utc(12, 30),
                },
            ],
        });

        await expect(createBooking(request({ startTime: utc(11, 15) }), repository)).rejects.toSatisfy(
            (error) => {
                expectBookingError(error, "UNAVAILABLE_SLOT");
                return true;
            },
        );

        await expect(createBooking(request({ startTime: utc(11, 30) }), repository)).resolves.toBeTruthy();
        await expect(createBooking(request({ startTime: utc(12) }), repository)).resolves.toBeTruthy();
    });

    test("rejects barber, location, and business blocked times", async () => {
        for (const blockedTime of [
            { scope: "barber" as const, barberId: barberAId, startTime: utc(10), endTime: utc(10, 30) },
            { scope: "location" as const, locationId, startTime: utc(10), endTime: utc(10, 30) },
            { scope: "business" as const, startTime: utc(10), endTime: utc(10, 30) },
        ]) {
            const blockedRepository = new InMemoryBookingRepository({
                availabilityData: baseAvailability({ blockedTimes: [blockedTime] }),
            });

            await expect(createBooking(request(), blockedRepository)).rejects.toSatisfy((error) => {
                expectBookingError(error, "UNAVAILABLE_SLOT");
                return true;
            });
        }
    });

    test("assigns any available barber by sort order before same-day booking count", async () => {
        repository.availabilityData = baseAvailability({
            bookings: [
                {
                    barberId: barberAId,
                    locationId,
                    status: "confirmed",
                    startTime: utc(15),
                    endTime: utc(15, 30),
                },
            ],
        });

        const result = await createBooking(request({ barberId: undefined }), repository);

        expect(result.booking.barberId).toBe(barberAId);
    });

    test("uses fewest confirmed bookings as the next any available tie-breaker", async () => {
        repository.availabilityData = baseAvailability({
            barbers: [
                { id: barberBId, active: true, sortOrder: 2 },
                { id: barberCId, active: true, sortOrder: 2 },
            ],
            barberLocations: [
                { barberId: barberBId, locationId },
                { barberId: barberCId, locationId },
            ],
            shifts: [
                {
                    barberId: barberBId,
                    locationId,
                    dayOfWeek: 1,
                    startTime: "10:00",
                    endTime: "19:00",
                    active: true,
                },
                {
                    barberId: barberCId,
                    locationId,
                    dayOfWeek: 1,
                    startTime: "10:00",
                    endTime: "19:00",
                    active: true,
                },
            ],
            bookings: [
                {
                    barberId: barberBId,
                    locationId,
                    status: "confirmed",
                    startTime: utc(15),
                    endTime: utc(15, 30),
                },
            ],
        });

        const result = await createBooking(request({ barberId: undefined }), repository);

        expect(result.booking.barberId).toBe(barberCId);
    });

    test("uses stable barber id as the final any available tie-breaker", async () => {
        repository.availabilityData = baseAvailability({
            barbers: [
                { id: "barber-z", active: true, sortOrder: 2 },
                { id: "barber-a", active: true, sortOrder: 2 },
            ],
            barberLocations: [
                { barberId: "barber-z", locationId },
                { barberId: "barber-a", locationId },
            ],
            shifts: [
                {
                    barberId: "barber-z",
                    locationId,
                    dayOfWeek: 1,
                    startTime: "10:00",
                    endTime: "19:00",
                    active: true,
                },
                {
                    barberId: "barber-a",
                    locationId,
                    dayOfWeek: 1,
                    startTime: "10:00",
                    endTime: "19:00",
                    active: true,
                },
            ],
        });

        const result = await createBooking(request({ barberId: undefined }), repository);

        expect(result.booking.barberId).toBe("barber-a");
    });

    test("rolls back booking and snapshots if snapshot insert fails", async () => {
        repository.failOnServiceInsert = true;

        await expect(createBooking(request(), repository)).rejects.toThrow(/snapshot insert failed/);
        expect(repository.bookings).toHaveLength(0);
        expect(repository.bookingServices).toHaveLength(0);
        expect(repository.customers).toHaveLength(0);
    });

    test("converts race-condition conflicts into unavailable slot errors", async () => {
        const racingRepository = new InMemoryBookingRepository();
        racingRepository.insertBooking = async () => {
            const error = new Error("conflicting key value violates exclusion constraint");
            Object.assign(error, { code: "23P01" });
            throw error;
        };

        await expect(createBooking(request(), racingRepository)).rejects.toSatisfy((error) => {
            expectBookingError(error, "UNAVAILABLE_SLOT");
            return true;
        });
    });
});
