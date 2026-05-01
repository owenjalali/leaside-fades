export type {
    BookingLifecycleDispatchInput,
    BookingLifecycleDispatchResult,
    BookingLifecycleNotificationDispatcher,
    BookingNotificationAttempt,
    BookingNotificationContext,
    BookingReminderDispatchInput,
    BookingReminderNotificationEventType,
    NotificationAttemptStatus,
    NotificationChannel,
    NotificationDeliveryMode,
    NotificationEventType,
    NotificationManagementUrls,
    NotificationProviderSet,
    NotificationRecipientType,
} from "./types.ts";

export {
    dispatchBookingLifecycleNotification,
    dispatchBookingReminderNotification,
    type BookingLifecycleNotificationRepository,
} from "./dispatcher.ts";
export {
    NotificationRuntimeConfigurationError,
    assertNotificationRuntimeConfig,
    resolveNotificationDeliveryMode,
    validateNotificationRuntimeConfig,
} from "./config.ts";
export {
    NotificationProviderConfigurationError,
    createNotificationProviders,
} from "./providers.ts";
export { createDrizzleNotificationRepository } from "./repository.ts";
export {
    buildBookingNotificationMessage,
    buildNotificationMetadata,
} from "./templates.ts";
export {
    reminderJobWindowFromEnv,
    runBookingReminderJob,
    type BookingReminderCandidate,
    type BookingReminderJobResult,
    type BookingReminderNotificationRepository,
} from "./reminders.ts";

import {
    dispatchBookingLifecycleNotification,
} from "./dispatcher.ts";
import {
    createNotificationProviders,
} from "./providers.ts";
import {
    createDrizzleNotificationRepository,
} from "./repository.ts";
import type {
    BookingLifecycleDispatchInput,
    BookingLifecycleDispatchResult,
} from "./types.ts";

export async function dispatchBookingNotificationSafely(
    input: BookingLifecycleDispatchInput,
): Promise<BookingLifecycleDispatchResult[]> {
    try {
        return await dispatchBookingLifecycleNotification({
            ...input,
            repository: createDrizzleNotificationRepository(),
            providers: createNotificationProviders(),
        });
    } catch (error) {
        console.error("[notifications] lifecycle dispatch failed", error);
        return [];
    }
}
