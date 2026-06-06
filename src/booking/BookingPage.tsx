import { type InputHTMLAttributes, useEffect, useMemo, useState } from "react";
import {
    CalendarCheck2,
    CalendarDays,
    Check,
    ChevronLeft,
    ChevronRight,
    Clock,
    MapPin,
    Scissors,
    User,
    UsersRound,
} from "lucide-react";

import lauraImage from "@/assets/barbers/booking-thumbnails/laura-thumb.jpg";
import josefImage from "@/assets/barbers/booking-thumbnails/josef-thumb.jpg";
import samImage from "@/assets/barbers/booking-thumbnails/sam-thumb.jpg";
import shayonImage from "@/assets/barbers/booking-thumbnails/shayon-thumb.jpg";
import yogeshImage from "@/assets/barbers/booking-thumbnails/yogesh-thumb.jpg";
import { cn } from "@/lib/utils";
import {
    fetchBookingAvailability,
    fetchBookingCatalog,
    submitPublicBooking,
} from "./api";
import {
    bookingStepLabels,
    bookingSteps,
    formatDayNumber,
    formatDateTime,
    formatMonthYear,
    formatPhoneForDisplay,
    formatPhoneNumber,
    formatTime,
    formatWeekdayShort,
    getMaxBookingLocalDate,
    getPathForStep,
    getStepFromPath,
    getTodayLocalDate,
    getWeekDates,
    getWeekStartLocalDate,
    isCustomerDetailsComplete,
    isPhoneComplete,
    isValidEmail,
    summarizeConfirmationServices,
    summarizeSelectedServices,
} from "./booking-utils";
import type {
    BookingAvailability,
    BookingBarber,
    BookingCatalog,
    BookingConfirmation,
    BookingLocation,
    BookingService,
    BookingSlot,
    BookingStep,
    CustomerDetails,
} from "./types";

const emptyCustomer: CustomerDetails = {
    firstName: "",
    lastName: "",
    phoneCountryCode: "+1",
    phone: "",
    email: "",
    notes: "",
};

const phoneCountryCodes = [
    { value: "+1", label: "+1 CA/US" },
    { value: "+44", label: "+44 UK" },
    { value: "+61", label: "+61 AU" },
    { value: "+91", label: "+91 IN" },
] as const;

const barberProfiles: Record<
    string,
    {
        image: string;
        shortName: string;
        role: string;
    }
> = {
    "sam-to": {
        image: samImage,
        shortName: "Sam",
        role: "Owner / Barber",
    },
    "laura-nguyen": {
        image: lauraImage,
        shortName: "Laura",
        role: "Barber & Stylist",
    },
    josef: {
        image: josefImage,
        shortName: "Josef",
        role: "Barber",
    },
    "yogesh-kumar": {
        image: yogeshImage,
        shortName: "Yogesh",
        role: "Barber",
    },
    "shayan-hussain": {
        image: shayonImage,
        shortName: "Shayon",
        role: "Barber",
    },
};

