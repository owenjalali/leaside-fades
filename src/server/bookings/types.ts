import type { AvailabilityData } from "../availability/index.ts";

export type BookingCreationErrorCode = "INVALID_REQUEST" | "UNAVAILABLE_SLOT";

export class BookingCreationError extends Error {
    readonly code: BookingCreationErrorCode;

    constructor(code: BookingCreationErrorCode, message: string) {
        super(message);
        this.name = "BookingCreationError";
        this.code = code;
    }
}

export interface CreateBookingCustomerInput {
    firstName: string;
    lastName: string;
    phoneE164: string | null;
    email: string | null;
    notes?: string | null;
}

export type BookingSource = "public" | "manual" | "walk_in" | "imported";

export interface BookingManagementTokens {
    cancellationToken: string;
    rescheduleToken: string;
}

export interface CreateBookingRequest {
    locationId: string;
    serviceIds: string[];
    startTime: Date;
    barberId?: string;
    source?: BookingSource;
    excludeBookingId?: string;
    customer: CreateBookingCustomerInput;
    customerNotes?: string | null;
    internalNotes?: string | null;
    generateCustomerManagementTokens?: boolean;
    minimumNoticeMinutes?: number;
    now?: Date;
    timeZone?: string;
}

export interface AvailabilityRepositoryRequest {
    locationId: string;
    serviceIds: string[];
    barberId?: string;
    now?: Date;
    timeZone?: string;
    excludeBookingId?: string;
    minimumNoticeMinutes?: number;
}

export interface BookingServiceSnapshot {
    serviceId: string | null;
    serviceName: string;
    categoryName: string;
    durationMinutes: number;
    priceCents: number;
    priceType: "fixed" | "from";
    displayPrice: string;
    sortOrder: number;
}

export interface CreatedCustomer {
    id: string;
}

export interface BookingInsertInput {
    customerId: string;
    barberId: string;
    locationId: string;
    status: "confirmed";
    source: BookingSource;
    startTime: Date;
    endTime: Date;
    totalDurationMinutes: number;
    customerNotes?: string | null;
    internalNotes?: string | null;
    cancellationTokenHash?: string | null;
    rescheduleTokenHash?: string | null;
}

export interface CreatedBooking extends BookingInsertInput {
    id: string;
}

export interface CreateBookingResult {
    booking: CreatedBooking;
    bookingServices: BookingServiceSnapshot[];
    customerManagementTokens?: BookingManagementTokens;
}

export interface BookingRepository {
    withTransaction<T>(callback: (transaction: BookingRepository) => Promise<T>): Promise<T>;
    loadAvailabilityData(
        request: CreateBookingRequest | AvailabilityRepositoryRequest,
        localDate: string,
    ): Promise<AvailabilityData>;
    loadServiceSnapshots(serviceIds: string[]): Promise<BookingServiceSnapshot[]>;
    countConfirmedBookingsByBarber(
        barberIds: string[],
        startOfDay: Date,
        endOfDay: Date,
    ): Promise<Record<string, number>>;
    hasConfirmedBookingOverlap(
        barberId: string,
        startTime: Date,
        endTime: Date,
        excludeBookingId?: string,
    ): Promise<boolean>;
    hasBlockedTimeOverlap(
        barberId: string,
        locationId: string,
        startTime: Date,
        endTime: Date,
    ): Promise<boolean>;
    createCustomer(customer: CreateBookingCustomerInput): Promise<CreatedCustomer>;
    insertBooking(booking: BookingInsertInput): Promise<CreatedBooking>;
    insertBookingServices(
        bookingId: string,
        snapshots: BookingServiceSnapshot[],
    ): Promise<void>;
}
