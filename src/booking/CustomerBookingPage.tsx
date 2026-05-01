import { type ReactNode, useEffect, useMemo, useState } from "react";
import {
    CalendarClock,
    Check,
    Clock,
    MapPin,
    Scissors,
    TriangleAlert,
    User,
    XCircle,
} from "lucide-react";

import {
    fetchBookingCatalog,
} from "./api";
import {
    cancelCustomerBooking,
    fetchCustomerBooking,
    fetchCustomerRescheduleAvailability,
    rescheduleCustomerBooking,
} from "./customer-management-api";
import type {
    CustomerManagedBooking,
    CustomerRescheduleAvailability,
} from "./customer-management-types";
import {
    formatDateTime,
    formatTime,
    getMaxBookingLocalDate,
    getTodayLocalDate,
    summarizeConfirmationServices,
} from "./booking-utils";
import type {
    BookingBarber,
    BookingCatalog,
    BookingLocation,
    BookingSlot,
} from "./types";

type CustomerRouteAction = "summary" | "cancel" | "reschedule";

interface CustomerRoute {
    token: string;
    action: CustomerRouteAction;
}

export default function CustomerBookingPage() {
    const [route, setRoute] = useState(() => parseCustomerBookingRoute(window.location.pathname));
    const [booking, setBooking] = useState<CustomerManagedBooking | null>(null);
    const [catalog, setCatalog] = useState<BookingCatalog | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState("");
    const [message, setMessage] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const [selectedLocationId, setSelectedLocationId] = useState("");
    const [selectedBarberId, setSelectedBarberId] = useState("");
    const [selectedDate, setSelectedDate] = useState(() => getTodayLocalDate());
    const [availability, setAvailability] = useState<CustomerRescheduleAvailability | null>(null);
    const [availabilityLoading, setAvailabilityLoading] = useState(false);
    const [selectedSlot, setSelectedSlot] = useState<BookingSlot | null>(null);

    useEffect(() => {
        let active = true;
        setLoading(true);

        Promise.all([
            route.token ? fetchCustomerBooking(route.token) : Promise.reject(new Error("Booking link is invalid or expired.")),
            fetchBookingCatalog(),
        ])
            .then(([bookingPayload, catalogPayload]) => {
                if (!active) return;
                setBooking(bookingPayload);
                setCatalog(catalogPayload);
                setSelectedLocationId(bookingPayload.locationId);
                setSelectedBarberId(bookingPayload.barberId);
                setSelectedDate(localDateFromIso(bookingPayload.startTime));
            })
            .catch((fetchError) => {
                if (!active) return;
                setError(fetchError instanceof Error ? fetchError.message : "Booking link is invalid or expired.");
            })
            .finally(() => {
                if (active) setLoading(false);
            });

        return () => {
            active = false;
        };
    }, [route.token]);

    useEffect(() => {
        const onPopState = () => setRoute(parseCustomerBookingRoute(window.location.pathname));
        window.addEventListener("popstate", onPopState);
        return () => window.removeEventListener("popstate", onPopState);
    }, []);

    useEffect(() => {
        if (route.action !== "reschedule" || !route.token || !booking?.canReschedule || !selectedLocationId) {
            return;
        }

        let active = true;
        setAvailabilityLoading(true);
        setSelectedSlot(null);

        fetchCustomerRescheduleAvailability({
            token: route.token,
            locationId: selectedLocationId,
            date: selectedDate,
            barberId: selectedBarberId || undefined,
        })
            .then((payload) => {
                if (!active) return;
                setAvailability(payload);
            })
            .catch((fetchError) => {
                if (!active) return;
                setAvailability(null);
                setError(fetchError instanceof Error ? fetchError.message : "Availability is unavailable.");
            })
            .finally(() => {
                if (active) setAvailabilityLoading(false);
            });

        return () => {
            active = false;
        };
    }, [booking?.canReschedule, route.action, route.token, selectedBarberId, selectedDate, selectedLocationId]);

    const location = catalog?.locations.find((candidate) => candidate.id === booking?.locationId);
    const selectedLocation = catalog?.locations.find((candidate) => candidate.id === selectedLocationId);
    const locationBarbers =
        catalog?.barbers.filter((barber) => barber.locationIds.includes(selectedLocationId)) ?? [];
    const slots = useMemo(
        () =>
            uniqueSlots(
                availability?.barberSlots.flatMap((barberAvailability) => barberAvailability.slots) ?? [],
            ),
        [availability],
    );

    async function cancelBooking() {
        if (!route.token) return;
        setSubmitting(true);
        setError("");
        setMessage("");

        try {
            const cancelled = await cancelCustomerBooking(route.token);
            setBooking(cancelled);
            setMessage("Booking cancelled.");
        } catch (cancelError) {
            setError(cancelError instanceof Error ? cancelError.message : "Cancellation failed.");
        } finally {
            setSubmitting(false);
        }
    }

    async function rescheduleBooking() {
        if (!route.token || !selectedSlot) return;
        setSubmitting(true);
        setError("");
        setMessage("");

        try {
            const updated = await rescheduleCustomerBooking(route.token, {
                locationId: selectedLocationId,
                barberId: selectedBarberId || undefined,
                startTime: selectedSlot.startTime,
            });
            setBooking(updated);
            setSelectedSlot(null);
            setMessage("Booking rescheduled.");
            window.history.replaceState({}, "", `/booking/${route.token}`);
            setRoute({ token: route.token, action: "summary" });
        } catch (rescheduleError) {
            setError(rescheduleError instanceof Error ? rescheduleError.message : "Reschedule failed.");
        } finally {
            setSubmitting(false);
        }
    }

    if (loading) {
        return <CustomerShell><Notice title="Loading booking" /></CustomerShell>;
    }

    if (error && !booking) {
        return (
            <CustomerShell>
                <div className="rounded-lg border border-red-200 bg-red-50 p-5 text-red-700">
                    <div className="mb-3 flex items-center gap-2 font-bold">
                        <TriangleAlert size={18} />
                        Booking link unavailable
                    </div>
                    <p className="text-sm">{error}</p>
                    <HomeLink />
                </div>
            </CustomerShell>
        );
    }

    if (!booking) {
        return <CustomerShell><Notice title="Booking link is invalid or expired." tone="error" /></CustomerShell>;
    }

    return (
        <CustomerShell>
            <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
                <div className="space-y-5 rounded-lg border border-charcoal/10 bg-white p-5 shadow-sm">
                    <div>
                        <p className="text-sm font-semibold uppercase text-green">Manage booking</p>
                        <h1 className="font-display text-5xl tracking-wide">Your appointment</h1>
                    </div>

                    {message && <Notice title={message} tone="success" />}
                    {error && <Notice title={error} tone="error" />}

                    {route.action === "cancel" && (
                        <CancelPanel booking={booking} submitting={submitting} onCancel={cancelBooking} />
                    )}

                    {route.action === "reschedule" && catalog && (
                        <ReschedulePanel
                            booking={booking}
                            catalog={catalog}
                            selectedLocationId={selectedLocationId}
                            selectedBarberId={selectedBarberId}
                            selectedDate={selectedDate}
                            selectedSlot={selectedSlot}
                            selectedLocation={selectedLocation}
                            locationBarbers={locationBarbers}
                            slots={slots}
                            loading={availabilityLoading}
                            submitting={submitting}
                            onLocationChange={(value) => {
                                setSelectedLocationId(value);
                                setSelectedBarberId("");
                            }}
                            onBarberChange={setSelectedBarberId}
                            onDateChange={setSelectedDate}
                            onSelectSlot={setSelectedSlot}
                            onSubmit={rescheduleBooking}
                        />
                    )}

                    {route.action === "summary" && <SummaryActions booking={booking} token={route.token} />}
                </div>

                <BookingSummary booking={booking} location={location} />
            </section>
        </CustomerShell>
    );
}