export default function BookingPage() {
    const [step, setStep] = useState<BookingStep>(() => getStepFromPath(window.location.pathname));
    const [catalog, setCatalog] = useState<BookingCatalog | null>(null);
    const [catalogError, setCatalogError] = useState("");
    const [catalogLoading, setCatalogLoading] = useState(true);
    const [selectedLocationId, setSelectedLocationId] = useState("");
    const [selectedServiceIds, setSelectedServiceIds] = useState<string[]>([]);
    const [selectedBarberId, setSelectedBarberId] = useState<string | undefined>();
    const [selectedDate, setSelectedDate] = useState(() => getTodayLocalDate());
    const [selectedSlot, setSelectedSlot] = useState<BookingSlot | null>(null);
    const [availabilityByDate, setAvailabilityByDate] = useState<Record<string, BookingAvailability>>({});
    const [availabilityLoading, setAvailabilityLoading] = useState(false);
    const [availabilityError, setAvailabilityError] = useState("");
    const [customer, setCustomer] = useState<CustomerDetails>(emptyCustomer);
    const [submitError, setSubmitError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [confirmation, setConfirmation] = useState<BookingConfirmation | null>(null);

    useEffect(() => {
        let active = true;

        fetchBookingCatalog()
            .then((payload) => {
                if (!active) return;
                setCatalog(payload);
                const locationSlug = new URLSearchParams(window.location.search).get("location");
                const requestedLocation = payload.locations.find(
                    (location) => location.slug === locationSlug,
                );
                setSelectedLocationId(requestedLocation?.id ?? payload.locations[0]?.id ?? "");
            })
            .catch((error) => {
                if (!active) return;
                setCatalogError(error instanceof Error ? error.message : "Booking setup is unavailable.");
            })
            .finally(() => {
                if (active) setCatalogLoading(false);
            });

        return () => {
            active = false;
        };
    }, []);

    useEffect(() => {
        const onPopState = () => setStep(getStepFromPath(window.location.pathname));
        window.addEventListener("popstate", onPopState);
        return () => window.removeEventListener("popstate", onPopState);
    }, []);

    const selectedWeekStart = useMemo(() => getWeekStartLocalDate(selectedDate), [selectedDate]);
    const weekDates = useMemo(() => getWeekDates(selectedWeekStart), [selectedWeekStart]);

    useEffect(() => {
        setSelectedSlot(null);

        if (!selectedLocationId || selectedServiceIds.length === 0 || !selectedDate) {
            setAvailabilityByDate({});
            return;
        }

        let active = true;
        setAvailabilityLoading(true);
        setAvailabilityError("");
        const today = getTodayLocalDate();
        const maxDate = getMaxBookingLocalDate();
        const fetchableDates = weekDates.filter((date) => date >= today && date <= maxDate);

        if (fetchableDates.length === 0) {
            setAvailabilityByDate({});
            setAvailabilityLoading(false);
            return;
        }

        Promise.allSettled(
            fetchableDates.map((date) =>
                fetchBookingAvailability({
                    locationId: selectedLocationId,
                    serviceIds: selectedServiceIds,
                    date,
                    barberId: selectedBarberId,
                }),
            ),
        )
            .then((results) => {
                if (!active) return;
                const payloads = results
                    .filter(
                        (result): result is PromiseFulfilledResult<BookingAvailability> =>
                            result.status === "fulfilled",
                    )
                    .map((result) => result.value);

                if (payloads.length === 0) {
                    const failed = results.find(
                        (result): result is PromiseRejectedResult => result.status === "rejected",
                    );
                    throw failed?.reason ?? new Error("Availability is temporarily unavailable.");
                }

                setAvailabilityByDate(Object.fromEntries(payloads.map((payload) => [payload.date, payload])));
            })
            .catch((error) => {
                if (active) {
                    setAvailabilityByDate({});
                    setAvailabilityError(
                        error instanceof Error ? error.message : "Availability is temporarily unavailable.",
                    );
                }
            })
            .finally(() => {
                if (active) setAvailabilityLoading(false);
            });

        return () => {
            active = false;
        };
    }, [selectedLocationId, selectedServiceIds, selectedWeekStart, selectedBarberId, weekDates]);

    useEffect(() => {
        setSelectedSlot(null);
    }, [selectedDate]);

    const selectedLocation = catalog?.locations.find((location) => location.id === selectedLocationId);
    const selectedServices = useMemo(
        () =>
            catalog?.serviceCategories
                .flatMap((category) => category.services)
                .filter((service) => selectedServiceIds.includes(service.id)) ?? [],
        [catalog, selectedServiceIds],
    );
    const serviceSummary = summarizeSelectedServices(selectedServices);
    const locationBarbers =
        catalog?.barbers.filter((barber) => barber.locationIds.includes(selectedLocationId)) ?? [];
    const selectedBarber = selectedBarberId
        ? catalog?.barbers.find((barber) => barber.id === selectedBarberId)
        : undefined;
    const selectedAvailability = availabilityByDate[selectedDate];
    const flattenedSlots = useMemo(
        () =>
            getUniqueSlots(
                selectedAvailability?.barberSlots.flatMap((barberSlot) => barberSlot.slots) ?? [],
            ),
        [selectedAvailability],
    );

    function goToStep(nextStep: BookingStep) {
        const path = getPathForStep(nextStep);
        window.history.pushState({}, "", path);
        setStep(nextStep);
        window.scrollTo({ top: 0, behavior: "smooth" });
    }

    function updateCustomer(field: keyof CustomerDetails, value: string) {
        setCustomer((current) => ({ ...current, [field]: value }));
    }

    async function confirmBooking() {
        if (!selectedLocationId || selectedServiceIds.length === 0 || !selectedSlot) return;

        setSubmitting(true);
        setSubmitError("");

        try {
            const booking = await submitPublicBooking({
                locationId: selectedLocationId,
                serviceIds: selectedServiceIds,
                barberId: selectedBarberId,
                startTime: selectedSlot.startTime,
                customer,
            });
            setConfirmation(booking);
        } catch (error) {
            setSubmitError(
                error instanceof Error ? error.message : "The selected appointment could not be booked.",
            );
        } finally {
            setSubmitting(false);
        }
    }

    if (confirmation && catalog) {
        return <ConfirmationView catalog={catalog} confirmation={confirmation} />;
    }

    return (
        <main className="min-h-screen bg-[#f7fbf8] text-charcoal">
            <section className="border-b border-charcoal/10 bg-white">
                <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 md:px-8 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <a href="/" className="mb-8 inline-flex items-center gap-3">
                            <img
                                src="/assets/logo-transparent.png"
                                alt="Leaside Fades"
                                className="h-12"
                            />
                            <span className="font-display text-3xl tracking-wide">LEASIDE FADES</span>
                        </a>
                        <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-green">
                            Book an appointment
                        </p>
                        <h1 className="font-display text-5xl tracking-wide md:text-6xl">
                            Choose your fade, time, and chair.
                        </h1>
                    </div>
                    <div className="max-w-sm rounded-lg border border-green/25 bg-cream p-4 text-sm text-charcoal/75">
                        <p className="font-semibold text-charcoal">Pay in shop.</p>
                        <p>No online payment or deposit is required for this booking flow.</p>
                    </div>
                </div>
            </section>

            <div className="mx-auto grid max-w-7xl gap-6 px-4 py-8 md:px-8 lg:grid-cols-[1fr_360px]">
                <section className="rounded-lg border border-charcoal/10 bg-white p-4 shadow-sm md:p-6">
                    <StepRail currentStep={step} />

                    {catalogLoading && <Notice title="Loading booking options" />}
                    {catalogError && <Notice title={catalogError} tone="error" />}

                    {catalog && (
                        <>
                            {step === "location" && (
                                <LocationStep
                                    locations={catalog.locations}
                                    selectedLocationId={selectedLocationId}
                                    onSelect={(locationId) => {
                                        setSelectedLocationId(locationId);
                                        setSelectedBarberId(undefined);
                                        goToStep("services");
                                    }}
                                />
                            )}

                            {step === "services" && (
                                <ServicesStep
                                    categories={catalog.serviceCategories}
                                    selectedServiceIds={selectedServiceIds}
                                    onToggle={(serviceId) => {
                                        setSelectedServiceIds((current) =>
                                            current.includes(serviceId)
                                                ? current.filter((id) => id !== serviceId)
                                                : [...current, serviceId],
                                        );
                                    }}
                                />
                            )}

                            {step === "barber" && (
                                <BarberStep
                                    barbers={locationBarbers}
                                    selectedBarberId={selectedBarberId}
                                    onSelect={setSelectedBarberId}
                                />
                            )}

                            {step === "time" && (
                                <TimeStep
                                    date={selectedDate}
                                    weekDates={weekDates}
                                    availabilityByDate={availabilityByDate}
                                    onDateChange={setSelectedDate}
                                    slots={flattenedSlots}
                                    selectedSlot={selectedSlot}
                                    selectedBarberId={selectedBarberId}
                                    selectedBarber={selectedBarber}
                                    barbers={catalog.barbers}
                                    loading={availabilityLoading}
                                    error={availabilityError}
                                    emptyMessage={selectedAvailability?.emptyMessage}
                                    onSelectSlot={setSelectedSlot}
                                />
                            )}

                            {step === "details" && (
                                <DetailsStep customer={customer} onChange={updateCustomer} />
                            )}

                            {step === "confirm" && (
                                <ConfirmStep
                                    location={selectedLocation}
                                    services={selectedServices}
                                    barber={selectedBarber}
                                    slot={selectedSlot}
                                    customer={customer}
                                    priceSummary={serviceSummary.priceSummary}
                                    submitting={submitting}
                                    submitError={submitError}
                                    onSubmit={confirmBooking}
                                />
                            )}
                        </>
                    )}

                    {catalog && step !== "location" && (
                        <div className="mt-8 flex flex-col gap-3 border-t border-charcoal/10 pt-5 sm:flex-row sm:items-center sm:justify-between">
                            <button
                                type="button"
                                onClick={() => goToStep(previousStep(step))}
                                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full border border-charcoal/15 px-5 text-sm font-semibold text-charcoal transition-colors hover:bg-charcoal/5"
                            >
                                <ChevronLeft size={16} />
                                Back
                            </button>
                            {step !== "confirm" && (
                                <button
                                    type="button"
                                    disabled={!canContinue(step, {
                                        selectedLocationId,
                                        selectedServiceIds,
                                        selectedSlot,
                                        customer,
                                    })}
                                    onClick={() => goToStep(nextStep(step))}
                                    className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-full bg-green px-6 text-sm font-semibold text-white transition-colors hover:bg-emerald disabled:cursor-not-allowed disabled:bg-charcoal/20"
                                >
                                    Continue
                                    <ChevronRight size={16} />
                                </button>
                            )}
                        </div>
                    )}
                </section>

                <AppointmentSummary
                    location={selectedLocation}
                    services={selectedServices}
                    barber={selectedBarber}
                    slot={selectedSlot}
                    priceSummary={serviceSummary.priceSummary}
                    duration={serviceSummary.totalDurationMinutes}
                />
            </div>
        </main>
    );
}

function StepRail({ currentStep }: { currentStep: BookingStep }) {
    const currentIndex = bookingSteps.indexOf(currentStep);

    return (
        <ol className="mb-6 grid grid-cols-2 gap-2 md:grid-cols-6">
            {bookingSteps.map((item, index) => (
                <li key={item}>
                    <button
                        type="button"
                        disabled={index > currentIndex}
                        className={cn(
                            "flex h-10 w-full items-center justify-center rounded-full border text-xs font-semibold",
                            index === currentIndex
                                ? "border-green bg-green text-white"
                                : index < currentIndex
                                  ? "border-green/35 bg-cream text-forest"
                                  : "border-charcoal/10 bg-white text-charcoal/35",
                        )}
                    >
                        {bookingStepLabels[item]}
                    </button>
                </li>
            ))}
        </ol>
    );
}

function LocationStep({
    locations,
    selectedLocationId,
    onSelect,
}: {
    locations: BookingLocation[];
    selectedLocationId: string;
    onSelect: (locationId: string) => void;
}) {
    return (
        <div className="space-y-4">
            <StepHeading icon={MapPin} title="Select a location" />
            <div className="grid gap-3 md:grid-cols-2">
                {locations.map((location) => (
                    <button
                        key={location.id}
                        type="button"
                        onClick={() => onSelect(location.id)}
                        className={cn(
                            "min-h-[132px] rounded-lg border p-5 text-left transition-all hover:border-green hover:bg-cream",
                            selectedLocationId === location.id
                                ? "border-green bg-cream ring-2 ring-green/20"
                                : "border-charcoal/10 bg-white",
                        )}
                    >
                        <span className="mb-2 block text-lg font-bold">{location.name}</span>
                        <span className="block text-sm text-charcoal/65">
                            {location.addressLine1}, {location.city}, {location.province}
                        </span>
                        <span className="mt-3 block text-sm font-semibold text-green">
                            {location.phoneDisplay}
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
}

function ServicesStep({
    categories,
    selectedServiceIds,
    onToggle,
}: {
    categories: BookingCatalog["serviceCategories"];
    selectedServiceIds: string[];
    onToggle: (serviceId: string) => void;
}) {
    return (
        <div className="space-y-6">
            <StepHeading icon={Scissors} title="Select services" />
            {categories.map((category) => (
                <div key={category.id}>
                    <h2 className="mb-3 text-sm font-bold uppercase tracking-widest text-charcoal/60">
                        {category.name}
                    </h2>
                    <div className="grid gap-2">
                        {category.services.map((service) => {
                            const selected = selectedServiceIds.includes(service.id);

                            return (
                                <button
                                    key={service.id}
                                    type="button"
                                    onClick={() => onToggle(service.id)}
                                    className={cn(
                                        "grid min-h-[72px] grid-cols-[1fr_auto] items-center gap-4 rounded-lg border p-4 text-left transition-colors",
                                        selected
                                            ? "border-green bg-cream"
                                            : "border-charcoal/10 bg-white hover:border-green/60",
                                    )}
                                >
                                    <span>
                                        <span className="block font-semibold">{service.name}</span>
                                        <span className="text-sm text-charcoal/55">
                                            {service.durationMinutes} min
                                        </span>
                                    </span>
                                    <span className="flex items-center gap-3">
                                        <span className="font-bold text-forest">{service.displayPrice}</span>
                                        <span
                                            className={cn(
                                                "grid h-6 w-6 place-items-center rounded-full border",
                                                selected
                                                    ? "border-green bg-green text-white"
                                                    : "border-charcoal/20 text-transparent",
                                            )}
                                        >
                                            <Check size={14} />
                                        </span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                </div>
            ))}
        </div>
    );
}

function BarberStep({
    barbers,
    selectedBarberId,
    onSelect,
}: {
    barbers: BookingBarber[];
    selectedBarberId?: string;
    onSelect: (barberId?: string) => void;
}) {
    return (
        <div className="space-y-4">
            <StepHeading icon={User} title="Choose a barber" />
            <div className="grid gap-3 md:grid-cols-2">
                <BarberButton
                    selected={!selectedBarberId}
                    title="Any available barber"
                    subtitle="Maximum availability"
                    onClick={() => onSelect(undefined)}
                />
                {barbers.map((barber) => (
                    <BarberButton
                        key={barber.id}
                        selected={selectedBarberId === barber.id}
                        title={barber.displayName}
                        subtitle={getBarberProfile(barber).role}
                        barber={barber}
                        onClick={() => onSelect(barber.id)}
                    />
                ))}
            </div>
        </div>
    );
}

function BarberButton({
    selected,
    title,
    subtitle,
    barber,
    onClick,
}: {
    selected: boolean;
    title: string;
    subtitle: string;
    barber?: BookingBarber;
    onClick: () => void;
}) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={cn(
                "flex min-h-[104px] items-center justify-between gap-4 rounded-lg border p-4 text-left transition-colors",
                selected ? "border-green bg-cream" : "border-charcoal/10 bg-white hover:border-green/60",
            )}
        >
            <span className="flex min-w-0 items-center gap-4">
                <BarberAvatar barber={barber} />
                <span className="min-w-0">
                    <span className="block truncate font-semibold">{title}</span>
                    <span className="block text-sm text-charcoal/55">{subtitle}</span>
                </span>
            </span>
            <span
                className={cn(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-full border",
                    selected
                        ? "border-green bg-green text-white"
                        : "border-charcoal/15 bg-white text-transparent",
                )}
            >
                <Check size={18} />
            </span>
        </button>
    );
}

function BarberAvatar({
    barber,
    size = "md",
}: {
    barber?: BookingBarber;
    size?: "sm" | "md" | "lg";
}) {
    const dimensions = {
        sm: "h-9 w-9",
        md: "h-14 w-14",
        lg: "h-16 w-16",
    }[size];

    if (!barber) {
        return (
            <span
                className={cn(
                    "grid shrink-0 place-items-center rounded-full bg-cream text-green",
                    dimensions,
                )}
            >
                <UsersRound size={size === "sm" ? 18 : 24} />
            </span>
        );
    }

    const profile = getBarberProfile(barber);

    return (
        <img
            src={profile.image}
            alt={`${profile.shortName} profile`}
            className={cn("shrink-0 rounded-full object-cover", dimensions)}
        />
    );
}

function getBarberProfile(barber: BookingBarber) {
    if (barber.profileImageUrl) {
        return {
            image: barber.profileImageUrl,
            shortName: barber.displayName.split(" ")[0] ?? barber.displayName,
            role: "Barber",
        };
    }

    return (
        barberProfiles[barber.slug] ?? {
            image: samImage,
            shortName: barber.displayName.split(" ")[0] ?? barber.displayName,
            role: "Barber",
        }
    );
}

function TimeStep({
    date,
    weekDates,
    availabilityByDate,
    onDateChange,
    slots,
    selectedSlot,
    selectedBarberId,
    selectedBarber,
    barbers,
    loading,
    error,
    emptyMessage,
    onSelectSlot,
}: {
    date: string;
    weekDates: string[];
    availabilityByDate: Record<string, BookingAvailability>;
    onDateChange: (date: string) => void;
    slots: BookingSlot[];
    selectedSlot: BookingSlot | null;
    selectedBarberId?: string;
    selectedBarber?: BookingBarber;
    barbers: BookingBarber[];
    loading: boolean;
    error: string;
    emptyMessage?: string;
    onSelectSlot: (slot: BookingSlot) => void;
}) {
    const nextAvailableDate = weekDates.find(
        (candidate) => candidate !== date && getSlotCountForDate(availabilityByDate, candidate) > 0,
    );
    const today = getTodayLocalDate();
    const maxDate = getMaxBookingLocalDate();

    return (
        <div className="space-y-6">
            <StepHeading icon={Clock} title="Pick a date and time" />
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="inline-flex w-fit items-center gap-3 rounded-full border border-charcoal/10 bg-white py-2 pl-2 pr-4">
                    <BarberAvatar barber={selectedBarber} size="sm" />
                    <span className="text-sm font-semibold">
                        {selectedBarberId && selectedBarber
                            ? getBarberProfile(selectedBarber).shortName
                            : "Any barber"}
                    </span>
                </div>
                <label className="flex w-full items-center gap-2 rounded-full border border-charcoal/15 bg-white px-3 py-2 md:w-auto">
                    <CalendarDays size={18} className="shrink-0 text-green" />
                    <span className="text-sm font-semibold text-charcoal/60">Calendar</span>
                    <input
                        type="date"
                        min={getTodayLocalDate()}
                        max={getMaxBookingLocalDate()}
                        value={date}
                        onChange={(event) => {
                            if (event.target.value) onDateChange(event.target.value);
                        }}
                        className="h-8 min-w-0 flex-1 border-0 bg-transparent text-sm font-semibold outline-none md:w-36"
                    />
                </label>
            </div>

            <div className="space-y-3">
                <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-bold">{formatMonthYear(date)}</h3>
                    <div className="text-xs font-semibold uppercase tracking-widest text-charcoal/45">
                        Week view
                    </div>
                </div>
                <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
                    {weekDates.map((weekDate) => {
                        const selected = weekDate === date;
                        const slotCount = getSlotCountForDate(availabilityByDate, weekDate);
                        const isAvailable = slotCount > 0;
                        const isOutsideBookingWindow = weekDate < today || weekDate > maxDate;

                        return (
                            <button
                                key={weekDate}
                                type="button"
                                disabled={isOutsideBookingWindow}
                                onClick={() => {
                                    if (!isOutsideBookingWindow) onDateChange(weekDate);
                                }}
                                className={cn(
                                    "flex min-h-[78px] min-w-0 flex-col items-center justify-center rounded-lg border px-1 text-center transition-colors",
                                    selected
                                        ? "border-green bg-green text-white"
                                        : isOutsideBookingWindow
                                          ? "cursor-not-allowed border-charcoal/10 bg-white text-charcoal/25"
                                          : isAvailable
                                          ? "border-green/25 bg-cream text-charcoal hover:border-green"
                                          : "border-charcoal/10 bg-white text-charcoal/45 hover:border-charcoal/20",
                                )}
                            >
                                <span className="text-[11px] font-semibold uppercase sm:text-xs">
                                    {formatWeekdayShort(weekDate)}
                                </span>
                                <span className="font-display text-2xl leading-none tracking-wide sm:text-3xl">
                                    {formatDayNumber(weekDate)}
                                </span>
                                <span
                                    className={cn(
                                        "mt-1 truncate text-[10px] font-semibold sm:text-xs",
                                        selected
                                            ? "text-white/85"
                                            : isAvailable
                                              ? "text-forest"
                                              : "text-charcoal/35",
                                    )}
                                >
                                    {loading && !isOutsideBookingWindow
                                        ? "..."
                                        : isOutsideBookingWindow
                                          ? weekDate < today
                                            ? "Past"
                                            : "Later"
                                          : isAvailable
                                            ? `${slotCount} times`
                                            : "Full"}
                                </span>
                            </button>
                        );
                    })}
                </div>
            </div>

            {loading && <Notice title="Checking availability" />}
            {error && <Notice title={error} tone="error" />}
            {!loading && !error && slots.length === 0 && (
                <div className="space-y-3 rounded-lg border border-green/20 bg-cream p-4">
                    <p className="text-sm font-semibold text-forest">
                        {emptyMessage ?? "No available times for this date. Try another date or barber."}
                    </p>
                    {nextAvailableDate && (
                        <button
                            type="button"
                            onClick={() => onDateChange(nextAvailableDate)}
                            className="inline-flex min-h-[40px] items-center justify-center rounded-full border border-green/30 bg-white px-4 text-sm font-semibold text-forest transition-colors hover:bg-green hover:text-white"
                        >
                            Next available: {formatWeekdayShort(nextAvailableDate)},{" "}
                            {formatDayNumber(nextAvailableDate)}
                        </button>
                    )}
                </div>
            )}
            {!loading && slots.length > 0 && (
                <div className="space-y-3">
                    <h3 className="text-sm font-bold uppercase tracking-widest text-charcoal/55">
                        Available times
                    </h3>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                        {slots.map((slot) => {
                            const selected = selectedSlot?.startTime === slot.startTime;
                            const barber = barbers.find((candidate) => candidate.id === slot.barberId);
                            const barberName = barber?.displayName;

                            return (
                                <button
                                    key={`${slot.startTime}-${slot.barberId}`}
                                    type="button"
                                    onClick={() => onSelectSlot(slot)}
                                    className={cn(
                                        "flex min-h-[58px] flex-col items-center justify-center rounded-lg border px-3 text-sm transition-colors",
                                        selected
                                            ? "border-green bg-green text-white"
                                            : "border-charcoal/10 bg-white hover:border-green/60",
                                    )}
                                >
                                    <span className="font-bold">{formatTime(slot.startTime)}</span>
                                    {!selectedBarberId && barberName && (
                                        <span
                                            className={cn(
                                                "text-xs",
                                                selected ? "text-white/80" : "text-charcoal/45",
                                            )}
                                        >
                                            {barberName}
                                        </span>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
}

function DetailsStep({
    customer,
    onChange,
}: {
    customer: CustomerDetails;
    onChange: (field: keyof CustomerDetails, value: string) => void;
}) {
    const phoneInvalid = customer.phone.trim().length > 0 && !isPhoneComplete(customer);
    const emailInvalid = customer.email.trim().length > 0 && !isValidEmail(customer.email);

    return (
        <div className="space-y-5">
            <StepHeading icon={User} title="Your details" />
            <div className="grid gap-4 md:grid-cols-2">
                <TextInput
                    label="First name"
                    value={customer.firstName}
                    autoComplete="given-name"
                    onChange={(value) => onChange("firstName", value)}
                />
                <TextInput
                    label="Last name"
                    value={customer.lastName}
                    autoComplete="family-name"
                    onChange={(value) => onChange("lastName", value)}
                />
                <PhoneInput
                    countryCode={customer.phoneCountryCode}
                    phone={customer.phone}
                    invalid={phoneInvalid}
                    onCountryCodeChange={(value) => onChange("phoneCountryCode", value)}
                    onPhoneChange={(value) => onChange("phone", formatPhoneNumber(value))}
                />
                <TextInput
                    label="Email"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    value={customer.email}
                    error={emailInvalid ? "Enter a valid email address with @." : undefined}
                    onChange={(value) => onChange("email", value)}
                />
            </div>
            <label className="block">
                <span className="mb-2 block text-sm font-semibold text-charcoal/70">Notes</span>
                <textarea
                    value={customer.notes}
                    onChange={(event) => onChange("notes", event.target.value)}
                    rows={4}
                    className="w-full rounded-lg border border-charcoal/15 p-3 outline-none focus:border-green focus:ring-2 focus:ring-green/20"
                />
            </label>
        </div>
    );
}

function ConfirmStep({
    location,
    services,
    barber,
    slot,
    customer,
    priceSummary,
    submitting,
    submitError,
    onSubmit,
}: {
    location?: BookingLocation;
    services: BookingService[];
    barber?: BookingBarber;
    slot: BookingSlot | null;
    customer: CustomerDetails;
    priceSummary: string;
    submitting: boolean;
    submitError: string;
    onSubmit: () => void;
}) {
    return (
        <div className="space-y-5">
            <StepHeading icon={CalendarCheck2} title="Review and confirm" />
            <div className="grid gap-3 rounded-lg border border-charcoal/10 bg-[#fbfdfb] p-4 text-sm">
                <SummaryLine label="Location" value={location?.name ?? "-"} />
                <SummaryLine label="Barber" value={barber?.displayName ?? "Any available barber"} />
                <SummaryLine label="Time" value={slot ? formatDateTime(slot.startTime) : "-"} />
                <SummaryLine label="Customer" value={`${customer.firstName} ${customer.lastName}`} />
                <SummaryLine label="Contact" value={`${formatPhoneForDisplay(customer)} | ${customer.email}`} />
                <SummaryLine label="Services" value={services.map((service) => service.name).join(", ")} />
                <SummaryLine label="Estimated total" value={priceSummary} />
                <SummaryLine label="Payment" value="Pay in shop." />
            </div>
            {submitError && <Notice title={submitError} tone="error" />}
            <button
                type="button"
                disabled={submitting || !slot || !isCustomerDetailsComplete(customer)}
                onClick={onSubmit}
                className="inline-flex min-h-[48px] w-full items-center justify-center rounded-full bg-green px-6 text-sm font-bold text-white transition-colors hover:bg-emerald disabled:cursor-not-allowed disabled:bg-charcoal/20 sm:w-auto"
            >
                {submitting ? "Confirming..." : "Confirm Booking"}
            </button>
        </div>
    );
}

function AppointmentSummary({
    location,
    services,
    barber,
    slot,
    priceSummary,
    duration,
}: {
    location?: BookingLocation;
    services: BookingService[];
    barber?: BookingBarber;
    slot: BookingSlot | null;
    priceSummary: string;
    duration: number;
}) {
    return (
        <aside className="h-fit rounded-lg border border-charcoal/10 bg-white p-5 shadow-sm lg:sticky lg:top-6">
            <h2 className="mb-4 font-display text-3xl tracking-wide">Appointment</h2>
            <div className="space-y-3 text-sm">
                <SummaryLine label="Location" value={location?.name ?? "Select a location"} />
                <SummaryLine label="Services" value={services.length ? `${services.length} selected` : "Select services"} />
                <SummaryLine label="Duration" value={duration ? `${duration} min` : "-"} />
                <SummaryLine label="Barber" value={barber?.displayName ?? "Any available barber"} />
                <SummaryLine label="Time" value={slot ? formatDateTime(slot.startTime) : "Select a time"} />
                <SummaryLine label="Total" value={services.length ? priceSummary : "-"} />
                <SummaryLine label="Payment" value="Pay in shop." />
            </div>
            {services.length > 0 && (
                <div className="mt-5 border-t border-charcoal/10 pt-4">
                    {services.map((service) => (
                        <div key={service.id} className="flex items-center justify-between gap-4 py-2 text-sm">
                            <span>{service.name}</span>
                            <span className="font-semibold">{service.displayPrice}</span>
                        </div>
                    ))}
                </div>
            )}
        </aside>
    );
}

function ConfirmationView({
    catalog,
    confirmation,
}: {
    catalog: BookingCatalog;
    confirmation: BookingConfirmation;
}) {
    const location = catalog.locations.find((candidate) => candidate.id === confirmation.locationId);
    const barber = catalog.barbers.find((candidate) => candidate.id === confirmation.barberId);

    return (
        <main className="grid min-h-screen place-items-center bg-[#f7fbf8] px-4 py-10 text-charcoal">
            <section className="w-full max-w-2xl rounded-lg border border-green/25 bg-white p-6 text-center shadow-sm md:p-8">
                <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-full bg-green text-white">
                    <Check size={28} />
                </div>
                <p className="mb-3 text-sm font-semibold uppercase tracking-widest text-green">
                    Booking confirmed
                </p>
                <h1 className="font-display text-5xl tracking-wide">You’re booked.</h1>
                <div className="mt-6 grid gap-3 rounded-lg bg-cream p-4 text-left text-sm">
                    <SummaryLine label="Location" value={location?.name ?? confirmation.locationId} />
                    <SummaryLine label="Barber" value={barber?.displayName ?? confirmation.barberId} />
                    <SummaryLine label="Time" value={formatDateTime(confirmation.startTime)} />
                    <SummaryLine label="Services" value={summarizeConfirmationServices(confirmation.services)} />
                    <SummaryLine label="Estimated total" value={confirmation.priceSummary} />
                    <SummaryLine label="Payment" value={confirmation.paymentLabel} />
                </div>
                <a
                    href="/"
                    className="mt-6 inline-flex min-h-[44px] items-center justify-center rounded-full border border-charcoal/15 px-6 text-sm font-semibold hover:bg-charcoal/5"
                >
                    Back to website
                </a>
                {(confirmation.rescheduleUrl || confirmation.cancelUrl) && (
                    <div className="mt-3 flex flex-col justify-center gap-2 sm:flex-row">
                        {confirmation.rescheduleUrl && (
                            <a
                                href={confirmation.rescheduleUrl}
                                className="inline-flex min-h-[44px] items-center justify-center rounded-full bg-green px-6 text-sm font-semibold text-white hover:bg-emerald"
                            >
                                Reschedule
                            </a>
                        )}
                        {confirmation.cancelUrl && (
                            <a
                                href={confirmation.cancelUrl}
                                className="inline-flex min-h-[44px] items-center justify-center rounded-full border border-red-200 bg-red-50 px-6 text-sm font-semibold text-red-700 hover:bg-red-100"
                            >
                                Cancel
                            </a>
                        )}
                    </div>
                )}
            </section>
        </main>
    );
}

function StepHeading({
    icon: Icon,
    title,
}: {
    icon: typeof MapPin;
    title: string;
}) {
    return (
        <div className="mb-5 flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-cream text-green">
                <Icon size={20} />
            </span>
            <h2 className="font-display text-4xl tracking-wide">{title}</h2>
        </div>
    );
}

function TextInput({
    label,
    value,
    type = "text",
    inputMode,
    autoComplete,
    error,
    onChange,
}: {
    label: string;
    value: string;
    type?: string;
    inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
    autoComplete?: string;
    error?: string;
    onChange: (value: string) => void;
}) {
    return (
        <label className="block">
            <span className="mb-2 block text-sm font-semibold text-charcoal/70">{label}</span>
            <input
                type={type}
                inputMode={inputMode}
                autoComplete={autoComplete}
                aria-invalid={Boolean(error)}
                value={value}
                onChange={(event) => onChange(event.target.value)}
                className={cn(
                    "h-12 w-full rounded-lg border px-3 outline-none focus:ring-2",
                    error
                        ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                        : "border-charcoal/15 focus:border-green focus:ring-green/20",
                )}
            />
            {error && <span className="mt-2 block text-xs font-semibold text-red-600">{error}</span>}
        </label>
    );
}

function PhoneInput({
    countryCode,
    phone,
    invalid,
    onCountryCodeChange,
    onPhoneChange,
}: {
    countryCode: string;
    phone: string;
    invalid: boolean;
    onCountryCodeChange: (value: string) => void;
    onPhoneChange: (value: string) => void;
}) {
    return (
        <label className="block">
            <span className="mb-2 block text-sm font-semibold text-charcoal/70">Phone</span>
            <span className="grid grid-cols-[112px_1fr] gap-2">
                <select
                    aria-label="Phone country code"
                    value={countryCode}
                    onChange={(event) => onCountryCodeChange(event.target.value)}
                    className="h-12 rounded-lg border border-charcoal/15 bg-white px-3 text-sm font-semibold outline-none focus:border-green focus:ring-2 focus:ring-green/20"
                >
                    {phoneCountryCodes.map((option) => (
                        <option key={option.value} value={option.value}>
                            {option.label}
                        </option>
                    ))}
                </select>
                <input
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel-national"
                    aria-invalid={invalid}
                    value={phone}
                    placeholder="(647) 555-0199"
                    onChange={(event) => onPhoneChange(event.target.value)}
                    className={cn(
                        "h-12 min-w-0 rounded-lg border px-3 outline-none focus:ring-2",
                        invalid
                            ? "border-red-300 focus:border-red-400 focus:ring-red-100"
                            : "border-charcoal/15 focus:border-green focus:ring-green/20",
                    )}
                />
            </span>
            {invalid && (
                <span className="mt-2 block text-xs font-semibold text-red-600">
                    Enter a 10-digit phone number.
                </span>
            )}
        </label>
    );
}

function SummaryLine({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex items-start justify-between gap-4">
            <span className="text-charcoal/55">{label}</span>
            <span className="text-right font-semibold text-charcoal">{value}</span>
        </div>
    );
}

function Notice({ title, tone = "neutral" }: { title: string; tone?: "neutral" | "error" }) {
    return (
        <div
            className={cn(
                "rounded-lg border p-4 text-sm font-semibold",
                tone === "error"
                    ? "border-red-200 bg-red-50 text-red-700"
                    : "border-green/20 bg-cream text-forest",
            )}
        >
            {title}
        </div>
    );
}

function getUniqueSlots(slots: BookingSlot[]) {
    const unique = new Map<string, BookingSlot>();

    for (const slot of slots) {
        if (!unique.has(slot.startTime)) {
            unique.set(slot.startTime, slot);
        }
    }

    return [...unique.values()].sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );
}

function getSlotCountForDate(
    availabilityByDate: Record<string, BookingAvailability>,
    date: string,
) {
    return getUniqueSlots(
        availabilityByDate[date]?.barberSlots.flatMap((barberSlot) => barberSlot.slots) ?? [],
    ).length;
}

function nextStep(step: BookingStep) {
    return bookingSteps[Math.min(bookingSteps.indexOf(step) + 1, bookingSteps.length - 1)];
}

function previousStep(step: BookingStep) {
    return bookingSteps[Math.max(bookingSteps.indexOf(step) - 1, 0)];
}

function canContinue(
    step: BookingStep,
    state: {
        selectedLocationId: string;
        selectedServiceIds: string[];
        selectedSlot: BookingSlot | null;
        customer: CustomerDetails;
    },
) {
    if (step === "services") return state.selectedServiceIds.length > 0;
    if (step === "time") return Boolean(state.selectedSlot);
    if (step === "details") return isCustomerDetailsComplete(state.customer);
    return Boolean(state.selectedLocationId);
}
