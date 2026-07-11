import type {
    AdminBarberOption,
    AdminBlockedTime,
    AdminBlockedTimeScope,
    AdminBookingFilters,
    AdminBookingStatus,
    AdminBookingSummary,
    AdminCalendarOptions,
    AdminDashboardActivity,
    AdminDashboardNotificationHealth,
    AdminDashboardPeriod,
    AdminDay,
    AdminDayShiftReplacePayload,
    AdminSchedule,
    AdminScheduleFilters,
    AdminShift,
    BlockedTimeFormInput,
    SafeAdminUser,
} from "./types";

const timeZone = "America/Toronto";
const statusLabels: Record<AdminBookingStatus, string> = {
    confirmed: "Confirmed",
    cancelled: "Cancelled",
    completed: "Completed",
    no_show: "No show",
};
const weeklyScheduleDayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
const weeklyScheduleDisplayOrder = [1, 2, 3, 4, 5, 6, 0] as const;

export type AdminCalendarView = "day" | "week" | "month" | "list";

export interface CalendarWorkingWindow {
    barberId: string;
    locationId: string;
    startTime: string;
    endTime: string;
    source: "shift" | "override";
}

export interface CalendarUnavailableRange {
    startTime: string;
    endTime: string;
}

export interface ScheduledCalendarBarber {
    barber: AdminBarberOption;
    workingWindows: CalendarWorkingWindow[];
    offScheduleBookings: AdminBookingSummary[];
    scheduled: boolean;
}

export interface ShiftWindowDraft {
    draftId: string;
    shiftId?: string;
    locationId: string;
    startTime: string;
    endTime: string;
    effectiveFrom?: string;
    effectiveTo?: string;
}

export interface DayScheduleDraft {
    dayOfWeek: number;
    active: boolean;
    windows: ShiftWindowDraft[];
}

export interface WeeklyScheduleDraft {
    barberId: string;
    effectiveFrom: string;
    effectiveTo: string;
    effectiveDatesTouched: boolean;
    sourceShiftIds: string[];
    days: DayScheduleDraft[];
}

export type WeeklyScheduleShiftPayload = Record<string, unknown> & {
    barberId: string;
    locationId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    effectiveFrom: string;
    effectiveTo: string;
};

export type WeeklyScheduleSaveOperation =
    | { type: "deactivate"; shiftId: string }
    | { type: "update"; shiftId: string; payload: WeeklyScheduleShiftPayload }
    | { type: "create"; payload: WeeklyScheduleShiftPayload };

export interface WeeklyScheduleValidationIssue {
    dayOfWeek?: number;
    windowDraftId?: string;
    field: "effectiveFrom" | "effectiveTo" | "startTime" | "endTime" | "locationId" | "window";
    message: string;
}

export function getWeeklyCopyTargetDayOptions(sourceDayOfWeek: number) {
    return weeklyScheduleDisplayOrder
        .filter((dayOfWeek) => dayOfWeek !== sourceDayOfWeek)
        .map((dayOfWeek) => ({
            dayOfWeek,
            label: weeklyScheduleDayLabels[dayOfWeek],
        }));
}

export const mobileAdminCalendarLayoutBudget = {
    viewportHeightPx: 568,
    railHeightPx: 56,
    topbarHeightPx: 144,
    contentVerticalPaddingPx: 16,
    boardHeaderHeightPx: 88,
    slotHeightPx: 44,
};

export function estimateMobileCalendarGridHeight({
    viewportHeightPx,
    railHeightPx,
    topbarHeightPx,
    contentVerticalPaddingPx,
    boardHeaderHeightPx,
    slotHeightPx,
}: typeof mobileAdminCalendarLayoutBudget) {
    const availableGridHeightPx =
        viewportHeightPx - railHeightPx - topbarHeightPx - contentVerticalPaddingPx - boardHeaderHeightPx;

    return {
        availableGridHeightPx,
        visibleSlotRows: Math.floor(Math.max(0, availableGridHeightPx) / slotHeightPx),
    };
}

export function buildAdminBookingQuery(filters: AdminBookingFilters) {
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(filters)) {
        if (typeof value === "string" && value.trim()) {
            params.set(key, value.trim());
        }
    }

    return params.toString();
}

export function buildAdminScheduleQuery(filters: AdminScheduleFilters) {
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(filters)) {
        if (typeof value === "string" && value.trim()) {
            params.set(key, value.trim());
        }
    }

    return params.toString();
}

export type NotificationCenterFilter = "all" | "sent" | "scheduled" | "failed" | "sms" | "email";

export const notificationFilters: NotificationCenterFilter[] = ["all", "sent", "scheduled", "failed", "sms", "email"];

export function getActiveNotificationFailures(activity: AdminDashboardActivity[]) {
    return activity.filter((item) => item.status === "failed" && item.isActiveFailure).slice(0, 4);
}

export function notificationFilterMatches(item: AdminDashboardActivity, filter: NotificationCenterFilter) {
    if (filter === "all") return true;
    if (filter === "scheduled") return Boolean(item.scheduledFor) || item.status === "pending";
    if (filter === "sms" || filter === "email") return item.channel === filter;
    return item.status === filter;
}

export function compactNotificationFailureMessage(errorMessage: string | null, failureSummary: string | null) {
    if (failureSummary) {
        return failureSummary;
    }

    const compacted = (errorMessage ?? "").replace(/\s+/g, " ").trim();
    if (!compacted) {
        return null;
    }

    return compacted.length > 117 ? `${compacted.slice(0, 114)}...` : compacted;
}

export function formatDashboardCurrency(cents: number) {
    return `CA$ ${Math.round(cents / 100).toLocaleString("en-CA")}`;
}

export function formatCompactDashboardCurrency(cents: number) {
    const dollars = Math.round(cents / 100);

    if (dollars >= 1000) {
        const compact = dollars / 1000;
        return `CA$ ${compact % 1 === 0 ? compact.toFixed(0) : compact.toFixed(1)}k`;
    }

    return `CA$ ${dollars.toLocaleString("en-CA")}`;
}

export function buildDashboardChartScale(values: number[]) {
    const maxValue = Math.max(0, ...values);

    if (maxValue === 0) {
        return { max: 1, ticks: [1, 0.75, 0.5, 0.25, 0] };
    }

    const magnitude = 10 ** Math.floor(Math.log10(maxValue));
    const normalized = maxValue / magnitude;
    const rounded = normalized <= 1.5 ? 1.5 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
    const max = rounded * magnitude;

    return {
        max,
        ticks: [max, max * 0.75, max * 0.5, max * 0.25, 0],
    };
}

export function seriesHasDashboardData<T extends object, K extends keyof T>(series: T[], key: K) {
    return series.some((item) => Number(item[key]) > 0);
}

export function summarizeNotificationHealth(health: AdminDashboardNotificationHealth) {
    return [
        `${health.deliverySuccessRate}% delivery success`,
        `${health.failedActiveCount} active ${health.failedActiveCount === 1 ? "issue" : "issues"}`,
        `${health.reminderQueueCount} reminders queued`,
        `Scheduler ${health.reminderScheduler.state}`,
    ];
}

export function buildDashboardPeriodRange(period: AdminDashboardPeriod, anchorDate: string) {
    if (period === "all-time") {
        return {
            period,
            anchorDate,
            periodStart: anchorDate,
            periodEnd: anchorDate,
        };
    }

    if (period === "week") {
        return {
            period,
            anchorDate,
            periodStart: addDaysToLocalDate(anchorDate, -6),
            periodEnd: anchorDate,
        };
    }

    if (period === "month") {
        const date = parseLocalDate(anchorDate);
        const periodStart = dateToLocalString(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1)));
        const periodEnd = dateToLocalString(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)));

        return {
            period,
            anchorDate,
            periodStart,
            periodEnd,
        };
    }

    const year = anchorDate.slice(0, 4);
    return {
        period,
        anchorDate,
        periodStart: `${year}-01-01`,
        periodEnd: `${year}-12-31`,
    };
}

export function navigateDashboardPeriod(period: AdminDashboardPeriod, anchorDate: string, direction: -1 | 1) {
    if (period === "all-time") {
        return anchorDate;
    }

    if (period === "week") {
        return addDaysToLocalDate(anchorDate, direction * 7);
    }

    if (period === "month") {
        return addMonthsToLocalDate(anchorDate, direction);
    }

    return addMonthsToLocalDate(anchorDate, direction * 12);
}

export function formatDashboardPeriodLabel(
    period: AdminDashboardPeriod,
    periodStart: string,
    periodEnd: string,
) {
    if (period === "all-time") {
        return "All time";
    }

    if (period === "year") {
        return periodStart.slice(0, 4);
    }

    if (period === "month") {
        return new Intl.DateTimeFormat("en-US", {
            timeZone: "UTC",
            month: "long",
            year: "numeric",
        }).format(parseLocalDate(periodStart));
    }

    const start = parseLocalDate(periodStart);
    const end = parseLocalDate(periodEnd);
    const sameYear = start.getUTCFullYear() === end.getUTCFullYear();

    const startLabel = new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
        year: sameYear ? undefined : "numeric",
    }).format(start);
    const endLabel = new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
        year: "numeric",
    }).format(end);

    return `${startLabel}-${endLabel}`;
}

export function buildWeekDays(selectedDate: string) {
    const date = parseLocalDate(selectedDate);
    const start = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - date.getUTCDay()));

    return Array.from({ length: 7 }, (_, index) => dayInfo(addDays(start, index), selectedDate.slice(0, 7)));
}

export function buildMonthDays(selectedDate: string) {
    const selected = parseLocalDate(selectedDate);
    const monthStart = new Date(Date.UTC(selected.getUTCFullYear(), selected.getUTCMonth(), 1));
    const monthEnd = new Date(Date.UTC(selected.getUTCFullYear(), selected.getUTCMonth() + 1, 0));
    const gridStart = new Date(
        Date.UTC(
            monthStart.getUTCFullYear(),
            monthStart.getUTCMonth(),
            monthStart.getUTCDate() - monthStart.getUTCDay(),
        ),
    );
    const gridEnd = new Date(
        Date.UTC(
            monthEnd.getUTCFullYear(),
            monthEnd.getUTCMonth(),
            monthEnd.getUTCDate() + (6 - monthEnd.getUTCDay()),
        ),
    );
    const dayCount = Math.round((gridEnd.getTime() - gridStart.getTime()) / 86400000) + 1;
    const currentMonth = selectedDate.slice(0, 7);

    return Array.from({ length: dayCount }, (_, index) => dayInfo(addDays(gridStart, index), currentMonth));
}

export function buildDateRangeForView(view: AdminCalendarView, date: string) {
    if (view === "week" || view === "list") {
        const days = buildWeekDays(date);
        return { from: days[0]?.date ?? date, to: days[days.length - 1]?.date ?? date };
    }

    if (view === "month") {
        const days = buildMonthDays(date);
        return { from: days[0]?.date ?? date, to: days[days.length - 1]?.date ?? date };
    }

    return { from: date, to: date };
}

export function navigateCalendarDate(view: AdminCalendarView, date: string, direction: -1 | 1) {
    if (view === "month") {
        return addMonthsToLocalDate(date, direction);
    }

    if (view === "week" || view === "list") {
        return addDaysToLocalDate(date, direction * 7);
    }

    return addDaysToLocalDate(date, direction);
}