function CustomerShell({ children }: { children: ReactNode }) {
    return (
        <main className="min-h-screen bg-[#f7fbf8] px-4 py-8 text-charcoal md:px-8">
            <div className="mx-auto max-w-6xl">
                <a href="/" className="mb-8 inline-flex items-center gap-3">
                    <img src="/assets/logo-transparent.png" alt="Leaside Fades" className="h-12" />
                    <span className="font-display text-3xl tracking-wide">LEASIDE FADES</span>
                </a>
                {children}
            </div>
        </main>
    );
}

function CancelPanel({
    booking,
    submitting,
    onCancel,
}: {
    booking: CustomerManagedBooking;
    submitting: boolean;
    onCancel: () => void;
}) {
    return (
        <div className="space-y-4">
            <PanelHeading icon={XCircle} title="Cancel appointment" />
            <p className="text-sm text-charcoal/70">
                {booking.canCancel
                    ? "This will cancel your appointment and free the time for another customer."
                    : "This appointment can no longer be cancelled from this link."}
            </p>
            <button
                type="button"
                disabled={!booking.canCancel || submitting}
                onClick={onCancel}
                className="danger-button justify-center"
            >
                <XCircle size={18} />
                {submitting ? "Cancelling..." : "Cancel booking"}
            </button>
        </div>
    );
}

