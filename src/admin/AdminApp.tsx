import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
    Ban,
    Bell,
    CalendarClock,
    CalendarDays,
    CalendarPlus,
    Check,
    ChevronLeft,
    ChevronRight,
    ClipboardList,
    Clock,
    LayoutDashboard,
    LogOut,
    MapPin,
    RefreshCw,
    Scissors,
    Search,
    UserRound,
    X,
} from "lucide-react";

import lauraThumb from "../assets/barbers/booking-thumbnails/laura-thumb.jpg";
import samThumb from "../assets/barbers/booking-thumbnails/sam-thumb.jpg";
import yogeshThumb from "../assets/barbers/booking-thumbnails/yogesh-thumb.jpg";
import fawadPhoto from "../assets/barbers/fawad.png";
import shayonPhoto from "../assets/barbers/shayon.png";
import {
    cancelAdminBooking,
    createManualBooking,
    createWalkInBooking,
    fetchAdminAvailability,
    fetchAdminBookingDetail,
    fetchAdminBookings,
    fetchAdminCalendarOptions,
    fetchAdminDashboard,
    fetchAdminSchedule,
    fetchAdminSession,
    loginAdmin,
    logoutAdmin,
    markAdminBookingNoShow,
    rescheduleAdminBooking,
} from "./api";
import SchedulePage from "./SchedulePage";
import {
    addDaysToLocalDate,
    buildBookingDragPayload,
    buildCalendarBoardRows,
    buildMonthDays,
    buildWeekDays,
    formatAdminStatus,
    formatLocalDateTime,
    formatLocalTime,
    getBookingCardTone,
    groupBookingsByLocalDate,
    todayLocalDate,
} from "./admin-utils";
import type {
    AdminAvailability,
    AdminBarberOption,
    AdminBlockedTime,
    AdminBookingDetail,
    AdminBookingFilters,
    AdminBookingSummary,
    AdminCalendarOptions,
    AdminDashboardActivity,
    AdminDashboardSnapshot,
    AdminSchedule,
    AdminServiceOption,
    AdminSlot,
    SafeAdminUser,
} from "./types";

type AdminView = "day" | "week" | "month" | "list";
interface AppointmentPreview {
    barberId: string;
    locationId: string;
    startTime: string;
    endTime: string;
}

type DrawerState =
    | { mode: "detail"; bookingId: string }
    | { mode: "add_appointment"; barberId: string; locationId: string; startTime: string }
    | null;

const TIME_ZONE = "America/Toronto";
const SLOT_HEIGHT = 42;
const TIME_GUTTER_WIDTH = "clamp(88px, 7vw, 132px)";

const defaultFilters = (date = todayLocalDate(), view: AdminView = "day"): AdminBookingFilters => ({
    ...dateRangeForView(view, date),
    locationId: "",
    barberId: "",
    status: "",
});

export default function AdminApp() {
    const [path, setPath] = useState(window.location.pathname);
    const [user, setUser] = useState<SafeAdminUser | null>(null);
    const [sessionLoading, setSessionLoading] = useState(true);

    useEffect(() => {
        const handlePopState = () => setPath(window.location.pathname);
        window.addEventListener("popstate", handlePopState);
        return () => window.removeEventListener("popstate", handlePopState);
    }, []);

    useEffect(() => {
        fetchAdminSession()
            .then((session) => setUser(session.user))
            .catch(() => setUser(null))
            .finally(() => setSessionLoading(false));
    }, []);

    function navigate(nextPath: string) {
        window.history.pushState({}, "", nextPath);
        setPath(nextPath);
    }

    async function handleLogout() {
        await logoutAdmin();
        setUser(null);
        navigate("/admin/login");
    }

    if (sessionLoading) {
        return <AdminSplash label="Loading admin workspace" />;
    }

    if (!user || path === "/admin/login") {
        return <LoginPage onLogin={setUser} onNavigate={navigate} />;
    }

    return (
        <AdminWorkspace
            path={path}
            user={user}
            onNavigate={navigate}
            onLogout={handleLogout}
        />
    );
}