export function groupBookingsByLocalDate(bookings: AdminBookingSummary[]) {
    return bookings.reduce<Record<string, AdminBookingSummary[]>>((groups, booking) => {
        const localDate = formatLocalDate(new Date(booking.startTime));
        groups[localDate] ??= [];
        groups[localDate].push(booking);
        return groups;
    }, {});
}

export function formatAdminStatus(status: AdminBookingStatus) {
    return statusLabels[status];
}

export function todayLocalDate() {
    return formatLocalDate(new Date());
}

export function formatLocalDateTime(value: string | Date) {
    // en-US for uppercase "AM/PM" — matches the calendar ruler (formatClockLabel)
    // and notification templates; en-CA's lowercase "a.m." was the odd one out.
    return new Intl.DateTimeFormat("en-US", {
        timeZone,
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(typeof value === "string" ? new Date(value) : value);
}

export function formatLocalTime(value: string | Date) {
    return new Intl.DateTimeFormat("en-US", {
        timeZone,
        hour: "numeric",
        minute: "2-digit",
    }).format(typeof value === "string" ? new Date(value) : value);
}

export function formatScheduleWindow(startTime: string, endTime: string) {
    return `${formatLocalClockTime(startTime)} - ${formatLocalClockTime(endTime)}`;
}

export function groupShiftsByBarberAndWeekday(shifts: AdminShift[]) {
    return shifts.reduce<Record<string, Record<number, AdminShift[]>>>((groups, shift) => {
        groups[shift.barberId] ??= {};
        groups[shift.barberId][shift.dayOfWeek] ??= [];
        groups[shift.barberId][shift.dayOfWeek].push(shift);
        groups[shift.barberId][shift.dayOfWeek].sort((a, b) => a.startTime.localeCompare(b.startTime));
        return groups;
    }, {});
}

export function buildWeeklyScheduleDraft(schedule: AdminSchedule, barberId: string): WeeklyScheduleDraft {
    const activeShifts = schedule.shifts
        .filter((shift) => shift.active && shift.barberId === barberId)
        .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime));
    const shifts = selectCurrentWeeklyShiftPattern(activeShifts);
    const effectiveFromValues = uniqueShiftDateValues(shifts, "effectiveFrom");
    const effectiveToValues = uniqueShiftDateValues(shifts, "effectiveTo");
    const days: DayScheduleDraft[] = Array.from({ length: 7 }, (_, dayOfWeek) => {
        const windows = shifts
            .filter((shift) => shift.dayOfWeek === dayOfWeek)
            .map((shift) => ({
                draftId: shift.id,
                shiftId: shift.id,
                locationId: shift.locationId,
                startTime: shift.startTime,
                endTime: shift.endTime,
                effectiveFrom: shift.effectiveFrom ?? "",
                effectiveTo: shift.effectiveTo ?? "",
            }));

        return {
            dayOfWeek,
            active: windows.length > 0,
            windows,
        };
    });

    return {
        barberId,
        effectiveFrom: effectiveFromValues.length === 1 ? effectiveFromValues[0] : "",
        effectiveTo: effectiveToValues.length === 1 ? effectiveToValues[0] : "",
        effectiveDatesTouched: false,
        sourceShiftIds: shifts.map((shift) => shift.id),
        days,
    };
}

export function calculateWeeklyScheduleHours(draft: WeeklyScheduleDraft) {
    return draft.days.reduce((total, day) => {
        if (!day.active) {
            return total;
        }

        return total + day.windows.reduce((dayTotal, window) => {
            return dayTotal + Math.max(0, clockToMinutes(window.endTime) - clockToMinutes(window.startTime)) / 60;
        }, 0);
    }, 0);
}

export function validateWeeklyScheduleDraft(draft: WeeklyScheduleDraft): WeeklyScheduleValidationIssue[] {
    const issues: WeeklyScheduleValidationIssue[] = [];

    if (draft.effectiveFrom && draft.effectiveTo && draft.effectiveFrom > draft.effectiveTo) {
        issues.push({
            field: "effectiveTo",
            message: "Ends must be on or after Starts.",
        });
    }

    for (const day of draft.days) {
        if (!day.active) {
            continue;
        }

        if (day.windows.length === 0) {
            issues.push({
                dayOfWeek: day.dayOfWeek,
                field: "window",
                message: "Turn this day off or add working hours.",
            });
            continue;
        }

        const validWindows: Array<ShiftWindowDraft & { startMinutes: number; endMinutes: number }> = [];

        for (const window of day.windows) {
            const startMinutes = scheduleClockToMinutes(window.startTime);
            const endMinutes = scheduleClockToMinutes(window.endTime);

            if (!window.locationId) {
                issues.push({
                    dayOfWeek: day.dayOfWeek,
                    windowDraftId: window.draftId,
                    field: "locationId",
                    message: "Choose a location.",
                });
            }

            if (startMinutes === null) {
                issues.push({
                    dayOfWeek: day.dayOfWeek,
                    windowDraftId: window.draftId,
                    field: "startTime",
                    message: "Start time must use a 15-minute increment.",
                });
            }

            if (endMinutes === null) {
                issues.push({
                    dayOfWeek: day.dayOfWeek,
                    windowDraftId: window.draftId,
                    field: "endTime",
                    message: "End time must use a 15-minute increment.",
                });
            }

            if (startMinutes === null || endMinutes === null) {
                continue;
            }

            if (startMinutes >= endMinutes) {
                issues.push({
                    dayOfWeek: day.dayOfWeek,
                    windowDraftId: window.draftId,
                    field: "endTime",
                    message: "End time must be after start time.",
                });
                continue;
            }

            validWindows.push({ ...window, startMinutes, endMinutes });
        }

        const sortedWindows = [...validWindows].sort((a, b) => a.startMinutes - b.startMinutes);
        for (let index = 1; index < sortedWindows.length; index += 1) {
            const previous = sortedWindows[index - 1];
            const current = sortedWindows[index];
            if (previous.startMinutes < current.endMinutes && previous.endMinutes > current.startMinutes) {
                issues.push({
                    dayOfWeek: day.dayOfWeek,
                    windowDraftId: current.draftId,
                    field: "window",
                    message: "Split shifts on the same day cannot overlap.",
                });
            }
        }
    }

    return issues;
}

export function snapWeeklyScheduleClock(time: string) {
    const minutes = looseClockToMinutes(time);
    if (minutes === null) {
        return null;
    }

    return minutesToClock(clampScheduleMinutes(Math.round(minutes / 15) * 15));
}

export function moveWeeklyScheduleWindow(
    draft: WeeklyScheduleDraft,
    input: {
        windowDraftId: string;
        targetDayOfWeek: number;
        targetStartTime: string;
    },
) {
    const targetStartTime = snapWeeklyScheduleClock(input.targetStartTime);
    const targetDay = normalizedDayOfWeek(input.targetDayOfWeek);
    if (!targetStartTime || targetDay === null) {
        return cloneWeeklyScheduleDraft(draft);
    }

    const next = cloneWeeklyScheduleDraft(draft);
    const located = findWeeklyScheduleWindow(next, input.windowDraftId);
    if (!located) {
        return next;
    }

    const [window] = located.day.windows.splice(located.windowIndex, 1);
    if (located.day.windows.length === 0) {
        located.day.active = false;
    }

    const duration = validWindowDurationMinutes(window) ?? 60;
    const targetStartMinutes = fitWindowStartMinutes(targetStartTime, duration);
    const movedWindow = {
        ...window,
        startTime: minutesToClock(targetStartMinutes),
        endTime: minutesToClock(targetStartMinutes + duration),
    };
    const targetDayDraft = next.days[targetDay];
    targetDayDraft.active = true;
    targetDayDraft.windows = [...targetDayDraft.windows, movedWindow].sort(compareShiftWindowDrafts);

    return next;
}

export function resizeWeeklyScheduleWindow(
    draft: WeeklyScheduleDraft,
    input: {
        windowDraftId: string;
        edge: "start" | "end";
        targetTime: string;
    },
) {
    const targetTime = snapWeeklyScheduleClock(input.targetTime);
    const next = cloneWeeklyScheduleDraft(draft);
    const located = findWeeklyScheduleWindow(next, input.windowDraftId);
    if (!located || !targetTime) {
        return next;
    }

    const startMinutes = looseClockToMinutes(located.window.startTime);
    const endMinutes = looseClockToMinutes(located.window.endTime);
    const targetMinutes = looseClockToMinutes(targetTime);
    if (startMinutes === null || endMinutes === null || targetMinutes === null) {
        return next;
    }

    if (input.edge === "start") {
        located.window.startTime = minutesToClock(Math.min(targetMinutes, endMinutes - 15));
    } else {
        located.window.endTime = minutesToClock(Math.max(targetMinutes, startMinutes + 15));
    }
    located.day.windows.sort(compareShiftWindowDrafts);

    return next;
}

export function duplicateWeeklyScheduleWindow(
    draft: WeeklyScheduleDraft,
    input: {
        windowDraftId: string;
        targetDayOfWeek?: number;
        targetStartTime?: string;
    },
) {
    const next = cloneWeeklyScheduleDraft(draft);
    const located = findWeeklyScheduleWindow(next, input.windowDraftId);
    if (!located) {
        return next;
    }

    const targetDay = normalizedDayOfWeek(input.targetDayOfWeek ?? located.day.dayOfWeek);
    if (targetDay === null) {
        return next;
    }

    const duration = validWindowDurationMinutes(located.window) ?? 60;
    const desiredStart = snapWeeklyScheduleClock(input.targetStartTime ?? located.window.startTime);
    if (!desiredStart) {
        return next;
    }

    const targetStartMinutes = fitWindowStartMinutes(desiredStart, duration);
    const duplicate: ShiftWindowDraft = {
        ...located.window,
        draftId: createWeeklyScheduleDraftWindowId(targetDay),
        shiftId: undefined,
        startTime: minutesToClock(targetStartMinutes),
        endTime: minutesToClock(targetStartMinutes + duration),
    };
    const targetDayDraft = next.days[targetDay];
    targetDayDraft.active = true;
    targetDayDraft.windows = [...targetDayDraft.windows, duplicate].sort(compareShiftWindowDrafts);

    return next;
}

export function copyWeeklyScheduleDay(
    draft: WeeklyScheduleDraft,
    input: {
        fromDayOfWeek: number;
        toDayOfWeek: number;
    },
) {
    const sourceDay = normalizedDayOfWeek(input.fromDayOfWeek);
    const targetDay = normalizedDayOfWeek(input.toDayOfWeek);
    const next = cloneWeeklyScheduleDraft(draft);
    if (sourceDay === null || targetDay === null) {
        return next;
    }

    const source = next.days[sourceDay];
    next.days[targetDay] = {
        ...next.days[targetDay],
        active: source.active,
        windows: source.active
            ? source.windows.map((window) => ({
                ...window,
                draftId: createWeeklyScheduleDraftWindowId(targetDay),
                shiftId: undefined,
            }))
            : [],
    };

    return next;
}

export function clearWeeklyScheduleDay(draft: WeeklyScheduleDraft, dayOfWeek: number) {
    const targetDay = normalizedDayOfWeek(dayOfWeek);
    const next = cloneWeeklyScheduleDraft(draft);
    if (targetDay === null) {
        return next;
    }

    next.days[targetDay] = {
        ...next.days[targetDay],
        active: false,
        windows: [],
    };

    return next;
}