function ReschedulePanel({
    booking,
    catalog,
    selectedLocationId,
    selectedBarberId,
    selectedDate,
    selectedSlot,
    selectedLocation,
    locationBarbers,
    slots,
    loading,
    submitting,
    onLocationChange,
    onBarberChange,
    onDateChange,
    onSelectSlot,
    onSubmit,
}: {
    booking: CustomerManagedBooking;
    catalog: BookingCatalog;
    selectedLocationId: string;
    selectedBarberId: string;
    selectedDate: string;
    selectedSlot: BookingSlot | null;
    selectedLocation?: BookingLocation;
    locationBarbers: BookingBarber[];
    slots: BookingSlot[];
    loading: boolean;
    submitting: boolean;
    onLocationChange: (value: string) => void;
    onBarberChange: (value: string) => void;
    onDateChange: (value: string) => void;
    onSelectSlot: (slot: BookingSlot) => void;
    onSubmit: () => void;
}) {
    if (!booking.canReschedule) {
        return <Notice title="Only confirmed bookings can be rescheduled." tone="error" />;
    }

    return (
        <div className="space-y-5">
            <PanelHeading icon={CalendarClock} title="Choose a new time" />
            <div className="grid gap-3 md:grid-cols-3">
                <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-charcoal/70">Location</span>
                    <select className="input" value={selectedLocationId} onChange={(event) => onLocationChange(event.target.value)}>
                        {catalog.locations.map((location) => (
                            <option key={location.id} value={location.id}>{location.name}</option>
                        ))}
                    </select>
                </label>
                <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-charcoal/70">Barber</span>
                    <select className="input" value={selectedBarberId} onChange={(event) => onBarberChange(event.target.value)}>
                        <option value="">Any available barber</option>
                        {locationBarbers.map((barber) => (
                            <option key={barber.id} value={barber.id}>{barber.displayName}</option>
                        ))}
                    </select>
                </label>
                <label className="block">
                    <span className="mb-2 block text-sm font-semibold text-charcoal/70">Date</span>
                    <input
                        className="input"
                        type="date"
                        min={getTodayLocalDate()}
                        max={getMaxBookingLocalDate()}
                        value={selectedDate}
                        onChange={(event) => onDateChange(event.target.value)}
                    />
                </label>
            </div>

            <div className="rounded-lg border border-charcoal/10 bg-[#fbfdfb] p-4">
                <div className="mb-3 flex items-center gap-2 text-sm font-bold text-charcoal/70">
                    <MapPin size={16} />
                    {selectedLocation?.name ?? "Selected location"}
                </div>
                {loading && <Notice title="Checking availability" />}
                {!loading && slots.length === 0 && <Notice title="No available times for this date." />}
                {!loading && slots.length > 0 && (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                        {slots.map((slot) => {
                            const selected = selectedSlot?.startTime === slot.startTime;
                            const barber = catalog.barbers.find((candidate) => candidate.id === slot.barberId);

                            return (
                                <button
                                    key={`${slot.startTime}-${slot.barberId}`}
                                    type="button"
                                    onClick={() => onSelectSlot(slot)}
                                    className={selected ? "slot-button-selected" : "slot-button"}
                                >
                                    <span className="font-bold">{formatTime(slot.startTime)}</span>
                                    <span className={selected ? "text-xs text-white/80" : "text-xs text-charcoal/50"}>
                                        {barber?.displayName ?? "Available barber"}
                                    </span>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>

            <button
                type="button"
                disabled={!selectedSlot || submitting}
                onClick={onSubmit}
                className="primary-button w-full justify-center sm:w-auto"
            >
                {submitting ? "Rescheduling..." : "Reschedule booking"}
            </button>
        </div>
    );
}

function SummaryActions({ booking, token }: { booking: CustomerManagedBooking; token: string }) {
    return (
        <div className="grid gap-3 sm:grid-cols-2">
            <a
                href={`/booking/${token}/reschedule`}
                className={booking.canReschedule ? "icon-text-button justify-center" : "icon-text-button pointer-events-none justify-center opacity-50"}
            >
                <CalendarClock size={18} />
                Reschedule
            </a>
            <a
                href={`/booking/${token}/cancel`}
                className={booking.canCancel ? "danger-button justify-center" : "danger-button pointer-events-none justify-center opacity-50"}
            >
                <XCircle size={18} />
                Cancel
            </a>
        </div>
    );
}

function BookingSummary({
    booking,
    location,
}: {
    booking: CustomerManagedBooking;
    location?: BookingLocation;
}) {
    return (
        <aside className="h-fit rounded-lg border border-charcoal/10 bg-white p-5 shadow-sm lg:sticky lg:top-6">
            <h2 className="mb-4 font-display text-3xl tracking-wide">Appointment</h2>
            <div className="space-y-3 text-sm">
                <SummaryLine icon={User} label="Customer" value={booking.customerName} />
                <SummaryLine icon={MapPin} label="Location" value={location?.name ?? booking.locationName} />
                <SummaryLine icon={Scissors} label="Services" value={summarizeConfirmationServices(booking.services)} />
                <SummaryLine icon={Clock} label="Time" value={formatDateTime(booking.startTime)} />
                <SummaryLine icon={Check} label="Status" value={formatStatus(booking.status)} />
                <SummaryLine icon={Scissors} label="Total" value={booking.priceSummary} />
            </div>
            <div className="mt-5 border-t border-charcoal/10 pt-4 text-sm">
                {booking.services.map((service) => (
                    <div key={`${service.serviceName}-${service.sortOrder}`} className="flex items-center justify-between gap-4 py-2">
                        <span>{service.serviceName}</span>
                        <span className="font-semibold">{service.displayPrice}</span>
                    </div>
                ))}
                <div className="mt-3 font-semibold text-forest">{booking.paymentLabel}</div>
            </div>
            <HomeLink />
        </aside>
    );
}

function PanelHeading({ icon: Icon, title }: { icon: typeof CalendarClock; title: string }) {
    return (
        <div className="flex items-center gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-full bg-cream text-green">
                <Icon size={20} />
            </span>
            <h2 className="font-display text-4xl tracking-wide">{title}</h2>
        </div>
    );
}

function SummaryLine({
    icon: Icon,
    label,
    value,
}: {
    icon: typeof User;
    label: string;
    value: string;
}) {
    return (
        <div className="flex items-start justify-between gap-4">
            <span className="inline-flex items-center gap-2 text-charcoal/55">
                <Icon size={14} />
                {label}
            </span>
            <span className="text-right font-semibold">{value}</span>
        </div>
    );
}

function Notice({ title, tone = "neutral" }: { title: string; tone?: "neutral" | "error" | "success" }) {
    const classes =
        tone === "error"
            ? "border-red-200 bg-red-50 text-red-700"
            : tone === "success"
              ? "border-green/20 bg-cream text-forest"
              : "border-charcoal/10 bg-white text-charcoal/70";

    return <div className={`rounded-lg border p-4 text-sm font-semibold ${classes}`}>{title}</div>;
}

function HomeLink() {
    return (
        <a href="/" className="mt-5 inline-flex min-h-[44px] items-center justify-center rounded-full border border-charcoal/15 px-5 text-sm font-semibold hover:bg-charcoal/5">
            Back to website
        </a>
    );
}

function parseCustomerBookingRoute(pathname: string): CustomerRoute {
    const [, token = "", action = "summary"] = pathname.split("/").filter(Boolean);

    return {
        token,
        action: action === "cancel" || action === "reschedule" ? action : "summary",
    };
}

function uniqueSlots(slots: BookingSlot[]) {
    const unique = new Map<string, BookingSlot>();

    for (const slot of slots) {
        const key = `${slot.startTime}-${slot.barberId}`;
        if (!unique.has(key)) {
            unique.set(key, slot);
        }
    }

    return [...unique.values()].sort(
        (a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime(),
    );
}

function localDateFromIso(value: string) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Toronto",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
    }).formatToParts(new Date(value));
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
    return `${get("year")}-${get("month")}-${get("day")}`;
}

function formatStatus(status: CustomerManagedBooking["status"]) {
    return status
        .split("_")
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(" ");
}