function LoginPage({
    onLogin,
    onNavigate,
}: {
    onLogin: (user: SafeAdminUser) => void;
    onNavigate: (path: string) => void;
}) {
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        setSubmitting(true);
        setError("");

        try {
            const session = await loginAdmin(email, password);
            onLogin(session.user);
            onNavigate(session.user.role === "barber" ? "/admin/calendar" : "/admin/dashboard");
        } catch (error) {
            setError(error instanceof Error ? error.message : "Login failed.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <main className="min-h-screen bg-cream text-charcoal">
            <section className="mx-auto flex min-h-screen w-full max-w-[min(92vw,34rem)] flex-col justify-center px-6 py-12">
                <div className="mb-8 md:mb-10">
                    <p className="text-base font-semibold uppercase tracking-[0.22em] text-green md:text-lg">Leaside Fades</p>
                    <h1 className="mt-2 text-5xl font-black leading-tight text-forest md:text-6xl">Admin login</h1>
                </div>
                <form onSubmit={handleSubmit} className="space-y-6 rounded-md border border-forest/10 bg-white p-6 shadow-sm md:p-8">
                    <Field label="Email">
                        <input
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            className="input"
                            type="email"
                            autoComplete="email"
                            required
                        />
                    </Field>
                    <Field label="Password">
                        <input
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            className="input"
                            type="password"
                            autoComplete="current-password"
                            required
                        />
                    </Field>
                    {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}
                    <button className="primary-button w-full text-lg md:text-xl" type="submit" disabled={submitting}>
                        {submitting ? "Signing in" : "Sign in"}
                    </button>
                </form>
            </section>
        </main>
    );
}

function AdminWorkspace({
    path,
    user,
    onNavigate,
    onLogout,
}: {
    path: string;
    user: SafeAdminUser;
    onNavigate: (path: string) => void;
    onLogout: () => void;
}) {
    const [options, setOptions] = useState<AdminCalendarOptions | null>(null);
    const [schedule, setSchedule] = useState<AdminSchedule | null>(null);
    const [dashboard, setDashboard] = useState<AdminDashboardSnapshot | null>(null);
    const [bookings, setBookings] = useState<AdminBookingSummary[]>([]);
    const [filters, setFilters] = useState<AdminBookingFilters>(() => defaultFilters());
    const [view, setView] = useState<AdminView>(path.startsWith("/admin/bookings") ? "list" : "day");
    const [drawer, setDrawer] = useState<DrawerState>(null);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const [dashboardLoading, setDashboardLoading] = useState(false);
    const [appointmentPreview, setAppointmentPreview] = useState<AppointmentPreview | null>(null);
    const [draggingBookingId, setDraggingBookingId] = useState<string | null>(null);
    const [pendingDragId, setPendingDragId] = useState<string | null>(null);
    const detailId = path.match(/^\/admin\/bookings\/([^/]+)$/)?.[1];
    const isDashboardPath = path.startsWith("/admin/dashboard");
    const isShiftsPath = path.startsWith("/admin/shifts");
    const isBlockedTimePath = path.startsWith("/admin/blocked-time");
    const isSchedulePath = isShiftsPath || isBlockedTimePath;
    const selectedDate = filters.from || todayLocalDate();
    const pageTitle = isDashboardPath ? "Dashboard" : isShiftsPath ? "Staff shifts" : isBlockedTimePath ? "Blocked time" : "Calendar";

    useEffect(() => {
        fetchAdminCalendarOptions()
            .then(setOptions)
            .catch((error) => setError(error instanceof Error ? error.message : "Failed to load admin options."));
    }, []);

    useEffect(() => {
        if (!options) return;

        const nextLocationId = filters.locationId || resolveDefaultLocationId(options, user);
        const nextBarberId = user.role === "barber" && user.barberId ? user.barberId : filters.barberId || "";

        if (nextLocationId !== filters.locationId || nextBarberId !== filters.barberId) {
            setFilters((current) => ({
                ...current,
                locationId: nextLocationId,
                barberId: nextBarberId,
            }));
        }
    }, [filters.barberId, filters.locationId, options, user]);

    useEffect(() => {
        if (path.startsWith("/admin/bookings")) {
            setView("list");
            setDrawer(null);
        } else if (path.startsWith("/admin/dashboard")) {
            setDrawer(null);
        } else if (path.startsWith("/admin/calendar") && view === "list") {
            setView("day");
        }
    }, [path, view]);

    useEffect(() => {
        if (isSchedulePath) {
            setLoading(false);
            return;
        }

        let cancelled = false;
        setLoading(true);
        fetchAdminBookings(filters)
            .then((response) => {
                if (!cancelled) setBookings(response.bookings);
            })
            .catch((error) => {
                if (!cancelled) setError(error instanceof Error ? error.message : "Failed to load bookings.");
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [filters, isSchedulePath]);

    useEffect(() => {
        if (isSchedulePath) return;

        let cancelled = false;
        fetchAdminSchedule({ from: filters.from, to: filters.to })
            .then((response) => {
                if (!cancelled) setSchedule(response);
            })
            .catch((error) => {
                if (!cancelled) setError(error instanceof Error ? error.message : "Failed to load schedule context.");
            });

        return () => {
            cancelled = true;
        };
    }, [filters.from, filters.to, isSchedulePath]);

    useEffect(() => {
        if (!isDashboardPath) return;

        let cancelled = false;
        setDashboardLoading(true);
        fetchAdminDashboard()
            .then((response) => {
                if (!cancelled) setDashboard(response);
            })
            .catch((error) => {
                if (!cancelled) setError(error instanceof Error ? error.message : "Failed to load dashboard.");
            })
            .finally(() => {
                if (!cancelled) setDashboardLoading(false);
            });

        return () => {
            cancelled = true;
        };
    }, [isDashboardPath]);

    async function refreshBookings() {
        const response = await fetchAdminBookings(filters);
        setBookings(response.bookings);

        if (!isSchedulePath) {
            const scheduleResponse = await fetchAdminSchedule({ from: filters.from, to: filters.to });
            setSchedule(scheduleResponse);
        }

        if (isDashboardPath) {
            await refreshDashboard();
        }
    }

    async function refreshDashboard() {
        setDashboardLoading(true);
        try {
            setDashboard(await fetchAdminDashboard());
        } finally {
            setDashboardLoading(false);
        }
    }

    function openAddAppointment(input?: Partial<{ barberId: string; locationId: string; startTime: string }>) {
        const barberId = input?.barberId ?? visibleBarbers[0]?.id ?? user.barberId ?? "";
        const locationId = input?.locationId ?? activeLocationId;
        const startTime = input?.startTime ?? localDateTimeToIso(selectedDate, defaultAppointmentClockForDate(selectedDate));

        setDrawer({ mode: "add_appointment", barberId, locationId, startTime });
    }

    function applyDate(nextDate: string, nextView = view) {
        setFilters((current) => ({
            ...current,
            ...dateRangeForView(nextView, nextDate),
        }));
    }

    function changeView(nextView: AdminView) {
        setView(nextView);
        applyDate(selectedDate, nextView);

        if (nextView === "list") {
            onNavigate("/admin/bookings");
            return;
        }

        if (!path.startsWith("/admin/calendar")) {
            onNavigate("/admin/calendar");
        }
    }

    async function handleBookingDrop(
        booking: AdminBookingSummary,
        targetBarberId: string,
        targetLocationId: string,
        targetStartTime: string,
    ) {
        const payload = buildBookingDragPayload({
            user,
            booking,
            targetBarberId,
            targetLocationId,
            targetStartTime,
        });

        if (!payload) {
            setError("This booking cannot be moved there.");
            return;
        }

        setPendingDragId(booking.id);
        setError("");

        try {
            await rescheduleAdminBooking(booking.id, payload);
            setMessage("Booking rescheduled.");
            await refreshBookings();
        } catch (error) {
            setError(error instanceof Error ? error.message : "Reschedule failed. The booking stayed in its original slot.");
        } finally {
            setPendingDragId(null);
            setDraggingBookingId(null);
        }
    }

    const groupedBookings = useMemo(() => groupBookingsByLocalDate(bookings), [bookings]);
    const visibleDays = view === "month" ? buildMonthDays(selectedDate) : buildWeekDays(selectedDate);
    const activeLocationId = options ? resolveDefaultLocationId(options, user, filters.locationId) : "";
    const visibleBarbers = options ? getVisibleBarbers(options, user, activeLocationId, filters.barberId) : [];
    const isDayCalendarPath =
        !isDashboardPath &&
        !isSchedulePath &&
        !detailId &&
        !path.startsWith("/admin/bookings") &&
        view === "day";
    const workspaceColumns = drawer
        ? "lg:grid-cols-[clamp(88px,8vw,132px)_minmax(0,1fr)] xl:grid-cols-[clamp(88px,8vw,132px)_minmax(0,1fr)_minmax(24rem,34rem)]"
        : "lg:grid-cols-[clamp(88px,8vw,132px)_minmax(0,1fr)]";

    return (
        <main className={`flex h-dvh min-h-0 flex-col overflow-hidden bg-[#f4f7f2] text-[clamp(18px,1.3vw,20px)] text-charcoal lg:grid ${workspaceColumns}`}>
            <AdminRail path={path} user={user} onNavigate={onNavigate} onLogout={onLogout} />
            <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <CalendarTopbar
                    title={pageTitle}
                    view={view}
                    filters={filters}
                    options={options}
                    user={user}
                    loading={isDashboardPath ? dashboardLoading : loading}
                    isDashboardPath={isDashboardPath}
                    isSchedulePath={isSchedulePath}
                    onView={changeView}
                    onDate={applyDate}
                    onChangeFilters={setFilters}
                    onRefresh={isDashboardPath ? refreshDashboard : refreshBookings}
                    onNewBooking={() => openAddAppointment()}
                />
                <section
                    className={`min-h-0 min-w-0 flex-1 px-4 pb-5 pt-4 lg:px-7 ${
                        isDayCalendarPath ? "flex flex-col overflow-hidden" : "overflow-y-auto"
                    }`}
                >
                    <div className="mb-3 space-y-2">
                        {message && <Notice tone="success" message={message} onClear={() => setMessage("")} />}
                        {error && <Notice tone="error" message={error} onClear={() => setError("")} />}
                    </div>
                    {isDashboardPath ? (
                        <DashboardPage
                            dashboard={dashboard}
                            loading={dashboardLoading}
                            onOpenBooking={(bookingId) => setDrawer({ mode: "detail", bookingId })}
                        />
                    ) : isSchedulePath ? (
                        <SchedulePage mode={isBlockedTimePath ? "blocked" : "shifts"} user={user} />
                    ) : detailId ? (
                        <BookingDetailView
                            bookingId={detailId}
                            options={options}
                            user={user}
                            onBack={() => onNavigate("/admin/bookings")}
                            onChanged={async (nextMessage) => {
                                setMessage(nextMessage);
                                await refreshBookings();
                            }}
                        />
                    ) : view === "list" || path.startsWith("/admin/bookings") ? (
                        <BookingList
                            bookings={bookings}
                            loading={loading}
                            onOpen={(bookingId) => onNavigate(`/admin/bookings/${bookingId}`)}
                        />
                    ) : view === "day" ? (
                        <DayCalendarBoard
                            bookings={bookings}
                            schedule={schedule}
                            options={options}
                            user={user}
                            selectedDate={selectedDate}
                            locationId={activeLocationId}
                            barbers={visibleBarbers}
                            loading={loading}
                            draggingBookingId={draggingBookingId}
                            pendingDragId={pendingDragId}
                            appointmentPreview={appointmentPreview}
                            onOpen={(bookingId) => setDrawer({ mode: "detail", bookingId })}
                            onSlot={(barberId, startTime) =>
                                openAddAppointment({ barberId, locationId: activeLocationId, startTime })
                            }
                            onDragStart={setDraggingBookingId}
                            onDragEnd={() => setDraggingBookingId(null)}
                            onDropBooking={handleBookingDrop}
                        />
                    ) : (
                        <CalendarGrid
                            days={visibleDays}
                            bookingsByDate={groupedBookings}
                            view={view}
                            onOpen={(bookingId) => setDrawer({ mode: "detail", bookingId })}
                        />
                    )}
                </section>
            </section>
            {drawer?.mode === "detail" && (
                <BookingDetailDrawer
                    bookingId={drawer.bookingId}
                    options={options}
                    user={user}
                    onClose={() => setDrawer(null)}
                    onChanged={async (nextMessage) => {
                        setMessage(nextMessage);
                        await refreshBookings();
                    }}
                />
            )}
            {drawer?.mode === "add_appointment" && options && (
                <AddAppointmentDrawer
                    key={`${drawer.barberId}-${drawer.startTime}`}
                    options={options}
                    user={user}
                    initialBarberId={drawer.barberId}
                    initialLocationId={drawer.locationId}
                    initialStartTime={drawer.startTime}
                    onPreviewChange={setAppointmentPreview}
                    onClose={() => {
                        setAppointmentPreview(null);
                        setDrawer(null);
                    }}
                    onCreated={async () => {
                        setAppointmentPreview(null);
                        setDrawer(null);
                        setMessage("Appointment created.");
                        await refreshBookings();
                    }}
                />
            )}
        </main>
    );
}

function AdminRail({
    path,
    user,
    onNavigate,
    onLogout,
}: {
    path: string;
    user: SafeAdminUser;
    onNavigate: (path: string) => void;
    onLogout: () => void;
}) {
    const items = [
        { label: "Dashboard", path: "/admin/dashboard", icon: LayoutDashboard },
        { label: "Calendar", path: "/admin/calendar", icon: CalendarClock },
        { label: "Bookings", path: "/admin/bookings", icon: ClipboardList },
        { label: "Shifts", path: "/admin/shifts", icon: Clock },
        { label: "Blocked", path: "/admin/blocked-time", icon: Ban },
    ];

    return (
        <aside className="sticky top-0 z-30 flex min-h-20 items-center justify-between gap-3 border-b border-white/10 bg-[#08110e] px-4 text-white lg:h-screen lg:min-h-screen lg:flex-col lg:items-stretch lg:border-b-0 lg:px-3 lg:py-6 2xl:px-4">
            <button
                className="flex min-w-0 items-center gap-3 rounded-md px-2 py-2 text-left lg:flex-col lg:justify-center"
                onClick={() => onNavigate(user.role === "barber" ? "/admin/calendar" : "/admin/dashboard")}
                title="Leaside Fades"
            >
                <span className="flex size-14 items-center justify-center overflow-hidden rounded-md bg-white p-1.5 2xl:size-16">
                    <img src="/assets/logo-transparent.png" alt="Leaside Fades" className="h-full w-full object-contain" />
                </span>
                <span className="hidden text-sm font-black uppercase tracking-[0.16em] text-white/70 lg:block">Leaside</span>
            </button>
            <nav className="flex flex-1 items-center justify-center gap-2 lg:flex-col lg:justify-start">
                {items.map((item) => {
                    const Icon = item.icon;
                    const active = path.startsWith(item.path);
                    return (
                        <button
                            key={item.path}
                            className={`flex size-14 items-center justify-center rounded-md transition 2xl:size-16 lg:w-full ${
                                active ? "bg-green text-[#08110e]" : "text-white/72 hover:bg-white/10 hover:text-white"
                            }`}
                            onClick={() => onNavigate(item.path)}
                            title={item.label}
                        >
                            <Icon size={28} />
                        </button>
                    );
                })}
            </nav>
            <div className="flex items-center gap-1 lg:flex-col">
                <button className="flex size-12 items-center justify-center rounded-md bg-white/8 text-white 2xl:size-14" title={`${user.displayName} (${user.role})`}>
                    <UserRound size={26} />
                </button>
                <button className="flex size-12 items-center justify-center rounded-md text-white/72 hover:bg-white/10 hover:text-white 2xl:size-14" onClick={onLogout} title="Sign out">
                    <LogOut size={26} />
                </button>
            </div>
        </aside>
    );
}

function CalendarTopbar({
    title,
    view,
    filters,
    options,
    user,
    loading,
    isDashboardPath,
    isSchedulePath,
    onView,
    onDate,
    onChangeFilters,
    onRefresh,
    onNewBooking,
}: {
    title: string;
    view: AdminView;
    filters: AdminBookingFilters;
    options: AdminCalendarOptions | null;
    user: SafeAdminUser;
    loading: boolean;
    isDashboardPath: boolean;
    isSchedulePath: boolean;
    onView: (view: AdminView) => void;
    onDate: (date: string) => void;
    onChangeFilters: (filters: AdminBookingFilters) => void;
    onRefresh: () => Promise<void>;
    onNewBooking: () => void;
}) {
    const selectedDate = filters.from || todayLocalDate();
    const step = view === "month" ? 30 : view === "week" || view === "list" ? 7 : 1;
    const locationId = options ? resolveDefaultLocationId(options, user, filters.locationId) : filters.locationId ?? "";
    const availableBarbers = options ? getVisibleBarbers(options, user, locationId) : [];

    return (
        <header className="sticky top-0 z-20 max-h-[44dvh] shrink-0 overflow-y-auto border-b border-[#cfdacf] bg-white/95 px-4 py-4 backdrop-blur lg:max-h-none lg:overflow-visible lg:px-6 2xl:px-8 2xl:py-5">
            <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,auto)_minmax(0,1fr)] 2xl:items-center 2xl:gap-5">
                <div className="flex min-w-0 flex-wrap items-center gap-3">
                    <button className="text-button bg-white" onClick={() => onDate(todayLocalDate())} disabled={isSchedulePath}>
                        Today
                    </button>
                    <button className="icon-button" onClick={() => onDate(addDaysToLocalDate(selectedDate, -step))} title="Previous" disabled={isSchedulePath}>
                        <ChevronLeft size={24} />
                    </button>
                    <button className="icon-button" onClick={() => onDate(addDaysToLocalDate(selectedDate, step))} title="Next" disabled={isSchedulePath}>
                        <ChevronRight size={24} />
                    </button>
                    <div className="min-w-0 px-2 2xl:px-4">
                        <p className="truncate text-3xl font-black text-forest">{isSchedulePath ? title : formatDateTitle(selectedDate, view)}</p>
                        <p className="text-sm font-bold uppercase tracking-[0.12em] text-charcoal/50">{isSchedulePath ? "Setup" : title}</p>
                    </div>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-3 2xl:justify-end">
                    {!isSchedulePath && !isDashboardPath && (
                        <>
                            <select
                                className="input h-14 min-w-[min(14rem,100%)] flex-[1_1_15rem] 2xl:max-w-72"
                                value={locationId}
                                onChange={(event) => onChangeFilters({ ...filters, locationId: event.target.value })}
                            >
                                {options?.locations.map((location) => (
                                    <option key={location.id} value={location.id}>
                                        {location.name}
                                    </option>
                                ))}
                            </select>
                            <select
                                className="input h-14 min-w-[min(14rem,100%)] flex-[1_1_15rem] 2xl:max-w-72"
                                value={filters.barberId ?? ""}
                                onChange={(event) => onChangeFilters({ ...filters, barberId: event.target.value })}
                                disabled={user.role === "barber"}
                            >
                                {user.role !== "barber" && <option value="">All team members</option>}
                                {availableBarbers.map((barber) => (
                                    <option key={barber.id} value={barber.id}>
                                        {barber.displayName}
                                    </option>
                                ))}
                            </select>
                            <select
                                className="input h-14 min-w-[min(12rem,100%)] flex-[1_1_12rem] 2xl:max-w-56"
                                value={filters.status ?? ""}
                                onChange={(event) => onChangeFilters({ ...filters, status: event.target.value as AdminBookingFilters["status"] })}
                            >
                                <option value="">All statuses</option>
                                <option value="confirmed">Confirmed</option>
                                <option value="cancelled">Cancelled</option>
                                <option value="completed">Completed</option>
                                <option value="no_show">No show</option>
                            </select>
                            <div className="flex max-w-full shrink-0 overflow-x-auto rounded-md border border-forest/10 bg-[#f7faf7] p-1">
                                {(["day", "week", "month", "list"] as AdminView[]).map((item) => (
                                    <button
                                        key={item}
                                        className={view === item ? "segmented-active min-h-12 shrink-0 px-5 py-2.5 text-base" : "segmented min-h-12 shrink-0 border-0 bg-transparent px-5 py-2.5 text-base"}
                                        onClick={() => onView(item)}
                                    >
                                        {item}
                                    </button>
                                ))}
                            </div>
                            <button className="icon-button" onClick={onRefresh} title="Refresh bookings">
                                <RefreshCw size={24} className={loading ? "animate-spin" : ""} />
                            </button>
                            <button className="icon-text-button" onClick={onNewBooking}>
                                <CalendarPlus size={22} />
                                Add appointment
                            </button>
                        </>
                    )}
                    {isDashboardPath && (
                        <>
                            <button className="icon-button" onClick={onRefresh} title="Refresh dashboard">
                                <RefreshCw size={24} className={loading ? "animate-spin" : ""} />
                            </button>
                            <button className="primary-button inline-flex items-center gap-2" onClick={onNewBooking}>
                                <CalendarPlus size={22} />
                                Add appointment
                            </button>
                        </>
                    )}
                </div>
            </div>
        </header>
    );
}

function DashboardPage({
    dashboard,
    loading,
    onOpenBooking,
}: {
    dashboard: AdminDashboardSnapshot | null;
    loading: boolean;
    onOpenBooking: (bookingId: string) => void;
}) {
    const today = dashboard?.todayBookings ?? [];
    const upcoming = dashboard?.upcomingBookings ?? [];
    const activity = dashboard?.activity ?? [];

    if (loading && !dashboard) {
        return (
            <section className="flex min-h-[560px] items-center justify-center rounded-md border border-[#d6ded6] bg-white text-xl font-bold text-charcoal/60">
                <RefreshCw size={24} className="mr-3 animate-spin" />
                Loading dashboard
            </section>
        );
    }

    return (
        <div className="space-y-5">
            <section className="grid gap-4 xl:grid-cols-3">
                <DashboardStat title="Today" value={`${today.length}`} label="appointments" />
                <DashboardStat title="Upcoming" value={`${upcoming.length}`} label="next 7 days" />
                <DashboardStat title="Activity" value={`${activity.length}`} label="recent items" />
            </section>
            <section className="grid gap-5 2xl:grid-cols-[1fr_1.15fr]">
                <DashboardAppointments
                    title="Today"
                    empty="No appointments today."
                    bookings={today}
                    onOpenBooking={onOpenBooking}
                />
                <NotificationCenter activity={activity} onOpenBooking={onOpenBooking} />
            </section>
            <DashboardAppointments
                title="Upcoming appointments"
                empty="No upcoming appointments in the next week."
                bookings={upcoming}
                onOpenBooking={onOpenBooking}
                compact
            />
        </div>
    );
}

function DashboardStat({ title, value, label }: { title: string; value: string; label: string }) {
    return (
        <div className="rounded-md border border-[#d7e0d7] bg-white p-5 shadow-sm">
            <p className="text-sm font-black uppercase tracking-[0.14em] text-charcoal/45">{title}</p>
            <p className="mt-2 text-5xl font-black text-forest">{value}</p>
            <p className="text-base font-bold text-charcoal/55">{label}</p>
        </div>
    );
}

function DashboardAppointments({
    title,
    empty,
    bookings,
    onOpenBooking,
    compact = false,
}: {
    title: string;
    empty: string;
    bookings: AdminBookingSummary[];
    onOpenBooking: (bookingId: string) => void;
    compact?: boolean;
}) {
    return (
        <section className="rounded-md border border-[#d7e0d7] bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-[#d7e0d7] px-5 py-4">
                <CalendarDays size={21} className="text-green" />
                <h2 className="text-2xl font-black text-forest">{title}</h2>
            </div>
            {bookings.length === 0 ? (
                <p className="p-5 text-lg font-bold text-charcoal/55">{empty}</p>
            ) : (
                <div className={compact ? "grid gap-px bg-[#d7e0d7] md:grid-cols-2 xl:grid-cols-3" : "divide-y divide-[#e1e8e1]"}>
                    {bookings.map((booking) => (
                        <button
                            key={`${title}-${booking.id}`}
                            className="min-w-0 bg-white p-4 text-left transition hover:bg-[#f8fbf8]"
                            onClick={() => onOpenBooking(booking.id)}
                        >
                            <span className="block text-sm font-black uppercase tracking-[0.12em] text-green">{formatLocalTime(booking.startTime)}</span>
                            <span className="mt-1 block truncate text-xl font-black text-forest">{booking.customerName}</span>
                            <span className="block truncate text-base font-bold text-charcoal/60">{booking.services.join(", ")}</span>
                            <span className="mt-2 block truncate text-sm font-bold text-charcoal/55">{booking.barberName} - {booking.locationName}</span>
                        </button>
                    ))}
                </div>
            )}
        </section>
    );
}

function NotificationCenter({
    activity,
    onOpenBooking,
}: {
    activity: AdminDashboardActivity[];
    onOpenBooking: (bookingId: string) => void;
}) {
    return (
        <section className="rounded-md border border-[#d7e0d7] bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-[#d7e0d7] px-5 py-4">
                <Bell size={21} className="text-green" />
                <h2 className="text-2xl font-black text-forest">Notification Center</h2>
            </div>
            {activity.length === 0 ? (
                <p className="p-5 text-lg font-bold text-charcoal/55">No recent appointment activity.</p>
            ) : (
                <div className="max-h-[620px] divide-y divide-[#e1e8e1] overflow-y-auto">
                    {activity.map((item) => (
                        <button
                            key={item.id}
                            className="grid w-full gap-3 px-5 py-4 text-left transition hover:bg-[#f8fbf8] md:grid-cols-[1fr_auto]"
                            onClick={() => onOpenBooking(item.bookingId)}
                        >
                            <span className="min-w-0">
                                <span className="block text-sm font-black uppercase tracking-[0.12em] text-green">{activityLabel(item.eventType)}</span>
                                <span className="mt-1 block truncate text-xl font-black text-forest">{item.customerName}</span>
                                <span className="block truncate text-base font-bold text-charcoal/62">
                                    {item.services.join(", ") || "Appointment"} with {item.barberName}
                                </span>
                                <span className="mt-2 block truncate text-sm font-bold text-charcoal/50">
                                    {formatLocalDateTime(item.appointmentStartTime)} - {item.locationName}
                                </span>
                            </span>
                            <span className="flex flex-wrap items-start gap-2 md:justify-end">
                                <ActivityPill label={formatAdminStatus(item.appointmentStatus)} tone={item.appointmentStatus} />
                                <ActivityPill label={activityStatusLabel(item)} tone={item.status} />
                                <span className="rounded-full bg-[#eef5f1] px-3 py-1 text-xs font-black uppercase tracking-[0.08em] text-charcoal/60">
                                    {item.recipientLabel}
                                </span>
                            </span>
                        </button>
                    ))}
                </div>
            )}
        </section>
    );
}

function ActivityPill({ label, tone }: { label: string; tone: string }) {
    const classes =
        tone === "failed"
            ? "bg-red-100 text-red-800"
            : tone === "skipped" || tone === "cancelled" || tone === "no_show"
              ? "bg-amber-100 text-amber-800"
              : tone === "sent" || tone === "confirmed"
                ? "bg-green/20 text-forest"
                : "bg-[#eef5f1] text-charcoal/65";

    return <span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.08em] ${classes}`}>{label}</span>;
}

function DayCalendarBoard({
    bookings,
    schedule,
    options,
    user,
    selectedDate,
    locationId,
    barbers,
    loading,
    draggingBookingId,
    pendingDragId,
    appointmentPreview,
    onOpen,
    onSlot,
    onDragStart,
    onDragEnd,
    onDropBooking,
}: {
    bookings: AdminBookingSummary[];
    schedule: AdminSchedule | null;
    options: AdminCalendarOptions | null;
    user: SafeAdminUser;
    selectedDate: string;
    locationId: string;
    barbers: AdminBarberOption[];
    loading: boolean;
    draggingBookingId: string | null;
    pendingDragId: string | null;
    appointmentPreview: AppointmentPreview | null;
    onOpen: (bookingId: string) => void;
    onSlot: (barberId: string, startTime: string) => void;
    onDragStart: (bookingId: string) => void;
    onDragEnd: () => void;
    onDropBooking: (
        booking: AdminBookingSummary,
        targetBarberId: string,
        targetLocationId: string,
        targetStartTime: string,
    ) => Promise<void>;
}) {
    const window = businessWindowForDate(selectedDate);
    const boardRows = buildCalendarBoardRows(window.start, window.end, 15);
    const slots = boardRows.bookableSlots;
    const bookingsBySlot = useMemo(() => indexBookingsByBarberAndTime(bookings, selectedDate, locationId), [bookings, locationId, selectedDate]);
    const barberColumnMin = barbers.length >= 3 ? 190 : barbers.length === 2 ? 260 : 320;
    const boardMinWidth = 132 + Math.max(barbers.length, 1) * barberColumnMin;
    const gridTemplateColumns = `${TIME_GUTTER_WIDTH} repeat(${Math.max(barbers.length, 1)}, minmax(${barberColumnMin}px, 1fr))`;
    const headerAvatarSize = barbers.length >= 3 ? "md" : "lg";

    if (!options || loading) {
        return (
            <section className="flex min-h-[640px] items-center justify-center rounded-md border border-[#d6ded6] bg-white text-xl font-bold text-charcoal/60">
                <RefreshCw size={24} className="mr-3 animate-spin" />
                Loading calendar
            </section>
        );
    }

    if (barbers.length === 0) {
        return (
            <section className="rounded-md border border-[#d6ded6] bg-white p-8 text-xl font-bold text-charcoal/60">
                No active barbers are available for this calendar filter.
            </section>
        );
    }

    return (
        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-[#d4ddd4] bg-white shadow-sm">
            <div className="shrink-0 flex flex-wrap items-center justify-between gap-4 border-b border-[#cfdacf] px-6 py-5">
                <div className="flex items-center gap-3 text-2xl font-black text-forest">
                    <CalendarDays size={28} />
                    Day board
                    <span className="rounded-full bg-[#eef5f1] px-3 py-1.5 text-sm text-charcoal/65">{barbers.length} columns</span>
                </div>
                <CalendarLegend />
            </div>
            <div className="min-h-0 flex-1 overflow-auto overscroll-contain pb-6">
                <div style={{ minWidth: `max(100%, ${boardMinWidth}px)` }}>
                    <div className="sticky top-0 z-10 grid border-b border-[#c5d0c5] bg-white" style={{ gridTemplateColumns }}>
                        <div className="sticky left-0 z-20 border-r border-[#d2dcd2] bg-white px-4 py-5 text-base font-black uppercase tracking-[0.12em] text-charcoal/55 2xl:px-5 2xl:py-6">Time</div>
                        {barbers.map((barber) => (
                            <div key={barber.id} className="flex min-w-0 items-center gap-3 border-r border-[#d2dcd2] px-4 py-4 last:border-r-0 2xl:gap-4 2xl:px-5 2xl:py-5">
                                <BarberAvatar barber={barber} size={headerAvatarSize} />
                                <span className="min-w-0 truncate text-xl font-black text-forest 2xl:text-2xl">{barber.displayName}</span>
                            </div>
                        ))}
                    </div>
                    {slots.map((slot) => {
                        const isHour = slot.endsWith(":00");

                        return (
                            <div key={slot} className={`grid ${calendarRowLineClasses(slot)} last:border-b-0`} style={{ gridTemplateColumns, minHeight: SLOT_HEIGHT }}>
                                <div className="sticky left-0 z-[3] border-r border-[#d2dcd2] bg-white px-3 py-4 text-right text-base font-bold text-charcoal/65 2xl:px-5 2xl:text-lg">
                                    {isHour ? formatClockLabel(slot) : ""}
                                </div>
                                {barbers.map((barber) => {
                                    const startTime = localDateTimeToIso(selectedDate, slot);
                                    const key = slotKey(barber.id, slot);
                                    const cellBookings = bookingsBySlot[key] ?? [];
                                    const blocks = blockedTimesForSlot(schedule?.blockedTimes ?? [], {
                                        barberId: barber.id,
                                        locationId,
                                        selectedDate,
                                        slot,
                                    });
                                    const isCurrent = selectedDate === todayLocalDate() && currentSlotContains(slot);
                                    const previewState = appointmentPreviewForSlot(appointmentPreview, {
                                        barberId: barber.id,
                                        locationId,
                                        selectedDate,
                                        slot,
                                    });

                                    return (
                                        <div
                                            key={`${barber.id}-${slot}`}
                                            role="button"
                                            tabIndex={0}
                                            className={`group relative overflow-hidden border-r border-[#d8e1d8] bg-white px-2.5 py-1.5 outline-none last:border-r-0 hover:bg-[#f6fbf7] ${
                                                isCurrent ? "before:absolute before:left-0 before:right-0 before:top-0 before:z-[2] before:h-1 before:bg-red-500" : ""
                                            } ${draggingBookingId ? "ring-inset hover:ring-2 hover:ring-green/40" : ""}`}
                                            onClick={() => onSlot(barber.id, startTime)}
                                            onKeyDown={(event) => {
                                                if (event.key === "Enter") onSlot(barber.id, startTime);
                                            }}
                                            onDragOver={(event) => {
                                                if (draggingBookingId) event.preventDefault();
                                            }}
                                            onDrop={(event) => {
                                                event.preventDefault();
                                                const bookingId = event.dataTransfer.getData("text/plain") || draggingBookingId;
                                                const booking = bookings.find((candidate) => candidate.id === bookingId);
                                                if (booking) void onDropBooking(booking, barber.id, locationId, startTime);
                                            }}
                                        >
                                            {previewState.active && (
                                                <div
                                                    className={`pointer-events-none absolute inset-0 z-0 border-x border-[#6d5dfc]/45 bg-[#ece9ff]/95 ${
                                                        previewState.starts ? "rounded-t-md border-t" : ""
                                                    } ${previewState.ends ? "rounded-b-md border-b" : ""}`}
                                                />
                                            )}
                                            {previewState.starts && (
                                                <div className="pointer-events-none absolute inset-x-0 top-0 z-[2] flex h-full items-center px-4 text-sm font-black text-[#4d3cff]">
                                                    {previewState.label}
                                                </div>
                                            )}
                                            {blocks.length > 0 && (
                                                <div className="absolute inset-x-3 bottom-2 z-[2] rounded bg-charcoal/10 px-3 py-1.5 text-sm font-black text-charcoal/60">
                                                    {blocks[0].reason || "Blocked"}
                                                </div>
                                            )}
                                            <div className="relative z-[1] space-y-2">
                                                {cellBookings.map((booking) => (
                                                    <BookingCard
                                                        key={booking.id}
                                                        booking={booking}
                                                        user={user}
                                                        pending={pendingDragId === booking.id}
                                                        onOpen={onOpen}
                                                        onDragStart={onDragStart}
                                                        onDragEnd={onDragEnd}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        );
                    })}
                    <div className="grid border-t-2 border-[#9fb29f] bg-[#f7faf7]" style={{ gridTemplateColumns, minHeight: 56 }}>
                        <div className="sticky left-0 z-[3] border-r border-[#c5d0c5] bg-[#f7faf7] px-3 py-4 text-right text-base font-black text-forest 2xl:px-5 2xl:text-lg">
                            {formatClockLabel(boardRows.closeBoundary)}
                        </div>
                        {barbers.map((barber) => (
                            <div
                                key={`${barber.id}-${boardRows.closeBoundary}-close`}
                                className="border-r border-[#d8e1d8] px-3 py-4 text-sm font-black uppercase tracking-[0.12em] text-charcoal/45 last:border-r-0"
                                aria-label={`Closed after ${formatClockLabel(boardRows.closeBoundary)} for ${barber.displayName}`}
                            />
                        ))}
                    </div>
                </div>
            </div>
        </section>
    );
}

function BookingCard({
    booking,
    user,
    pending,
    onOpen,
    onDragStart,
    onDragEnd,
}: {
    booking: AdminBookingSummary;
    user: SafeAdminUser;
    pending: boolean;
    onOpen: (bookingId: string) => void;
    onDragStart: (bookingId: string) => void;
    onDragEnd: () => void;
}) {
    const tone = getBookingCardTone(booking);
    const draggable = booking.status === "confirmed" && (user.role !== "barber" || booking.barberId === user.barberId);
    const height = Math.max(58, Math.ceil(booking.totalDurationMinutes / 15) * SLOT_HEIGHT - 8);

    return (
        <button
            className={`relative z-[1] w-full overflow-hidden rounded-md border-l-[5px] px-3 py-2 text-left text-base shadow-sm transition hover:shadow-md ${bookingToneClasses(tone)} ${
                pending ? "opacity-60" : ""
            }`}
            style={{ minHeight: height }}
            draggable={draggable}
            onClick={(event) => {
                event.stopPropagation();
                onOpen(booking.id);
            }}
            onDragStart={(event) => {
                event.stopPropagation();
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("text/plain", booking.id);
                onDragStart(booking.id);
            }}
            onDragEnd={onDragEnd}
            title={draggable ? "Drag to reschedule" : "Open booking"}
        >
            <span className="block text-sm font-black">{formatLocalTime(booking.startTime)}</span>
            <span className="block truncate font-black leading-tight">{booking.customerName}</span>
            <span className="block truncate text-sm opacity-75">{booking.services.join(", ")}</span>
            <span className="mt-1 inline-flex rounded-full bg-white/65 px-2 py-0.5 text-xs font-black uppercase tracking-[0.08em]">
                {booking.source === "walk_in" ? "Walk-in" : formatAdminStatus(booking.status)}
            </span>
        </button>
    );
}

function BookingDetailDrawer({
    bookingId,
    options,
    user,
    onClose,
    onChanged,
}: {
    bookingId: string;
    options: AdminCalendarOptions | null;
    user: SafeAdminUser;
    onClose: () => void;
    onChanged: (message: string) => Promise<void>;
}) {
    const [booking, setBooking] = useState<AdminBookingDetail | null>(null);
    const [error, setError] = useState("");

    useEffect(() => {
        setBooking(null);
        setError("");
        fetchAdminBookingDetail(bookingId)
            .then((response) => setBooking(response.booking))
            .catch((error) => setError(error instanceof Error ? error.message : "Failed to load booking."));
    }, [bookingId]);

    return (
        <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl min-w-0 flex-col border-l border-[#cfdacf] bg-white shadow-2xl xl:static xl:inset-auto xl:z-auto xl:h-[100dvh] xl:max-w-none xl:shadow-none">
            <div className="flex items-start justify-between gap-4 border-b border-[#cfdacf] px-7 py-7">
                <div className="min-w-0">
                    <p className="text-sm font-bold uppercase tracking-[0.14em] text-charcoal/50">Booking</p>
                    <h2 className="truncate text-4xl font-black text-forest">{booking?.customerName ?? "Loading"}</h2>
                </div>
                <button className="icon-button" onClick={onClose} title="Close booking drawer">
                    <X size={24} />
                </button>
            </div>
            <div className="flex-1 overflow-y-auto p-7">
                {error && <Notice tone="error" message={error} onClear={() => setError("")} />}
                {!error && !booking && <p className="text-lg font-bold text-charcoal/60">Loading booking...</p>}
                {booking && (
                    <BookingDetailBody
                        booking={booking}
                        setBooking={setBooking}
                        options={options}
                        user={user}
                        onChanged={onChanged}
                        compact
                    />
                )}
            </div>
        </aside>
    );
}

function BookingDetailView({
    bookingId,
    options,
    user,
    onBack,
    onChanged,
}: {
    bookingId: string;
    options: AdminCalendarOptions | null;
    user: SafeAdminUser;
    onBack: () => void;
    onChanged: (message: string) => Promise<void>;
}) {
    const [booking, setBooking] = useState<AdminBookingDetail | null>(null);
    const [error, setError] = useState("");

    useEffect(() => {
        fetchAdminBookingDetail(bookingId)
            .then((response) => setBooking(response.booking))
            .catch((error) => setError(error instanceof Error ? error.message : "Failed to load booking."));
    }, [bookingId]);

    if (error) {
        return <Notice tone="error" message={error} onClear={onBack} />;
    }

    if (!booking) {
        return <section className="rounded-md border border-forest/10 bg-white p-4 text-sm text-charcoal/60">Loading booking</section>;
    }

    return (
        <section className="rounded-md border border-[#d6ded6] bg-white p-6">
            <button className="text-button mb-4" onClick={onBack}>
                Back to bookings
            </button>
            <BookingDetailBody
                booking={booking}
                setBooking={setBooking}
                options={options}
                user={user}
                onChanged={onChanged}
            />
        </section>
    );
}

function BookingDetailBody({
    booking,
    setBooking,
    options,
    user,
    onChanged,
    compact = false,
}: {
    booking: AdminBookingDetail;
    setBooking: (booking: AdminBookingDetail) => void;
    options: AdminCalendarOptions | null;
    user: SafeAdminUser;
    onChanged: (message: string) => Promise<void>;
    compact?: boolean;
}) {
    const [error, setError] = useState("");
    const [showReschedule, setShowReschedule] = useState(false);
    const canMutate = booking.status === "confirmed";
    const canNoShow = canMutate && new Date(booking.startTime).getTime() <= Date.now();
    const bookingBarber = options?.barbers.find((barber) => barber.id === booking.barberId);

    async function refreshDetail() {
        const fresh = await fetchAdminBookingDetail(booking.id);
        setBooking(fresh.booking);
    }

    async function handleCancel() {
        if (!window.confirm("Cancel this booking?")) return;
        setError("");

        try {
            await cancelAdminBooking(booking.id);
            await refreshDetail();
            await onChanged("Booking cancelled.");
        } catch (error) {
            setError(error instanceof Error ? error.message : "Cancel failed.");
        }
    }

    async function handleNoShow() {
        setError("");

        try {
            await markAdminBookingNoShow(booking.id);
            await refreshDetail();
            await onChanged("Booking marked no-show.");
        } catch (error) {
            setError(error instanceof Error ? error.message : "No-show update failed.");
        }
    }

    return (
        <div className="space-y-4">
            {error && <Notice tone="error" message={error} onClear={() => setError("")} />}
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                    <h2 className={`${compact ? "text-4xl" : "text-4xl"} truncate font-black text-forest`}>{booking.customerName}</h2>
                    <p className="text-lg text-charcoal/60">{formatLocalDateTime(booking.startTime)}</p>
                </div>
                <StatusPill status={booking.status} />
            </div>
            <div className="grid gap-3 md:grid-cols-2">
                <DetailLine label="Location" value={booking.locationName} icon={<MapPin size={15} />} />
                <BarberDetailLine barber={bookingBarber} fallbackName={booking.barberName} />
                <DetailLine label="Phone" value={booking.customerPhone} />
                <DetailLine label="Email" value={booking.customerEmail} />
                <DetailLine label="Source" value={booking.source === "walk_in" ? "Walk-in" : booking.source} />
                <DetailLine label="Duration" value={`${booking.totalDurationMinutes} minutes`} />
            </div>
            <div>
                <p className="mb-3 text-xl font-black text-forest">Services</p>
                <div className="grid gap-2">
                    {booking.serviceDetails.map((service) => (
                        <div key={`${booking.id}-${service.sortOrder}-${service.serviceName}`} className="rounded-md bg-[#f3f8f4] p-4 text-lg">
                            <span className="font-black text-forest">{service.serviceName}</span>
                            <span className="ml-2 text-charcoal/60">{service.durationMinutes} min - {service.displayPrice}</span>
                        </div>
                    ))}
                </div>
            </div>
            {(booking.customerNotes || booking.internalNotes) && (
                <div className="grid gap-3 md:grid-cols-2">
                    <DetailLine label="Customer notes" value={booking.customerNotes || "None"} />
                    <DetailLine label="Internal notes" value={booking.internalNotes || "None"} />
                </div>
            )}
            {canMutate && (
                <div className="grid gap-2 sm:grid-cols-3">
                    <button className="icon-text-button justify-center" onClick={() => setShowReschedule((value) => !value)}>
                        <Clock size={16} />
                        Reschedule
                    </button>
                    <button className="danger-button justify-center" onClick={handleCancel}>
                        <X size={16} />
                        Cancel
                    </button>
                    <button className="danger-button justify-center" onClick={handleNoShow} disabled={!canNoShow} title={canNoShow ? "Mark no-show" : "No-show is only for current or past bookings"}>
                        <Ban size={16} />
                        No-show
                    </button>
                </div>
            )}
            {showReschedule && options && (
                <RescheduleForm
                    booking={booking}
                    options={options}
                    user={user}
                    onDone={async () => {
                        setShowReschedule(false);
                        await refreshDetail();
                        await onChanged("Booking rescheduled.");
                    }}
                />
            )}
        </div>
    );
}

function AddAppointmentDrawer({
    options,
    user,
    initialBarberId,
    initialLocationId,
    initialStartTime,
    onPreviewChange,
    onClose,
    onCreated,
}: {
    options: AdminCalendarOptions;
    user: SafeAdminUser;
    initialBarberId: string;
    initialLocationId: string;
    initialStartTime: string;
    onPreviewChange: (preview: AppointmentPreview | null) => void;
    onClose: () => void;
    onCreated: () => Promise<void>;
}) {
    const initialParts = localPartsFromIso(initialStartTime);
    const [locationId, setLocationId] = useState(initialLocationId);
    const [barberId, setBarberId] = useState(user.role === "barber" && user.barberId ? user.barberId : initialBarberId);
    const [serviceIds, setServiceIds] = useState<string[]>(options.services[0] ? [options.services[0].id] : []);
    const [date, setDate] = useState(initialParts.date);
    const [time, setTime] = useState(initialParts.time);
    const [availability, setAvailability] = useState<AdminAvailability | null>(null);
    const [selectedSlot, setSelectedSlot] = useState<AdminSlot | null>(null);
    const [loadingSlots, setLoadingSlots] = useState(false);
    const [customerName, setCustomerName] = useState("");
    const [phone, setPhone] = useState("");
    const [email, setEmail] = useState("");
    const [internalNotes, setInternalNotes] = useState("");
    const [bookingSource, setBookingSource] = useState<"manual" | "walk_in">("manual");
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const serviceKey = serviceIds.join("|");
    const selectableBarbers = getVisibleBarbers(options, user, locationId);
    const selectedBarber = selectableBarbers.find((barber) => barber.id === barberId);
    const selectedServices = options.services.filter((service) => serviceIds.includes(service.id));
    const totalDurationMinutes = selectedServices.reduce((total, service) => total + service.durationMinutes, 0);
    const priceSummary = formatServiceSelectionPrice(selectedServices);
    const requestedStartTime = localDateTimeToIso(date, time);
    const exactSlotAvailable =
        Boolean(selectedSlot) &&
        selectedSlot?.barberId === barberId &&
        selectedSlot?.startTime === requestedStartTime;
    const previewStartTime = exactSlotAvailable ? selectedSlot?.startTime ?? requestedStartTime : requestedStartTime;
    const previewEndTime = addMinutesToIso(previewStartTime, totalDurationMinutes || 30);

    useEffect(() => {
        if (user.role === "barber" && user.barberId) {
            setBarberId(user.barberId);
            return;
        }

        if (!selectableBarbers.some((barber) => barber.id === barberId)) {
            setBarberId(selectableBarbers[0]?.id ?? "");
        }
    }, [barberId, selectableBarbers, user]);

    useEffect(() => {
        if (!barberId || !locationId || serviceIds.length === 0) {
            setAvailability(null);
            setSelectedSlot(null);
            return;
        }

        let cancelled = false;
        setLoadingSlots(true);
        setError("");
        fetchAdminAvailability({ locationId, barberId, serviceIds, date })
            .then((response) => {
                if (cancelled) return;
                const requested = localDateTimeToIso(date, time);
                const slots = response.barberSlots.flatMap((barberSlots) => barberSlots.slots);
                setAvailability(response);
                setSelectedSlot(slots.find((slot) => slot.barberId === barberId && slot.startTime === requested) ?? null);
            })
            .catch((error) => {
                if (!cancelled) {
                    setAvailability(null);
                    setSelectedSlot(null);
                    setError(error instanceof Error ? error.message : "Availability failed.");
                }
            })
            .finally(() => {
                if (!cancelled) setLoadingSlots(false);
            });

        return () => {
            cancelled = true;
        };
    }, [barberId, date, locationId, serviceKey, time]);

    useEffect(() => {
        if (!barberId || !locationId) {
            onPreviewChange(null);
            return;
        }

        onPreviewChange({
            barberId,
            locationId,
            startTime: previewStartTime,
            endTime: previewEndTime,
        });
    }, [barberId, locationId, onPreviewChange, previewEndTime, previewStartTime]);

    useEffect(() => () => onPreviewChange(null), [onPreviewChange]);

    function handleSlotSelect(slot: AdminSlot) {
        setSelectedSlot(slot);
        setBarberId(slot.barberId);
        setLocationId(slot.locationId);
        const parts = localPartsFromIso(slot.startTime);
        setDate(parts.date);
        setTime(parts.time);
    }

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        if (!selectedSlot || !exactSlotAvailable) {
            setError("Choose an available time for this barber first.");
            return;
        }

        setSubmitting(true);
        setError("");

        try {
            const payload = {
                locationId,
                barberId,
                serviceIds,
                startTime: selectedSlot.startTime,
                customer: {
                    name: customerName,
                    phone: phone.trim() || undefined,
                    email: email.trim() || undefined,
                },
                internalNotes,
            };

            if (bookingSource === "walk_in") {
                await createWalkInBooking(payload);
            } else {
                await createManualBooking(payload);
            }
            await onCreated();
        } catch (error) {
            setError(error instanceof Error ? error.message : "Appointment creation failed.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-3xl min-w-0 flex-col border-l border-[#cfdacf] bg-white shadow-2xl xl:static xl:inset-auto xl:z-auto xl:h-[100dvh] xl:max-w-none xl:shadow-none">
            <div className="flex items-start justify-between gap-4 border-b border-[#cfdacf] px-7 py-7">
                <div>
                    <p className="text-sm font-bold uppercase tracking-[0.14em] text-charcoal/50">Staff create</p>
                    <h2 className="text-4xl font-black text-forest">Add appointment</h2>
                </div>
                <button className="icon-button" onClick={onClose} title="Close appointment drawer">
                    <X size={24} />
                </button>
            </div>
            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 space-y-6 overflow-y-auto p-7 pb-8">
                    {error && <Notice tone="error" message={error} onClear={() => setError("")} />}
                    <div className="rounded-md border border-[#d8e1d8] bg-[#f8fbf8] p-4">
                        <div className="grid gap-3 sm:grid-cols-3">
                            <SummaryMetric label="Duration" value={`${totalDurationMinutes || 0} min`} />
                            <SummaryMetric label="Price" value={priceSummary} />
                            <SummaryMetric label="Time" value={`${formatLocalTime(previewStartTime)} - ${formatLocalTime(previewEndTime)}`} />
                        </div>
                    </div>
                    <Field label="Customer name">
                        <input className="input" value={customerName} onChange={(event) => setCustomerName(event.target.value)} required autoFocus />
                    </Field>
                    <Field label="Appointment type">
                        <div className="grid grid-cols-2 rounded-md border border-[#d8e1d8] bg-[#f8fbf8] p-1">
                            <button
                                className={`rounded-md px-4 py-3 text-sm font-black transition ${bookingSource === "manual" ? "bg-mint text-forest shadow-sm" : "text-charcoal/65 hover:bg-white"}`}
                                type="button"
                                onClick={() => setBookingSource("manual")}
                            >
                                Appointment
                            </button>
                            <button
                                className={`rounded-md px-4 py-3 text-sm font-black transition ${bookingSource === "walk_in" ? "bg-mint text-forest shadow-sm" : "text-charcoal/65 hover:bg-white"}`}
                                type="button"
                                onClick={() => setBookingSource("walk_in")}
                            >
                                Walk-in
                            </button>
                        </div>
                    </Field>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Location">
                            <LocationSelect value={locationId} options={options.locations} onChange={setLocationId} />
                        </Field>
                        <Field label="Barber">
                            <BarberSelect value={barberId} options={selectableBarbers} user={user} onChange={setBarberId} />
                        </Field>
                        {selectedBarber && (
                            <div className="sm:col-span-2">
                                <BarberPreview barber={selectedBarber} />
                            </div>
                        )}
                        <Field label="Date">
                            <input className="input" type="date" value={date} onChange={(event) => setDate(event.target.value)} required />
                        </Field>
                        <Field label="Start time">
                            <input className="input" type="time" step={900} value={time} onChange={(event) => setTime(event.target.value)} required />
                        </Field>
                    </div>
                    <Field label="Services">
                        <ServicePicker services={options.services} selected={serviceIds} onChange={setServiceIds} />
                    </Field>
                    <div className="space-y-3">
                        <div className="flex items-center justify-between gap-3">
                            <p className="text-lg font-black text-forest">Available times</p>
                            {loadingSlots && <span className="text-sm font-bold text-charcoal/55">Loading</span>}
                        </div>
                        {!loadingSlots && availability && !exactSlotAvailable && (
                            <p className="rounded-md bg-[#fff7ed] px-3 py-2 text-sm font-bold text-[#9a3412]">
                                The selected start time is not available for this barber and service length. Pick one of the available times below.
                            </p>
                        )}
                        <div className="max-h-80 overflow-y-auto pr-1">
                            <SlotPicker
                                availability={availability}
                                selectedSlot={selectedSlot}
                                barbers={options.barbers}
                                onSelect={handleSlotSelect}
                            />
                        </div>
                    </div>
                    <div className="grid gap-3 sm:grid-cols-2">
                        <Field label="Phone optional">
                            <input className="input" value={phone} onChange={(event) => setPhone(event.target.value)} />
                        </Field>
                        <Field label="Email optional">
                            <input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
                        </Field>
                    </div>
                    <Field label="Internal notes">
                        <textarea className="input min-h-20" value={internalNotes} onChange={(event) => setInternalNotes(event.target.value)} />
                    </Field>
                </div>
                <div className="shrink-0 border-t border-[#d4ddd4] bg-white px-7 py-5 shadow-[0_-12px_24px_rgba(16,56,38,0.08)]">
                    <button className="primary-button w-full" type="submit" disabled={submitting || !selectedSlot || !exactSlotAvailable}>
                        {submitting ? "Creating" : bookingSource === "walk_in" ? "Create walk-in" : "Create appointment"}
                    </button>
                </div>
            </form>
        </aside>
    );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-md bg-white px-4 py-3">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-charcoal/45">{label}</p>
            <p className="truncate text-xl font-black text-forest">{value}</p>
        </div>
    );
}

function CalendarGrid({
    days,
    bookingsByDate,
    view,
    onOpen,
}: {
    days: ReturnType<typeof buildWeekDays>;
    bookingsByDate: Record<string, AdminBookingSummary[]>;
    view: Exclude<AdminView, "day" | "list">;
    onOpen: (bookingId: string) => void;
}) {
    return (
        <section className="grid gap-px overflow-hidden rounded-md border border-forest/10 bg-forest/10 md:grid-cols-7">
            {days.map((day) => (
                <div
                    key={day.date}
                    className={`min-h-36 bg-white p-3 ${day.inCurrentMonth ? "" : "opacity-60"}`}
                >
                    <div className="mb-2 flex items-center justify-between gap-2">
                        <p className="text-sm font-black text-forest">{day.label}</p>
                        {day.isToday && <span className="rounded-full bg-green px-2 py-0.5 text-xs font-bold text-forest">Today</span>}
                    </div>
                    <div className={view === "month" ? "space-y-1" : "space-y-2"}>
                        {(bookingsByDate[day.date] ?? []).map((booking) => (
                            <button
                                key={booking.id}
                                className={`w-full rounded-md border-l-4 p-2 text-left text-sm transition hover:shadow-sm ${bookingToneClasses(getBookingCardTone(booking))}`}
                                onClick={() => onOpen(booking.id)}
                            >
                                <span className="block font-black">{formatLocalTime(booking.startTime)}</span>
                                <span className="block truncate">{booking.customerName}</span>
                                <span className="block truncate opacity-70">{booking.barberName}</span>
                            </button>
                        ))}
                    </div>
                </div>
            ))}
        </section>
    );
}

function BookingList({
    bookings,
    loading,
    onOpen,
}: {
    bookings: AdminBookingSummary[];
    loading: boolean;
    onOpen: (bookingId: string) => void;
}) {
    if (loading) {
        return <section className="rounded-md border border-forest/10 bg-white p-4 text-sm text-charcoal/60">Loading bookings</section>;
    }

    if (bookings.length === 0) {
        return <section className="rounded-md border border-forest/10 bg-white p-4 text-sm text-charcoal/60">No bookings match these filters.</section>;
    }

    return (
        <section className="overflow-hidden rounded-md border border-forest/10 bg-white">
            <div className="flex items-center gap-2 border-b border-forest/10 px-4 py-3 text-sm font-black text-forest">
                <Search size={18} />
                Booking history
            </div>
            <div className="divide-y divide-forest/10">
                {bookings.map((booking) => (
                    <button
                        key={booking.id}
                        className="grid w-full gap-3 px-4 py-3 text-left transition hover:bg-[#f7faf7] md:grid-cols-[1.3fr_1fr_1fr_auto]"
                        onClick={() => onOpen(booking.id)}
                    >
                        <div className="min-w-0">
                            <p className="truncate font-black text-forest">{booking.customerName}</p>
                            <p className="truncate text-sm text-charcoal/60">{booking.services.join(", ")}</p>
                        </div>
                        <p className="text-sm font-bold text-charcoal/70">{formatLocalDateTime(booking.startTime)}</p>
                        <p className="text-sm font-bold text-charcoal/70">{booking.barberName} - {booking.locationName}</p>
                        <StatusPill status={booking.status} />
                    </button>
                ))}
            </div>
        </section>
    );
}

function ManualBookingModal({
    options,
    user,
    onClose,
    onCreated,
}: {
    options: AdminCalendarOptions;
    user: SafeAdminUser;
    onClose: () => void;
    onCreated: () => Promise<void>;
}) {
    return (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-charcoal/40 p-4">
            <section className="mx-auto my-6 max-w-3xl rounded-md bg-white p-4 shadow-xl">
                <div className="mb-4 flex items-center justify-between gap-3">
                    <h2 className="text-2xl font-black text-forest">New manual booking</h2>
                    <button className="icon-button" onClick={onClose} title="Close">
                        <X size={18} />
                    </button>
                </div>
                <ManualBookingForm options={options} user={user} onCreated={onCreated} />
            </section>
        </div>
    );
}

function ManualBookingForm({
    options,
    user,
    onCreated,
}: {
    options: AdminCalendarOptions;
    user: SafeAdminUser;
    onCreated: () => Promise<void>;
}) {
    const initialBarber = user.role === "barber" && user.barberId ? user.barberId : options.barbers[0]?.id ?? "";
    const initialLocation = options.barbers.find((barber) => barber.id === initialBarber)?.locationIds[0] ?? options.locations[0]?.id ?? "";
    const [locationId, setLocationId] = useState(initialLocation);
    const [barberId, setBarberId] = useState(initialBarber);
    const [serviceIds, setServiceIds] = useState<string[]>(options.services[0] ? [options.services[0].id] : []);
    const [date, setDate] = useState(todayLocalDate());
    const [availability, setAvailability] = useState<AdminAvailability | null>(null);
    const [selectedSlot, setSelectedSlot] = useState<AdminSlot | null>(null);
    const [customer, setCustomer] = useState({ firstName: "", lastName: "", phone: "", email: "" });
    const [internalNotes, setInternalNotes] = useState("");
    const [error, setError] = useState("");

    async function loadSlots() {
        setError("");
        setSelectedSlot(null);
        try {
            setAvailability(await fetchAdminAvailability({ locationId, barberId, serviceIds, date }));
        } catch (error) {
            setError(error instanceof Error ? error.message : "Availability failed.");
        }
    }

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        if (!selectedSlot) {
            setError("Choose an available time first.");
            return;
        }

        try {
            await createManualBooking({
                locationId,
                serviceIds,
                barberId,
                startTime: selectedSlot.startTime,
                customer,
                internalNotes,
            });
            await onCreated();
        } catch (error) {
            setError(error instanceof Error ? error.message : "Manual booking failed.");
        }
    }

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {error && <Notice tone="error" message={error} onClear={() => setError("")} />}
            <BookingSelectors
                options={options}
                user={user}
                locationId={locationId}
                barberId={barberId}
                serviceIds={serviceIds}
                date={date}
                onLocation={setLocationId}
                onBarber={setBarberId}
                onServices={setServiceIds}
                onDate={setDate}
            />
            <button type="button" className="icon-text-button" onClick={loadSlots}>
                <CalendarDays size={16} />
                Load times
            </button>
            <SlotPicker
                availability={availability}
                selectedSlot={selectedSlot}
                barbers={options.barbers}
                onSelect={setSelectedSlot}
            />
            <div className="grid gap-3 md:grid-cols-2">
                <Field label="First name">
                    <input className="input" value={customer.firstName} onChange={(event) => setCustomer({ ...customer, firstName: event.target.value })} required />
                </Field>
                <Field label="Last name">
                    <input className="input" value={customer.lastName} onChange={(event) => setCustomer({ ...customer, lastName: event.target.value })} required />
                </Field>
                <Field label="Phone">
                    <input className="input" value={customer.phone} onChange={(event) => setCustomer({ ...customer, phone: event.target.value })} required />
                </Field>
                <Field label="Email">
                    <input className="input" type="email" value={customer.email} onChange={(event) => setCustomer({ ...customer, email: event.target.value })} required />
                </Field>
            </div>
            <Field label="Internal notes">
                <textarea className="input min-h-20" value={internalNotes} onChange={(event) => setInternalNotes(event.target.value)} />
            </Field>
            <button className="primary-button" type="submit">
                Create booking
            </button>
        </form>
    );
}

function RescheduleForm({
    booking,
    options,
    user,
    onDone,
}: {
    booking: AdminBookingDetail;
    options: AdminCalendarOptions;
    user: SafeAdminUser;
    onDone: () => Promise<void>;
}) {
    const [locationId, setLocationId] = useState(booking.locationId);
    const [barberId, setBarberId] = useState(booking.barberId);
    const [date, setDate] = useState(localDateFromIso(booking.startTime));
    const [availability, setAvailability] = useState<AdminAvailability | null>(null);
    const [selectedSlot, setSelectedSlot] = useState<AdminSlot | null>(null);
    const [error, setError] = useState("");

    async function loadSlots() {
        setError("");
        setSelectedSlot(null);
        try {
            setAvailability(await fetchAdminAvailability({ locationId, barberId, serviceIds: booking.serviceIds, date }));
        } catch (error) {
            setError(error instanceof Error ? error.message : "Availability failed.");
        }
    }

    async function submit(event: FormEvent) {
        event.preventDefault();
        if (!selectedSlot) {
            setError("Choose an available time first.");
            return;
        }

        try {
            await rescheduleAdminBooking(booking.id, {
                locationId,
                barberId,
                startTime: selectedSlot.startTime,
            });
            await onDone();
        } catch (error) {
            setError(error instanceof Error ? error.message : "Reschedule failed.");
        }
    }

    return (
        <form onSubmit={submit} className="space-y-4 rounded-md border border-forest/10 bg-[#f3f8f4] p-4">
            {error && <Notice tone="error" message={error} onClear={() => setError("")} />}
            <div className="grid gap-3 md:grid-cols-3">
                <Field label="Location">
                    <LocationSelect value={locationId} options={options.locations} onChange={setLocationId} />
                </Field>
                <Field label="Barber">
                    <BarberSelect value={barberId} options={options.barbers} user={user} onChange={setBarberId} />
                </Field>
                <Field label="Date">
                    <input className="input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
                </Field>
            </div>
            <button type="button" className="icon-text-button" onClick={loadSlots}>
                <CalendarDays size={16} />
                Load times
            </button>
            <SlotPicker
                availability={availability}
                selectedSlot={selectedSlot}
                barbers={options.barbers}
                onSelect={setSelectedSlot}
            />
            <button className="primary-button" type="submit">
                Reschedule booking
            </button>
        </form>
    );
}

function BookingSelectors({
    options,
    user,
    locationId,
    barberId,
    serviceIds,
    date,
    onLocation,
    onBarber,
    onServices,
    onDate,
}: {
    options: AdminCalendarOptions;
    user: SafeAdminUser;
    locationId: string;
    barberId: string;
    serviceIds: string[];
    date: string;
    onLocation: (value: string) => void;
    onBarber: (value: string) => void;
    onServices: (value: string[]) => void;
    onDate: (value: string) => void;
}) {
    return (
        <div className="grid gap-3 md:grid-cols-2">
            <Field label="Location">
                <LocationSelect value={locationId} options={options.locations} onChange={onLocation} />
            </Field>
            <Field label="Barber">
                <BarberSelect value={barberId} options={options.barbers} user={user} onChange={onBarber} />
            </Field>
            <Field label="Date">
                <input className="input" type="date" value={date} onChange={(event) => onDate(event.target.value)} />
            </Field>
            <Field label="Services">
                <ServicePicker services={options.services} selected={serviceIds} onChange={onServices} />
            </Field>
        </div>
    );
}

function LocationSelect({
    value,
    options,
    onChange,
}: {
    value: string;
    options: AdminCalendarOptions["locations"];
    onChange: (value: string) => void;
}) {
    return (
        <select className="input" value={value} onChange={(event) => onChange(event.target.value)} required>
            {options.map((location) => (
                <option key={location.id} value={location.id}>
                    {location.name}
                </option>
            ))}
        </select>
    );
}

function BarberSelect({
    value,
    options,
    user,
    onChange,
}: {
    value: string;
    options: AdminBarberOption[];
    user: SafeAdminUser;
    onChange: (value: string) => void;
}) {
    const barbers = user.role === "barber" && user.barberId
        ? options.filter((barber) => barber.id === user.barberId)
        : options;

    return (
        <select
            className="input"
            value={value}
            onChange={(event) => onChange(event.target.value)}
            disabled={user.role === "barber"}
            required
        >
            {barbers.map((barber) => (
                <option key={barber.id} value={barber.id}>
                    {barber.displayName}
                </option>
            ))}
        </select>
    );
}

function ServicePicker({
    services,
    selected,
    onChange,
}: {
    services: AdminServiceOption[];
    selected: string[];
    onChange: (value: string[]) => void;
}) {
    return (
        <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border border-[#d4ddd4] p-3">
            {services.map((service) => (
                <label key={service.id} className="flex items-center gap-3 text-base">
                    <input
                        type="checkbox"
                        checked={selected.includes(service.id)}
                        onChange={(event) =>
                            onChange(
                                event.target.checked
                                    ? [...selected, service.id]
                                    : selected.filter((serviceId) => serviceId !== service.id),
                            )
                        }
                    />
                    <span className="min-w-0 flex-1 truncate">{service.name}</span>
                    <span className="text-charcoal/60">{service.displayPrice}</span>
                </label>
            ))}
        </div>
    );
}

function SlotPicker({
    availability,
    selectedSlot,
    barbers,
    onSelect,
}: {
    availability: AdminAvailability | null;
    selectedSlot: AdminSlot | null;
    barbers: AdminBarberOption[];
    onSelect: (slot: AdminSlot) => void;
}) {
    const slots = availability?.barberSlots.flatMap((barberSlot) => barberSlot.slots) ?? [];

    if (!availability) {
        return <p className="text-lg text-charcoal/60">Load times to choose an available slot.</p>;
    }

    if (slots.length === 0) {
        return <p className="rounded-md bg-white p-4 text-lg text-charcoal/60">{availability.emptyMessage ?? "No times available."}</p>;
    }

    return (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {slots.map((slot) => {
                const barber = barbers.find((candidate) => candidate.id === slot.barberId);
                const selected = selectedSlot?.startTime === slot.startTime && selectedSlot?.barberId === slot.barberId;

                return (
                    <button
                        key={`${slot.startTime}-${slot.barberId}`}
                        type="button"
                        className={selected ? "slot-button-selected" : "slot-button"}
                        onClick={() => onSelect(slot)}
                    >
                        <span className="flex w-full items-center gap-3">
                            {barber && <BarberAvatar barber={barber} size="sm" />}
                            <span className="min-w-0">
                                <span className="block font-black">{formatLocalTime(slot.startTime)}</span>
                                <span className="block truncate text-base">{barber?.displayName ?? "Barber"}</span>
                            </span>
                        </span>
                    </button>
                );
            })}
        </div>
    );
}

function BarberAvatar({
    barber,
    size = "md",
}: {
    barber: Pick<AdminBarberOption, "displayName" | "slug">;
    size?: "sm" | "md" | "lg";
}) {
    const source = barberPhotoUrl(barber);
    const [imageFailed, setImageFailed] = useState(false);
    const photo = imageFailed ? undefined : source;
    const sizeClass = size === "lg" ? "size-16" : size === "sm" ? "size-11" : "size-14";
    const textClass = size === "sm" ? "text-sm" : "text-base";

    useEffect(() => {
        setImageFailed(false);
    }, [source]);

    if (photo) {
        return (
            <img
                src={photo}
                alt={barber.displayName}
                className={`${sizeClass} shrink-0 rounded-full border border-white object-cover shadow-sm ring-1 ring-forest/10`}
                decoding="async"
                loading="lazy"
                onError={() => setImageFailed(true)}
            />
        );
    }

    return (
        <span className={`${sizeClass} ${textClass} flex shrink-0 items-center justify-center rounded-full bg-[#d9efe1] font-black text-forest ring-1 ring-forest/10`}>
            {initials(barber.displayName)}
        </span>
    );
}

function BarberPreview({ barber }: { barber: AdminBarberOption }) {
    return (
        <div className="flex items-center gap-4 rounded-md bg-[#f3f8f4] p-4">
            <BarberAvatar barber={barber} size="lg" />
            <div className="min-w-0">
                <p className="text-sm font-bold uppercase tracking-[0.12em] text-charcoal/50">Selected barber</p>
                <p className="truncate text-xl font-black text-forest">{barber.displayName}</p>
            </div>
        </div>
    );
}

function CalendarLegend() {
    const items: Array<[string, string]> = [
        ["Confirmed", "bg-blue-100"],
        ["Walk-in", "bg-violet-100"],
        ["No-show", "bg-red-100"],
        ["Completed", "bg-emerald-100"],
        ["Blocked", "bg-charcoal/10"],
    ];

    return (
        <div className="flex flex-wrap items-center gap-3 text-sm font-black text-charcoal/60">
            {items.map(([label, color]) => (
                <span key={label} className="inline-flex items-center gap-1.5">
                    <span className={`size-3 rounded-full ${color}`} />
                    {label}
                </span>
            ))}
        </div>
    );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
    return (
        <label className="block text-lg font-bold text-charcoal/70">
            <span className="mb-1.5 block">{label}</span>
            {children}
        </label>
    );
}

function DetailLine({ label, value, icon }: { label: string; value: string | null | undefined; icon?: ReactNode }) {
    return (
        <div className="rounded-md bg-[#f3f8f4] p-5">
            <p className="flex items-center gap-1.5 text-sm font-bold uppercase tracking-[0.14em] text-charcoal/50">
                {icon}
                {label}
            </p>
            <p className="mt-2 break-words text-xl font-black text-forest">{value || "None"}</p>
        </div>
    );
}

function BarberDetailLine({
    barber,
    fallbackName,
}: {
    barber: AdminBarberOption | undefined;
    fallbackName: string;
}) {
    const avatarBarber = barber ?? { displayName: fallbackName };

    return (
        <div className="rounded-md bg-[#f3f8f4] p-5">
            <p className="text-sm font-bold uppercase tracking-[0.14em] text-charcoal/50">Barber</p>
            <div className="mt-3 flex items-center gap-4">
                <BarberAvatar barber={avatarBarber} size="md" />
                <p className="min-w-0 truncate text-xl font-black text-forest">{fallbackName}</p>
            </div>
        </div>
    );
}

function StatusPill({ status }: { status: AdminBookingSummary["status"] }) {
    const tone =
        status === "confirmed"
            ? "bg-blue-50 text-blue-800"
            : status === "cancelled"
              ? "bg-stone-100 text-stone-700"
              : status === "no_show"
                ? "bg-red-50 text-red-700"
                : "bg-emerald-50 text-emerald-700";

    return (
        <span className={`inline-flex h-10 items-center rounded-full px-4 text-sm font-black ${tone}`}>
            {formatAdminStatus(status)}
        </span>
    );
}

function Notice({
    tone,
    message,
    onClear,
}: {
    tone: "success" | "error";
    message: string;
    onClear: () => void;
}) {
    return (
        <div className={`flex items-center justify-between gap-3 rounded-md px-4 py-3 text-sm font-bold ${tone === "success" ? "bg-mint text-forest" : "bg-red-50 text-red-700"}`}>
            <span>{message}</span>
            <button onClick={onClear} title="Dismiss">
                {tone === "success" ? <Check size={16} /> : <X size={16} />}
            </button>
        </div>
    );
}

function AdminSplash({ label }: { label: string }) {
    return (
        <main className="flex min-h-screen items-center justify-center bg-cream text-forest">
            <div className="flex items-center gap-3 text-sm font-black">
                <RefreshCw size={18} className="animate-spin" />
                {label}
            </div>
        </main>
    );
}

function resolveDefaultLocationId(options: AdminCalendarOptions, user: SafeAdminUser, requestedLocationId?: string) {
    if (requestedLocationId && options.locations.some((location) => location.id === requestedLocationId)) {
        return requestedLocationId;
    }

    const userBarber = user.barberId ? options.barbers.find((barber) => barber.id === user.barberId) : null;
    return userBarber?.locationIds[0] ?? options.locations[0]?.id ?? "";
}

function getVisibleBarbers(
    options: AdminCalendarOptions,
    user: SafeAdminUser,
    locationId: string,
    requestedBarberId?: string,
) {
    let barbers = options.barbers.filter((barber) => !locationId || barber.locationIds.includes(locationId));

    if (user.role === "barber") {
        barbers = user.barberId ? barbers.filter((barber) => barber.id === user.barberId) : [];
    }

    if (requestedBarberId) {
        barbers = barbers.filter((barber) => barber.id === requestedBarberId);
    }

    return barbers;
}

function dateRangeForView(view: AdminView, date: string) {
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

function formatDateTitle(date: string, view: AdminView) {
    if (view === "month") {
        return new Intl.DateTimeFormat("en-US", {
            timeZone: "UTC",
            month: "long",
            year: "numeric",
        }).format(parseLocalDate(date));
    }

    return new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        weekday: "long",
        month: "long",
        day: "numeric",
        year: "numeric",
    }).format(parseLocalDate(date));
}

