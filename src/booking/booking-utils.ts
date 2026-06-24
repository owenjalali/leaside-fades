import type { BookingBarber, BookingService, BookingSlot, BookingStep, CustomerDetails } from "./types";

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const stepPaths: Record<BookingStep, string> = {
    location: "/book",
    services: "/book/services",
    barber: "/book/barber",
    time: "/book/time",
    details: "/book/details",
    confirm: "/book/confirm",
};

export const bookingSteps: BookingStep[] = [
    "location",
    "services",
    "barber",
    "time",
    "details",
    "confirm",
];

export const bookingStepLabels: Record<BookingStep, string> = {
    location: "Location",
    services: "Services",
    barber: "Barber",
    time: "Time",
    details: "Details",
    confirm: "Confirm",
};

export function getPathForStep(step: BookingStep) {
    return stepPaths[step];
}

export function getStepFromPath(pathname: string): BookingStep {
    const normalized = pathname.replace(/\/$/, "");
    const match = (Object.entries(stepPaths) as Array<[BookingStep, string]>).find(
        ([, path]) => path === normalized,
    );
    return match?.[0] ?? "location";
}

export function summarizeSelectedServices(services: BookingService[]) {
    const totalDurationMinutes = services.reduce(
        (total, service) => total + service.durationMinutes,
        0,
    );
    const totalPriceCents = services.reduce((total, service) => total + service.priceCents, 0);
    const hasFromPrice = services.some((service) => service.priceType === "from");

    return {
        totalDurationMinutes,
        priceSummary:
            services.length === 0
                ? "$0"
                : `${hasFromPrice ? "from " : ""}${formatCents(totalPriceCents)}`,
    };
}

export function isCustomerDetailsComplete(details: CustomerDetails) {
    return Boolean(
        details.firstName.trim() &&
            details.lastName.trim() &&
            isPhoneComplete(details) &&
            isValidEmail(details.email),
    );
}

export function isValidEmail(value: string) {
    return emailPattern.test(value.trim());
}

export function getPhoneDigits(value: string) {
    return value.replace(/\D/g, "");
}

export function isPhoneComplete(details: Pick<CustomerDetails, "phone" | "phoneCountryCode">) {
    return Boolean(details.phoneCountryCode.trim() && getPhoneDigits(details.phone).length >= 10);
}

export function formatPhoneNumber(value: string) {
    const digits = getPhoneDigits(value).slice(0, 10);

    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

export function formatPhoneForSubmit(details: Pick<CustomerDetails, "phone" | "phoneCountryCode">) {
    return `${details.phoneCountryCode.trim()}${getPhoneDigits(details.phone)}`;
}

export function formatPhoneForDisplay(details: Pick<CustomerDetails, "phone" | "phoneCountryCode">) {
    return `${details.phoneCountryCode.trim()} ${details.phone.trim()}`.trim();
}

export function summarizeConfirmationServices(
    services: Array<{ serviceName?: string | null; name?: string | null }>,
) {
    return services
        .map((service) => service.serviceName ?? service.name ?? "")
        .filter(Boolean)
        .join(", ");
}

export function clearSlotIfUnavailable(
    selectedSlot: BookingSlot | null,
    availableSlots: BookingSlot[],
) {
    if (!selectedSlot) {
        return null;
    }

    return availableSlots.some((slot) => sameBookingSlot(slot, selectedSlot)) ? selectedSlot : null;
}

export function resetBookingSelectionsForLocation({
    nextLocationId,
    selectedBarberId,
    selectedSlot,
    barbers,
}: {
    nextLocationId: string;
    selectedBarberId?: string;
    selectedSlot: BookingSlot | null;
    barbers: Pick<BookingBarber, "id" | "locationIds">[];
}) {
    const barberStillAvailable = selectedBarberId
        ? barbers.some((barber) => barber.id === selectedBarberId && barber.locationIds.includes(nextLocationId))
        : true;
    const nextBarberId = barberStillAvailable ? selectedBarberId : undefined;
    const slotStillCompatible =
        Boolean(selectedSlot) &&
        selectedSlot?.locationId === nextLocationId &&
        (!nextBarberId || selectedSlot.barberId === nextBarberId);

    return {
        selectedBarberId: nextBarberId,
        selectedSlot: slotStillCompatible ? selectedSlot : null,
    };
}

export function formatDateTime(value: string, timeZone = "America/Toronto") {
    return new Intl.DateTimeFormat("en-CA", {
        weekday: "short",
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
        timeZone,
    }).format(new Date(value));
}

export function formatTime(value: string, timeZone = "America/Toronto") {
    return new Intl.DateTimeFormat("en-CA", {
        hour: "numeric",
        minute: "2-digit",
        timeZone,
    }).format(new Date(value));
}

export function getTodayLocalDate(timeZone = "America/Toronto") {
    return localDateFromOffset(0, timeZone);
}

export function getMaxBookingLocalDate(timeZone = "America/Toronto") {
    return localDateFromOffset(30, timeZone);
}

export function addLocalDays(localDate: string, offsetDays: number) {
    const date = parseLocalDate(localDate);
    date.setUTCDate(date.getUTCDate() + offsetDays);
    return toLocalDateString(date);
}

export function getWeekStartLocalDate(localDate: string) {
    const date = parseLocalDate(localDate);
    return addLocalDays(localDate, -date.getUTCDay());
}

export function getWeekDates(localDate: string) {
    const start = getWeekStartLocalDate(localDate);
    return Array.from({ length: 7 }, (_, index) => addLocalDays(start, index));
}

export function formatMonthYear(localDate: string) {
    return new Intl.DateTimeFormat("en-CA", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
    }).format(parseLocalDate(localDate));
}

export function formatWeekdayShort(localDate: string) {
    return new Intl.DateTimeFormat("en-CA", {
        weekday: "short",
        timeZone: "UTC",
    }).format(parseLocalDate(localDate));
}

export function formatDayNumber(localDate: string) {
    return new Intl.DateTimeFormat("en-CA", {
        day: "numeric",
        timeZone: "UTC",
    }).format(parseLocalDate(localDate));
}

function localDateFromOffset(offsetDays: number, timeZone: string) {
    const date = new Date();
    date.setDate(date.getDate() + offsetDays);

    const parts = new Intl.DateTimeFormat("en-CA", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone,
    }).formatToParts(date);

    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
}

function formatCents(cents: number) {
    const dollars = cents / 100;
    return Number.isInteger(dollars) ? `$${dollars}` : `$${dollars.toFixed(2)}`;
}

function sameBookingSlot(left: BookingSlot, right: BookingSlot) {
    return (
        left.startTime === right.startTime &&
        left.endTime === right.endTime &&
        left.barberId === right.barberId &&
        left.locationId === right.locationId
    );
}

function parseLocalDate(localDate: string) {
    const [year, month, day] = localDate.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day));
}

function toLocalDateString(date: Date) {
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, "0");
    const day = String(date.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
}