export function buildWeeklyScheduleSavePlan(
    schedule: Pick<AdminSchedule, "shifts">,
    draft: WeeklyScheduleDraft,
): WeeklyScheduleSaveOperation[] {
    const sourceShiftIds = new Set(draft.sourceShiftIds);
    const existingShifts = schedule.shifts.filter((shift) =>
        shift.active && shift.barberId === draft.barberId && sourceShiftIds.has(shift.id),
    );
    const existingById = new Map(existingShifts.map((shift) => [shift.id, shift]));
    const retainedShiftIds = new Set<string>();
    const deactivates: WeeklyScheduleSaveOperation[] = [];
    const updates: WeeklyScheduleSaveOperation[] = [];
    const creates: WeeklyScheduleSaveOperation[] = [];

    for (const day of draft.days) {
        if (!day.active) {
            continue;
        }

        for (const window of day.windows) {
            const payload = buildWeeklyShiftPayload(draft, day.dayOfWeek, window);

            if (window.shiftId && existingById.has(window.shiftId)) {
                retainedShiftIds.add(window.shiftId);
                const existing = existingById.get(window.shiftId);
                if (existing && !weeklyShiftPayloadMatches(existing, payload)) {
                    updates.push({ type: "update", shiftId: window.shiftId, payload });
                }
            } else {
                creates.push({ type: "create", payload });
            }
        }
    }

    for (const shift of existingShifts) {
        if (!retainedShiftIds.has(shift.id)) {
            deactivates.push({ type: "deactivate", shiftId: shift.id });
        }
    }

    return [...deactivates, ...updates, ...creates];
}

export function localDateWeekday(localDate: string) {
    return parseLocalDate(localDate).getUTCDay();
}

export function formatLocalDateLabel(localDate: string, options: { year?: boolean } = {}) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
        ...(options.year ? { year: "numeric" as const } : {}),
    }).format(parseLocalDate(localDate));
}

export function buildBlockedTimePayload(input: BlockedTimeFormInput) {
    const payload: Record<string, string> = {
        scope: input.scope,
        startDate: input.startDate,
        startTime: input.allDay ? "00:00" : input.startTime,
        endDate: input.allDay ? addDaysToLocalDate(input.startDate, 1) : input.endDate,
        endTime: input.allDay ? "00:00" : input.endTime,
    };

    if (input.barberId) {
        payload.barberId = input.barberId;
    }

    if (input.locationId) {
        payload.locationId = input.locationId;
    }

    if (input.reason?.trim()) {
        payload.reason = input.reason.trim();
    }

    return payload;
}

export function buildCalendarTimeSlots(startTime: string, endTime: string, intervalMinutes = 15) {
    const start = clockToMinutes(startTime);
    const end = clockToMinutes(endTime);
    const slots: string[] = [];

    for (let minute = start; minute < end; minute += intervalMinutes) {
        slots.push(minutesToClock(minute));
    }

    return slots;
}

export function buildCalendarBoardRows(startTime: string, endTime: string, intervalMinutes = 15) {
    return {
        bookableSlots: buildCalendarTimeSlots(startTime, endTime, intervalMinutes),
        closeBoundary: endTime,
    };
}

export function getCalendarInitialScrollTop({
    dayStartTime,
    targetTime,
    slotHeightPx,
}: {
    dayStartTime: string;
    targetTime: string;
    slotHeightPx: number;
}) {
    const minutesAfterStart = Math.max(0, clockToMinutes(targetTime) - clockToMinutes(dayStartTime));
    return Math.floor((minutesAfterStart / 15) * slotHeightPx);
}

export function buildCalendarWorkingWindows({
    schedule,
    selectedDate,
    locationId,
    businessStartTime = "00:00",
    businessEndTime = "24:00",
}: {
    schedule: Pick<AdminSchedule, "shifts" | "shiftOverrides">;
    selectedDate: string;
    locationId: string;
    businessStartTime?: string;
    businessEndTime?: string;
}) {
    const selectedWeekday = parseLocalDate(selectedDate).getUTCDay();
    // Honor the override's locationId gate exactly like the engine's
    // overrideAppliesToLocation: null clears the barber everywhere, otherwise
    // only the matching location — so a location-scoped not_working never wipes
    // the other location's windows.
    const notWorkingBarbers = new Set(
        schedule.shiftOverrides
            .filter(
                (override) =>
                    override.overrideDate === selectedDate &&
                    override.overrideType === "not_working" &&
                    (override.locationId === null || override.locationId === locationId),
            )
            .map((override) => override.barberId),
    );
    const windowsByBarber: Record<string, CalendarWorkingWindow[]> = {};

    for (const shift of schedule.shifts) {
        if (
            !shift.active ||
            shift.locationId !== locationId ||
            shift.dayOfWeek !== selectedWeekday ||
            notWorkingBarbers.has(shift.barberId) ||
            (shift.effectiveFrom && selectedDate < shift.effectiveFrom) ||
            (shift.effectiveTo && selectedDate > shift.effectiveTo)
        ) {
            continue;
        }

        addCalendarWindow(windowsByBarber, {
            barberId: shift.barberId,
            locationId: shift.locationId,
            startTime: shift.startTime,
            endTime: shift.endTime,
            source: "shift",
        }, businessStartTime, businessEndTime);
    }

    for (const override of schedule.shiftOverrides) {
        if (
            override.overrideDate !== selectedDate ||
            override.overrideType !== "add" ||
            override.locationId !== locationId ||
            !override.startTime ||
            !override.endTime ||
            notWorkingBarbers.has(override.barberId)
        ) {
            continue;
        }

        addCalendarWindow(windowsByBarber, {
            barberId: override.barberId,
            locationId: override.locationId,
            startTime: override.startTime,
            endTime: override.endTime,
            source: "override",
        }, businessStartTime, businessEndTime);
    }

    for (const override of schedule.shiftOverrides) {
        if (
            override.overrideDate !== selectedDate ||
            override.overrideType !== "remove" ||
            (override.locationId && override.locationId !== locationId) ||
            !override.startTime ||
            !override.endTime
        ) {
            continue;
        }

        windowsByBarber[override.barberId] = (windowsByBarber[override.barberId] ?? []).flatMap((window) =>
            subtractCalendarWindow(window, override.startTime ?? "00:00", override.endTime ?? "00:00"),
        );
    }

    for (const barberId of Object.keys(windowsByBarber)) {
        const normalized = normalizeCalendarWindows(windowsByBarber[barberId]);
        if (normalized.length > 0 && !notWorkingBarbers.has(barberId)) {
            windowsByBarber[barberId] = normalized;
        } else {
            delete windowsByBarber[barberId];
        }
    }

    return windowsByBarber;
}

export function buildCalendarUnavailableRanges(
    workingWindows: CalendarWorkingWindow[],
    businessWindow: { startTime: string; endTime: string },
): CalendarUnavailableRange[] {
    const ranges: CalendarUnavailableRange[] = [];
    let cursor = clockToMinutes(businessWindow.startTime);
    const businessEnd = clockToMinutes(businessWindow.endTime);

    for (const window of normalizeCalendarWindows(workingWindows)) {
        const start = Math.max(clockToMinutes(window.startTime), clockToMinutes(businessWindow.startTime));
        const end = Math.min(clockToMinutes(window.endTime), businessEnd);

        if (start > cursor) {
            ranges.push({ startTime: minutesToClock(cursor), endTime: minutesToClock(start) });
        }

        cursor = Math.max(cursor, end);
    }

    if (cursor < businessEnd) {
        ranges.push({ startTime: minutesToClock(cursor), endTime: minutesToClock(businessEnd) });
    }

    return ranges;
}

export function bookingFallsOutsideWorkingWindows(
    booking: Pick<AdminBookingSummary, "startTime" | "endTime">,
    workingWindows: CalendarWorkingWindow[],
) {
    if (workingWindows.length === 0) {
        return true;
    }

    const start = localClockMinutesFromUtc(booking.startTime);
    const end = localClockMinutesFromUtc(booking.endTime);

    return !workingWindows.some((window) => {
        const windowStart = clockToMinutes(window.startTime);
        const windowEnd = clockToMinutes(window.endTime);
        return start >= windowStart && end <= windowEnd;
    });
}

export function calendarRangeFitsWorkingWindows(
    range: { startTime: string; endTime: string },
    workingWindows: CalendarWorkingWindow[],
) {
    if (workingWindows.length === 0) {
        return false;
    }

    const start = clockToMinutes(range.startTime);
    const end = clockToMinutes(range.endTime);
    if (start >= end) {
        return false;
    }

    return normalizeCalendarWindows(workingWindows).some((window) => {
        const windowStart = clockToMinutes(window.startTime);
        const windowEnd = clockToMinutes(window.endTime);
        return start >= windowStart && end <= windowEnd;
    });
}

export function getScheduledCalendarBarbers({
    options,
    schedule,
    user,
    selectedDate,
    locationId,
    requestedBarberId,
    bookings = [],
    businessStartTime = "00:00",
    businessEndTime = "24:00",
}: {
    options: AdminCalendarOptions;
    schedule: Pick<AdminSchedule, "shifts" | "shiftOverrides">;
    user: SafeAdminUser;
    selectedDate: string;
    locationId: string;
    requestedBarberId?: string;
    bookings?: AdminBookingSummary[];
    businessStartTime?: string;
    businessEndTime?: string;
}): ScheduledCalendarBarber[] {
    const windowsByBarber = buildCalendarWorkingWindows({
        schedule,
        selectedDate,
        locationId,
        businessStartTime,
        businessEndTime,
    });
    const requestedId = user.role === "barber" ? user.barberId : requestedBarberId;

    return options.barbers
        .filter((barber) => !requestedId || barber.id === requestedId)
        .filter((barber) => barber.locationIds.includes(locationId))
        .map((barber) => {
            const workingWindows = windowsByBarber[barber.id] ?? [];
            const offScheduleBookings = bookings.filter(
                (booking) =>
                    booking.barberId === barber.id &&
                    booking.locationId === locationId &&
                    formatLocalDate(new Date(booking.startTime)) === selectedDate &&
                    bookingFallsOutsideWorkingWindows(booking, workingWindows),
            );

            return {
                barber,
                workingWindows,
                offScheduleBookings,
                scheduled: workingWindows.length > 0,
            };
        })
        .sort((a, b) => a.barber.sortOrder - b.barber.sortOrder || a.barber.displayName.localeCompare(b.barber.displayName));
}

export function getBookingCardTone(booking: AdminBookingSummary) {
    if (booking.status === "no_show") return "no_show";
    if (booking.status === "cancelled") return "cancelled";
    if (booking.status === "completed") return "completed";
    const categoryTone = getServiceCategoryTone(booking.serviceCategoryNames ?? []);
    if (categoryTone) return categoryTone;
    if (booking.source === "walk_in") return "walk_in";
    return "confirmed";
}

export type BookingCardTone = ReturnType<typeof getBookingCardTone>;

export function getBookingToneClasses(tone: BookingCardTone) {
    if (tone === "men") return "border-blue-700 bg-blue-100 text-blue-950 shadow-[inset_4px_0_0_rgba(29,78,216,0.95)]";
    if (tone === "women") return "border-pink-700 bg-pink-100 text-pink-950 shadow-[inset_4px_0_0_rgba(190,24,93,0.95)]";
    if (tone === "boys") return "border-yellow-700 bg-yellow-100 text-yellow-950 shadow-[inset_4px_0_0_rgba(161,98,7,0.95)]";
    if (tone === "mixed") return "border-violet-700 bg-violet-100 text-violet-950 shadow-[inset_4px_0_0_rgba(109,40,217,0.95)]";
    if (tone === "walk_in") return "border-violet-700 bg-violet-100 text-violet-950 shadow-[inset_4px_0_0_rgba(109,40,217,0.95)]";
    if (tone === "no_show") return "border-red-800 bg-red-600 text-white shadow-[inset_4px_0_0_rgba(127,29,29,1)]";
    if (tone === "cancelled") return "border-stone-500 bg-stone-200 text-stone-800 shadow-[inset_4px_0_0_rgba(87,83,78,0.9)]";
    if (tone === "completed") return "border-emerald-700 bg-emerald-100 text-emerald-950 shadow-[inset_4px_0_0_rgba(4,120,87,0.95)]";
    return "border-blue-700 bg-blue-100 text-blue-950 shadow-[inset_4px_0_0_rgba(29,78,216,0.95)]";
}

