import {
    dispatchBookingReminderNotification,
    type BookingLifecycleNotificationRepository,
} from "./dispatcher.ts";
import type {
    BookingLifecycleDispatchResult,
    BookingReminderNotificationEventType,
    NotificationProviderSet,
} from "./types.ts";

const DEFAULT_LOOKBACK_MINUTES = 60;
const DEFAULT_LOOKAHEAD_MINUTES = 15;

const REMINDER_DEFINITIONS: Array<{
    eventType: BookingReminderNotificationEventType;
    offsetMinutes: number;
}> = [
    { eventType: "reminder_2h", offsetMinutes: 2 * 60 },
];

export interface BookingReminderCandidate {
    bookingId: string;
    startTime: Date;
}

export interface BookingReminderCandidateLookup {
    eventType: BookingReminderNotificationEventType;
    offsetMinutes: number;
    startFrom: Date;
    startTo: Date;
}

export interface BookingReminderNotificationRepository
    extends BookingLifecycleNotificationRepository {
    listReminderCandidates(input: BookingReminderCandidateLookup): Promise<BookingReminderCandidate[]>;
}

export interface RunBookingReminderJobInput {
    repository: BookingReminderNotificationRepository;
    providers: NotificationProviderSet;
    now?: Date;
    lookBackMinutes?: number;
    lookAheadMinutes?: number;
}

export interface BookingReminderJobResult {
    scanned: number;
    totalAttempts: number;
    sent: number;
    failed: number;
    skipped: number;
    duplicate: number;
}

export async function runBookingReminderJob(
    input: RunBookingReminderJobInput,
): Promise<BookingReminderJobResult> {
    const now = input.now ?? new Date();
    const lookBackMinutes = input.lookBackMinutes ?? DEFAULT_LOOKBACK_MINUTES;
    const lookAheadMinutes = input.lookAheadMinutes ?? DEFAULT_LOOKAHEAD_MINUTES;
    const dueFrom = addMinutes(now, -lookBackMinutes);
    const dueTo = addMinutes(now, lookAheadMinutes);
    const result: BookingReminderJobResult = {
        scanned: 0,
        totalAttempts: 0,
        sent: 0,
        failed: 0,
        skipped: 0,
        duplicate: 0,
    };

    for (const reminder of REMINDER_DEFINITIONS) {
        const candidates = await input.repository.listReminderCandidates({
            eventType: reminder.eventType,
            offsetMinutes: reminder.offsetMinutes,
            startFrom: addMinutes(dueFrom, reminder.offsetMinutes),
            startTo: addMinutes(dueTo, reminder.offsetMinutes),
        });

        result.scanned += candidates.length;

        for (const candidate of candidates) {
            const attempts = await dispatchBookingReminderNotification({
                eventType: reminder.eventType,
                bookingId: candidate.bookingId,
                repository: input.repository,
                providers: input.providers,
                scheduledFor: addMinutes(candidate.startTime, -reminder.offsetMinutes),
                expectedStartTime: candidate.startTime,
                now,
            });

            tallyAttempts(result, attempts);
        }
    }

    return result;
}

export function reminderJobWindowFromEnv(env: Partial<Record<string, string | undefined>>) {
    return {
        lookBackMinutes: parsePositiveInteger(
            env.REMINDER_JOB_LOOKBACK_MINUTES,
            DEFAULT_LOOKBACK_MINUTES,
        ),
        lookAheadMinutes: parsePositiveInteger(
            env.REMINDER_JOB_LOOKAHEAD_MINUTES,
            DEFAULT_LOOKAHEAD_MINUTES,
        ),
    };
}

function tallyAttempts(result: BookingReminderJobResult, attempts: BookingLifecycleDispatchResult[]) {
    for (const attempt of attempts) {
        result.totalAttempts += 1;

        if (attempt.status === "duplicate") {
            result.duplicate += 1;
        } else if (attempt.status === "sent") {
            result.sent += 1;
        } else if (attempt.status === "failed") {
            result.failed += 1;
        } else if (attempt.status === "skipped") {
            result.skipped += 1;
        }
    }
}

function addMinutes(value: Date, minutes: number) {
    return new Date(value.getTime() + minutes * 60_000);
}

function parsePositiveInteger(value: string | undefined, fallback: number) {
    const parsed = Number(value);

    if (Number.isInteger(parsed) && parsed >= 0) {
        return parsed;
    }

    return fallback;
}
