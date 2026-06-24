import {
    addMinutes,
    ceilMinutesToInterval,
    getLocalDate,
    localDateDifferenceInDays,
    localDateTimeToUtc,
    localDateToDayOfWeek,
    minutesToTime,
    rangesOverlap,
    subtractWindow,
    timeToMinutes,
    type TimeWindow,
} from "./time.ts";
import type {
    AvailabilityData,
    AvailabilityRequest,
    AvailabilityResult,
    AvailableSlot,
    BarberRecord,
    BlockedTimeRecord,
    BookingRecord,
    ShiftOverrideRecord,
    ShiftRecord,
} from "./types.ts";

const DEFAULT_TIME_ZONE = "America/Toronto";
const DEFAULT_SLOT_INTERVAL_MINUTES = 15;
const DEFAULT_MINIMUM_NOTICE_MINUTES = 30;
const DEFAULT_MAX_ADVANCE_DAYS = 30;

export function getAvailableSlots(
    request: AvailabilityRequest,
    data: AvailabilityData,
): AvailabilityResult {
    const timeZone = request.timeZone ?? DEFAULT_TIME_ZONE;
    const slotIntervalMinutes = request.slotIntervalMinutes ?? DEFAULT_SLOT_INTERVAL_MINUTES;
    const minimumNoticeMinutes =
        request.minimumNoticeMinutes ?? DEFAULT_MINIMUM_NOTICE_MINUTES;
    const maxAdvanceDays = request.maxAdvanceDays ?? DEFAULT_MAX_ADVANCE_DAYS;
    const now = request.now ?? new Date();
    const today = getLocalDate(now, timeZone);
    const daysAhead = localDateDifferenceInDays(today, request.date);

    if (daysAhead < 0) {
        throw new Error("Availability cannot be generated for past dates.");
    }

    if (daysAhead > maxAdvanceDays) {
        throw new Error(`Availability cannot be generated more than ${maxAdvanceDays} days ahead.`);
    }

    if (request.serviceIds.length === 0) {
        throw new Error("At least one service is required to generate availability.");
    }

    const selectedServices = request.serviceIds.map((serviceId) => {
        const service = data.services.find((candidate) => candidate.id === serviceId);

        if (!service || service.active === false) {
            throw new Error(`Service "${serviceId}" is not available.`);
        }

        return service;
    });
    const totalDurationMinutes = selectedServices.reduce(
        (sum, service) => sum + service.durationMinutes,
        0,
    );
    const dayOfWeek = localDateToDayOfWeek(request.date);
    const businessHours = data.businessHours.find(
        (hours) => hours.locationId === request.locationId && hours.dayOfWeek === dayOfWeek,
    );
    const eligibleBarbers = getEligibleBarbers(request, data);
    const threshold = addMinutes(now, minimumNoticeMinutes);

    if (!businessHours || businessHours.closed) {
        return {
            date: request.date,
            locationId: request.locationId,
            timeZone,
            totalDurationMinutes,
            barberSlots: eligibleBarbers.map((barber) => ({
                barberId: barber.id,
                locationId: request.locationId,
                slots: [],
            })),
        };
    }

    return {
        date: request.date,
        locationId: request.locationId,
        timeZone,
        totalDurationMinutes,
        barberSlots: eligibleBarbers.map((barber) => ({
            barberId: barber.id,
            locationId: request.locationId,
            slots: buildSlotsForBarber({
                barber,
                request,
                data,
                dayOfWeek,
                totalDurationMinutes,
                slotIntervalMinutes,
                threshold,
                timeZone,
            }),
        })),
    };
}

function getEligibleBarbers(request: AvailabilityRequest, data: AvailabilityData) {
    const assignedBarberIds = new Set(
        data.barberLocations
            .filter((assignment) => assignment.locationId === request.locationId)
            .map((assignment) => assignment.barberId),
    );
    const activeAssignedBarbers = data.barbers
        .filter((barber) => barber.active !== false && assignedBarberIds.has(barber.id))
        .sort(compareBarbers);

    if (!request.barberId) {
        return activeAssignedBarbers;
    }

    return activeAssignedBarbers.filter((barber) => barber.id === request.barberId);
}

