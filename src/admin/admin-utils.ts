import type {
    AdminBookingFilters,
    AdminBookingStatus,
    AdminBookingSummary,
    AdminDay,
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

function clockToMinutes(time: string) {
    const [hour, minute] = time.split(":").map(Number);
    return hour * 60 + minute;
}

function minutesToClock(totalMinutes: number) {
    const hour = Math.floor(totalMinutes / 60);
    const minute = totalMinutes % 60;

    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}
