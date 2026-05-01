import type {
    BookingAvailability,
    BookingConfirmationService,
} from "./types";

export type CustomerManagedBookingStatus = "confirmed" | "cancelled" | "completed" | "no_show";
export type CustomerManagedBookingSource = "public" | "manual" | "walk_in" | "imported";

export interface CustomerManagedBooking {
    id: string;
    locationId: string;
    locationName: string;
    barberId: string;
    barberName: string;
    customerName: string;
    customerEmail: string | null;
    customerPhone: string | null;
    status: CustomerManagedBookingStatus;
    source: CustomerManagedBookingSource;
    startTime: string;
    endTime: string;
    totalDurationMinutes: number;
    services: BookingConfirmationService[];
    priceSummary: string;
    paymentLabel: "Pay in shop.";
    canCancel: boolean;
    canReschedule: boolean;
}

export type CustomerRescheduleAvailability = BookingAvailability;