export function buildBookingDragPayload({
    user,
    booking,
    targetBarberId,
    targetLocationId,
    targetStartTime,
}: {
    user: SafeAdminUser;
    booking: AdminBookingSummary;
    targetBarberId: string;
    targetLocationId: string;
    targetStartTime: string;
}) {
    if (booking.status !== "confirmed") {
        return null;
    }

    if (user.role === "barber" && (booking.barberId !== user.barberId || targetBarberId !== user.barberId)) {
        return null;
    }

    return {
        locationId: targetLocationId,
        barberId: targetBarberId,
        startTime: targetStartTime,
    };
}

export function addDaysToLocalDate(localDate: string, days: number) {
    return dateToLocalString(addDays(parseLocalDate(localDate), days));
}

function addMonthsToLocalDate(localDate: string, months: number) {
    const date = parseLocalDate(localDate);
    const targetMonthStart = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
    const targetMonthEnd = new Date(Date.UTC(targetMonthStart.getUTCFullYear(), targetMonthStart.getUTCMonth() + 1, 0));
    const targetDay = Math.min(date.getUTCDate(), targetMonthEnd.getUTCDate());

    return dateToLocalString(new Date(Date.UTC(targetMonthStart.getUTCFullYear(), targetMonthStart.getUTCMonth(), targetDay)));
}

function dayInfo(date: Date, currentMonth: string): AdminDay {
    const localDate = dateToLocalString(date);

    return {
        date: localDate,
        label: new Intl.DateTimeFormat("en-CA", {
            timeZone: "UTC",
            weekday: "short",
            month: "short",
            day: "numeric",
        }).format(date),
        inCurrentMonth: localDate.startsWith(currentMonth),
        isToday: localDate === todayLocalDate(),
    };
}

function parseLocalDate(localDate: string) {
    const [year, month, day] = localDate.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
}

function addDays(date: Date, days: number) {
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + days));
}

function dateToLocalString(date: Date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}

function formatLocalDate(date: Date) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).format(date);
}

function formatLocalClockTime(time: string) {
    const [hour, minute] = time.split(":").map(Number);
    const date = new Date(Date.UTC(2026, 0, 1, hour, minute));

    return new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        hour: "numeric",
        minute: "2-digit",
    }).format(date);
}

function uniqueShiftDateValues(shifts: AdminShift[], key: "effectiveFrom" | "effectiveTo") {
    return Array.from(new Set(shifts.map((shift) => shift[key] ?? "")));
}

function selectCurrentWeeklyShiftPattern(shifts: AdminShift[]) {
    if (shifts.length <= 1) {
        return shifts;
    }

    const groups = new Map<string, AdminShift[]>();
    for (const shift of shifts) {
        const key = `${shift.effectiveFrom ?? ""}|${shift.effectiveTo ?? ""}`;
        groups.set(key, [...(groups.get(key) ?? []), shift]);
    }

    return [...groups.values()]
        .sort((a, b) => {
            const latestStart = (b[0]?.effectiveFrom ?? "").localeCompare(a[0]?.effectiveFrom ?? "");
            if (latestStart !== 0) {
                return latestStart;
            }

            const latestEnd = (b[0]?.effectiveTo ?? "").localeCompare(a[0]?.effectiveTo ?? "");
            if (latestEnd !== 0) {
                return latestEnd;
            }

            return b.length - a.length;
        })[0] ?? [];
}

function buildWeeklyShiftPayload(
    draft: WeeklyScheduleDraft,
    dayOfWeek: number,
    window: ShiftWindowDraft,
): WeeklyScheduleShiftPayload {
    return {
        barberId: draft.barberId,
        locationId: window.locationId,
        dayOfWeek,
        startTime: window.startTime,
        endTime: window.endTime,
        effectiveFrom: draft.effectiveDatesTouched ? draft.effectiveFrom : window.effectiveFrom ?? draft.effectiveFrom,
        effectiveTo: draft.effectiveDatesTouched ? draft.effectiveTo : window.effectiveTo ?? draft.effectiveTo,
    };
}

function weeklyShiftPayloadMatches(shift: AdminShift, payload: WeeklyScheduleShiftPayload) {
    return (
        shift.barberId === payload.barberId &&
        shift.locationId === payload.locationId &&
        shift.dayOfWeek === payload.dayOfWeek &&
        shift.startTime === payload.startTime &&
        shift.endTime === payload.endTime &&
        (shift.effectiveFrom ?? "") === payload.effectiveFrom &&
        (shift.effectiveTo ?? "") === payload.effectiveTo
    );
}

function addCalendarWindow(
    windowsByBarber: Record<string, CalendarWorkingWindow[]>,
    window: CalendarWorkingWindow,
    businessStartTime: string,
    businessEndTime: string,
) {
    const clipped = clipCalendarWindow(window, businessStartTime, businessEndTime);
    if (!clipped) {
        return;
    }

    windowsByBarber[clipped.barberId] ??= [];
    windowsByBarber[clipped.barberId].push(clipped);
}

function clipCalendarWindow(
    window: CalendarWorkingWindow,
    businessStartTime: string,
    businessEndTime: string,
) {
    const start = Math.max(clockToMinutes(window.startTime), clockToMinutes(businessStartTime));
    const end = Math.min(clockToMinutes(window.endTime), clockToMinutes(businessEndTime));

    if (start >= end) {
        return null;
    }

    return {
        ...window,
        startTime: minutesToClock(start),
        endTime: minutesToClock(end),
    };
}

function subtractCalendarWindow(
    window: CalendarWorkingWindow,
    removeStartTime: string,
    removeEndTime: string,
) {
    const start = clockToMinutes(window.startTime);
    const end = clockToMinutes(window.endTime);
    const removeStart = clockToMinutes(removeStartTime);
    const removeEnd = clockToMinutes(removeEndTime);

    if (removeStart >= end || removeEnd <= start) {
        return [window];
    }

    const parts: CalendarWorkingWindow[] = [];
    if (removeStart > start) {
        parts.push({ ...window, endTime: minutesToClock(Math.min(removeStart, end)) });
    }
    if (removeEnd < end) {
        parts.push({ ...window, startTime: minutesToClock(Math.max(removeEnd, start)) });
    }

    return parts;
}

function normalizeCalendarWindows(windows: CalendarWorkingWindow[]) {
    const sorted = [...windows]
        .filter((window) => clockToMinutes(window.startTime) < clockToMinutes(window.endTime))
        .sort((a, b) => clockToMinutes(a.startTime) - clockToMinutes(b.startTime));
    const normalized: CalendarWorkingWindow[] = [];

    for (const window of sorted) {
        const previous = normalized[normalized.length - 1];
        if (
            previous &&
            previous.barberId === window.barberId &&
            previous.locationId === window.locationId &&
            previous.source === window.source &&
            clockToMinutes(window.startTime) <= clockToMinutes(previous.endTime)
        ) {
            previous.endTime = minutesToClock(Math.max(clockToMinutes(previous.endTime), clockToMinutes(window.endTime)));
        } else {
            normalized.push({ ...window });
        }
    }

    return normalized;
}

function localClockMinutesFromUtc(value: string) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).formatToParts(new Date(value));
    const hour = Number(parts.find((part) => part.type === "hour")?.value ?? 0);
    const minute = Number(parts.find((part) => part.type === "minute")?.value ?? 0);

    return hour * 60 + minute;
}

function clockToMinutes(time: string) {
    const [hour, minute] = time.split(":").map(Number);
    return hour * 60 + minute;
}

function looseClockToMinutes(time: string) {
    if (!/^\d{2}:\d{2}$/.test(time)) {
        return null;
    }

    const [hour, minute] = time.split(":").map(Number);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        return null;
    }

    return hour * 60 + minute;
}

function scheduleClockToMinutes(time: string) {
    if (!/^\d{2}:\d{2}$/.test(time)) {
        return null;
    }

    const [hour, minute] = time.split(":").map(Number);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || minute % 15 !== 0) {
        return null;
    }

    return hour * 60 + minute;
}

function minutesToClock(totalMinutes: number) {
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;

    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function clampScheduleMinutes(minutes: number) {
    return Math.max(0, Math.min(23 * 60 + 45, minutes));
}

function fitWindowStartMinutes(startTime: string, durationMinutes: number) {
    const startMinutes = looseClockToMinutes(startTime) ?? 0;
    const latestStartMinutes = Math.max(0, 23 * 60 + 45 - Math.max(15, durationMinutes));
    return Math.max(0, Math.min(latestStartMinutes, startMinutes));
}

function normalizedDayOfWeek(dayOfWeek: number) {
    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
        return null;
    }

    return dayOfWeek;
}