function parseLocalDate(date: string) {
    const [year, month, day] = date.split("-").map(Number);
    return new Date(Date.UTC(year, month - 1, day, 12));
}

function indexBookingsByBarberAndTime(bookings: AdminBookingSummary[], selectedDate: string, locationId: string) {
    return bookings.reduce<Record<string, AdminBookingSummary[]>>((groups, booking) => {
        if (booking.locationId !== locationId || localDateFromIso(booking.startTime) !== selectedDate) {
            return groups;
        }

        const key = slotKey(booking.barberId, localClockFromIso(booking.startTime));
        groups[key] ??= [];
        groups[key].push(booking);
        groups[key].sort((a, b) => a.startTime.localeCompare(b.startTime));
        return groups;
    }, {});
}

function slotKey(barberId: string, slot: string) {
    return `${barberId}:${slot}`;
}

function calendarRowLineClasses(slot: string) {
    if (slot.endsWith(":00")) {
        return "border-b border-[#bccabc] shadow-[inset_0_1px_0_#bccabc]";
    }

    if (slot.endsWith(":30")) {
        return "border-b border-[#ccd8cc]";
    }

    return "border-b border-[#dbe4db]";
}

function blockedTimesForSlot(
    blockedTimes: AdminBlockedTime[],
    input: { barberId: string; locationId: string; selectedDate: string; slot: string },
) {
    const start = new Date(localDateTimeToIso(input.selectedDate, input.slot));
    const end = new Date(start.getTime() + 15 * 60 * 1000);

    return blockedTimes.filter((blockedTime) => {
        if (!blockedAppliesToCell(blockedTime, input.barberId, input.locationId)) {
            return false;
        }

        return start < new Date(blockedTime.endTime) && end > new Date(blockedTime.startTime);
    });
}

