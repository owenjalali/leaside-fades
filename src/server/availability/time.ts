const datePattern = /^\d{4}-\d{2}-\d{2}$/;
const timePattern = /^\d{2}:\d{2}$/;

export interface TimeWindow {
    start: Date;
    end: Date;
}

interface ZonedParts {
    year: number;
    month: number;
    day: number;
    hour: number;
    minute: number;
    second: number;
}

export function assertLocalDate(value: string) {
    if (!datePattern.test(value)) {
        throw new Error(`Expected local date in YYYY-MM-DD format, received "${value}".`);
    }
}

export function assertLocalTime(value: string) {
    if (!timePattern.test(value)) {
        throw new Error(`Expected local time in HH:mm format, received "${value}".`);
    }
}

export function addMinutes(date: Date, minutes: number) {
    return new Date(date.getTime() + minutes * 60_000);
}

export function localDateToDayOfWeek(localDate: string) {
    assertLocalDate(localDate);
    const [year, month, day] = localDate.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function localDateDifferenceInDays(fromLocalDate: string, toLocalDate: string) {
    assertLocalDate(fromLocalDate);
    assertLocalDate(toLocalDate);
    const from = parseLocalDateAsUtcMidnight(fromLocalDate);
    const to = parseLocalDateAsUtcMidnight(toLocalDate);
    return Math.round((to.getTime() - from.getTime()) / 86_400_000);
}

export function localDateTimeToUtc(localDate: string, localTime: string, timeZone: string) {
    assertLocalDate(localDate);
    assertLocalTime(localTime);

    const [year, month, day] = localDate.split("-").map(Number);
    const [hour, minute] = localTime.split(":").map(Number);
    const intendedUtcWallTime = Date.UTC(year, month - 1, day, hour, minute);
    const firstOffset = getTimeZoneOffsetMs(new Date(intendedUtcWallTime), timeZone);
    const firstUtc = new Date(intendedUtcWallTime - firstOffset);
    const secondOffset = getTimeZoneOffsetMs(firstUtc, timeZone);

    return new Date(intendedUtcWallTime - secondOffset);
}

export function getLocalDate(date: Date, timeZone: string) {
    const parts = getZonedParts(date, timeZone);
    return [
        String(parts.year).padStart(4, "0"),
        String(parts.month).padStart(2, "0"),
        String(parts.day).padStart(2, "0"),
    ].join("-");
}

export function timeToMinutes(time: string) {
    assertLocalTime(time);
    const [hour, minute] = time.split(":").map(Number);
    return hour * 60 + minute;
}

export function minutesToTime(minutes: number) {
    const hour = Math.floor(minutes / 60);
    const minute = minutes % 60;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function ceilMinutesToInterval(minutes: number, intervalMinutes: number) {
    return Math.ceil(minutes / intervalMinutes) * intervalMinutes;
}

export function rangesOverlap(aStart: Date, aEnd: Date, bStart: Date, bEnd: Date) {
    return aStart < bEnd && aEnd > bStart;
}

export function intersectWindows(a: TimeWindow, b: TimeWindow): TimeWindow | null {
    const start = a.start > b.start ? a.start : b.start;
    const end = a.end < b.end ? a.end : b.end;

    if (start >= end) {
        return null;
    }

    return { start, end };
}

export function subtractWindow(source: TimeWindow, blocked: TimeWindow) {
    if (!rangesOverlap(source.start, source.end, blocked.start, blocked.end)) {
        return [source];
    }

    const remaining: TimeWindow[] = [];

    if (blocked.start > source.start) {
        remaining.push({ start: source.start, end: blocked.start });
    }

    if (blocked.end < source.end) {
        remaining.push({ start: blocked.end, end: source.end });
    }

    return remaining.filter((window) => window.start < window.end);
}

function parseLocalDateAsUtcMidnight(localDate: string) {
    const [year, month, day] = localDate.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
    const parts = getZonedParts(date, timeZone);
    const zonedAsUtc = Date.UTC(
        parts.year,
        parts.month - 1,
        parts.day,
        parts.hour,
        parts.minute,
        parts.second,
    );

    return zonedAsUtc - date.getTime();
}

function getZonedParts(date: Date, timeZone: string): ZonedParts {
    const formatter = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
        hourCycle: "h23",
    });

    const values = Object.fromEntries(
        formatter
            .formatToParts(date)
            .filter((part) => part.type !== "literal")
            .map((part) => [part.type, Number(part.value)]),
    );

    return {
        year: values.year,
        month: values.month,
        day: values.day,
        hour: values.hour,
        minute: values.minute,
        second: values.second,
    };
}