function createWeeklyScheduleDraftWindowId(dayOfWeek: number) {
    return `day-${dayOfWeek}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function cloneWeeklyScheduleDraft(draft: WeeklyScheduleDraft): WeeklyScheduleDraft {
    return {
        ...draft,
        sourceShiftIds: [...draft.sourceShiftIds],
        days: draft.days.map((day) => ({
            ...day,
            windows: day.windows.map((window) => ({ ...window })),
        })),
    };
}

function findWeeklyScheduleWindow(draft: WeeklyScheduleDraft, windowDraftId: string) {
    for (const day of draft.days) {
        const windowIndex = day.windows.findIndex((window) => window.draftId === windowDraftId);
        if (windowIndex >= 0) {
            return {
                day,
                window: day.windows[windowIndex],
                windowIndex,
            };
        }
    }

    return null;
}

function validWindowDurationMinutes(window: Pick<ShiftWindowDraft, "startTime" | "endTime">) {
    const startMinutes = scheduleClockToMinutes(window.startTime);
    const endMinutes = scheduleClockToMinutes(window.endTime);
    if (startMinutes === null || endMinutes === null || endMinutes <= startMinutes) {
        return null;
    }

    return endMinutes - startMinutes;
}

function compareShiftWindowDrafts(left: ShiftWindowDraft, right: ShiftWindowDraft) {
    return left.startTime.localeCompare(right.startTime) || left.endTime.localeCompare(right.endTime) || left.draftId.localeCompare(right.draftId);
}

function getServiceCategoryTone(categoryNames: string[]) {
    const tones = new Set(
        categoryNames
            .map((category) => category.toLowerCase())
            .map((category) => {
                if (category.includes("women")) return "women";
                if (category.includes("boy")) return "boys";
                if (category.includes("men")) return "men";
                return null;
            })
            .filter((tone): tone is "men" | "women" | "boys" => Boolean(tone)),
    );

    if (tones.size > 1) return "mixed";
    return tones.values().next().value as "men" | "women" | "boys" | undefined;
}

// ============================================================================
// Team Week grid — day resolution, weekly totals, cover plans, "coming up".
//
// These pure helpers mirror the override semantics in
// src/server/availability/availability-engine.ts (what public booking sees) by
// reusing the tested buildCalendarWorkingWindows resolver per location, so the
// grid never shows a barber as off while the engine still sells them - the
// booking-safety direction proven by engine-parity.test.ts. The reverse can
// legitimately differ: confirmed bookings and partial blocks leave the engine
// with fewer bookable slots than the grid's working window shows.
// ============================================================================

export interface ResolvedDayWindow {
    locationId: string;
    startTime: string;
    endTime: string;
}

export type BarberDayBadgeTone = "cover" | "hours" | "late" | "off";

export interface BarberDayBadge {
    text: string;
    tone: BarberDayBadgeTone;
}

export type BarberDayProvenance = "normal" | "changed" | "off";

export interface ResolvedBarberDay {
    date: string;
    weekday: number;
    working: boolean;
    changed: boolean;
    provenance: BarberDayProvenance;
    windows: ResolvedDayWindow[];
    baselineWindows: ResolvedDayWindow[];
    offReason?: string;
    hasPartialBlock?: boolean;
    partialBlockLabel?: string;
    partialBlockWindows?: Array<{ startMinutes: number; endMinutes: number }>;
    badge?: BarberDayBadge;
    tooltip?: string;
}

/** Monday of the week containing `localDate` (Mon-start per weeklyScheduleDisplayOrder). */
export function startOfWeekLocalDate(localDate: string) {
    const offset = (localDateWeekday(localDate) + 6) % 7;
    return addDaysToLocalDate(localDate, -offset);
}

/** The 7 real dates (Mon..Sun) of the week containing `localDate`. */
export function weekDatesFromLocalDate(localDate: string) {
    const start = startOfWeekLocalDate(localDate);
    return Array.from({ length: 7 }, (_, index) => addDaysToLocalDate(start, index));
}

/** "Jul 6 – 12, 2026" (collapses shared month/year). */
export function formatWeekRangeLabel(dates: string[]) {
    if (dates.length === 0) {
        return "";
    }

    const firstDate = dates[0];
    const lastDate = dates[dates.length - 1];
    const start = parseLocalDate(firstDate);
    const end = parseLocalDate(lastDate);
    const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
    const sameMonth = sameYear && start.getUTCMonth() === end.getUTCMonth();

    if (sameMonth) {
        return `${formatLocalDateLabel(firstDate)} – ${end.getUTCDate()}, ${end.getUTCFullYear()}`;
    }

    if (sameYear) {
        return `${formatLocalDateLabel(firstDate)} – ${formatLocalDateLabel(lastDate)}, ${end.getUTCFullYear()}`;
    }

    return `${formatLocalDateLabel(firstDate, { year: true })} – ${formatLocalDateLabel(lastDate, { year: true })}`;
}

/** "Sat Jul 11". Returns "" for an empty/invalid date so a half-typed dialog
 *  field never throws through Intl and unmounts the admin (no ErrorBoundary).
 *  Round-trips the parsed date so overflow inputs (2026-13-99) are rejected too. */
export function formatDayNameDate(localDate: string) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(localDate)) {
        return "";
    }
    const parsed = parseLocalDate(localDate);
    if (Number.isNaN(parsed.getTime())) {
        return "";
    }
    const roundTrip = `${parsed.getUTCFullYear()}-${String(parsed.getUTCMonth() + 1).padStart(2, "0")}-${String(parsed.getUTCDate()).padStart(2, "0")}`;
    if (roundTrip !== localDate) {
        return "";
    }
    const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short" }).format(parsed);
    return `${weekday} ${formatLocalDateLabel(localDate)}`;
}

/** "Sat Jul 11" for a single day, else "Jul 8–13" / "Jul 30 – Aug 2". */
export function formatDateRangeLabel(startDate: string, endDate: string) {
    if (startDate === endDate) {
        return formatDayNameDate(startDate);
    }

    const start = parseLocalDate(startDate);
    const end = parseLocalDate(endDate);
    const sameMonth = start.getUTCFullYear() === end.getUTCFullYear() && start.getUTCMonth() === end.getUTCMonth();

    if (sameMonth) {
        return `${formatLocalDateLabel(startDate)}–${end.getUTCDate()}`;
    }

    return `${formatLocalDateLabel(startDate)} – ${formatLocalDateLabel(endDate)}`;
}

/** "10:00 AM–9:00 PM" — 12-hour range for humane dialog microcopy. */
export function formatClockRange12(startTime: string, endTime: string) {
    return `${formatLocalClockTime(startTime)}–${formatLocalClockTime(endTime)}`;
}

/** "12:00–2:00 PM" when both ends share a meridiem, else "10:00 AM–7:00 PM". */
export function formatClockRangeCompact12(startTime: string, endTime: string) {
    const start = formatLocalClockTime(startTime);
    const end = formatLocalClockTime(endTime);
    if (start.slice(-2) === end.slice(-2)) {
        return `${start.slice(0, -3)}–${end}`;
    }
    return `${start}–${end}`;
}

/**
 * Resolves one barber's real working windows on one dated day, applying shift
 * overrides with the SAME semantics as the availability engine, plus an overlay
 * that treats an all-day barber blocked time as Off. Also reports provenance and
 * a badge describing how the day differs from the recurring baseline.
 */
export function resolveBarberDay(
    schedule: Pick<AdminSchedule, "shifts" | "shiftOverrides" | "blockedTimes" | "locations">,
    barberId: string,
    date: string,
): ResolvedBarberDay {
    const weekday = localDateWeekday(date);
    const baselineWindows = mergeResolvedDayWindows(
        schedule.shifts
            .filter(
                (shift) =>
                    shift.active &&
                    shift.barberId === barberId &&
                    shift.dayOfWeek === weekday &&
                    shiftEffectiveOnDate(shift, date),
            )
            .map((shift) => ({ locationId: shift.locationId, startTime: shift.startTime, endTime: shift.endTime })),
    );

    const resolvedRaw: ResolvedDayWindow[] = [];
    for (const location of schedule.locations) {
        const windowsByBarber = buildCalendarWorkingWindows({ schedule, selectedDate: date, locationId: location.id });
        for (const window of windowsByBarber[barberId] ?? []) {
            resolvedRaw.push({ locationId: location.id, startTime: window.startTime, endTime: window.endTime });
        }
    }
    let windows = mergeResolvedDayWindows(resolvedRaw);

    // All-day blocked times close the day the same way the availability engine
    // does — mirror blockedTimeApplies across business/location/barber scopes so
    // the grid never shows a bookable window that booking has actually blocked.
    const allDayBlocks = schedule.blockedTimes.filter((blockedTime) =>
        blockedTimeCoversLocalDate(blockedTime, date),
    );
    const offBlocks: Array<Pick<AdminBlockedTime, "reason">> = [];
    if (allDayBlocks.length > 0) {
        windows = windows.filter((window) => {
            const covering = allDayBlocks.find((block) =>
                blockedTimeAppliesToBarberLocation(block, barberId, window.locationId),
            );
            if (covering) {
                offBlocks.push(covering);
                return false;
            }
            return true;
        });
    }

    // Partial-day blocks don't change the windows, but the admin must not be
    // lied to: note any (of any scope, engine semantics) that overlap a window
    // the barber is still working that date.
    const partialBlockRanges = new Set<string>();
    const partialBlockWindows: Array<{ startMinutes: number; endMinutes: number }> = [];
    for (const blockedTime of schedule.blockedTimes) {
        if (blockedTimeCoversLocalDate(blockedTime, date)) {
            continue;
        }
        const interval = blockedTimeLocalInterval(blockedTime, date);
        if (!interval) {
            continue;
        }
        const overlapsWorking = windows.some(
            (window) =>
                blockedTimeAppliesToBarberLocation(blockedTime, barberId, window.locationId) &&
                clockToMinutes(window.startTime) < interval.endMinutes &&
                clockToMinutes(window.endTime) > interval.startMinutes,
        );
        if (overlapsWorking) {
            const rangeKey = `${minutesToClock(interval.startMinutes)}–${minutesToClock(interval.endMinutes)}`;
            if (!partialBlockRanges.has(rangeKey)) {
                partialBlockWindows.push({ startMinutes: interval.startMinutes, endMinutes: interval.endMinutes });
            }
            partialBlockRanges.add(rangeKey);
        }
    }
    partialBlockWindows.sort((a, b) => a.startMinutes - b.startMinutes || a.endMinutes - b.endMinutes);
    const hasPartialBlock = partialBlockWindows.length > 0;
    // 12-hour label for the tooltip/menu, consistent with the grid's Busy chip.
    const partialBlockLabel = hasPartialBlock ? partialBlockLabel12({ partialBlockWindows }) : undefined;

    if (windows.length > 0) {
        if (resolvedDayWindowsEqual(windows, baselineWindows)) {
            return {
                date,
                weekday,
                working: true,
                changed: false,
                provenance: "normal",
                windows,
                baselineWindows,
                hasPartialBlock,
                partialBlockLabel,
                partialBlockWindows: hasPartialBlock ? partialBlockWindows : undefined,
                tooltip: partialBlockLabel,
            };
        }

        return {
            date,
            weekday,
            working: true,
            changed: true,
            provenance: "changed",
            windows,
            baselineWindows,
            hasPartialBlock,
            partialBlockLabel,
            partialBlockWindows: hasPartialBlock ? partialBlockWindows : undefined,
            badge: deriveWorkingBadge(windows, baselineWindows),
            tooltip: `Changed for this day — normally ${describeBaselineWindows(schedule, baselineWindows)}.${partialBlockLabel ? ` ${partialBlockLabel}.` : ""}`,
        };
    }

    if (baselineWindows.length === 0) {
        return { date, weekday, working: false, changed: false, provenance: "normal", windows: [], baselineWindows };
    }

    const offReason = resolveOffReason(schedule, barberId, date, offBlocks);
    return {
        date,
        weekday,
        working: false,
        changed: true,
        provenance: "off",
        windows: [],
        baselineWindows,
        offReason,
        badge: { text: offReason ? `Off · ${offReason}` : "Off", tone: "off" },
        tooltip: `Off${offReason ? ` — ${offReason}` : ""}. Normally ${describeBaselineWindows(schedule, baselineWindows)}. Customers can't book this day.`,
    };
}

/** Total working minutes across the given dates, from each day's resolved windows. */
export function resolveBarberWeekMinutes(
    schedule: Pick<AdminSchedule, "shifts" | "shiftOverrides" | "blockedTimes" | "locations">,
    barberId: string,
    dates: string[],
) {
    return dates.reduce((total, date) => {
        const day = resolveBarberDay(schedule, barberId, date);
        return (
            total +
            day.windows.reduce(
                (sum, window) => sum + Math.max(0, clockToMinutes(window.endTime) - clockToMinutes(window.startTime)),
                0,
            )
        );
    }, 0);
}

/** "40h" / "37h 30m" */
export function formatWeekHoursLabel(totalMinutes: number) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return minutes ? `${hours}h ${minutes}m` : `${hours}h`;
}

export interface CoverPlanInput {
    barberId: string;
    coverLocationId: string;
    fromDate: string;
    toDate: string;
    startTime?: string;
    endTime?: string;
}

export interface CoverPlan {
    payloads: AdminDayShiftReplacePayload[];
    coveredDates: string[];
    skippedDates: string[];
}

/**
 * A range of day-shift replacements that move a barber to `coverLocationId`:
 * for each date, book the cover location (same baseline hours unless explicit
 * hours are given) and clear each home location that has a shift that day.
 * Days with no baseline are skipped unless explicit hours are provided.
 */