function appointmentPreviewForSlot(
    preview: AppointmentPreview | null,
    input: { barberId: string; locationId: string; selectedDate: string; slot: string },
) {
    if (!preview || preview.barberId !== input.barberId || preview.locationId !== input.locationId) {
        return { active: false, starts: false, ends: false, label: "" };
    }

    const slotStart = new Date(localDateTimeToIso(input.selectedDate, input.slot));
    const slotEnd = new Date(slotStart.getTime() + 15 * 60 * 1000);
    const previewStart = new Date(preview.startTime);
    const previewEnd = new Date(preview.endTime);
    const active = slotStart < previewEnd && slotEnd > previewStart;
    const starts = active && slotStart.getTime() === previewStart.getTime();
    const ends = active && slotEnd.getTime() >= previewEnd.getTime();

    return {
        active,
        starts,
        ends,
        label: `${formatLocalTime(preview.startTime)} - ${formatLocalTime(preview.endTime)}`,
    };
}

function blockedAppliesToCell(blockedTime: AdminBlockedTime, barberId: string, locationId: string) {
    if (blockedTime.scope === "business") return true;
    if (blockedTime.scope === "location") return blockedTime.locationId === locationId;
    return blockedTime.barberId === barberId && (!blockedTime.locationId || blockedTime.locationId === locationId);
}

