export interface ReminderHttpScheduleDecision {
    shouldRun: boolean;
    intervalMinutes: number;
    reason?: "outside_scheduled_boundary";
    nextRunAt?: string;
}

const DEFAULT_HTTP_INTERVAL_MINUTES = 30;
const ALLOWED_INTERVAL_MINUTES = new Set([5, 10, 15, 20, 30, 60]);

export function reminderHttpIntervalFromEnv(env: Partial<Record<string, string | undefined>>) {
    const parsed = Number(env.REMINDER_HTTP_MIN_INTERVAL_MINUTES);

    if (
        Number.isInteger(parsed) &&
        ALLOWED_INTERVAL_MINUTES.has(parsed)
    ) {
        return parsed;
    }

    return DEFAULT_HTTP_INTERVAL_MINUTES;
}

export function getReminderHttpScheduleDecision(input: {
    now?: Date;
    intervalMinutes: number;
}): ReminderHttpScheduleDecision {
    const now = input.now ?? new Date();
    const intervalMinutes = input.intervalMinutes;

    if (intervalMinutes <= 5) {
        return { shouldRun: true, intervalMinutes };
    }

    const minute = now.getUTCMinutes();

    if (minute % intervalMinutes === 0) {
        return { shouldRun: true, intervalMinutes };
    }

    const nextRunAt = new Date(now);
    nextRunAt.setUTCSeconds(0, 0);
    nextRunAt.setUTCMinutes(minute + (intervalMinutes - (minute % intervalMinutes)));

    return {
        shouldRun: false,
        intervalMinutes,
        reason: "outside_scheduled_boundary",
        nextRunAt: nextRunAt.toISOString(),
    };
}