export function buildCoverPlan(schedule: Pick<AdminSchedule, "shifts">, input: CoverPlanInput): CoverPlan {
    const payloads: AdminDayShiftReplacePayload[] = [];
    const coveredDates: string[] = [];
    const skippedDates: string[] = [];
    const explicitHours = Boolean(input.startTime && input.endTime);

    if (!input.fromDate || !input.toDate || input.fromDate > input.toDate) {
        return { payloads, coveredDates, skippedDates };
    }

    for (let date = input.fromDate; date <= input.toDate; date = addDaysToLocalDate(date, 1)) {
        const baselineByLocation = baselineWindowsByLocation(schedule, input.barberId, date);
        if (baselineByLocation.size === 0 && !explicitHours) {
            skippedDates.push(date);
            continue;
        }

        const coverWindows =
            explicitHours && input.startTime && input.endTime
                ? [{ startTime: input.startTime, endTime: input.endTime }]
                : mergedTimesFromLocationMap(baselineByLocation);

        // Clear each home location FIRST, then add the cover location LAST: an
        // interruption between the two must never leave the barber bookable at
        // both places on the same date.
        for (const [locationId, windows] of baselineByLocation) {
            if (locationId !== input.coverLocationId && windows.length > 0) {
                payloads.push({ barberId: input.barberId, locationId, date, windows: [] });
            }
        }

        payloads.push({ barberId: input.barberId, locationId: input.coverLocationId, date, windows: coverWindows });

        coveredDates.push(date);
    }

    return { payloads, coveredDates, skippedDates };
}

export interface TimeOffWriteDay {
    date: string;
    deleteOverrideIds: string[];
    createNotWorking: boolean;
}

/**
 * Per-date plan for marking a barber off: delete EVERY existing override on that
 * date before creating the barber-wide not_working, so a pre-existing add/remove
 * (cover or day-edit) can never be re-applied after the not_working and re-open
 * booking. A date already cleanly off (only barber-wide not_working overrides)
 * is skipped so we don't churn redundant writes.
 */
export function buildTimeOffWritePlan(
    schedule: Pick<AdminSchedule, "shiftOverrides">,
    barberId: string,
    dates: string[],
): TimeOffWriteDay[] {
    return dates.map((date) => {
        const dayOverrides = schedule.shiftOverrides.filter(
            (override) => override.barberId === barberId && override.overrideDate === date,
        );
        const alreadyOff =
            dayOverrides.length > 0 &&
            dayOverrides.every(
                (override) => override.overrideType === "not_working" && override.locationId === null,
            );
        return {
            date,
            deleteOverrideIds: alreadyOff ? [] : dayOverrides.map((override) => override.id),
            createNotWorking: !alreadyOff,
        };
    });
}

export type ComingUpKind = "cover" | "off" | "hours";

export interface ComingUpGroup {
    barberId: string;
    barberName: string;
    kind: ComingUpKind;
    tone: BarberDayBadgeTone;
    startDate: string;
    endDate: string;
    dates: string[];
    overrideIds: string[];
    locationId?: string;
    locationName?: string;
    reason?: string;
    windows: ResolvedDayWindow[];
    backToWorkDate?: string;
    backToWorkLocationName?: string;
    sentence: string;
}

interface ComingUpDraftGroup {
    key: string;
    kind: ComingUpKind;
    tone: BarberDayBadgeTone;
    startDate: string;
    endDate: string;
    dates: string[];
    overrideIds: string[];
    windows: ResolvedDayWindow[];
    reason?: string;
    locationId?: string;
}

/**
 * Groups each barber's current/future override days into human ranges with a
 * plain-sentence summary and the override ids to remove. Consecutive same-shape
 * days bridge over days the barber is normally off, but a normal working day in
 * the gap (or a different shape) splits the group.
 */
export function buildComingUp(
    schedule: Pick<AdminSchedule, "shifts" | "shiftOverrides" | "blockedTimes" | "locations">,
    barbers: Array<Pick<AdminBarberOption, "id" | "displayName" | "locationIds">>,
    fromDate: string,
    horizonDate?: string,
): ComingUpGroup[] {
    const groups: ComingUpGroup[] = [];

    for (const barber of barbers) {
        const overrideDates = Array.from(
            new Set(
                schedule.shiftOverrides
                    .filter(
                        (override) =>
                            override.barberId === barber.id &&
                            override.overrideDate >= fromDate &&
                            (!horizonDate || override.overrideDate <= horizonDate),
                    )
                    .map((override) => override.overrideDate),
            ),
        ).sort();

        let current: ComingUpDraftGroup | null = null;
        const flush = () => {
            if (current) {
                groups.push(finalizeComingUpGroup(schedule, barber, current));
                current = null;
            }
        };

        for (const date of overrideDates) {
            const resolved = resolveBarberDay(schedule, barber.id, date);
            if (!resolved.changed) {
                flush();
                continue;
            }

            const shape = comingUpShape(resolved);
            const overrideIds = schedule.shiftOverrides
                .filter((override) => override.barberId === barber.id && override.overrideDate === date)
                .map((override) => override.id);

            if (current && current.key === shape.key && bridgeableCoverGap(schedule, barber.id, current.endDate, date)) {
                current.endDate = date;
                current.dates.push(date);
                current.overrideIds.push(...overrideIds);
            } else {
                flush();
                current = {
                    key: shape.key,
                    kind: shape.kind,
                    tone: shape.tone,
                    startDate: date,
                    endDate: date,
                    dates: [date],
                    overrideIds: [...overrideIds],
                    windows: resolved.windows,
                    reason: resolved.offReason,
                    locationId: shape.locationId,
                };
            }
        }

        flush();
    }

    return groups.sort(
        (a, b) => a.startDate.localeCompare(b.startDate) || a.barberName.localeCompare(b.barberName),
    );
}

export function describeDayEditResult(params: {
    barberName: string;
    date: string;
    locationName: string;
    windows: Array<{ startTime: string; endTime: string }>;
    baselineWindows: ResolvedDayWindow[];
}) {
    const dayLabel = formatDayNameDate(params.date);
    const baselineLabel = params.baselineWindows.length
        ? params.baselineWindows.map((window) => formatClockRange12(window.startTime, window.endTime)).join(", ")
        : "a day off";

    if (params.windows.length === 0) {
        return `Just ${dayLabel}: ${params.barberName} is off — instead of ${baselineLabel}.`;
    }

    const desired = params.windows.map((window) => formatClockRange12(window.startTime, window.endTime)).join(", ");
    return `Just ${dayLabel}: ${params.barberName} works ${desired} at ${params.locationName} — instead of ${baselineLabel}.`;
}

export function describeTimeOffResult(params: {
    barberName: string;
    fromDate: string;
    toDate: string;
    reason?: string;
}) {
    const range = formatDateRangeLabel(params.fromDate, params.toDate);
    const reasonSuffix = params.reason?.trim() ? ` (${params.reason.trim()})` : "";
    const dayScope = params.fromDate === params.toDate ? "this day" : "these days";
    return `${params.barberName} is off ${range}${reasonSuffix}. Customers can't book ${dayScope}.`;
}

export function describeCoverResult(params: {
    barberName: string;
    coverLocationName: string;
    fromDate: string;
    toDate: string;
    homeLocationName?: string;
    hoursLabel?: string;
    coveredCount: number;
}) {
    if (params.coveredCount === 0) {
        return `${params.barberName} has no working days in this range to cover.`;
    }

    const range = formatDateRangeLabel(params.fromDate, params.toDate);
    const hours = params.hoursLabel ? ` (${params.hoursLabel})` : "";
    const back = params.homeLocationName ? `, then back at ${params.homeLocationName}` : "";
    return `${params.barberName} covers ${params.coverLocationName} ${range}${hours}${back}.`;
}

function shiftEffectiveOnDate(shift: AdminShift, date: string) {
    return (!shift.effectiveFrom || shift.effectiveFrom <= date) && (!shift.effectiveTo || shift.effectiveTo >= date);
}

function mergeResolvedDayWindows(windows: ResolvedDayWindow[]): ResolvedDayWindow[] {
    const byLocation = new Map<string, ResolvedDayWindow[]>();
    for (const window of windows) {
        if (clockToMinutes(window.startTime) >= clockToMinutes(window.endTime)) {
            continue;
        }
        byLocation.set(window.locationId, [...(byLocation.get(window.locationId) ?? []), window]);
    }

    const merged: ResolvedDayWindow[] = [];
    for (const [locationId, locationWindows] of byLocation) {
        const sorted = [...locationWindows].sort((a, b) => clockToMinutes(a.startTime) - clockToMinutes(b.startTime));
        const locationMerged: ResolvedDayWindow[] = [];
        for (const window of sorted) {
            const last = locationMerged[locationMerged.length - 1];
            if (last && clockToMinutes(window.startTime) <= clockToMinutes(last.endTime)) {
                last.endTime = minutesToClock(Math.max(clockToMinutes(last.endTime), clockToMinutes(window.endTime)));
            } else {
                locationMerged.push({ locationId, startTime: window.startTime, endTime: window.endTime });
            }
        }
        merged.push(...locationMerged);
    }

    return merged.sort(
        (a, b) => clockToMinutes(a.startTime) - clockToMinutes(b.startTime) || a.locationId.localeCompare(b.locationId),
    );
}

function resolvedDayWindowsEqual(a: ResolvedDayWindow[], b: ResolvedDayWindow[]) {
    if (a.length !== b.length) {
        return false;
    }
    const key = (window: ResolvedDayWindow) => `${window.locationId}|${window.startTime}|${window.endTime}`;
    const keysB = new Set(b.map(key));
    return a.every((window) => keysB.has(key(window)));
}

function deriveWorkingBadge(windows: ResolvedDayWindow[], baseline: ResolvedDayWindow[]): BarberDayBadge {
    if (baseline.length === 0) {
        return { text: "Changed", tone: "hours" };
    }

    const baselineLocations = new Set(baseline.map((window) => window.locationId));
    const resolvedLocations = new Set(windows.map((window) => window.locationId));
    if (!setsEqual(baselineLocations, resolvedLocations)) {
        return { text: "Covering", tone: "cover" };
    }

    const resolvedEnd = Math.max(...windows.map((window) => clockToMinutes(window.endTime)));
    const baselineEnd = Math.max(...baseline.map((window) => clockToMinutes(window.endTime)));
    return resolvedEnd > baselineEnd ? { text: "Late", tone: "late" } : { text: "Changed", tone: "hours" };
}

function setsEqual(a: Set<string>, b: Set<string>) {
    if (a.size !== b.size) {
        return false;
    }
    for (const value of a) {
        if (!b.has(value)) {
            return false;
        }
    }
    return true;
}

function describeBaselineWindows(schedule: Pick<AdminSchedule, "locations">, windows: ResolvedDayWindow[]) {
    if (windows.length === 0) {
        return "a day off";
    }
    return windows
        .map((window) => `${formatClockRange12(window.startTime, window.endTime)} at ${scheduleLocationName(schedule, window.locationId)}`)
        .join(", ");
}

function scheduleLocationName(schedule: Pick<AdminSchedule, "locations">, locationId: string) {
    const name = schedule.locations.find((location) => location.id === locationId)?.name ?? "Location";
    return name.replace(/^Leaside Fades\s+/i, "");
}