function businessWindowForDate(date: string) {
    const day = parseLocalDate(date).getUTCDay();
    return day === 0 ? { start: "10:00", end: "17:00" } : { start: "10:00", end: "19:00" };
}

function currentSlotContains(slot: string) {
    const nowClock = localClockFromDate(new Date());
    const now = clockToMinutes(nowClock);
    const start = clockToMinutes(slot);
    return now >= start && now < start + 15;
}

function nextQuarterClock() {
    const minutes = clockToMinutes(localClockFromDate(new Date()));
    return minutesToClock(Math.ceil(minutes / 15) * 15);
}

function defaultAppointmentClockForDate(date: string) {
    const window = businessWindowForDate(date);
    const windowStart = clockToMinutes(window.start);
    const windowEnd = clockToMinutes(window.end);

    if (date !== todayLocalDate()) {
        return window.start;
    }

    const nextQuarter = clockToMinutes(nextQuarterClock());
    if (nextQuarter < windowStart || nextQuarter >= windowEnd) {
        return window.start;
    }

    return minutesToClock(nextQuarter);
}

function localDateTimeToIso(date: string, time: string) {
    const [year, month, day] = date.split("-").map(Number);
    const [hour, minute] = time.split(":").map(Number);
    const utcGuess = new Date(Date.UTC(year, month - 1, day, hour, minute));
    const offset = timeZoneOffsetMinutes(utcGuess, TIME_ZONE);
    return new Date(Date.UTC(year, month - 1, day, hour, minute) - offset * 60_000).toISOString();
}

