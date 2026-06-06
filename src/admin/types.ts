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

export interface AdminBookingEditPayload {
    locationId: string;
    barberId: string;
    startTime: string;
    serviceIds: string[];
    customer: {
        name: string;
        phone: string;
        email: string;
        notes: string;
    };
    internalNotes: string;
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
    profileImageUrl?: string | null;
    profileImagePathname?: string | null;
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

export interface AdminTeamWeeklyShift {
    id?: string;
    barberId?: string;
    locationId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    effectiveFrom: string | null;
    effectiveTo: string | null;
    active?: boolean;
}

export interface AdminTeamUser extends SafeAdminUser {
    active: boolean;
}

export interface AdminTeamBarber {
    id: string;
    slug: string;
    displayName: string;
    email: string | null;
    phoneE164: string | null;
    profileImageUrl: string | null;
    profileImagePathname: string | null;
    active: boolean;
    locationIds: string[];
    user: AdminTeamUser | null;
    weeklyShifts: AdminTeamWeeklyShift[];
    futureConfirmedBookingCount: number;
}

export interface AdminTeamBarberCreatePayload {
    displayName: string;
    email: string;
    phoneE164: string;
    profileImageUrl: string;
    profileImagePathname: string;
    locationIds: string[];
    weeklyShifts: AdminTeamWeeklyShift[];
}

export interface AdminTeamProfileImageUpload {
    url: string;
    pathname: string;
}

export interface AdminDayShiftReplacePayload {
    barberId: string;
    locationId: string;
    date: string;
    windows: Array<{ startTime: string; endTime: string }>;
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

export interface AdminDashboardValueSeriesPoint {
    date: string;
    totalCents: number;
    appointmentCount: number;
    pricedAppointmentCount: number;
    unpricedAppointmentCount: number;
}

export interface AdminDashboardAppointmentValue {
    totalCents: number;
    appointmentCount: number;
    pricedAppointmentCount: number;
    unpricedAppointmentCount: number;
    fromPriceAppointmentCount: number;
    averageValueCents: number;
    dailySeries: AdminDashboardValueSeriesPoint[];
}

export interface AdminDashboardUpcomingSeriesPoint {
    date: string;
    confirmedCount: number;
    cancelledCount: number;
}

export interface AdminDashboardUpcomingAppointments {
    confirmedCount: number;
    cancelledCount: number;
    dailySeries: AdminDashboardUpcomingSeriesPoint[];
}

export interface AdminDashboardNotificationHealth {
    sentCount: number;
    scheduledCount: number;
    skippedCount: number;
    failedActiveCount: number;
    failedHistoricalCount: number;
    deliverySuccessRate: number;
    reminderQueueCount: number;
    reminderScheduler: AdminReminderSchedulerStatus;
}

export type AdminReminderSchedulerState = "healthy" | "stale" | "failing" | "unknown";

export interface AdminReminderSchedulerStatus {
    state: AdminReminderSchedulerState;
    latestRunAt: string | null;
    latestStatus: "success" | "failure" | null;
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    minutesSinceLastSuccess: number | null;
    staleAfterMinutes: number;
    trigger: string | null;
    durationMs: number | null;
    errorMessage: string | null;
    latestResult: Record<string, unknown> | null;
    message: string;
}

export interface AdminDashboardSnapshot {
    generatedAt: string;
    todayBookings: AdminBookingSummary[];
    upcomingBookings: AdminBookingSummary[];
    activity: AdminDashboardActivity[];
    notificationDeliveryMode: AdminNotificationDeliveryMode;
    upcomingReminders: AdminUpcomingReminderPreview[];
    appointmentValue: AdminDashboardAppointmentValue;
    upcomingAppointments: AdminDashboardUpcomingAppointments;
    notificationHealth: AdminDashboardNotificationHealth;
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