function resolveOffReason(
    schedule: Pick<AdminSchedule, "shiftOverrides">,
    barberId: string,
    date: string,
    dayBlocks: Array<Pick<AdminBlockedTime, "reason">>,
): string | undefined {
    const notWorking = schedule.shiftOverrides.find(
        (override) =>
            override.barberId === barberId &&
            override.overrideDate === date &&
            override.overrideType === "not_working",
    );
    if (notWorking) {
        return notWorking.reason?.trim() || "Time off";
    }
    if (dayBlocks.length > 0) {
        return dayBlocks[0].reason?.trim() || "Time off";
    }
    return undefined;
}

function blockedTimeCoversLocalDate(blockedTime: Pick<AdminBlockedTime, "startTime" | "endTime">, date: string) {
    const startLocalDate = formatLocalDate(new Date(blockedTime.startTime));
    const endLocalDate = formatLocalDate(new Date(blockedTime.endTime));
    return (
        localClockFromIso(blockedTime.startTime) === "00:00" &&
        localClockFromIso(blockedTime.endTime) === "00:00" &&
        startLocalDate <= date &&
        date < endLocalDate
    );
}

/** Mirror of the engine's blockedTimeApplies (availability-engine.ts): business
 * blocks everyone, location blocks its own location, barber blocks that barber
 * (barber-wide when locationId is null, else only the matching location). */
function blockedTimeAppliesToBarberLocation(
    blockedTime: Pick<AdminBlockedTime, "scope" | "barberId" | "locationId">,
    barberId: string,
    locationId: string,
) {
    if (blockedTime.scope === "business") {
        return true;
    }
    if (blockedTime.scope === "location") {
        return blockedTime.locationId === locationId;
    }
    return blockedTime.barberId === barberId && (!blockedTime.locationId || blockedTime.locationId === locationId);
}

/** Local-clock minute span a blocked time occupies on `date`, clamped to the
 * day (00:00–24:00) for multi-day blocks. Null when it doesn't touch the date. */
function blockedTimeLocalInterval(
    blockedTime: Pick<AdminBlockedTime, "startTime" | "endTime">,
    date: string,
): { startMinutes: number; endMinutes: number } | null {
    const startLocalDate = formatLocalDate(new Date(blockedTime.startTime));
    const endLocalDate = formatLocalDate(new Date(blockedTime.endTime));
    if (date < startLocalDate || date > endLocalDate) {
        return null;
    }
    const startMinutes = date === startLocalDate ? localClockMinutesFromUtc(blockedTime.startTime) : 0;
    const endMinutes = date === endLocalDate ? localClockMinutesFromUtc(blockedTime.endTime) : 24 * 60;
    if (endMinutes <= startMinutes) {
        return null;
    }
    return { startMinutes, endMinutes };
}

function localClockFromIso(value: string | Date) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).format(typeof value === "string" ? new Date(value) : value);
}

function baselineWindowsByLocation(schedule: Pick<AdminSchedule, "shifts">, barberId: string, date: string) {
    const weekday = localDateWeekday(date);
    const merged = mergeResolvedDayWindows(
        schedule.shifts
            .filter(
                (shift) =>
                    shift.active &&
                    shift.barberId === barberId &&
                    shift.dayOfWeek === weekday &&
                    shiftEffectiveOnDate(shift, date),
            )
            .map((shift) => ({ locationId: shift.locationId, startTime: shift.startTime, endTime: shift.endTime })),
    );

    const map = new Map<string, Array<{ startTime: string; endTime: string }>>();
    for (const window of merged) {
        map.set(window.locationId, [
            ...(map.get(window.locationId) ?? []),
            { startTime: window.startTime, endTime: window.endTime },
        ]);
    }
    return map;
}

function mergedTimesFromLocationMap(map: Map<string, Array<{ startTime: string; endTime: string }>>) {
    const timeWindows = [...map.values()]
        .flat()
        .sort((a, b) => clockToMinutes(a.startTime) - clockToMinutes(b.startTime));
    const merged: Array<{ startTime: string; endTime: string }> = [];
    for (const window of timeWindows) {
        const last = merged[merged.length - 1];
        if (last && clockToMinutes(window.startTime) <= clockToMinutes(last.endTime)) {
            last.endTime = minutesToClock(Math.max(clockToMinutes(last.endTime), clockToMinutes(window.endTime)));
        } else {
            merged.push({ ...window });
        }
    }
    return merged;
}

function comingUpShape(resolved: ResolvedBarberDay): {
    key: string;
    kind: ComingUpKind;
    tone: BarberDayBadgeTone;
    locationId?: string;
} {
    if (resolved.provenance === "off") {
        return { key: `off|${resolved.offReason ?? ""}`, kind: "off", tone: "off" };
    }

    const locationsKey = resolved.windows.map((window) => window.locationId).sort().join(",");
    const timesKey = resolved.windows
        .map((window) => `${window.startTime}-${window.endTime}@${window.locationId}`)
        .sort()
        .join("|");
    const isCover = resolved.badge?.tone === "cover";

    return {
        key: `${isCover ? "cover" : "hours"}|${locationsKey}|${timesKey}`,
        kind: isCover ? "cover" : "hours",
        tone: resolved.badge?.tone ?? "hours",
        locationId: resolved.windows[0]?.locationId,
    };
}

function bridgeableCoverGap(
    schedule: Pick<AdminSchedule, "shifts">,
    barberId: string,
    previousEndDate: string,
    date: string,
) {
    let cursor = addDaysToLocalDate(previousEndDate, 1);
    while (cursor < date) {
        if (baselineWindowsByLocation(schedule, barberId, cursor).size > 0) {
            return false;
        }
        cursor = addDaysToLocalDate(cursor, 1);
    }
    return true;
}

function finalizeComingUpGroup(
    schedule: Pick<AdminSchedule, "shifts" | "shiftOverrides" | "blockedTimes" | "locations">,
    barber: Pick<AdminBarberOption, "id" | "displayName" | "locationIds">,
    group: ComingUpDraftGroup,
): ComingUpGroup {
    const locationName = group.locationId ? scheduleLocationName(schedule, group.locationId) : undefined;
    let backToWorkDate: string | undefined;
    let backToWorkLocationName: string | undefined;

    if (group.kind === "cover") {
        let cursor = addDaysToLocalDate(group.endDate, 1);
        for (let index = 0; index < 21; index += 1) {
            // Resolve the ACTUAL day (overrides + blocks included), not just the
            // recurring baseline — "back at Eglinton Thu" must not name a day the
            // barber has time off on. The baseline map still names the home
            // location when it exists; otherwise use where they really work.
            const resolved = resolveBarberDay(schedule, barber.id, cursor);
            if (resolved.working && resolved.windows.length > 0) {
                const map = baselineWindowsByLocation(schedule, barber.id, cursor);
                backToWorkDate = cursor;
                backToWorkLocationName = scheduleLocationName(
                    schedule,
                    map.size > 0 ? homeLocationFromMap(map, barber) : resolved.windows[0].locationId,
                );
                break;
            }
            cursor = addDaysToLocalDate(cursor, 1);
        }
    }

    const sentence = buildComingUpSentence(barber.displayName, group, locationName, backToWorkDate, backToWorkLocationName);

    return {
        barberId: barber.id,
        barberName: barber.displayName,
        kind: group.kind,
        tone: group.tone,
        startDate: group.startDate,
        endDate: group.endDate,
        dates: group.dates,
        overrideIds: group.overrideIds,
        locationId: group.locationId,
        locationName,
        reason: group.reason,
        windows: group.windows,
        backToWorkDate,
        backToWorkLocationName,
        sentence,
    };
}

function homeLocationFromMap(
    map: Map<string, Array<{ startTime: string; endTime: string }>>,
    barber: Pick<AdminBarberOption, "locationIds">,
) {
    for (const locationId of map.keys()) {
        if (barber.locationIds.includes(locationId)) {
            return locationId;
        }
    }
    return map.keys().next().value ?? barber.locationIds[0] ?? "";
}

function buildComingUpSentence(
    barberName: string,
    group: ComingUpDraftGroup,
    locationName: string | undefined,
    backToWorkDate: string | undefined,
    backToWorkLocationName: string | undefined,
) {
    const rangeLabel = formatDateRangeLabel(group.startDate, group.endDate);

    if (group.kind === "cover") {
        const back = backToWorkDate
            ? ` · back at ${backToWorkLocationName ?? "home"} ${formatDayNameDate(backToWorkDate)}`
            : "";
        return `${barberName} covering ${locationName ?? "another location"} · ${rangeLabel}${back}`;
    }

    if (group.kind === "off") {
        return `${barberName} off${group.reason ? ` · ${group.reason}` : ""} · ${rangeLabel} · customers can't book`;
    }

    const times = group.windows.map((window) => formatClockRange12(window.startTime, window.endTime)).join(", ");
    return `${barberName} · ${times} at ${locationName ?? "—"} · ${rangeLabel}`;
}

/** Formats weekday numbers into compact Mon-first ranges, e.g. [2,3,4,5,6] → "Tue–Sat", [1,0] → "Mon, Sun". */
function formatWeekdayRangeList(daysOfWeek: number[]): string {
    const present = new Set(daysOfWeek);
    const ranges: string[] = [];
    let runStart = -1;
    for (let index = 0; index <= weeklyScheduleDisplayOrder.length; index += 1) {
        const inRun = index < weeklyScheduleDisplayOrder.length && present.has(weeklyScheduleDisplayOrder[index]);
        if (inRun && runStart === -1) {
            runStart = index;
        } else if (!inRun && runStart !== -1) {
            const startDay = weeklyScheduleDisplayOrder[runStart];
            const endDay = weeklyScheduleDisplayOrder[index - 1];
            ranges.push(startDay === endDay
                ? weeklyScheduleDayLabels[startDay]
                : `${weeklyScheduleDayLabels[startDay]}–${weeklyScheduleDayLabels[endDay]}`);
            runStart = -1;
        }
    }
    return ranges.join(", ");
}

function joinWithAnd(parts: string[]): string {
    if (parts.length <= 1) {
        return parts[0] ?? "";
    }
    if (parts.length === 2) {
        return `${parts[0]} and ${parts[1]}`;
    }
    return `${parts.slice(0, -1).join(", ")}, and ${parts[parts.length - 1]}`;
}

/**
 * One-sentence plain-English summary of a weekly schedule draft, e.g. "Sam works
 * Tue–Sat, 10:00 AM–7:00 PM at Eglinton and is off Mon, Sun — every week from now
 * on." Groups days that share identical windows/location, lists weekday ranges
 * Mon-first with 12h times, and only names off days when some exist.
 */