function localPartsFromIso(value: string) {
    const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: TIME_ZONE,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
    }).formatToParts(new Date(value));
    const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";

    return {
        date: `${get("year")}-${get("month")}-${get("day")}`,
        time: `${get("hour")}:${get("minute")}`,
    };
}

function localDateFromIso(value: string) {
    return localPartsFromIso(value).date;
}

function localClockFromIso(value: string) {
    return localPartsFromIso(value).time;
}

function localClockFromDate(value: Date) {
    return localPartsFromIso(value.toISOString()).time;
}

function addMinutesToIso(value: string, minutes: number) {
    return new Date(new Date(value).getTime() + minutes * 60_000).toISOString();
}

function timeZoneOffsetMinutes(date: Date, timeZone: string) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone,
        timeZoneName: "shortOffset",
        hour: "2-digit",
    }).formatToParts(date);
    const value = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT";
    const match = value.match(/^GMT([+-])(\d{1,2})(?::(\d{2}))?$/);

    if (!match) {
        return 0;
    }

    const sign = match[1] === "-" ? -1 : 1;
    const hours = Number(match[2]);
    const minutes = Number(match[3] ?? 0);
    return sign * (hours * 60 + minutes);
}

function formatClockLabel(time: string) {
    const [hour, minute] = time.split(":").map(Number);
    return new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        hour: "numeric",
        minute: "2-digit",
    }).format(new Date(Date.UTC(2026, 0, 1, hour, minute)));
}

