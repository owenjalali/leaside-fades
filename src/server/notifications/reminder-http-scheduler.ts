export interface ReminderHttpScheduleDecision {
    shouldRun: boolean;
    intervalMinutes: number;
    boundaryGraceMinutes: number;
    reason?: "outside_scheduled_boundary";
    nextRunAt?: string;
}

const DEFAULT_HTTP_INTERVAL_MINUTES = 30;
const DEFAULT_BOUNDARY_GRACE_MINUTES = 2;
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

export function reminderHttpBoundaryGraceMinutesFromEnv(
    env: Partial<Record<string, string | undefined>>,
    intervalMinutes: number,
) {
    const parsed = Number(env.REMINDER_HTTP_BOUNDARY_GRACE_MINUTES);

    if (Number.isInteger(parsed) && parsed >= 0) {
        return normalizeBoundaryGraceMinutes(parsed, intervalMinutes);
    }

    return normalizeBoundaryGraceMinutes(DEFAULT_BOUNDARY_GRACE_MINUTES, intervalMinutes);
}

export function getReminderHttpScheduleDecision(input: {
    now?: Date;
    intervalMinutes: number;
    boundaryGraceMinutes?: number;
}): ReminderHttpScheduleDecision {
    const now = input.now ?? new Date();
    const intervalMinutes = input.intervalMinutes;
    const boundaryGraceMinutes = normalizeBoundaryGraceMinutes(input.boundaryGraceMinutes, intervalMinutes);

    if (intervalMinutes <= 5) {
        return { shouldRun: true, intervalMinutes, boundaryGraceMinutes };
    }

    const minute = now.getUTCMinutes();
    const minutesAfterBoundary = minute % intervalMinutes;

    if (minutesAfterBoundary <= boundaryGraceMinutes) {
        return { shouldRun: true, intervalMinutes, boundaryGraceMinutes };
    }

    const nextRunAt = new Date(now);
    nextRunAt.setUTCSeconds(0, 0);
    nextRunAt.setUTCMinutes(minute + (intervalMinutes - (minute % intervalMinutes)));

    return {
        shouldRun: false,
        intervalMinutes,
        boundaryGraceMinutes,
        reason: "outside_scheduled_boundary",
        nextRunAt: nextRunAt.toISOString(),
    };
}

function normalizeBoundaryGraceMinutes(value: number | undefined, intervalMinutes: number) {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
        return normalizeBoundaryGraceMinutes(DEFAULT_BOUNDARY_GRACE_MINUTES, intervalMinutes);
    }

    const maxByInterval = Number.isInteger(intervalMinutes) && intervalMinutes > 0 ? intervalMinutes - 1 : 0;

    return Math.min(value, 5, maxByInterval);
}
