export type NotificationChannel = "sms" | "email";
export type NotificationRecipientType = "customer" | "barber" | "admin";
export type BookingLifecycleNotificationEventType =
    | "booking_confirmation"
    | "cancellation_confirmation"
    | "reschedule_confirmation";
export type BookingReminderNotificationEventType = "reminder_24h" | "reminder_2h";
export type NotificationEventType =
    | BookingLifecycleNotificationEventType
    | BookingReminderNotificationEventType;
export type NotificationAttemptStatus = "pending" | "sent" | "failed" | "skipped";
export type NotificationDeliveryMode = "mock" | "dev" | "live";
export type NotificationProviderDeliveryState = "active" | "paused";
export type BookingNotificationStatus = "confirmed" | "cancelled" | "completed" | "no_show";

export interface BookingNotificationContext {
    bookingId: string;
    status: BookingNotificationStatus;
    source: "public" | "manual" | "walk_in" | "imported";
    customerName: string;
    customerPhone: string | null;
    customerEmail: string | null;
    barberName: string;
    barberPhone: string | null;
    barberEmail: string | null;
    ownerAdminEmails: string[];
    locationName: string;
    startTime: Date;
    endTime: Date;
    services: string[];
    priceSummary: string;
}

export interface NotificationManagementUrls {
    cancelUrl?: string;
    rescheduleUrl?: string;
}

export interface NotificationMessage {
    subject?: string;
    text: string;
    html?: string;
}

export interface SmsSendInput {
    idempotencyKey: string;
    to: string;
    body: string;
}

export interface EmailSendInput {
    idempotencyKey: string;
    to: string;
    subject: string;
    text: string;
    html?: string;
}

export interface NotificationSendResult {
    provider: string;
    providerMessageId: string;
}

export interface NotificationProviderStatus {
    provider: string;
    deliveryState: NotificationProviderDeliveryState;
    pauseReason?: "provider_paused";
}

export interface SmsNotificationProvider extends NotificationProviderStatus {
    send(input: SmsSendInput): Promise<NotificationSendResult>;
}

export interface EmailNotificationProvider extends NotificationProviderStatus {
    send(input: EmailSendInput): Promise<NotificationSendResult>;
}

export interface NotificationProviderSet {
    mode: NotificationDeliveryMode;
    sms: SmsNotificationProvider;
    email: EmailNotificationProvider;
}

export interface BookingNotificationAttempt {
    id: string;
    bookingId: string;
    recipientType: NotificationRecipientType;
    recipientPhone: string | null;
    recipientEmail: string | null;
    channel: NotificationChannel;
    eventType: NotificationEventType;
    status: NotificationAttemptStatus;
    provider: string | null;
    idempotencyKey: string;
    providerMessageId: string | null;
    errorMessage: string | null;
    metadata: Record<string, unknown>;
    attemptCount: number;
    scheduledFor: Date | null;
    sentAt: Date | null;
    lastAttemptAt: Date | null;
    createdAt: Date;
    updatedAt: Date;
}

export interface BookingLifecycleDispatchInput {
    eventType: BookingLifecycleNotificationEventType;
    bookingId: string;
    managementUrls?: NotificationManagementUrls;
    occurrenceKey?: string;
}

export interface BookingReminderDispatchInput {
    eventType: BookingReminderNotificationEventType;
    bookingId: string;
    scheduledFor: Date;
    expectedStartTime: Date;
}

export interface BookingLifecycleDispatchResult {
    idempotencyKey: string;
    channel: NotificationChannel;
    recipientType: NotificationRecipientType;
    status: NotificationAttemptStatus | "duplicate" | "deferred";
    notificationId?: string;
    provider?: string;
    skipReason?: string;
    errorMessage?: string;
}

export type BookingLifecycleNotificationDispatcher = (
    input: BookingLifecycleDispatchInput,
) => Promise<BookingLifecycleDispatchResult[]>;
