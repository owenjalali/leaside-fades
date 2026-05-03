export type AdminRole = "owner" | "admin" | "barber";
export type AdminBookingStatus = "confirmed" | "cancelled" | "completed" | "no_show";
export type AdminBookingSource = "public" | "manual" | "walk_in" | "imported";

export interface SafeAdminUser {
    id: string;
    email: string;
    displayName: string;
    role: AdminRole;
    barberId: string | null;
}

export interface AdminSessionResponse {
    user: SafeAdminUser;
}

export interface AdminBookingSummary {
    id: string;
    barberId: string;
    barberName: string;
    locationId: string;
    locationName: string;
    customerName: string;
    customerEmail: string | null;
    customerPhone: string | null;
    status: AdminBookingStatus;
    source: AdminBookingSource;
    startTime: string;
    endTime: string;
    totalDurationMinutes: number;
    services: string[];
}

export interface AdminBookingServiceDetail {
    serviceId: string | null;
    serviceName: string;
    categoryName: string;
    durationMinutes: number;
    priceCents: number;
    priceType: "fixed" | "from";
    displayPrice: string;
    sortOrder: number;
}

export interface AdminBookingDetail extends AdminBookingSummary {
    serviceIds: string[];
    serviceDetails: AdminBookingServiceDetail[];
    customerNotes: string | null;
    internalNotes: string | null;
}

export interface AdminLocationOption {
    id: string;
    name: string;
    sortOrder: number;
}

export interface AdminBarberOption {
    id: string;
    slug?: string;
    displayName: string;
    locationIds: string[];
    sortOrder: number;
}

export interface AdminServiceOption {
    id: string;
    name: string;
    durationMinutes: number;
    displayPrice: string;
    priceCents: number;
    priceType: "fixed" | "from";
    sortOrder: number;
}

export interface AdminCalendarOptions {
    locations: AdminLocationOption[];
    barbers: AdminBarberOption[];
    services: AdminServiceOption[];
}

export interface AdminBookingFilters {
    from?: string;
    to?: string;
    locationId?: string;
    barberId?: string;
    status?: AdminBookingStatus | "";
}

export interface AdminSlot {
    barberId: string;
    locationId: string;
    startTime: string;
    endTime: string;
    totalDurationMinutes: number;
}

export interface AdminBarberAvailability {
    barberId: string;
    locationId: string;
    slots: AdminSlot[];
}

export interface AdminAvailability {
    date: string;
    locationId: string;
    timeZone: string;
    totalDurationMinutes: number;
    barberSlots: AdminBarberAvailability[];
    emptyMessage?: string;
}

export interface AdminDay {
    date: string;
    label: string;
    inCurrentMonth: boolean;
    isToday: boolean;
}

export type AdminBlockedTimeScope = "barber" | "location" | "business";
export type AdminShiftOverrideType = "add" | "remove" | "not_working";

export interface AdminShift {
    id: string;
    barberId: string;
    locationId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    effectiveFrom: string | null;
    effectiveTo: string | null;
    active: boolean;
}

export interface AdminShiftOverride {
    id: string;
    barberId: string;
    locationId: string | null;
    overrideDate: string;
    overrideType: AdminShiftOverrideType;
    startTime: string | null;
    endTime: string | null;
    reason: string | null;
}

export interface AdminBlockedTime {
    id: string;
    scope: AdminBlockedTimeScope;
    barberId: string | null;
    locationId: string | null;
    startTime: string;
    endTime: string;
    reason: string | null;
    createdByUserId: string | null;
}

export interface AdminSchedule {
    locations: AdminLocationOption[];
    barbers: AdminBarberOption[];
    shifts: AdminShift[];
    shiftOverrides: AdminShiftOverride[];
    blockedTimes: AdminBlockedTime[];
}

export interface AdminScheduleFilters {
    from?: string;
    to?: string;
}

export type AdminNotificationChannel = "sms" | "email" | "calendar";
export type AdminNotificationDeliveryMode = "mock" | "dev" | "live";
export type AdminNotificationRecipientType = "customer" | "barber" | "admin" | "shop";
export type AdminNotificationEventType =
    | "booking_confirmation"
    | "cancellation_confirmation"
    | "reschedule_confirmation"
    | "reminder_24h"
    | "reminder_2h"
    | "no_show";
export type AdminNotificationStatus = "pending" | "sent" | "failed" | "skipped" | AdminBookingStatus;
export type AdminNotificationFailureCategory = "provider_config" | "provider_rejected" | "unknown";

export interface AdminDashboardActivity {
    id: string;
    bookingId: string;
    eventType: AdminNotificationEventType;
    status: AdminNotificationStatus;
    channel: AdminNotificationChannel;
    recipientType: AdminNotificationRecipientType;
    recipientLabel: string;
    customerName: string;
    barberId: string;
    barberName: string;
    locationName: string;
    appointmentStatus: AdminBookingStatus;
    appointmentSource: AdminBookingSource;
    appointmentStartTime: string;
    appointmentEndTime: string;
    services: string[];
    createdAt: string;
    updatedAt: string;
    sentAt: string | null;
    scheduledFor: string | null;
    errorMessage: string | null;
    provider: string | null;
    providerMessageId: string | null;
    attemptCount: number;
    lastAttemptAt: string | null;
    isActiveFailure: boolean;
    failureCategory: AdminNotificationFailureCategory | null;
    failureSummary: string | null;
}

export interface AdminUpcomingReminderPreview {
    id: string;
    bookingId: string;
    eventType: "reminder_24h" | "reminder_2h";
    channel: "sms" | "email";
    customerName: string;
    barberName: string;
    locationName: string;
    appointmentStartTime: string;
    scheduledFor: string;
    recipientLabel: string;
}

export interface AdminDashboardSnapshot {
    todayBookings: AdminBookingSummary[];
    upcomingBookings: AdminBookingSummary[];
    activity: AdminDashboardActivity[];
    notificationDeliveryMode: AdminNotificationDeliveryMode;
    upcomingReminders: AdminUpcomingReminderPreview[];
}

export interface BlockedTimeFormInput {
    scope: AdminBlockedTimeScope;
    barberId?: string;
    locationId?: string;
    startDate: string;
    startTime: string;
    endDate: string;
    endTime: string;
    allDay: boolean;
    reason?: string;
}