function buildSlotsForBarber({
    barber,
    request,
    data,
    dayOfWeek,
    totalDurationMinutes,
    slotIntervalMinutes,
    threshold,
    timeZone,
}: {
    barber: BarberRecord;
    request: AvailabilityRequest;
    data: AvailabilityData;
    dayOfWeek: number;
    totalDurationMinutes: number;
    slotIntervalMinutes: number;
    threshold: Date;
    timeZone: string;
}) {
    const windows = getShiftWindowsForBarber({
        barberId: barber.id,
        request,
        data,
        dayOfWeek,
        timeZone,
    });
    const blockingBookings = (data.bookings ?? []).filter(
        (booking) => booking.barberId === barber.id && booking.status === "confirmed",
    );
    const blockingTimes = (data.blockedTimes ?? []).filter((blockedTime) =>
        blockedTimeApplies(blockedTime, barber.id, request.locationId),
    );
    const slots: AvailableSlot[] = [];
    const seenStarts = new Set<string>();

    for (const window of windows) {
        const firstStartMinutes = ceilMinutesToInterval(
            timeToMinutes(getLocalTime(window.start, timeZone)),
            slotIntervalMinutes,
        );
        const lastStart = addMinutes(window.end, -totalDurationMinutes);

        for (
            let cursor = localDateTimeToUtc(
                request.date,
                minutesToTime(firstStartMinutes),
                timeZone,
            );
            cursor <= lastStart;
            cursor = addMinutes(cursor, slotIntervalMinutes)
        ) {
            const end = addMinutes(cursor, totalDurationMinutes);

            if (cursor < threshold || cursor < window.start || end > window.end) {
                continue;
            }

            if (bookingOverlaps(blockingBookings, cursor, end)) {
                continue;
            }

            if (blockedTimeOverlaps(blockingTimes, cursor, end)) {
                continue;
            }

            const startKey = cursor.toISOString();

            if (seenStarts.has(startKey)) {
                continue;
            }

            seenStarts.add(startKey);
            slots.push({
                barberId: barber.id,
                locationId: request.locationId,
                startTime: cursor,
                endTime: end,
                totalDurationMinutes,
            });
        }
    }

    return slots.sort((a, b) => a.startTime.getTime() - b.startTime.getTime());
}

function getShiftWindowsForBarber({
    barberId,
    request,
    data,
    dayOfWeek,
    timeZone,
}: {
    barberId: string;
    request: AvailabilityRequest;
    data: AvailabilityData;
    dayOfWeek: number;
    timeZone: string;
}) {
    const recurringWindows = data.shifts
        .filter((shift) => shiftApplies(shift, barberId, request.locationId, request.date, dayOfWeek))
        .map((shift) => shiftToWindow(shift, request.date, timeZone));

    const adjustedWindows = applyShiftOverrides(
        recurringWindows,
        (data.shiftOverrides ?? []).filter(
            (override) =>
                override.barberId === barberId &&
                override.overrideDate === request.date &&
                overrideAppliesToLocation(override, request.locationId),
        ),
        request.date,
        request.locationId,
        timeZone,
    );

    return adjustedWindows.sort((a, b) => a.start.getTime() - b.start.getTime());
}

function applyShiftOverrides(
    initialWindows: TimeWindow[],
    overrides: ShiftOverrideRecord[],
    localDate: string,
    locationId: string,
    timeZone: string,
) {
    let windows = initialWindows;

    for (const override of overrides) {
        if (override.overrideType === "not_working") {
            windows = [];
            continue;
        }

        if (!override.startTime || !override.endTime) {
            continue;
        }

        const overrideWindow = {
            start: localDateTimeToUtc(localDate, override.startTime, timeZone),
            end: localDateTimeToUtc(localDate, override.endTime, timeZone),
        };

        if (override.overrideType === "remove") {
            windows = windows.flatMap((window) => subtractWindow(window, overrideWindow));
            continue;
        }

        if (override.overrideType === "add" && override.locationId === locationId) {
            windows = [...windows, overrideWindow];
        }
    }

    return windows;
}

function shiftApplies(
    shift: ShiftRecord,
    barberId: string,
    locationId: string,
    localDate: string,
    dayOfWeek: number,
) {
    if (shift.active === false) {
        return false;
    }

    if (shift.barberId !== barberId || shift.locationId !== locationId) {
        return false;
    }

    if (shift.dayOfWeek !== dayOfWeek) {
        return false;
    }

    if (shift.effectiveFrom && localDate < shift.effectiveFrom) {
        return false;
    }

    if (shift.effectiveTo && localDate > shift.effectiveTo) {
        return false;
    }

    return true;
}

function shiftToWindow(shift: ShiftRecord, localDate: string, timeZone: string) {
    return {
        start: localDateTimeToUtc(localDate, shift.startTime, timeZone),
        end: localDateTimeToUtc(localDate, shift.endTime, timeZone),
    };
}

function overrideAppliesToLocation(override: ShiftOverrideRecord, locationId: string) {
    return !override.locationId || override.locationId === locationId;
}

function bookingOverlaps(bookings: BookingRecord[], start: Date, end: Date) {
    return bookings.some((booking) => rangesOverlap(start, end, booking.startTime, booking.endTime));
}

function blockedTimeOverlaps(blockedTimes: BlockedTimeRecord[], start: Date, end: Date) {
    return blockedTimes.some((blockedTime) =>
        rangesOverlap(start, end, blockedTime.startTime, blockedTime.endTime),
    );
}

function blockedTimeApplies(
    blockedTime: BlockedTimeRecord,
    barberId: string,
    locationId: string,
) {
    if (blockedTime.scope === "business") {
        return true;
    }

    if (blockedTime.scope === "location") {
        return blockedTime.locationId === locationId;
    }

    return (
        blockedTime.barberId === barberId &&
        (!blockedTime.locationId || blockedTime.locationId === locationId)
    );
}

function getLocalTime(date: Date, timeZone: string) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone,
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).format(date);
}

function compareBarbers(a: BarberRecord, b: BarberRecord) {
    return (a.sortOrder ?? 0) - (b.sortOrder ?? 0) || a.id.localeCompare(b.id);
}