export function describeWeeklyScheduleDraft(
    draft: WeeklyScheduleDraft,
    schedule: Pick<AdminSchedule, "locations">,
    barberName: string,
): string {
    const name = barberName.trim() || "This barber";
    const suffix = " — every week from now on.";
    const workingDays = draft.days.filter((day) => day.active && day.windows.length > 0);

    const groups = new Map<string, { days: number[]; windows: ShiftWindowDraft[] }>();
    for (const day of workingDays) {
        const sorted = [...day.windows].sort(
            (a, b) => a.startTime.localeCompare(b.startTime) || a.locationId.localeCompare(b.locationId),
        );
        const signature = sorted.map((window) => `${window.startTime}-${window.endTime}@${window.locationId}`).join("|");
        const existing = groups.get(signature);
        if (existing) {
            existing.days.push(day.dayOfWeek);
        } else {
            groups.set(signature, { days: [day.dayOfWeek], windows: sorted });
        }
    }

    if (groups.size === 0) {
        return `${name} isn't scheduled to work any day${suffix}`;
    }

    const workPhrases = [...groups.values()].map((group) => {
        const dayRange = formatWeekdayRangeList(group.days);
        const locationIds = Array.from(new Set(group.windows.map((window) => window.locationId)));
        const windowText = locationIds.length === 1
            ? `${group.windows.map((window) => formatClockRange12(window.startTime, window.endTime)).join(", ")} at ${scheduleLocationName(schedule, locationIds[0])}`
            : group.windows
                .map((window) => `${formatClockRange12(window.startTime, window.endTime)} at ${scheduleLocationName(schedule, window.locationId)}`)
                .join(", ");
        return `${dayRange}, ${windowText}`;
    });

    const workingDayNumbers = new Set(workingDays.map((day) => day.dayOfWeek));
    const offDays = weeklyScheduleDisplayOrder.filter((day) => !workingDayNumbers.has(day));
    const offText = offDays.length > 0 ? ` and is off ${formatWeekdayRangeList([...offDays])}` : "";

    return `${name} works ${joinWithAnd(workPhrases)}${offText}${suffix}`;
}

// ---------------------------------------------------------------------------
// Blocked time screen (Phase E): plain-language rows, grouping, dialog copy.
// Blocked time means "still at work, not bookable"; whole days away are Time off.
// ---------------------------------------------------------------------------

/** 12-hour label for a minutes-from-midnight instant; 1440 reads as "midnight". */
function formatMinutesLabel12(minutes: number) {
    if (minutes >= 24 * 60) {
        return "midnight";
    }
    return formatLocalClockTime(minutesToClock(minutes));
}

/** "12:00–2:00 PM" from a minutes range, collapsing a shared meridiem. */
function formatMinutesRangeCompact12(startMinutes: number, endMinutes: number) {
    const end = formatMinutesLabel12(endMinutes);
    if (end === "midnight") {
        return `${formatLocalClockTime(minutesToClock(startMinutes))}–midnight`;
    }
    return formatClockRangeCompact12(minutesToClock(startMinutes), minutesToClock(endMinutes));
}

/** "Busy 12:00–2:00 PM" (+" +1" when a day carries more than one partial block). */
export function busyChipLabel(day: Pick<ResolvedBarberDay, "partialBlockWindows">) {
    const blockWindows = day.partialBlockWindows ?? [];
    if (blockWindows.length === 0) {
        return undefined;
    }
    const first = blockWindows[0];
    const label = `Busy ${formatMinutesRangeCompact12(first.startMinutes, first.endMinutes)}`;
    return blockWindows.length > 1 ? `${label} +${blockWindows.length - 1}` : label;
}

/** "Busy 12:00–1:00 PM, 6:00–7:00 PM" — every partial block, 12-hour, for tooltips/menus. */
export function partialBlockLabel12(day: Pick<ResolvedBarberDay, "partialBlockWindows">) {
    const blockWindows = day.partialBlockWindows ?? [];
    if (blockWindows.length === 0) {
        return undefined;
    }
    return `Busy ${blockWindows.map((window) => formatMinutesRangeCompact12(window.startMinutes, window.endMinutes)).join(", ")}`;
}

export type BlockedTimeGroupKey = "past" | "today" | "week" | "upcoming";

export interface BlockedTimeRowView {
    blockedTime: AdminBlockedTime;
    scope: AdminBlockedTimeScope;
    barber?: AdminBarberOption;
    title: string;
    detail: string;
    locationLabel: string;
    locationId: string | null;
    canMutate: boolean;
}

export interface BlockedTimeGroupView {
    key: BlockedTimeGroupKey;
    heading: string;
    rows: BlockedTimeRowView[];
}

function blockedTimeLocalBounds(blockedTime: Pick<AdminBlockedTime, "startTime" | "endTime">) {
    const startDate = formatLocalDate(new Date(blockedTime.startTime));
    const endInstant = new Date(blockedTime.endTime);
    let endDate = formatLocalDate(endInstant);
    let endMinutes = localClockMinutesFromUtc(blockedTime.endTime);
    if (endMinutes === 0 && endDate > startDate) {
        endDate = addDaysToLocalDate(endDate, -1);
        endMinutes = 24 * 60;
    }
    return {
        startDate,
        endDate,
        startMinutes: localClockMinutesFromUtc(blockedTime.startTime),
        endMinutes,
    };
}

function blockedRangeText(bounds: ReturnType<typeof blockedTimeLocalBounds>) {
    const allDay = bounds.startDate === bounds.endDate && bounds.startMinutes === 0 && bounds.endMinutes === 24 * 60;
    if (allDay) {
        return `all day ${formatDayNameDate(bounds.startDate)}`;
    }
    if (bounds.startDate === bounds.endDate) {
        return `${formatClockRangeCompact12(minutesToClock(bounds.startMinutes), minutesToClock(Math.min(bounds.endMinutes, 24 * 60 - 1)))} on ${formatDayNameDate(bounds.startDate)}`;
    }
    return `from ${formatDayNameDate(bounds.startDate)}, ${formatLocalClockTime(minutesToClock(bounds.startMinutes))} to ${formatDayNameDate(bounds.endDate)}, ${formatLocalClockTime(minutesToClock(Math.min(bounds.endMinutes, 24 * 60 - 1)))}`;
}

function blockedRowTitle(
    schedule: Pick<AdminSchedule, "locations" | "barbers">,
    blockedTime: AdminBlockedTime,
    bounds: ReturnType<typeof blockedTimeLocalBounds>,
) {
    const rangeText = blockedRangeText(bounds);
    if (blockedTime.scope === "barber") {
        const name = schedule.barbers.find((barber) => barber.id === blockedTime.barberId)?.displayName ?? "This barber";
        return `${name.split(/\s+/)[0]} is busy ${rangeText}`;
    }
    if (blockedTime.scope === "location") {
        return `${scheduleLocationName(schedule, blockedTime.locationId ?? "")} takes no bookings ${rangeText}`;
    }
    return `The whole business takes no bookings ${rangeText}`;
}

/**
 * Groups blocked-time rows for the Blocked time screen: Past (only when the
 * fetched range includes finished rows), Today (anything still active today),
 * This week (Mon-start week, matching the Team Week grid), then Upcoming.
 */
export function buildBlockedTimeGroups(
    schedule: Pick<AdminSchedule, "blockedTimes" | "barbers" | "locations" | "shifts" | "shiftOverrides">,
    user: Pick<SafeAdminUser, "role" | "barberId">,
    today: string,
): BlockedTimeGroupView[] {
    const weekEnd = addDaysToLocalDate(startOfWeekLocalDate(today), 6);
    const groups: Record<BlockedTimeGroupKey, BlockedTimeRowView[]> = {
        past: [],
        today: [],
        week: [],
        upcoming: [],
    };

    const sorted = [...schedule.blockedTimes].sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );

    for (const blockedTime of sorted) {
        const bounds = blockedTimeLocalBounds(blockedTime);
        const canMutate =
            user.role === "owner" ||
            user.role === "admin" ||
            (blockedTime.scope === "barber" && blockedTime.barberId === user.barberId);

        let detail = bounds.startDate === bounds.endDate
            ? formatDayNameDate(bounds.startDate)
            : `${formatDayNameDate(bounds.startDate)} – ${formatDayNameDate(bounds.endDate)}`;
        if (blockedTime.reason?.trim()) {
            detail += ` · ${blockedTime.reason.trim()}`;
        }

        const barber = blockedTime.scope === "barber"
            ? schedule.barbers.find((candidate) => candidate.id === blockedTime.barberId)
            : undefined;
        if (barber && bounds.startDate === bounds.endDate) {
            const resolved = resolveBarberDay(schedule, barber.id, bounds.startDate);
            if (resolved.working && resolved.windows.length > 0) {
                detail += ` · still working ${resolved.windows
                    .map((window) => formatClockRangeCompact12(window.startTime, window.endTime))
                    .join(", ")}`;
            } else if (!resolved.working) {
                detail += " · not working this day";
            }
        }

        const locationLabel = blockedTime.scope === "business"
            ? "Both locations"
            : blockedTime.locationId
              ? scheduleLocationName(schedule, blockedTime.locationId)
              : "All assigned locations";

        const row: BlockedTimeRowView = {
            blockedTime,
            scope: blockedTime.scope,
            barber,
            title: blockedRowTitle(schedule, blockedTime, bounds),
            detail,
            locationLabel,
            locationId: blockedTime.locationId,
            canMutate,
        };

        if (bounds.endDate < today) {
            groups.past.push(row);
        } else if (bounds.startDate <= today) {
            groups.today.push(row);
        } else if (bounds.startDate <= weekEnd) {
            groups.week.push(row);
        } else {
            groups.upcoming.push(row);
        }
    }

    const views: BlockedTimeGroupView[] = [];
    if (groups.past.length > 0) {
        views.push({ key: "past", heading: "Past", rows: groups.past });
    }
    views.push({ key: "today", heading: `Today · ${formatDayNameDate(today)}`, rows: groups.today });
    views.push({ key: "week", heading: "This week", rows: groups.week });
    views.push({ key: "upcoming", heading: "Upcoming", rows: groups.upcoming });
    return views;
}

export interface BlockedTimeDraftInput {
    scope: AdminBlockedTimeScope;
    barberName?: string;
    locationName?: string;
    startDate: string;
    endDate: string;
    startTime: string;
    endTime: string;
    allDay: boolean;
    reason: string;
}

/** Live plain-language sentence for the blocked-time dialog. */
export function describeBlockedTimeDraft(input: BlockedTimeDraftInput) {
    const reasonSuffix = input.reason.trim() ? ` (${input.reason.trim()})` : "";
    let when: string;
    if (input.allDay) {
        when = `all day ${formatDayNameDate(input.startDate)}`;
    } else if (input.startDate === input.endDate) {
        when = `${formatClockRangeCompact12(input.startTime, input.endTime)} on ${formatDayNameDate(input.startDate)}`;
    } else {
        when = `from ${formatDayNameDate(input.startDate)}, ${formatLocalClockTime(input.startTime)} to ${formatDayNameDate(input.endDate)}, ${formatLocalClockTime(input.endTime)}`;
    }

    if (input.scope === "barber") {
        const first = (input.barberName ?? "This barber").split(/\s+/)[0];
        // A barber block pinned to one location only blocks them there — say so,
        // or the sentence overstates the block and invites a double-booking.
        if (input.locationName) {
            return `${first} is busy ${when} at ${input.locationName}${reasonSuffix} — customers can't book ${first} there then.`;
        }
        return `${first} is busy ${when}${reasonSuffix} — customers can't book ${first} then.`;
    }
    if (input.scope === "location") {
        return `${input.locationName ?? "This location"} takes no bookings ${when}${reasonSuffix} — no one there can take bookings then.`;
    }
    return `The whole business takes no bookings ${when}${reasonSuffix} — both locations.`;
}

/** Client-side sanity check for the blocked-time dialog; server stays the truth. */
export function validateBlockedTimeDraft(input: Pick<BlockedTimeDraftInput, "startDate" | "endDate" | "startTime" | "endTime" | "allDay">) {
    if (!input.startDate) {
        return "Pick a day.";
    }
    if (input.allDay) {
        return null;
    }
    if (!input.endDate) {
        return "Pick the last day.";
    }
    if (input.endDate < input.startDate) {
        return "The last day must be on or after the first day.";
    }
    if (input.startDate === input.endDate && input.endTime <= input.startTime) {
        return "The end time must be after the start time.";
    }
    return null;
}
