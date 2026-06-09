import type {
    AdminBarberOption,
    AdminBookingFilters,
    AdminBookingStatus,
    AdminBookingSummary,
    AdminCalendarOptions,
    AdminDashboardActivity,
    AdminDashboardNotificationHealth,
    AdminDashboardPeriod,
    AdminDay,
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
    return new Intl.DateTimeFormat("en-CA", {
        timeZone,
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(typeof value === "string" ? new Date(value) : value);
}

export function formatLocalTime(value: string | Date) {
    return new Intl.DateTimeFormat("en-CA", {
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
    const shifts = selectCurrentWeeklyShiftPattern(schedule.shifts
        .filter((shift) => shift.active && shift.barberId === barberId)
        .sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.startTime.localeCompare(b.startTime)));
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
    const notWorkingBarbers = new Set(
        schedule.shiftOverrides
            .filter((override) => override.overrideDate === selectedDate && override.overrideType === "not_working")
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
    if (booking.source === "walk_in") return "walk_in";
    return "confirmed";
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

function minutesToClock(totalMinutes: number) {
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;

    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
