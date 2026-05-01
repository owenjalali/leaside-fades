export type BookingStatus = "confirmed" | "cancelled" | "completed" | "no_show";

export type BlockedTimeScope = "barber" | "location" | "business";

export type ShiftOverrideType = "add" | "remove" | "not_working";

export interface AvailabilityRequest {
    locationId: string;
    serviceIds: string[];
    date: string;
    barberId?: string;
    now?: Date;
    timeZone?: string;
    slotIntervalMinutes?: number;
    minimumNoticeMinutes?: number;
    maxAdvanceDays?: number;
}

export interface AvailabilityData {
    businessHours: BusinessHoursRecord[];
    barbers: BarberRecord[];
    barberLocations: BarberLocationRecord[];
    services: ServiceRecord[];
    shifts: ShiftRecord[];
    shiftOverrides?: ShiftOverrideRecord[];
    bookings?: BookingRecord[];
    blockedTimes?: BlockedTimeRecord[];
}

export interface BusinessHoursRecord {
    locationId: string;
    dayOfWeek: number;
    openTime: string;
    closeTime: string;
    closed?: boolean;
}

export interface BarberRecord {
    id: string;
    active?: boolean;
    sortOrder?: number;
}

export interface BarberLocationRecord {
    barberId: string;
    locationId: string;
}

export interface ServiceRecord {
    id: string;
    durationMinutes: number;
    active?: boolean;
}

export interface ShiftRecord {
    barberId: string;
    locationId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    active?: boolean;
    effectiveFrom?: string | null;
    effectiveTo?: string | null;
}

export interface ShiftOverrideRecord {
    barberId: string;
    overrideDate: string;
    overrideType: ShiftOverrideType;
    locationId?: string | null;
    startTime?: string | null;
    endTime?: string | null;
}

export interface BookingRecord {
    barberId: string;
    locationId: string;
    status: BookingStatus;
    startTime: Date;
    endTime: Date;
}

export interface BlockedTimeRecord {
    scope: BlockedTimeScope;
    startTime: Date;
    endTime: Date;
    barberId?: string | null;
    locationId?: string | null;
}

export interface AvailableSlot {
    barberId: string;
    locationId: string;
    startTime: Date;
    endTime: Date;
    totalDurationMinutes: number;
}

export interface BarberAvailability {
    barberId: string;
    locationId: string;
    slots: AvailableSlot[];
}

export interface AvailabilityResult {
    date: string;
    locationId: string;
    timeZone: string;
    totalDurationMinutes: number;
    barberSlots: BarberAvailability[];
}
