export type BookingStep = "location" | "services" | "barber" | "time" | "details" | "confirm";

export interface BookingLocation {
    id: string;
    slug: string;
    name: string;
    addressLine1: string;
    city: string;
    province: string;
    postalCode: string;
    phoneDisplay: string;
    timezone: string;
}

export interface BookingService {
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

export interface BookingServiceCategory {
    id: string;
    slug: string;
    name: string;
    sortOrder: number;
    services: BookingService[];
}

export interface BookingBarber {
    id: string;
    slug: string;
    displayName: string;
    sortOrder: number;
    locationIds: string[];
}

export interface BookingCatalog {
    locations: BookingLocation[];
    serviceCategories: BookingServiceCategory[];
    barbers: BookingBarber[];
}

export interface BookingSlot {
    barberId: string;
    locationId: string;
    startTime: string;
    endTime: string;
    totalDurationMinutes: number;
}

export interface BarberAvailability {
    barberId: string;
    locationId: string;
    slots: BookingSlot[];
}

export interface BookingAvailability {
    date: string;
    locationId: string;
    timeZone: string;
    totalDurationMinutes: number;
    barberSlots: BarberAvailability[];
    emptyMessage?: string;
}

export interface CustomerDetails {
    firstName: string;
    lastName: string;
    phoneCountryCode: string;
    phone: string;
    email: string;
    notes: string;
}

export interface BookingConfirmationService {
    serviceId: string | null;
    serviceName: string;
    categoryName: string;
    durationMinutes: number;
    priceCents: number;
    priceType: "fixed" | "from";
    displayPrice: string;
    sortOrder: number;
}

export interface BookingConfirmation {
    id: string;
    locationId: string;
    barberId: string;
    startTime: string;
    endTime: string;
    totalDurationMinutes: number;
    services: BookingConfirmationService[];
    priceSummary: string;
    paymentLabel: string;
    cancelUrl?: string;
    rescheduleUrl?: string;
    customer: {
        firstName: string;
        lastName: string;
        phoneE164: string;
        email: string;
        notes?: string | null;
    };
}