function clockToMinutes(time: string) {
    const [hour, minute] = time.split(":").map(Number);
    return hour * 60 + minute;
}

function minutesToClock(totalMinutes: number) {
    const hour = Math.floor(totalMinutes / 60) % 24;
    const minute = totalMinutes % 60;
    return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function formatServiceSelectionPrice(services: AdminServiceOption[]) {
    if (services.length === 0) return "$0";
    const total = services.reduce((sum, service) => sum + service.priceCents, 0);
    const hasFromPrice = services.some((service) => service.priceType === "from");
    const formatted = `CA$ ${Math.round(total / 100)}`;
    return hasFromPrice ? `from ${formatted}` : formatted;
}

function activityLabel(eventType: AdminDashboardActivity["eventType"]) {
    switch (eventType) {
        case "booking_confirmation":
            return "New booking";
        case "cancellation_confirmation":
            return "Booking cancelled";
        case "reschedule_confirmation":
            return "Booking rescheduled";
        case "reminder_24h":
            return "24h reminder";
        case "reminder_2h":
            return "2h reminder";
        case "no_show":
            return "No-show marked";
    }
}

function activityStatusLabel(item: AdminDashboardActivity) {
    if (item.eventType === "no_show") return "Calendar";
    return item.status === "sent"
        ? "Sent"
        : item.status === "failed"
          ? "Failed"
          : item.status === "skipped"
            ? "Skipped"
            : item.status === "pending"
              ? "Pending"
              : formatAdminStatus(item.appointmentStatus);
}

const barberPhotosBySlug: Record<string, string> = {
    "sam-to": samThumb,
    "laura-nguyen": lauraThumb,
    "yogesh-kumar": yogeshThumb,
    "shayan-hussain": shayonPhoto,
    "shayon-hussain": shayonPhoto,
    fawad: fawadPhoto,
};

function barberPhotoUrl(barber: Pick<AdminBarberOption, "displayName" | "slug">) {
    if (barber.slug && barberPhotosBySlug[barber.slug]) {
        return barberPhotosBySlug[barber.slug];
    }

    return barberPhotosBySlug[slugifyBarberName(barber.displayName)];
}

function slugifyBarberName(value: string) {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");
}

function initials(name: string) {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase())
        .join("");
}

function bookingToneClasses(tone: ReturnType<typeof getBookingCardTone>) {
    if (tone === "walk_in") return "border-violet-500 bg-violet-50 text-violet-950";
    if (tone === "no_show") return "border-red-500 bg-red-50 text-red-900";
    if (tone === "cancelled") return "border-stone-400 bg-stone-100 text-stone-700";
    if (tone === "completed") return "border-emerald-500 bg-emerald-50 text-emerald-900";
    return "border-blue-500 bg-blue-50 text-blue-950";
}
