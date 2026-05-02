import type {
    AdminBarberOption,
    AdminBookingFilters,
    AdminBookingStatus,
    AdminBookingSummary,
    AdminCalendarOptions,
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
        .filter((item) => item.scheduled || item.offScheduleBookings.length > 0)
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
