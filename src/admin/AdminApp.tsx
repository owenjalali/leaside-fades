import { useEffect, useMemo, useRef, useState, type CSSProperties, type FormEvent, type ReactNode } from "react";
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
    Mail,
    MapPin,
    MessageSquare,
    RefreshCw,
    Scissors,
    Search,
    SlidersHorizontal,
    AlertTriangle,
    UserRound,
    UsersRound,
    X,
} from "lucide-react";

import lauraThumb from "../assets/barbers/booking-thumbnails/laura-thumb.jpg";
import josefThumb from "../assets/barbers/booking-thumbnails/josef-thumb.jpg";
import samThumb from "../assets/barbers/booking-thumbnails/sam-thumb.jpg";
import yogeshThumb from "../assets/barbers/booking-thumbnails/yogesh-thumb.jpg";
import shayonPhoto from "../assets/barbers/shayon.png";
import {
    ADMIN_AUTH_EXPIRED_EVENT,
    cancelAdminBooking,
    completeAdminBooking,
    createManualBooking,
    createWalkInBooking,
    editAdminBooking,
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
    requestAdminPasswordReset,
    replaceAdminDayShift,
    resetAdminPassword,
    acceptAdminInvite,
    rescheduleAdminBooking,
} from "./api";
import SchedulePage from "./SchedulePage";
import TeamPage from "./TeamPage";
import {
    buildDashboardChartScale,
    buildDashboardPeriodRange,
    buildBookingDragPayload,
    buildCalendarBoardRows,
    buildCalendarUnavailableRanges,
    buildDateRangeForView,
    buildMonthDays,
    buildWeekDays,
    bookingFallsOutsideWorkingWindows,
    compactNotificationFailureMessage,
    formatAdminStatus,
    formatCompactDashboardCurrency,
    formatDashboardCurrency,
    formatDashboardPeriodLabel,
    formatLocalDateTime,
    formatLocalTime,
    getCalendarInitialScrollTop,
    getBookingCardTone,
    getBookingToneClasses,
    getActiveNotificationFailures,
    getScheduledCalendarBarbers,
    groupBookingsByLocalDate,
    notificationFilterMatches,
    notificationFilters,
    seriesHasDashboardData,
    summarizeNotificationHealth,
    todayLocalDate,
    navigateCalendarDate,
    navigateDashboardPeriod,
    type AdminCalendarView,
    type NotificationCenterFilter,
    type ScheduledCalendarBarber,
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
    AdminDashboardPeriod,
    AdminDashboardSnapshot,
    AdminSchedule,
    AdminServiceOption,
    AdminSlot,
    AdminUpcomingReminderPreview,
    SafeAdminUser,
} from "./types";

type AdminView = AdminCalendarView;
interface AppointmentPreview {
    barberId: string;
    locationId: string;
    startTime: string;
    endTime: string;
}

type DrawerState =
    | { mode: "detail"; bookingId: string }
    | { mode: "add_appointment"; barberId: string; locationId: string; startTime: string }
    | { mode: "edit_shift"; barberId: string; locationId: string; date: string }
    | null;

const TIME_ZONE = "America/Toronto";
const SLOT_HEIGHT = 22;
const TIME_GUTTER_WIDTH = "clamp(66px, 7vw, 132px)";

const defaultFilters = (date = todayLocalDate(), view: AdminView = "day"): AdminBookingFilters => ({
    ...buildDateRangeForView(view, date),
    locationId: "",
    barberId: "",
    status: "",
});

export default function AdminApp() {
    const [path, setPath] = useState(window.location.pathname);
    const [user, setUser] = useState<SafeAdminUser | null>(null);
    const [sessionLoading, setSessionLoading] = useState(true);
    const [loginNotice, setLoginNotice] = useState("");

    useEffect(() => {
        const handlePopState = () => setPath(window.location.pathname);
        window.addEventListener("popstate", handlePopState);
        return () => window.removeEventListener("popstate", handlePopState);
    }, []);

    useEffect(() => {
        if (isStandaloneAdminAuthPath(path)) {
            setSessionLoading(false);
            return;
        }

        setSessionLoading(true);
        fetchAdminSession()
            .then((session) => setUser(session.user))
            .catch(() => setUser(null))
            .finally(() => setSessionLoading(false));
    }, [path]);

    useEffect(() => {
        const handleAuthExpired = () => {
            setUser(null);
            setSessionLoading(false);
            setLoginNotice("Your admin session expired. Sign in again to keep booking.");
            window.history.replaceState({}, "", "/admin/login");
            setPath("/admin/login");
        };

        window.addEventListener(ADMIN_AUTH_EXPIRED_EVENT, handleAuthExpired);
        return () => window.removeEventListener(ADMIN_AUTH_EXPIRED_EVENT, handleAuthExpired);
    }, []);

    function navigate(nextPath: string) {
        window.history.pushState({}, "", nextPath);
        setPath(nextPath);
    }

    async function handleLogout() {
        await logoutAdmin();
        setUser(null);
        setLoginNotice("");
        navigate("/admin/login");
    }

    function handleLogin(nextUser: SafeAdminUser) {
        setLoginNotice("");
        setUser(nextUser);
    }

    function handlePasswordResetComplete() {
        setLoginNotice("Password updated. Sign in with your new password.");
        navigate("/admin/login");
    }

    function handleInviteAccepted() {
        setLoginNotice("Account set up. Sign in with your new password.");
        navigate("/admin/login");
    }

    if (isStandaloneAdminAuthPath(path) && path === "/admin/forgot-password") {
        return <ForgotPasswordPage onNavigate={navigate} />;
    }

    if (isStandaloneAdminAuthPath(path) && path === "/admin/reset-password") {
        return (
            <ResetPasswordPage
                token={readUrlToken()}
                onNavigate={navigate}
                onPasswordReset={handlePasswordResetComplete}
            />
        );
    }

    if (isStandaloneAdminAuthPath(path) && path === "/admin/accept-invite") {
        return (
            <AcceptInvitePage
                token={readUrlToken()}
                onNavigate={navigate}
                onAccepted={handleInviteAccepted}
            />
        );
    }

    if (sessionLoading) {
        return <AdminSplash label="Loading admin workspace" />;
    }

    if (!user || path === "/admin/login") {
        return <LoginPage notice={loginNotice} onLogin={handleLogin} onNavigate={navigate} />;
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
    notice,
    onLogin,
    onNavigate,
}: {
    notice?: string;
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
                    {notice && <p className="rounded-md bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">{notice}</p>}
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
                    <button
                        className="w-full text-sm font-bold text-forest underline-offset-4 hover:underline"
                        type="button"
                        onClick={() => onNavigate("/admin/forgot-password")}
                    >
                        Forgot password?
                    </button>
                </form>
            </section>
        </main>
    );
}

export function ForgotPasswordPage({ onNavigate }: { onNavigate: (path: string) => void }) {
    const [email, setEmail] = useState("");
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        setSubmitting(true);
        setError("");
        setMessage("");

        try {
            const result = await requestAdminPasswordReset(email);
            setMessage(result.message);
        } catch (error) {
            setError(error instanceof Error ? error.message : "Password reset failed.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <AdminAuthPage title="Reset password">
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
                {message && <p className="rounded-md bg-green/10 px-3 py-2 text-sm font-semibold text-forest">{message}</p>}
                {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}
                <button className="primary-button w-full text-lg md:text-xl" type="submit" disabled={submitting}>
                    {submitting ? "Sending" : "Send reset email"}
                </button>
                <button
                    className="w-full text-sm font-bold text-forest underline-offset-4 hover:underline"
                    type="button"
                    onClick={() => onNavigate("/admin/login")}
                >
                    Back to sign in
                </button>
            </form>
        </AdminAuthPage>
    );
}

export function ResetPasswordPage({
    token,
    onNavigate,
    onPasswordReset,
}: {
    token: string;
    onNavigate: (path: string) => void;
    onPasswordReset: () => void;
}) {
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        setSubmitting(true);
        setError("");

        try {
            await resetAdminPassword(token, password);
            onPasswordReset();
        } catch (error) {
            setError(error instanceof Error ? error.message : "Password reset failed.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <AdminAuthPage title="Set new password">
            <form onSubmit={handleSubmit} className="space-y-6 rounded-md border border-forest/10 bg-white p-6 shadow-sm md:p-8">
                {!token && (
                    <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                        Password reset link is invalid or expired.
                    </p>
                )}
                <input className="hidden" type="text" name="username" autoComplete="username" tabIndex={-1} aria-hidden="true" />
                <Field label="New password">
                    <input
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="input"
                        type="password"
                        autoComplete="new-password"
                        minLength={8}
                        required
                    />
                </Field>
                {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}
                <button className="primary-button w-full text-lg md:text-xl" type="submit" disabled={submitting || !token}>
                    {submitting ? "Saving" : "Save password"}
                </button>
                <button
                    className="w-full text-sm font-bold text-forest underline-offset-4 hover:underline"
                    type="button"
                    onClick={() => onNavigate("/admin/login")}
                >
                    Back to sign in
                </button>
            </form>
        </AdminAuthPage>
    );
}

export function AcceptInvitePage({
    token,
    onNavigate,
    onAccepted,
}: {
    token: string;
    onNavigate: (path: string) => void;
    onAccepted: () => void;
}) {
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);

    async function handleSubmit(event: FormEvent) {
        event.preventDefault();
        setSubmitting(true);
        setError("");

        try {
            await acceptAdminInvite(token, password);
            onAccepted();
        } catch (error) {
            setError(error instanceof Error ? error.message : "Account setup failed.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <AdminAuthPage title="Set up account">
            <form onSubmit={handleSubmit} className="space-y-6 rounded-md border border-forest/10 bg-white p-6 shadow-sm md:p-8">
                {!token && (
                    <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">
                        Invite link is invalid or expired.
                    </p>
                )}
                <input className="hidden" type="text" name="username" autoComplete="username" tabIndex={-1} aria-hidden="true" />
                <Field label="Password">
                    <input
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        className="input"
                        type="password"
                        autoComplete="new-password"
                        minLength={8}
                        required
                    />
                </Field>
                {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}
                <button className="primary-button w-full text-lg md:text-xl" type="submit" disabled={submitting || !token}>
                    {submitting ? "Saving" : "Create account"}
                </button>
                <button
                    className="w-full text-sm font-bold text-forest underline-offset-4 hover:underline"
                    type="button"
                    onClick={() => onNavigate("/admin/login")}
                >
                    Back to sign in
                </button>
            </form>
        </AdminAuthPage>
    );
}

function AdminAuthPage({ title, children }: { title: string; children: ReactNode }) {
    return (
        <main className="min-h-screen bg-cream text-charcoal">
            <section className="mx-auto flex min-h-screen w-full max-w-[min(92vw,34rem)] flex-col justify-center px-6 py-12">
                <div className="mb-8 md:mb-10">
                    <p className="text-base font-semibold uppercase tracking-[0.22em] text-green md:text-lg">Leaside Fades</p>
                    <h1 className="mt-2 text-5xl font-black leading-tight text-forest md:text-6xl">{title}</h1>
                </div>
                {children}
            </section>
        </main>
    );
}

function readUrlToken() {
    if (typeof window === "undefined") return "";
    return new URLSearchParams(window.location.search).get("token")?.trim() ?? "";
}

export function isStandaloneAdminAuthPath(path: string) {
    return (
        path === "/admin/forgot-password" ||
        path === "/admin/reset-password" ||
        path === "/admin/accept-invite"
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
    const [dashboardPeriod, setDashboardPeriod] = useState<AdminDashboardPeriod>("week");
    const [dashboardAnchorDate, setDashboardAnchorDate] = useState<string | null>(null);
    const [bookings, setBookings] = useState<AdminBookingSummary[]>([]);
    const initialView: AdminView = path.startsWith("/admin/bookings") ? "list" : "day";
    const [calendarDate, setCalendarDate] = useState(() => todayLocalDate());
    const [filters, setFilters] = useState<AdminBookingFilters>(() => defaultFilters(todayLocalDate(), initialView));
    const [view, setView] = useState<AdminView>(initialView);
    const [drawer, setDrawer] = useState<DrawerState>(null);
    const [message, setMessage] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(true);
    const [dashboardLoading, setDashboardLoading] = useState(false);
    const [dashboardRefreshError, setDashboardRefreshError] = useState("");
    const [appointmentPreview, setAppointmentPreview] = useState<AppointmentPreview | null>(null);
    const [draggingBookingId, setDraggingBookingId] = useState<string | null>(null);
    const [pendingDragId, setPendingDragId] = useState<string | null>(null);
    const detailId = path.match(/^\/admin\/bookings\/([^/]+)$/)?.[1];
    const isDashboardPath = path.startsWith("/admin/dashboard");
    const isShiftsPath = path.startsWith("/admin/shifts");
    const isBlockedTimePath = path.startsWith("/admin/blocked-time");
    const isTeamPath = path.startsWith("/admin/team");
    const isSchedulePath = isShiftsPath || isBlockedTimePath;
    const isManagementPath = isSchedulePath || isTeamPath;
    const selectedDate = calendarDate;
    const pageTitle = isDashboardPath ? "Dashboard" : isTeamPath ? "Team" : isShiftsPath ? "Staff shifts" : isBlockedTimePath ? "Blocked time" : "Calendar";

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
            setFilters((current) => ({
                ...current,
                ...buildDateRangeForView("list", calendarDate),
            }));
            setDrawer(null);
        } else if (path.startsWith("/admin/dashboard")) {
            setDrawer(null);
        } else if (path.startsWith("/admin/calendar") && view === "list") {
            setView("day");
            setFilters((current) => ({
                ...current,
                ...buildDateRangeForView("day", calendarDate),
            }));
        }
    }, [calendarDate, path, view]);

    useEffect(() => {
        if (isManagementPath) {
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
    }, [filters, isManagementPath]);

    useEffect(() => {
        if (isManagementPath) return;

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
    }, [filters.from, filters.to, isManagementPath]);

    useEffect(() => {
        if (!isDashboardPath) return;

        let active = true;

        async function loadDashboard(quiet = false) {
            if (!quiet) setDashboardLoading(true);

            try {
                const response = await fetchAdminDashboard({
                    period: dashboardPeriod,
                    anchorDate: dashboardAnchorDate ?? undefined,
                });
                if (!active) return;
                setDashboard(response);
                setDashboardAnchorDate((current) =>
                    dashboardPeriod === "all-time" ? response.revenue.anchorDate : current ?? response.revenue.anchorDate,
                );
                setDashboardRefreshError("");
            } catch (error) {
                if (!active) return;
                const message = error instanceof Error ? error.message : "Failed to load dashboard.";
                setDashboardRefreshError(message);
                if (!quiet) setError(message);
            } finally {
                if (active && !quiet) setDashboardLoading(false);
            }
        }

        void loadDashboard(false);
        const refreshTimer = window.setInterval(() => {
            void loadDashboard(true);
        }, 30_000);

        return () => {
            active = false;
            window.clearInterval(refreshTimer);
        };
    }, [dashboardAnchorDate, dashboardPeriod, isDashboardPath]);

    async function refreshBookings() {
        const response = await fetchAdminBookings(filters);
        setBookings(response.bookings);

        if (!isManagementPath) {
            const scheduleResponse = await fetchAdminSchedule({ from: filters.from, to: filters.to });
            setSchedule(scheduleResponse);
        }

        if (isDashboardPath) {
            await refreshDashboard();
        }
    }

    async function refreshDashboard(options: { quiet?: boolean } = {}) {
        const quiet = options.quiet ?? false;
        if (!quiet) setDashboardLoading(true);

        try {
            const response = await fetchAdminDashboard({
                period: dashboardPeriod,
                anchorDate: dashboardAnchorDate ?? undefined,
            });
            setDashboard(response);
            setDashboardAnchorDate((current) =>
                dashboardPeriod === "all-time" ? response.revenue.anchorDate : current ?? response.revenue.anchorDate,
            );
            setDashboardRefreshError("");
        } catch (error) {
            const message = error instanceof Error ? error.message : "Failed to load dashboard.";
            setDashboardRefreshError(message);
            if (!quiet) setError(message);
        } finally {
            if (!quiet) setDashboardLoading(false);
        }
    }

    async function refreshAdminContext() {
        const [nextOptions, nextSchedule] = await Promise.all([
            fetchAdminCalendarOptions(),
            fetchAdminSchedule({ from: filters.from, to: filters.to }),
        ]);

        setOptions(nextOptions);
        setSchedule(nextSchedule);
    }

    function openAddAppointment(input?: Partial<{ barberId: string; locationId: string; startTime: string }>) {
        const barberId = input?.barberId ?? visibleBarbers[0]?.id ?? user.barberId ?? "";
        const locationId = input?.locationId ?? activeLocationId;
        const startTime = input?.startTime ?? localDateTimeToIso(selectedDate, defaultAppointmentClockForDate(selectedDate));

        setDrawer({ mode: "add_appointment", barberId, locationId, startTime });
    }

    function applyDate(nextDate: string, nextView = view) {
        setCalendarDate(nextDate);
        setFilters((current) => ({
            ...current,
            ...buildDateRangeForView(nextView, nextDate),
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

    function changeDashboardPeriod(nextPeriod: AdminDashboardPeriod) {
        const currentAnchorDate = dashboardAnchorDate ?? dashboard?.revenue.anchorDate ?? todayLocalDate();
        setDashboardPeriod(nextPeriod);
        setDashboardAnchorDate(nextPeriod === "all-time" ? null : buildDashboardPeriodRange(nextPeriod, currentAnchorDate).anchorDate);
    }

    function moveDashboardPeriod(direction: -1 | 1) {
        if (dashboardPeriod === "all-time") return;

        const currentAnchorDate = dashboardAnchorDate ?? dashboard?.revenue.anchorDate ?? todayLocalDate();
        setDashboardAnchorDate(navigateDashboardPeriod(dashboardPeriod, currentAnchorDate, direction));
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
    const businessWindow = businessWindowForDate(selectedDate);
    const staticVisibleBarbers = options ? getVisibleBarbers(options, user, activeLocationId, filters.barberId) : [];
    const calendarBarberItems = useMemo(() => {
        if (!options) return [];

        if (!schedule) {
            return staticVisibleBarbers.map((barber) => ({
                barber,
                workingWindows: [],
                offScheduleBookings: [],
                scheduled: true,
            }));
        }

        return getScheduledCalendarBarbers({
            options,
            schedule,
            user,
            selectedDate,
            locationId: activeLocationId,
            requestedBarberId: filters.barberId,
            bookings,
            businessStartTime: businessWindow.start,
            businessEndTime: businessWindow.end,
        });
    }, [
        activeLocationId,
        bookings,
        businessWindow.end,
        businessWindow.start,
        filters.barberId,
        options,
        schedule,
        selectedDate,
        staticVisibleBarbers,
        user,
    ]);
    const visibleBarbers = view === "day" ? calendarBarberItems.map((item) => item.barber) : staticVisibleBarbers;
    const isDayCalendarPath =
        !isDashboardPath &&
        !isManagementPath &&
        !detailId &&
        !path.startsWith("/admin/bookings") &&
        view === "day";
    const drawerOpen = Boolean(drawer);
    const workspaceColumns = drawer
        ? "lg:grid-cols-[clamp(88px,8vw,132px)_minmax(0,1fr)] xl:grid-cols-[clamp(88px,8vw,132px)_minmax(46rem,1fr)_minmax(22rem,28rem)] 2xl:grid-cols-[clamp(88px,8vw,132px)_minmax(54rem,1fr)_minmax(24rem,30rem)]"
        : "lg:grid-cols-[clamp(88px,8vw,132px)_minmax(0,1fr)]";

    return (
        <main
            data-admin-workspace
            className={`flex h-dvh min-h-0 flex-col overflow-hidden bg-[#f4f7f2] text-base text-charcoal sm:text-[17px] lg:grid lg:text-[clamp(18px,1.3vw,20px)] ${workspaceColumns}`}
        >
            <AdminRail path={path} user={user} onNavigate={onNavigate} onLogout={onLogout} />
            <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
                <CalendarTopbar
                    title={pageTitle}
                    view={view}
                    selectedDate={selectedDate}
                    filters={filters}
                    options={options}
                    user={user}
                    schedule={schedule}
                    loading={isDashboardPath ? dashboardLoading : loading}
                    isDashboardPath={isDashboardPath}
                    isSchedulePath={isManagementPath}
                    compactWorkspace={drawerOpen}
                    onView={changeView}
                    onDate={applyDate}
                    onChangeFilters={setFilters}
                    onRefresh={isDashboardPath ? refreshDashboard : isManagementPath ? refreshAdminContext : refreshBookings}
                    onNewBooking={() => openAddAppointment()}
                />
                <section
                    className={`min-h-0 min-w-0 flex-1 px-2 pb-2 pt-2 sm:px-4 sm:pb-5 sm:pt-4 lg:px-7 ${
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
                            period={dashboardPeriod}
                            anchorDate={dashboardAnchorDate ?? dashboard?.revenue.anchorDate ?? todayLocalDate()}
                            loading={dashboardLoading}
                            refreshError={dashboardRefreshError}
                            onChangePeriod={changeDashboardPeriod}
                            onNavigatePeriod={moveDashboardPeriod}
                            onOpenBooking={(bookingId) => setDrawer({ mode: "detail", bookingId })}
                        />
                    ) : isTeamPath ? (
                        <TeamPage user={user} onChanged={refreshAdminContext} />
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
                            user={user}
                            selectedDate={selectedDate}
                            locationId={activeLocationId}
                            barberItems={calendarBarberItems}
                            loading={loading || !schedule}
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
                            onEditShift={(barberId) =>
                                setDrawer({ mode: "edit_shift", barberId, locationId: activeLocationId, date: selectedDate })
                            }
                        />
                    ) : (
                        <CalendarGrid
                            days={visibleDays}
                            bookingsByDate={groupedBookings}
                            view={view}
                            onOpen={(bookingId) => setDrawer({ mode: "detail", bookingId })}
                            onDayOpen={(date) => {
                                setView("day");
                                applyDate(date, "day");
                                if (!path.startsWith("/admin/calendar")) onNavigate("/admin/calendar");
                            }}
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
            {drawer?.mode === "edit_shift" && options && schedule && (
                <EditShiftDrawer
                    key={`${drawer.barberId}-${drawer.locationId}-${drawer.date}`}
                    options={options}
                    schedule={schedule}
                    user={user}
                    barberId={drawer.barberId}
                    locationId={drawer.locationId}
                    date={drawer.date}
                    onClose={() => setDrawer(null)}
                    onSaved={async () => {
                        setDrawer(null);
                        setMessage("Shift updated.");
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
        { label: "Team", path: "/admin/team", icon: UsersRound, ownerOnly: true },
    ].filter((item) => !item.ownerOnly || user.role === "owner" || user.role === "admin");

    return (
        <aside className="sticky top-0 z-30 flex h-14 min-h-14 items-center justify-between gap-2 border-b border-white/10 bg-[#08110e] px-2 text-white lg:h-screen lg:min-h-screen lg:flex-col lg:items-stretch lg:gap-3 lg:border-b-0 lg:px-3 lg:py-6 2xl:px-4">
            <button
                className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1 text-left lg:flex-col lg:justify-center lg:gap-3 lg:px-2 lg:py-2"
                onClick={() => onNavigate(user.role === "barber" ? "/admin/calendar" : "/admin/dashboard")}
                title="Leaside Fades"
            >
                <span className="flex size-8 items-center justify-center overflow-hidden rounded-md bg-white p-1 lg:size-14 lg:p-1.5 2xl:size-16">
                    <img src="/assets/logo-transparent.png" alt="Leaside Fades" className="h-full w-full object-contain" />
                </span>
                <span className="hidden text-sm font-black uppercase tracking-[0.16em] text-white/70 lg:block">Leaside</span>
            </button>
            <nav className="flex flex-1 items-center justify-center gap-1 lg:flex-col lg:justify-start lg:gap-2">
                {items.map((item) => {
                    const Icon = item.icon;
                    const active = path.startsWith(item.path);
                    return (
                        <button
                            key={item.path}
                            className={`flex size-10 items-center justify-center rounded-md transition lg:size-14 lg:w-full 2xl:size-16 ${
                                active ? "bg-green text-[#08110e]" : "text-white/72 hover:bg-white/10 hover:text-white"
                            }`}
                            onClick={() => onNavigate(item.path)}
                            title={item.label}
                        >
                            <Icon className="size-5 lg:size-7" />
                        </button>
                    );
                })}
            </nav>
            <div className="flex items-center gap-1 lg:flex-col">
                <button className="hidden size-12 items-center justify-center rounded-md bg-white/8 text-white lg:flex 2xl:size-14" title={`${user.displayName} (${user.role})`}>
                    <UserRound size={26} />
                </button>
                <button className="flex size-10 items-center justify-center rounded-md text-white/72 hover:bg-white/10 hover:text-white lg:size-12 2xl:size-14" onClick={onLogout} title="Sign out">
                    <LogOut className="size-5 lg:size-6" />
                </button>
            </div>
        </aside>
    );
}

function CalendarTopbar({
    title,
    view,
    selectedDate,
    filters,
    options,
    user,
    schedule,
    loading,
    isDashboardPath,
    isSchedulePath,
    compactWorkspace,
    onView,
    onDate,
    onChangeFilters,
    onRefresh,
    onNewBooking,
}: {
    title: string;
    view: AdminView;
    selectedDate: string;
    filters: AdminBookingFilters;
    options: AdminCalendarOptions | null;
    user: SafeAdminUser;
    schedule: AdminSchedule | null;
    loading: boolean;
    isDashboardPath: boolean;
    isSchedulePath: boolean;
    compactWorkspace: boolean;
    onView: (view: AdminView) => void;
    onDate: (date: string) => void;
    onChangeFilters: (filters: AdminBookingFilters) => void;
    onRefresh: () => Promise<void>;
    onNewBooking: () => void;
}) {
    const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
    const locationId = options ? resolveDefaultLocationId(options, user, filters.locationId) : filters.locationId ?? "";
    const businessWindow = businessWindowForDate(selectedDate);
    const showCalendarControls = !isSchedulePath && !isDashboardPath;
    const viewItems: AdminView[] = ["day", "week", "month", "list"];
    const availableBarbers =
        options && schedule && view === "day"
            ? getScheduledCalendarBarbers({
                  options,
                  schedule,
                  user,
                  selectedDate,
                  locationId,
                  businessStartTime: businessWindow.start,
                  businessEndTime: businessWindow.end,
              }).map((item) => item.barber)
              : options
              ? getVisibleBarbers(options, user, locationId)
              : [];
    const desktopShellClass = compactWorkspace
        ? "hidden min-w-0 gap-3 lg:flex lg:flex-col"
        : isDashboardPath
        ? "hidden min-w-0 items-center justify-between gap-4 lg:flex"
        : "hidden min-w-0 gap-3 lg:grid 2xl:grid-cols-[minmax(0,auto)_minmax(0,1fr)] 2xl:items-center 2xl:gap-5";
    const desktopTitleBlockClass = compactWorkspace
        ? "min-w-[12rem] flex-1 px-1"
        : isDashboardPath
        ? "min-w-0 flex-1 px-1 2xl:px-4"
        : "min-w-[12rem] flex-1 px-1 sm:flex-none 2xl:px-4";
    const desktopTitleClass = compactWorkspace
        ? "truncate text-2xl font-black text-forest 2xl:text-3xl"
        : "truncate text-2xl font-black text-forest sm:text-3xl";
    const desktopControlsClass = compactWorkspace
        ? "flex min-w-0 flex-wrap items-center gap-2"
        : isDashboardPath
        ? "flex shrink-0 items-center justify-end gap-3"
        : "flex min-w-0 flex-wrap items-center gap-3 2xl:justify-end";
    const desktopLocationSelectClass = compactWorkspace
        ? "input h-11 min-w-[min(11rem,100%)] flex-[1_1_12rem] px-3 py-2 text-sm 2xl:max-w-60"
        : "input h-12 min-w-[min(13rem,100%)] flex-[1_1_14rem] text-base 2xl:max-w-72";
    const desktopBarberSelectClass = compactWorkspace
        ? "input h-11 min-w-[min(11rem,100%)] flex-[1_1_12rem] px-3 py-2 text-sm 2xl:max-w-60"
        : "input h-12 min-w-[min(13rem,100%)] flex-[1_1_14rem] text-base 2xl:max-w-72";
    const desktopStatusSelectClass = compactWorkspace
        ? "input h-11 min-w-[min(10rem,100%)] flex-[1_1_10rem] px-3 py-2 text-sm 2xl:max-w-48"
        : "input h-12 min-w-[min(11rem,100%)] flex-[1_1_11rem] text-base 2xl:max-w-56";
    const desktopSegmentButtonClass = (item: AdminView) =>
        view === item
            ? compactWorkspace
                ? "segmented-active min-h-10 shrink-0 px-3 py-2 text-sm"
                : "segmented-active min-h-11 shrink-0 px-4 py-2 text-base"
            : compactWorkspace
              ? "segmented min-h-10 shrink-0 border-0 bg-transparent px-3 py-2 text-sm"
              : "segmented min-h-11 shrink-0 border-0 bg-transparent px-4 py-2 text-base";
    const desktopRefreshButtonClass = compactWorkspace ? "icon-button min-h-10 min-w-10" : "icon-button min-h-11 min-w-11";
    const desktopAddButtonClass = compactWorkspace
        ? "icon-text-button min-h-10 shrink-0 px-3 py-2 text-sm"
        : "icon-text-button min-h-11 px-4 py-2 text-base";

    if (isSchedulePath) {
        return (
            <header data-admin-calendar-topbar className="sticky top-0 z-20 shrink-0 border-b border-[#cfdacf] bg-white/95 px-3 py-2 backdrop-blur lg:px-7 lg:py-4">
                <div className="flex min-w-0 items-center justify-between gap-3">
                    <div className="min-w-0">
                        <p className="truncate text-xl font-black leading-tight text-forest sm:text-2xl">{title}</p>
                        <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-charcoal/50 sm:text-xs">Setup</p>
                    </div>
                </div>
            </header>
        );
    }

    return (
        <header data-admin-calendar-topbar className="sticky top-0 z-20 shrink-0 overflow-visible border-b border-[#cfdacf] bg-white/95 px-2 py-2 backdrop-blur lg:px-6 lg:py-3 2xl:px-8 2xl:py-4">
            <div className="relative space-y-2 lg:hidden">
                <div className="flex min-w-0 items-center gap-1.5">
                    <button className="text-button !min-h-10 shrink-0 bg-white px-3 py-1.5 text-sm" onClick={() => onDate(todayLocalDate())} disabled={isSchedulePath}>
                        Today
                    </button>
                    <button className="icon-button !min-h-10 !w-10 shrink-0" onClick={() => onDate(navigateCalendarDate(view, selectedDate, -1))} title="Previous" disabled={isSchedulePath}>
                        <ChevronLeft size={21} />
                    </button>
                    <button className="icon-button !min-h-10 !w-10 shrink-0" onClick={() => onDate(navigateCalendarDate(view, selectedDate, 1))} title="Next" disabled={isSchedulePath}>
                        <ChevronRight size={21} />
                    </button>
                    <div className="min-w-0 flex-1 px-1">
                        <p className="truncate text-lg font-black leading-tight text-forest">{isSchedulePath ? title : formatDateTitle(selectedDate, view)}</p>
                        <p className="text-[0.68rem] font-bold uppercase tracking-[0.12em] text-charcoal/50">{isSchedulePath ? "Setup" : title}</p>
                    </div>
                    <button className="icon-button !min-h-10 !w-10 shrink-0" onClick={onRefresh} title={isDashboardPath ? "Refresh dashboard" : "Refresh bookings"}>
                        <RefreshCw size={20} className={loading ? "animate-spin" : ""} />
                    </button>
                </div>

                {showCalendarControls && (
                    <div className="flex min-w-0 items-center gap-1.5">
                        <button
                            className="icon-text-button !min-h-10 shrink-0 px-3 py-1.5 text-sm"
                            type="button"
                            onClick={() => setMobileFiltersOpen((value) => !value)}
                            aria-expanded={mobileFiltersOpen}
                        >
                            <SlidersHorizontal size={18} />
                            Filters
                        </button>
                        <div className="flex min-w-0 flex-1 overflow-x-auto rounded-md border border-forest/10 bg-[#f7faf7] p-1">
                            {viewItems.map((item) => (
                                <button
                                    key={item}
                                    className={view === item ? "segmented-active !min-h-9 shrink-0 px-3 py-1.5 text-sm" : "segmented !min-h-9 shrink-0 border-0 bg-transparent px-3 py-1.5 text-sm"}
                                    onClick={() => onView(item)}
                                >
                                    {item}
                                </button>
                            ))}
                        </div>
                        <button className="icon-text-button !min-h-10 shrink-0 px-3 py-1.5 text-sm" onClick={onNewBooking}>
                            <CalendarPlus size={18} />
                            Add<span className="hidden sm:inline"> appointment</span>
                        </button>
                    </div>
                )}

                {showCalendarControls && mobileFiltersOpen && (
                    <div className="absolute left-0 right-0 top-full z-30 mt-2 grid gap-2 rounded-md border border-[#d4ddd4] bg-[#f8fbf8] p-2 shadow-[0_16px_32px_rgba(16,56,38,0.18)]">
                        <select
                            className="input h-9 !min-h-9 px-3 py-1.5 text-sm"
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
                            className="input h-9 !min-h-9 px-3 py-1.5 text-sm"
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
                            className="input h-9 !min-h-9 px-3 py-1.5 text-sm"
                            value={filters.status ?? ""}
                            onChange={(event) => onChangeFilters({ ...filters, status: event.target.value as AdminBookingFilters["status"] })}
                        >
                            <option value="">All statuses</option>
                            <option value="confirmed">Confirmed</option>
                            <option value="cancelled">Cancelled</option>
                            <option value="completed">Completed</option>
                            <option value="no_show">No show</option>
                        </select>
                    </div>
                )}

                {isDashboardPath && (
                    <button className="primary-button inline-flex !min-h-10 w-full items-center justify-center gap-2 px-3 py-2 text-sm" onClick={onNewBooking}>
                        <CalendarPlus size={18} />
                        Add appointment
                    </button>
                )}
            </div>

            <div className={desktopShellClass}>
                <div className={isDashboardPath ? "flex min-w-0 flex-1 items-center gap-2 sm:gap-3" : "flex min-w-0 flex-wrap items-center gap-2 sm:gap-3"}>
                    <button className="text-button min-h-11 bg-white px-4 py-2 text-base" onClick={() => onDate(todayLocalDate())} disabled={isSchedulePath}>
                        Today
                    </button>
                    <button className="icon-button min-h-11 min-w-11" onClick={() => onDate(navigateCalendarDate(view, selectedDate, -1))} title="Previous" disabled={isSchedulePath}>
                        <ChevronLeft size={24} />
                    </button>
                    <button className="icon-button min-h-11 min-w-11" onClick={() => onDate(navigateCalendarDate(view, selectedDate, 1))} title="Next" disabled={isSchedulePath}>
                        <ChevronRight size={24} />
                    </button>
                    <div className={desktopTitleBlockClass}>
                        <p className={desktopTitleClass}>{isSchedulePath ? title : formatDateTitle(selectedDate, view)}</p>
                        <p className="text-sm font-bold uppercase tracking-[0.12em] text-charcoal/50">{isSchedulePath ? "Setup" : title}</p>
                    </div>
                </div>
                <div className={desktopControlsClass}>
                    {showCalendarControls && (
                        <>
                            <select
                                className={desktopLocationSelectClass}
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
                                className={desktopBarberSelectClass}
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
                                className={desktopStatusSelectClass}
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
                                {viewItems.map((item) => (
                                    <button
                                        key={item}
                                        className={desktopSegmentButtonClass(item)}
                                        onClick={() => onView(item)}
                                    >
                                        {item}
                                    </button>
                                ))}
                            </div>
                            <button className={desktopRefreshButtonClass} onClick={onRefresh} title="Refresh bookings">
                                <RefreshCw className={loading ? "size-5 animate-spin" : "size-5"} />
                            </button>
                            <button className={desktopAddButtonClass} onClick={onNewBooking}>
                                <CalendarPlus className="size-5" />
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
    period,
    anchorDate,
    loading,
    refreshError,
    onChangePeriod,
    onNavigatePeriod,
    onOpenBooking,
}: {
    dashboard: AdminDashboardSnapshot | null;
    period: AdminDashboardPeriod;
    anchorDate: string;
    loading: boolean;
    refreshError: string;
    onChangePeriod: (period: AdminDashboardPeriod) => void;
    onNavigatePeriod: (direction: -1 | 1) => void;
    onOpenBooking: (bookingId: string) => void;
}) {
    const today = dashboard?.todayBookings ?? [];
    const upcoming = dashboard?.upcomingBookings ?? [];
    const activity = dashboard?.activity ?? [];
    const upcomingReminders = dashboard?.upcomingReminders ?? [];
    const deliveryMode = dashboard?.notificationDeliveryMode ?? "mock";
    const lastUpdated = dashboard?.generatedAt ? formatDashboardUpdatedAt(dashboard.generatedAt) : "Waiting for first snapshot";

    if (loading && !dashboard) {
        return (
            <section className="flex min-h-[560px] items-center justify-center rounded-md border border-[#d6ded6] bg-white text-xl font-bold text-charcoal/60">
                <RefreshCw size={24} className="mr-3 animate-spin" />
                Loading dashboard
            </section>
        );
    }

    if (!dashboard) {
        return (
            <section className="flex min-h-[560px] flex-col items-center justify-center rounded-md border border-[#d6ded6] bg-white p-6 text-center shadow-sm">
                <AlertTriangle size={28} className="text-amber-600" />
                <p className="mt-3 text-2xl font-black text-forest">Dashboard unavailable</p>
                <p className="mt-2 max-w-md text-base font-bold text-charcoal/55">
                    The last refresh did not return a usable dashboard snapshot. Try refreshing again from the toolbar.
                </p>
            </section>
        );
    }

    return (
        <div className="space-y-5 2xl:space-y-6">
            <section className="flex flex-wrap items-end justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-sm font-black uppercase tracking-[0.14em] text-green">Operating dashboard</p>
                    <h1 className="mt-1 text-3xl font-black leading-tight text-forest sm:text-4xl">
                        Revenue, bookings, and notification health
                    </h1>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm font-black text-charcoal/55">
                    <span className="rounded-full border border-forest/10 bg-white px-3 py-2 shadow-sm">Last updated {lastUpdated}</span>
                    {loading && (
                        <span className="inline-flex items-center gap-2 rounded-full border border-green/20 bg-green/10 px-3 py-2 text-forest">
                            <RefreshCw size={14} className="animate-spin" />
                            Refreshing
                        </span>
                    )}
                    {refreshError && (
                        <span className="inline-flex max-w-full items-center gap-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900">
                            <AlertTriangle size={14} />
                            <span className="max-w-[20rem] truncate">Refresh delayed: {refreshError}</span>
                        </span>
                    )}
                </div>
            </section>
            <section className="grid gap-5 xl:grid-cols-2">
                <TrackedRevenueCard
                    revenue={dashboard.revenue}
                    period={period}
                    anchorDate={anchorDate}
                    onChangePeriod={onChangePeriod}
                    onNavigatePeriod={onNavigatePeriod}
                />
                <UpcomingAppointmentsChartCard upcoming={dashboard.upcomingAppointments} />
            </section>
            <section className="grid gap-5 2xl:grid-cols-[1.15fr_0.85fr]">
                <DashboardActivityPanel
                    todayBookings={today}
                    upcomingBookings={upcoming}
                    activity={activity}
                    onOpenBooking={onOpenBooking}
                />
                <NotificationHealthPanel
                    health={dashboard.notificationHealth}
                    activity={activity}
                    upcomingReminders={upcomingReminders}
                    deliveryMode={deliveryMode}
                    onOpenBooking={onOpenBooking}
                />
            </section>
        </div>
    );
}

function TrackedRevenueCard({
    revenue,
    period,
    anchorDate,
    onChangePeriod,
    onNavigatePeriod,
}: {
    revenue: AdminDashboardSnapshot["revenue"];
    period: AdminDashboardPeriod;
    anchorDate: string;
    onChangePeriod: (period: AdminDashboardPeriod) => void;
    onNavigatePeriod: (direction: -1 | 1) => void;
}) {
    const hasUnpriced = revenue.unpricedAppointmentCount > 0;
    const hasFromPrices = revenue.fromPriceAppointmentCount > 0;
    const hasPastConfirmed = revenue.pastConfirmedAppointmentCount > 0;
    const periodLabel = formatDashboardPeriodLabel(revenue.period, revenue.periodStart, revenue.periodEnd);
    const periodOptions: AdminDashboardPeriod[] = ["week", "month", "year", "all-time"];
    const isAllTime = period === "all-time";

    return (
        <section className="overflow-hidden rounded-md border border-[#d7e0d7] bg-white shadow-sm">
            <div className="space-y-5 p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                        <p className="text-sm font-black uppercase tracking-[0.13em] text-charcoal/45">Stored service snapshots</p>
                        <h2 className="mt-1 text-2xl font-black text-forest sm:text-3xl">Tracked revenue</h2>
                    </div>
                    <div className="flex flex-wrap items-center justify-end gap-2">
                        <div className="inline-grid grid-cols-4 overflow-hidden rounded-md border border-[#d7e0d7] bg-[#f7faf7] p-1">
                            {periodOptions.map((option) => (
                                <button
                                    key={`dashboard-period-${option}`}
                                    className={`rounded px-3 py-1.5 text-xs font-black uppercase tracking-[0.08em] transition ${
                                        option === period
                                            ? "bg-forest text-white shadow-sm"
                                            : "text-charcoal/58 hover:bg-white hover:text-forest"
                                    }`}
                                    onClick={() => onChangePeriod(option)}
                                    type="button"
                                >
                                    {formatDashboardPeriodOption(option)}
                                </button>
                            ))}
                        </div>
                        <div className="flex min-w-0 items-center gap-1 rounded-md border border-[#d7e0d7] bg-white p-1 shadow-sm" title={`Anchor date ${anchorDate}`}>
                            {!isAllTime && (
                                <button className="icon-button size-8" onClick={() => onNavigatePeriod(-1)} type="button" title={`Previous ${period}`}>
                                    <ChevronLeft size={18} />
                                </button>
                            )}
                            <span className="min-w-[9rem] truncate px-2 text-center text-sm font-black text-forest">
                                {periodLabel}
                            </span>
                            {!isAllTime && (
                                <button className="icon-button size-8" onClick={() => onNavigatePeriod(1)} type="button" title={`Next ${period}`}>
                                    <ChevronRight size={18} />
                                </button>
                            )}
                        </div>
                    </div>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                    <DashboardMetricTile
                        label="Revenue"
                        value={formatDashboardCurrency(revenue.totalCents)}
                        detail={`${revenue.pricedAppointmentCount} priced`}
                    />
                    <DashboardMetricTile
                        label="Appointments"
                        value={`${revenue.appointmentCount}`}
                        detail={`${revenue.completedAppointmentCount} completed`}
                    />
                    <DashboardMetricTile
                        label="Average"
                        value={formatDashboardCurrency(revenue.averageRevenueCents)}
                        detail="priced appointments"
                    />
                </div>
                {(hasUnpriced || hasFromPrices || hasPastConfirmed) && (
                    <div className="flex flex-wrap gap-2 text-xs font-black uppercase tracking-[0.08em]">
                        {hasPastConfirmed && (
                            <span className="rounded-full bg-[#eef5f1] px-3 py-1.5 text-charcoal/65">
                                {revenue.pastConfirmedAppointmentCount} past confirmed booking{revenue.pastConfirmedAppointmentCount === 1 ? "" : "s"} counted
                            </span>
                        )}
                        {hasUnpriced && (
                            <span className="rounded-full bg-amber-50 px-3 py-1.5 text-amber-800">
                                {revenue.unpricedAppointmentCount} unpriced appointment{revenue.unpricedAppointmentCount === 1 ? "" : "s"}
                            </span>
                        )}
                        {hasFromPrices && (
                            <span className="rounded-full bg-[#eef5f1] px-3 py-1.5 text-charcoal/65">
                                {revenue.fromPriceAppointmentCount} from-price snapshot{revenue.fromPriceAppointmentCount === 1 ? "" : "s"} counted at stored total
                            </span>
                        )}
                    </div>
                )}
            </div>
            <div className="border-t border-[#e1e8e1] px-3 pb-4 pt-3 sm:px-5">
                <RevenueChart series={revenue.series} period={revenue.period} />
            </div>
        </section>
    );
}

function formatDashboardPeriodOption(period: AdminDashboardPeriod) {
    switch (period) {
        case "week":
            return "Week";
        case "month":
            return "Month";
        case "year":
            return "Year";
        case "all-time":
            return "All time";
    }
}

function UpcomingAppointmentsChartCard({
    upcoming,
}: {
    upcoming: AdminDashboardSnapshot["upcomingAppointments"];
}) {
    return (
        <section className="overflow-hidden rounded-md border border-[#d7e0d7] bg-white shadow-sm">
            <div className="space-y-5 p-5 sm:p-6">
                <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                        <p className="text-sm font-black uppercase tracking-[0.13em] text-charcoal/45">All locations, next 7 days</p>
                        <h2 className="mt-1 text-2xl font-black text-forest sm:text-3xl">Upcoming appointments</h2>
                    </div>
                    <span className="rounded-full bg-green/15 px-3 py-1 text-xs font-black uppercase tracking-[0.08em] text-forest">
                        Live schedule
                    </span>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                    <DashboardMetricTile
                        label="Booked"
                        value={`${upcoming.confirmedCount + upcoming.cancelledCount}`}
                        detail="tracked"
                    />
                    <DashboardMetricTile
                        label="Confirmed"
                        value={`${upcoming.confirmedCount}`}
                        detail="active"
                    />
                    <DashboardMetricTile
                        label="Cancelled"
                        value={`${upcoming.cancelledCount}`}
                        detail="removed"
                    />
                </div>
            </div>
            <div className="border-t border-[#e1e8e1] px-3 pb-4 pt-3 sm:px-5">
                <UpcomingAppointmentsChart series={upcoming.dailySeries} />
            </div>
        </section>
    );
}

function DashboardMetricTile({ label, value, detail }: { label: string; value: string; detail: string }) {
    return (
        <div className="min-w-0 rounded-md border border-[#e1e8e1] bg-[#fbfdfb] p-3">
            <p className="truncate text-xs font-black uppercase tracking-[0.12em] text-charcoal/45">{label}</p>
            <p className="mt-1 truncate text-2xl font-black text-forest sm:text-3xl">{value}</p>
            <p className="truncate text-sm font-bold text-charcoal/52">{detail}</p>
        </div>
    );
}

function RevenueChart({
    series,
    period,
}: {
    series: AdminDashboardSnapshot["revenue"]["series"];
    period: AdminDashboardPeriod;
}) {
    const chartSeries =
        series.length > 0
            ? series
            : [
                  {
                      key: "",
                      label: "",
                      totalCents: 0,
                      appointmentCount: 0,
                      completedAppointmentCount: 0,
                      pastConfirmedAppointmentCount: 0,
                      pricedAppointmentCount: 0,
                      unpricedAppointmentCount: 0,
                      fromPriceAppointmentCount: 0,
                  },
              ];
    const hasData = seriesHasDashboardData(chartSeries, "totalCents");
    const scale = buildDashboardChartScale(chartSeries.map((point) => point.totalCents));
    const width = 680;
    const height = 300;
    const frame = { top: 24, right: 24, bottom: 48, left: 80 };
    const plotWidth = width - frame.left - frame.right;
    const plotHeight = height - frame.top - frame.bottom;
    const baseline = frame.top + plotHeight;
    const points = chartSeries.map((point, index) => {
        const x = chartPointX(index, chartSeries.length, frame.left, plotWidth);
        const y = chartPointY(point.totalCents, scale.max, frame.top, plotHeight);
        return { ...point, x, y };
    });
    const linePoints = points.map((point) => `${point.x},${point.y}`).join(" ");
    const areaPath = points.length
        ? `M ${points[0].x} ${baseline} L ${points.map((point) => `${point.x} ${point.y}`).join(" L ")} L ${points[points.length - 1].x} ${baseline} Z`
        : "";

    return (
        <div className="relative aspect-[16/9] min-h-[260px] w-full overflow-hidden rounded-md bg-[#fbfdfb]">
            <svg
                role="img"
                aria-label={`Tracked revenue by ${period === "year" || period === "all-time" ? "month" : "day"}`}
                viewBox={`0 0 ${width} ${height}`}
                className="h-full w-full"
            >
                <defs>
                    <linearGradient id="completedRevenueArea" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#51c28a" stopOpacity="0.28" />
                        <stop offset="100%" stopColor="#51c28a" stopOpacity="0.03" />
                    </linearGradient>
                </defs>
                {scale.ticks.map((tick) => {
                    const y = chartPointY(tick, scale.max, frame.top, plotHeight);
                    return (
                        <g key={`value-tick-${tick}`}>
                            <line x1={frame.left} x2={width - frame.right} y1={y} y2={y} stroke="#dfe8df" strokeWidth="1" />
                            <text x={frame.left - 12} y={y + 4} textAnchor="end" className="fill-charcoal/50 text-[0.68rem] font-black">
                                {hasData || tick === 0 ? formatCompactDashboardCurrency(tick) : ""}
                            </text>
                        </g>
                    );
                })}
                <line x1={frame.left} x2={width - frame.right} y1={baseline} y2={baseline} stroke="#cfdacf" strokeWidth="1.5" />
                {areaPath && <path d={areaPath} fill="url(#completedRevenueArea)" />}
                {linePoints && <polyline points={linePoints} fill="none" stroke="#009e65" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />}
                {points.map((point, index) => (
                    <g key={`revenue-point-${point.key || index}`}>
                        <circle cx={point.x} cy={point.y} r="5.5" fill="#009e65" stroke="#ffffff" strokeWidth="3">
                            <title>{`${point.label}: ${formatDashboardCurrency(point.totalCents)} from ${point.appointmentCount} appointment${point.appointmentCount === 1 ? "" : "s"}`}</title>
                        </circle>
                        {shouldShowRevenueChartLabel(index, chartSeries.length, period) && (
                            <text x={point.x} y={height - 17} textAnchor="middle" className="fill-charcoal/50 text-[0.72rem] font-black">
                                {point.label}
                            </text>
                        )}
                    </g>
                ))}
            </svg>
            {!hasData && <ChartEmptyState title="No tracked revenue yet" detail="Past appointments with service price snapshots will draw this line." />}
        </div>
    );
}

function UpcomingAppointmentsChart({
    series,
}: {
    series: AdminDashboardSnapshot["upcomingAppointments"]["dailySeries"];
}) {
    const chartSeries = series.length > 0 ? series : [{ date: "", confirmedCount: 0, cancelledCount: 0 }];
    const maxDaily = Math.max(0, ...chartSeries.map((point) => point.confirmedCount + point.cancelledCount));
    const hasData = chartSeries.some((point) => point.confirmedCount > 0 || point.cancelledCount > 0);
    const scale = buildDashboardCountScale(maxDaily);
    const width = 680;
    const height = 300;
    const frame = { top: 24, right: 24, bottom: 48, left: 52 };
    const plotWidth = width - frame.left - frame.right;
    const plotHeight = height - frame.top - frame.bottom;
    const baseline = frame.top + plotHeight;
    const groupWidth = plotWidth / Math.max(chartSeries.length, 1);
    const barWidth = Math.min(30, Math.max(10, groupWidth * 0.25));

    return (
        <div className="relative aspect-[16/9] min-h-[260px] w-full overflow-hidden rounded-md bg-[#fbfdfb]">
            <svg role="img" aria-label="Confirmed and cancelled upcoming appointments by day" viewBox={`0 0 ${width} ${height}`} className="h-full w-full">
                {scale.ticks.map((tick) => {
                    const y = chartPointY(tick, scale.max, frame.top, plotHeight);
                    return (
                        <g key={`upcoming-tick-${tick}`}>
                            <line x1={frame.left} x2={width - frame.right} y1={y} y2={y} stroke="#dfe8df" strokeWidth="1" />
                            <text x={frame.left - 12} y={y + 4} textAnchor="end" className="fill-charcoal/50 text-[0.7rem] font-black">
                                {hasData || tick === 0 ? tick : ""}
                            </text>
                        </g>
                    );
                })}
                <line x1={frame.left} x2={width - frame.right} y1={baseline} y2={baseline} stroke="#cfdacf" strokeWidth="1.5" />
                {chartSeries.map((point, index) => {
                    const x = chartPointX(index, chartSeries.length, frame.left, plotWidth);
                    const confirmedY = chartPointY(point.confirmedCount, scale.max, frame.top, plotHeight);
                    const cancelledY = chartPointY(point.cancelledCount, scale.max, frame.top, plotHeight);
                    const confirmedHeight = Math.max(0, baseline - confirmedY);
                    const cancelledHeight = Math.max(0, baseline - cancelledY);

                    return (
                        <g key={`upcoming-bar-${point.date}`}>
                            <rect
                                x={x - barWidth - 3}
                                y={confirmedY}
                                width={barWidth}
                                height={confirmedHeight}
                                rx="4"
                                fill="#009e65"
                                opacity={point.confirmedCount > 0 ? "1" : "0.18"}
                            >
                                <title>{`${formatDashboardSeriesDate(point.date)}: ${point.confirmedCount} confirmed`}</title>
                            </rect>
                            <rect
                                x={x + 3}
                                y={cancelledY}
                                width={barWidth}
                                height={cancelledHeight}
                                rx="4"
                                fill="#cf284e"
                                opacity={point.cancelledCount > 0 ? "1" : "0.18"}
                            >
                                <title>{`${formatDashboardSeriesDate(point.date)}: ${point.cancelledCount} cancelled`}</title>
                            </rect>
                            <text x={x} y={height - 17} textAnchor="middle" className="fill-charcoal/50 text-[0.72rem] font-black">
                                {formatDashboardSeriesDate(point.date)}
                            </text>
                        </g>
                    );
                })}
            </svg>
            {!hasData && <ChartEmptyState title="No upcoming appointment movement" detail="Confirmed and cancelled appointments will appear here as the week fills in." />}
            <div className="absolute right-3 top-3 flex flex-wrap justify-end gap-2 text-xs font-black">
                <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-forest shadow-sm">
                    <span className="size-2 rounded-full bg-[#009e65]" />
                    Confirmed
                </span>
                <span className="inline-flex items-center gap-1 rounded-full bg-white/90 px-2.5 py-1 text-[#a71739] shadow-sm">
                    <span className="size-2 rounded-full bg-[#cf284e]" />
                    Cancelled
                </span>
            </div>
        </div>
    );
}

function ChartEmptyState({ title, detail }: { title: string; detail: string }) {
    return (
        <div className="pointer-events-none absolute inset-x-4 top-1/2 mx-auto max-w-sm -translate-y-1/2 rounded-md border border-dashed border-[#cfdacf] bg-white/88 p-4 text-center shadow-sm">
            <p className="text-base font-black text-forest">{title}</p>
            <p className="mt-1 text-sm font-bold text-charcoal/55">{detail}</p>
        </div>
    );
}

function DashboardActivityPanel({
    todayBookings,
    upcomingBookings,
    activity,
    onOpenBooking,
}: {
    todayBookings: AdminBookingSummary[];
    upcomingBookings: AdminBookingSummary[];
    activity: AdminDashboardActivity[];
    onOpenBooking: (bookingId: string) => void;
}) {
    const cancellationCount = activity.filter((item) => item.eventType === "cancellation_confirmation" || item.appointmentStatus === "cancelled").length;
    const visibleActivity = activity.slice(0, 8);
    const fallbackBookings = [...todayBookings, ...upcomingBookings].slice(0, 8);

    return (
        <section className="rounded-md border border-[#d7e0d7] bg-white shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#d7e0d7] px-5 py-4">
                <div className="flex items-center gap-2">
                    <CalendarDays size={21} className="text-green" />
                    <h2 className="text-2xl font-black text-forest">Appointments activity</h2>
                </div>
                <div className="flex flex-wrap gap-2 text-xs font-black uppercase tracking-[0.08em] text-charcoal/60">
                    <span className="rounded-full bg-[#eef5f1] px-3 py-1.5">{todayBookings.length} today</span>
                    <span className="rounded-full bg-[#eef5f1] px-3 py-1.5">{upcomingBookings.length} next 7 days</span>
                    <span className="rounded-full bg-amber-50 px-3 py-1.5 text-amber-800">{cancellationCount} cancelled</span>
                </div>
            </div>
            <div className="max-h-[620px] divide-y divide-[#e1e8e1] overflow-y-auto">
                {visibleActivity.length > 0 ? (
                    visibleActivity.map((item) => (
                        <DashboardActivityRow key={`dashboard-activity-${item.id}`} item={item} onOpenBooking={onOpenBooking} />
                    ))
                ) : fallbackBookings.length > 0 ? (
                    fallbackBookings.map((booking) => (
                        <DashboardBookingActivityRow key={`dashboard-booking-${booking.id}`} booking={booking} onOpenBooking={onOpenBooking} />
                    ))
                ) : (
                    <p className="p-5 text-base font-bold text-charcoal/55">No appointment activity in this snapshot.</p>
                )}
            </div>
        </section>
    );
}

function DashboardActivityRow({
    item,
    onOpenBooking,
}: {
    item: AdminDashboardActivity;
    onOpenBooking: (bookingId: string) => void;
}) {
    const date = dashboardDateParts(item.appointmentStartTime);

    return (
        <button
            className="grid w-full gap-3 bg-white p-4 text-left transition hover:bg-[#f8fbf8] sm:grid-cols-[4.5rem_1fr_auto]"
            onClick={() => onOpenBooking(item.bookingId)}
        >
            <DashboardDateBadge month={date.month} day={date.day} />
            <span className="min-w-0">
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-2 text-sm font-black uppercase tracking-[0.08em] text-green">
                        <ChannelIcon channel={item.channel} />
                        {activityLabel(item.eventType)}
                    </span>
                    <span className="text-sm font-bold text-charcoal/45">{formatLocalTime(item.appointmentStartTime)}</span>
                </span>
                <span className="mt-1 block truncate text-lg font-black text-forest">{item.customerName}</span>
                <span className="block truncate text-sm font-bold text-charcoal/58">
                    {item.services.join(", ") || "Appointment"} with {item.barberName}
                </span>
            </span>
            <span className="flex flex-wrap items-start gap-2 sm:justify-end">
                <ActivityPill label={formatAdminStatus(item.appointmentStatus)} tone={item.appointmentStatus} />
                <ActivityPill label={activityStatusLabel(item)} tone={item.status} />
            </span>
        </button>
    );
}

function DashboardBookingActivityRow({
    booking,
    onOpenBooking,
}: {
    booking: AdminBookingSummary;
    onOpenBooking: (bookingId: string) => void;
}) {
    const date = dashboardDateParts(booking.startTime);

    return (
        <button
            className="grid w-full gap-3 bg-white p-4 text-left transition hover:bg-[#f8fbf8] sm:grid-cols-[4.5rem_1fr_auto]"
            onClick={() => onOpenBooking(booking.id)}
        >
            <DashboardDateBadge month={date.month} day={date.day} />
            <span className="min-w-0">
                <span className="text-sm font-black uppercase tracking-[0.08em] text-green">{formatLocalTime(booking.startTime)}</span>
                <span className="mt-1 block truncate text-lg font-black text-forest">{booking.customerName}</span>
                <span className="block truncate text-sm font-bold text-charcoal/58">
                    {booking.services.join(", ") || "Appointment"} with {booking.barberName}
                </span>
            </span>
            <span className="flex flex-wrap items-start gap-2 sm:justify-end">
                <ActivityPill label={formatAdminStatus(booking.status)} tone={booking.status} />
                <ActivityPill label={formatBookingSourceLabel(booking.source)} tone="recipient" />
            </span>
        </button>
    );
}

function DashboardDateBadge({ month, day }: { month: string; day: string }) {
    return (
        <span className="flex w-16 shrink-0 flex-col items-center justify-center rounded-md border border-[#e1e8e1] bg-[#fbfdfb] px-2 py-2 text-center">
            <span className="text-[0.65rem] font-black uppercase tracking-[0.1em] text-charcoal/45">{month}</span>
            <span className="text-xl font-black leading-tight text-forest">{day}</span>
        </span>
    );
}

function NotificationHealthPanel({
    health,
    activity,
    upcomingReminders,
    deliveryMode,
    onOpenBooking,
}: {
    health: AdminDashboardSnapshot["notificationHealth"];
    activity: AdminDashboardActivity[];
    upcomingReminders: AdminUpcomingReminderPreview[];
    deliveryMode: AdminDashboardSnapshot["notificationDeliveryMode"];
    onOpenBooking: (bookingId: string) => void;
}) {
    const summary = summarizeNotificationHealth(health);
    const activeFailures = getActiveNotificationFailures(activity);
    const activeFailureIds = new Set(activeFailures.map((item) => item.id));
    const recentRows = [
        ...activeFailures,
        ...activity.filter((item) => !activeFailureIds.has(item.id)).slice(0, Math.max(0, 4 - activeFailures.length)),
    ].slice(0, 4);

    return (
        <section className="rounded-md border border-[#d7e0d7] bg-white shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#d7e0d7] px-5 py-4">
                <div className="flex items-center gap-2">
                    <Bell size={21} className="text-green" />
                    <h2 className="text-2xl font-black text-forest">Notification health</h2>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.1em] ${deliveryModeTone(deliveryMode)}`}>
                    {deliveryMode} mode
                </span>
            </div>
            <div className="space-y-4 p-4 sm:p-5">
                <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
                    <DashboardHealthMeter value={health.deliverySuccessRate} />
                    <div className="min-w-0 space-y-3">
                        <div className="grid gap-2">
                            {summary.map((item) => (
                                <p key={item} className="rounded-md bg-[#fbfdfb] px-3 py-2 text-sm font-black text-charcoal/65">
                                    {item}
                                </p>
                            ))}
                        </div>
                        <NotificationHealthSegments health={health} />
                    </div>
                </div>
                <div className="grid grid-cols-2 gap-2">
                    <DashboardMetricTile label="Sent" value={`${health.sentCount}`} detail="delivered" />
                    <DashboardMetricTile label="Scheduled" value={`${health.scheduledCount}`} detail="pending" />
                    <DashboardMetricTile label="Failed" value={`${health.failedActiveCount}`} detail={`${health.failedHistoricalCount} historical`} />
                    <DashboardMetricTile label="Skipped" value={`${health.skippedCount}`} detail="missing contact" />
                </div>
                <div className="rounded-md border border-[#e1e8e1] bg-[#fbfdfb] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h3 className="text-base font-black text-forest">Reminder scheduler</h3>
                        <span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.1em] ${reminderSchedulerTone(health.reminderScheduler.state)}`}>
                            {reminderSchedulerLabel(health.reminderScheduler.state)}
                        </span>
                    </div>
                    <p className="mt-2 text-sm font-bold text-charcoal/65">{health.reminderScheduler.message}</p>
                    <div className="mt-3 grid gap-2 text-xs font-bold text-charcoal/50 sm:grid-cols-2">
                        <span>Last success: {formatNullableDashboardDateTime(health.reminderScheduler.lastSuccessAt)}</span>
                        <span>Last run: {formatNullableDashboardDateTime(health.reminderScheduler.latestRunAt)}</span>
                    </div>
                    {health.reminderScheduler.errorMessage ? (
                        <p className="mt-2 rounded-md bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
                            {health.reminderScheduler.errorMessage}
                        </p>
                    ) : null}
                </div>
                <div className="rounded-md border border-[#e1e8e1] bg-[#fbfdfb] p-3">
                    <div className="flex items-center justify-between gap-3">
                        <h3 className="text-base font-black text-forest">Reminder queue</h3>
                        <span className="text-sm font-black text-charcoal/45">{upcomingReminders.length} scheduled</span>
                    </div>
                    {upcomingReminders.length === 0 ? (
                        <p className="mt-2 text-sm font-bold text-charcoal/55">No upcoming reminders with customer contact info.</p>
                    ) : (
                        <div className="mt-3 grid gap-2">
                            {upcomingReminders.slice(0, 2).map((item) => (
                                <button
                                    key={`health-reminder-${item.id}`}
                                    className="min-w-0 rounded-md bg-white p-3 text-left transition hover:bg-[#f5fbf6]"
                                    onClick={() => onOpenBooking(item.bookingId)}
                                >
                                    <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-green">
                                        <ChannelIcon channel={item.channel} />
                                        {activityLabel(item.eventType)}
                                    </span>
                                    <span className="mt-1 block truncate text-base font-black text-forest">{item.customerName}</span>
                                    <span className="block truncate text-xs font-bold text-charcoal/50">
                                        {formatLocalDateTime(item.scheduledFor)}
                                    </span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
                <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                        <h3 className="text-base font-black text-forest">Recent delivery</h3>
                        {health.failedActiveCount > 0 ? (
                            <span className="inline-flex items-center gap-1 text-sm font-black text-red-700">
                                <AlertTriangle size={15} />
                                {health.failedActiveCount} active
                            </span>
                        ) : (
                            <span className="inline-flex items-center gap-1 text-sm font-black text-forest">
                                <Check size={15} />
                                Healthy
                            </span>
                        )}
                    </div>
                    {recentRows.length === 0 ? (
                        <p className="rounded-md border border-dashed border-[#d7e0d7] bg-[#f8fbf8] p-4 text-sm font-bold text-charcoal/55">
                            No notification delivery rows in this snapshot.
                        </p>
                    ) : (
                        <div className="grid gap-2">
                            {recentRows.map((item) => (
                                <NotificationActivityCard key={`health-activity-${item.id}`} item={item} onOpenBooking={onOpenBooking} compact />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}

function DashboardHealthMeter({ value }: { value: number }) {
    const bounded = Math.max(0, Math.min(100, value));
    const radius = 34;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference - (bounded / 100) * circumference;

    return (
        <div className="flex items-center justify-center rounded-md border border-[#e1e8e1] bg-[#fbfdfb] p-4">
            <svg viewBox="0 0 88 88" className="size-28" role="img" aria-label={`${bounded}% notification delivery success`}>
                <circle cx="44" cy="44" r={radius} fill="none" stroke="#e4ece4" strokeWidth="9" />
                <circle
                    cx="44"
                    cy="44"
                    r={radius}
                    fill="none"
                    stroke={bounded >= 90 ? "#009e65" : bounded >= 70 ? "#c6912f" : "#cf284e"}
                    strokeLinecap="round"
                    strokeWidth="9"
                    strokeDasharray={circumference}
                    strokeDashoffset={dashOffset}
                    transform="rotate(-90 44 44)"
                />
                <text x="44" y="42" textAnchor="middle" className="fill-forest text-lg font-black">
                    {bounded}%
                </text>
                <text x="44" y="58" textAnchor="middle" className="fill-charcoal/45 text-[0.58rem] font-black uppercase">
                    success
                </text>
            </svg>
        </div>
    );
}

function NotificationHealthSegments({
    health,
}: {
    health: AdminDashboardSnapshot["notificationHealth"];
}) {
    const segments = [
        { label: "Sent", value: health.sentCount, className: "bg-[#009e65]" },
        { label: "Scheduled", value: health.scheduledCount, className: "bg-[#7db9a5]" },
        { label: "Failed", value: health.failedActiveCount, className: "bg-[#cf284e]" },
        { label: "Skipped", value: health.skippedCount, className: "bg-[#d8a23b]" },
    ];
    const total = segments.reduce((sum, item) => sum + item.value, 0);

    if (total === 0) {
        return <div className="h-3 rounded-full bg-[#e4ece4]" aria-label="No notification delivery activity" />;
    }

    return (
        <div className="flex h-3 overflow-hidden rounded-full bg-[#e4ece4]" aria-label="Notification delivery status mix">
            {segments
                .filter((item) => item.value > 0)
                .map((item) => (
                    <span
                        key={item.label}
                        className={item.className}
                        style={{ width: `${Math.max(5, (item.value / total) * 100)}%` }}
                        title={`${item.label}: ${item.value}`}
                    />
                ))}
        </div>
    );
}

function NotificationCenter({
    activity,
    upcomingReminders,
    deliveryMode,
    onOpenBooking,
}: {
    activity: AdminDashboardActivity[];
    upcomingReminders: AdminUpcomingReminderPreview[];
    deliveryMode: AdminDashboardSnapshot["notificationDeliveryMode"];
    onOpenBooking: (bookingId: string) => void;
}) {
    const [filter, setFilter] = useState<NotificationCenterFilter>("all");
    const filteredActivity = activity.filter((item) => notificationFilterMatches(item, filter));
    const activeFailures = getActiveNotificationFailures(activity);

    return (
        <section className="rounded-md border border-[#d7e0d7] bg-white shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#d7e0d7] px-5 py-4">
                <div className="flex items-center gap-2">
                    <Bell size={21} className="text-green" />
                    <h2 className="text-2xl font-black text-forest">Notification Center</h2>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.1em] ${deliveryModeTone(deliveryMode)}`}>
                    {deliveryMode} mode
                </span>
            </div>
            <div className="space-y-4 p-4 sm:p-5">
                <div className="flex gap-2 overflow-x-auto pb-1">
                    {notificationFilters.map((item) => (
                        <button
                            key={item}
                            className={`shrink-0 rounded-full px-3 py-2 text-xs font-black uppercase tracking-[0.08em] transition ${
                                filter === item ? "bg-forest text-white" : "bg-[#eef5f1] text-charcoal/65 hover:bg-mint"
                            }`}
                            onClick={() => setFilter(item)}
                        >
                            {notificationFilterLabel(item)}
                        </button>
                    ))}
                </div>

                <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                        <h3 className="text-lg font-black text-forest">Upcoming reminders</h3>
                        <span className="text-sm font-bold text-charcoal/45">{upcomingReminders.length} scheduled</span>
                    </div>
                    {upcomingReminders.length === 0 ? (
                        <p className="rounded-md border border-dashed border-[#d7e0d7] bg-[#f8fbf8] p-4 text-sm font-bold text-charcoal/55">
                            No upcoming reminders with customer contact info.
                        </p>
                    ) : (
                        <div className="grid gap-2">
                            {upcomingReminders.slice(0, 5).map((item) => (
                                <button
                                    key={item.id}
                                    className="grid gap-2 rounded-md border border-[#e1e8e1] bg-[#fbfdfb] p-3 text-left transition hover:border-green/40 hover:bg-[#f5fbf6] sm:grid-cols-[1fr_auto]"
                                    onClick={() => onOpenBooking(item.bookingId)}
                                >
                                    <span className="min-w-0">
                                        <span className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.08em] text-green">
                                            <ChannelIcon channel={item.channel} />
                                            {activityLabel(item.eventType)}
                                        </span>
                                        <span className="mt-1 block truncate text-lg font-black text-forest">{item.customerName}</span>
                                        <span className="block truncate text-sm font-bold text-charcoal/55">
                                            {formatLocalDateTime(item.scheduledFor)} for {formatLocalDateTime(item.appointmentStartTime)}
                                        </span>
                                    </span>
                                    <ActivityPill label="Scheduled" tone="pending" />
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                        <span className="flex items-center gap-2">
                            {activeFailures.length > 0 ? (
                                <AlertTriangle size={18} className="text-red-600" />
                            ) : (
                                <Check size={18} className="text-green" />
                            )}
                            <h3 className="text-lg font-black text-forest">Delivery issues</h3>
                        </span>
                        <span className="text-sm font-bold text-charcoal/45">{activeFailures.length} active</span>
                    </div>
                    {activeFailures.length === 0 ? (
                        <p className="rounded-md border border-dashed border-[#d7e0d7] bg-[#f8fbf8] p-4 text-sm font-bold text-charcoal/55">
                            No active delivery issues.
                        </p>
                    ) : (
                        <div className="grid gap-2">
                            {activeFailures.map((item) => (
                                <NotificationActivityCard key={`active-failure-${item.id}`} item={item} onOpenBooking={onOpenBooking} compact />
                            ))}
                        </div>
                    )}
                </div>

                <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                        <h3 className="text-lg font-black text-forest">Recent delivery</h3>
                        <span className="text-sm font-bold text-charcoal/45">{filteredActivity.length} shown</span>
                    </div>
                    {filteredActivity.length === 0 ? (
                        <p className="rounded-md border border-dashed border-[#d7e0d7] bg-[#f8fbf8] p-4 text-sm font-bold text-charcoal/55">
                            No notifications match this filter.
                        </p>
                    ) : (
                        <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                            {filteredActivity.map((item) => (
                                <NotificationActivityCard key={item.id} item={item} onOpenBooking={onOpenBooking} />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}

function NotificationActivityCard({
    item,
    onOpenBooking,
    compact = false,
}: {
    item: AdminDashboardActivity;
    onOpenBooking: (bookingId: string) => void;
    compact?: boolean;
}) {
    const providerDetail = compactNotificationFailureMessage(item.errorMessage, item.failureSummary);

    return (
        <button
            className="grid w-full gap-3 rounded-md border border-[#e1e8e1] bg-white p-3 text-left transition hover:border-green/35 hover:bg-[#f8fbf8] sm:grid-cols-[1fr_auto]"
            onClick={() => onOpenBooking(item.bookingId)}
        >
            <span className="min-w-0">
                <span className="flex items-center gap-2 text-sm font-black uppercase tracking-[0.08em] text-green">
                    <ChannelIcon channel={item.channel} />
                    {activityLabel(item.eventType)}
                </span>
                <span className="mt-1 block truncate text-lg font-black text-forest">{item.customerName}</span>
                {!compact && (
                    <span className="block truncate text-sm font-bold text-charcoal/62">
                        {item.services.join(", ") || "Appointment"} with {item.barberName}
                    </span>
                )}
                <span className="mt-1 block truncate text-sm font-bold text-charcoal/50">
                    {formatLocalDateTime(item.appointmentStartTime)} - {item.locationName}
                </span>
                {(item.provider || providerDetail) && (
                    <span className="mt-2 block text-xs font-bold text-charcoal/50">
                        {item.provider ? `Provider: ${item.provider}` : "Provider pending"}
                        {item.providerMessageId ? ` | ${item.providerMessageId}` : ""}
                        {providerDetail ? ` | ${providerDetail}` : ""}
                    </span>
                )}
            </span>
            <span className="flex flex-wrap items-start gap-2 sm:justify-end">
                <ActivityPill label={channelLabel(item.channel)} tone={item.channel} />
                <ActivityPill label={activityStatusLabel(item)} tone={item.status} />
                {item.status === "failed" && !item.isActiveFailure && <ActivityPill label="Historical" tone="historical" />}
                <ActivityPill label={item.recipientLabel} tone="recipient" />
                {item.attemptCount > 1 && <ActivityPill label={`${item.attemptCount} tries`} tone="failed" />}
            </span>
        </button>
    );
}

function ActivityPill({ label, tone }: { label: string; tone: string }) {
    const classes =
        tone === "failed"
            ? "bg-red-100 text-red-800"
            : tone === "historical"
              ? "bg-[#eef5f1] text-charcoal/55"
            : tone === "skipped" || tone === "cancelled" || tone === "no_show"
              ? "bg-amber-100 text-amber-800"
              : tone === "sms"
                ? "bg-blue-100 text-blue-800"
                : tone === "email"
                  ? "bg-violet-100 text-violet-800"
              : tone === "sent" || tone === "confirmed"
                ? "bg-green/20 text-forest"
                : "bg-[#eef5f1] text-charcoal/65";

    return <span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.08em] ${classes}`}>{label}</span>;
}

function DayCalendarBoard({
    bookings,
    schedule,
    user,
    selectedDate,
    locationId,
    barberItems,
    loading,
    draggingBookingId,
    pendingDragId,
    appointmentPreview,
    onOpen,
    onSlot,
    onDragStart,
    onDragEnd,
    onDropBooking,
    onEditShift,
}: {
    bookings: AdminBookingSummary[];
    schedule: AdminSchedule | null;
    user: SafeAdminUser;
    selectedDate: string;
    locationId: string;
    barberItems: ScheduledCalendarBarber[];
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
    onEditShift: (barberId: string) => void;
}) {
    const window = businessWindowForDate(selectedDate);
    const boardRows = buildCalendarBoardRows(window.start, window.end, 15);
    const slots = boardRows.bookableSlots;
    const barbers = barberItems.map((item) => item.barber);
    const boardScrollRef = useRef<HTMLDivElement>(null);
    const barberColumnMin = barbers.length >= 3 ? 160 : barbers.length === 2 ? 210 : 240;
    const boardMinWidth = 66 + Math.max(barbers.length, 1) * barberColumnMin;
    const gridTemplateColumns = `${TIME_GUTTER_WIDTH} repeat(${Math.max(barbers.length, 1)}, minmax(${barberColumnMin}px, 1fr))`;
    const headerAvatarSize = barbers.length === 1 ? "lg" : barbers.length >= 3 ? "sm" : "md";
    const boardHeight = slots.length * SLOT_HEIGHT;
    const offScheduleBookings = barberItems.flatMap((item) => item.offScheduleBookings);
    const currentLineStyle = selectedDate === todayLocalDate() ? currentTimeLineStyle(window) : null;
    const boardContextKey = `${selectedDate}:${locationId}:${window.start}-${window.end}:${barbers.map((barber) => barber.id).join(",")}`;
    const boardReady = Boolean(schedule && !loading && barbers.length > 0);

    useEffect(() => {
        const scroll = boardScrollRef.current;

        if (!scroll || !boardReady) return;

        const frame = globalThis.requestAnimationFrame(() => {
            scroll.scrollTop = getCalendarInitialScrollTop({
                dayStartTime: window.start,
                targetTime: "09:00",
                slotHeightPx: SLOT_HEIGHT,
            });
            scroll.scrollLeft = 0;
        });

        return () => globalThis.cancelAnimationFrame(frame);
    }, [boardContextKey, boardReady, window.start]);

    if (!schedule || loading) {
        return (
            <section className="flex min-h-[360px] items-center justify-center rounded-md border border-[#d6ded6] bg-white text-base font-bold text-charcoal/60 sm:min-h-[520px] sm:text-xl">
                <RefreshCw size={24} className="mr-3 animate-spin" />
                Loading calendar
            </section>
        );
    }

    if (barbers.length === 0) {
        return (
            <section className="flex min-h-[320px] flex-col items-center justify-center rounded-md border border-[#d6ded6] bg-white p-5 text-center shadow-sm sm:min-h-[520px] sm:p-8">
                <CalendarDays size={34} className="text-green" />
                <p className="mt-4 text-xl font-black text-forest sm:text-2xl">No active team members at this location.</p>
                <p className="mt-2 max-w-lg text-base font-bold text-charcoal/55">
                    Use the location controls above to check another day board.
                </p>
            </section>
        );
    }

    return (
        <section data-admin-calendar-board className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-md border border-[#d4ddd4] bg-white shadow-sm">
            <div className="shrink-0 flex flex-wrap items-center justify-between gap-2 border-b border-[#cfdacf] px-3 py-2 sm:gap-3 sm:px-6 sm:py-4">
                <div className="flex items-center gap-2 text-lg font-black text-forest sm:gap-3 sm:text-2xl">
                    <CalendarDays className="size-5 sm:size-7" />
                    Day board
                    <span className="rounded-full bg-[#eef5f1] px-2 py-1 text-xs text-charcoal/65 sm:px-3 sm:py-1.5 sm:text-sm">
                        {barbers.length} {barbers.length === 1 ? "staff" : "columns"}
                    </span>
                </div>
                <CalendarLegend />
            </div>
            {offScheduleBookings.length > 0 && (
                <div className="shrink-0 border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900 sm:px-6">
                    {offScheduleBookings.length} booking{offScheduleBookings.length === 1 ? "" : "s"} sit outside scheduled working hours and are flagged on the board.
                </div>
            )}
            <div
                ref={boardScrollRef}
                data-admin-calendar-board-scroll
                className="min-h-0 flex-1 overflow-auto overscroll-contain bg-[#fbfdfb] pb-[calc(1rem+env(safe-area-inset-bottom))] sm:pb-6"
            >
                <div style={{ minWidth: `max(100%, ${boardMinWidth}px)` }}>
                    <div className="sticky top-0 z-10 grid border-b border-[#c5d0c5] bg-white" style={{ gridTemplateColumns }}>
                        <div className="sticky left-0 z-20 border-r border-[#d2dcd2] bg-white px-2 py-2 text-[0.68rem] font-black uppercase tracking-[0.12em] text-charcoal/55 sm:px-4 sm:py-4 sm:text-sm 2xl:px-5">Time</div>
                        {barberItems.map((item) => {
                            const canEditShift = user.role !== "barber" || user.barberId === item.barber.id;

                            return (
                                <div key={item.barber.id} className="flex min-w-0 items-center gap-2 border-r border-[#d2dcd2] px-2 py-2 last:border-r-0 sm:gap-3 sm:px-4 sm:py-3 2xl:gap-4 2xl:px-5">
                                    <BarberAvatar barber={item.barber} size={headerAvatarSize} />
                                    <span className="min-w-0 flex-1">
                                        <span className="block truncate text-sm font-black text-forest sm:text-lg 2xl:text-xl">{item.barber.displayName}</span>
                                        <span className="block truncate text-[0.64rem] font-black uppercase tracking-[0.06em] text-charcoal/45 sm:text-xs sm:tracking-[0.08em]">
                                            {item.workingWindows.map((range) => `${formatClockLabel(range.startTime)}-${formatClockLabel(range.endTime)}`).join(", ") || "Off schedule"}
                                        </span>
                                    </span>
                                    {canEditShift && (
                                        <details className="group/details relative shrink-0 [&_summary::-webkit-details-marker]:hidden">
                                            <summary className="flex size-9 cursor-pointer list-none items-center justify-center rounded-md border border-[#d6ded6] bg-white text-forest shadow-sm transition hover:bg-[#f4f8f4]" title="Shift options">
                                                <SlidersHorizontal size={16} />
                                            </summary>
                                            <div className="absolute right-0 top-11 z-30 min-w-40 rounded-md border border-[#d6ded6] bg-white p-1 shadow-lg">
                                                <button
                                                    type="button"
                                                    className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm font-black text-forest hover:bg-[#eef5f1]"
                                                    onClick={() => onEditShift(item.barber.id)}
                                                >
                                                    <Clock size={15} />
                                                    Edit shift
                                                </button>
                                            </div>
                                        </details>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <div className="grid" style={{ gridTemplateColumns }}>
                        <div className="sticky left-0 z-[5] border-r border-[#c5d0c5] bg-white" style={{ height: boardHeight }}>
                            {slots.map((slot) => (
                                <div
                                    key={`time-${slot}`}
                                    className={`absolute left-0 right-0 px-1.5 pr-2 text-right text-xs font-black sm:px-2 sm:pr-3 sm:text-sm ${
                                        slot.endsWith(":00") ? "text-charcoal/70" : "text-charcoal/35"
                                    }`}
                                    style={{ top: timeTopFromClock(slot, window.start), height: SLOT_HEIGHT }}
                                >
                                    {slot.endsWith(":00") ? formatClockLabel(slot) : ""}
                                </div>
                            ))}
                        </div>
                        {barberItems.map((item) => {
                            const barberBookings = layoutCalendarBookings(
                                bookingsForBarberDay(bookings, selectedDate, locationId, item.barber.id),
                                window.start,
                                window.end,
                            );
                            const unavailableRanges = buildCalendarUnavailableRanges(item.workingWindows, {
                                startTime: window.start,
                                endTime: window.end,
                            });
                            const blockedOverlays = blockedTimeOverlaysForBarber(schedule.blockedTimes, {
                                barberId: item.barber.id,
                                locationId,
                                selectedDate,
                                businessWindow: window,
                            });

                            return (
                                <div
                                    key={item.barber.id}
                                    className="relative border-r border-[#d4ddd4] bg-white last:border-r-0"
                                    style={{ height: boardHeight }}
                                >
                                    {slots.map((slot) => {
                                        const startTime = localDateTimeToIso(selectedDate, slot);
                                        const slotEnd = addMinutesToIso(startTime, 30);
                                        const blocked = blockedTimesOverlapRange(schedule.blockedTimes, {
                                            barberId: item.barber.id,
                                            locationId,
                                            startTime,
                                            endTime: slotEnd,
                                        });
                                        const canCreateHere = !blocked;

                                        return (
                                            <button
                                                key={`${item.barber.id}-${slot}`}
                                                className={`group absolute left-0 right-0 z-[4] border-b ${calendarRowLineClasses(slot)} outline-none transition ${
                                                    canCreateHere ? "hover:bg-[#dff6e7]/55 focus:bg-[#dff6e7]/70" : "cursor-not-allowed"
                                                } ${
                                                    draggingBookingId && canCreateHere ? "hover:ring-2 hover:ring-inset hover:ring-green/45" : ""
                                                }`}
                                                style={{ top: timeTopFromClock(slot, window.start), height: SLOT_HEIGHT }}
                                                aria-disabled={!canCreateHere}
                                                onClick={() => {
                                                    if (canCreateHere) onSlot(item.barber.id, startTime);
                                                }}
                                                onDragOver={(event) => {
                                                    if (draggingBookingId && canCreateHere) event.preventDefault();
                                                }}
                                                onDrop={(event) => {
                                                    event.preventDefault();
                                                    if (!canCreateHere) return;
                                                    const bookingId = event.dataTransfer.getData("text/plain") || draggingBookingId;
                                                    const booking = bookings.find((candidate) => candidate.id === bookingId);
                                                    if (booking) void onDropBooking(booking, item.barber.id, locationId, startTime);
                                                }}
                                                title={
                                                    canCreateHere
                                                        ? `Create staff appointment ${formatLocalTime(startTime)}-${formatLocalTime(slotEnd)}`
                                                        : `Blocked ${formatLocalTime(startTime)}-${formatLocalTime(slotEnd)}`
                                                }
                                            >
                                                <span className="pointer-events-none absolute inset-x-1 top-0.5 z-[7] hidden rounded border border-green/30 bg-mint/80 px-1.5 py-0.5 text-[11px] font-black leading-none text-forest opacity-0 shadow-sm transition group-hover:opacity-100 md:block">
                                                    {formatLocalTime(startTime)} - {formatLocalTime(slotEnd)}
                                                </span>
                                            </button>
                                        );
                                    })}
                                    {unavailableRanges.map((range) => (
                                        <div
                                            key={`${item.barber.id}-off-${range.startTime}-${range.endTime}`}
                                            className="pointer-events-none absolute inset-x-0 z-[1] border-y border-[#c7cec7]/90 opacity-100"
                                            style={{
                                                ...rangeStyleFromClock(range.startTime, range.endTime, window.start, window.end),
                                                backgroundColor: "rgba(235, 238, 235, 0.94)",
                                                backgroundImage:
                                                    "repeating-linear-gradient(135deg, rgba(78, 89, 80, 0.18) 0 7px, rgba(255, 255, 255, 0.65) 7px 14px)",
                                            }}
                                        />
                                    ))}
                                    {blockedOverlays.map((block) => (
                                        <div
                                            key={block.id}
                                            className="pointer-events-none absolute inset-x-2 z-[3] rounded-md border border-[#a8aaa8] bg-[#e2e4e2]/95 px-3 py-2 text-sm font-black text-charcoal/70 shadow-sm"
                                            style={block.style}
                                        >
                                            {block.reason || "Blocked"}
                                        </div>
                                    ))}
                                    {appointmentPreview?.barberId === item.barber.id && appointmentPreview.locationId === locationId && (
                                        <div
                                            className="pointer-events-none absolute inset-x-2 z-[5] rounded-md border border-[#6d5dfc]/45 bg-[#ece9ff]/90 px-3 py-2 text-sm font-black text-[#4d3cff]"
                                            style={rangeStyleFromIso(appointmentPreview.startTime, appointmentPreview.endTime, window.start, window.end)}
                                        >
                                            {formatLocalTime(appointmentPreview.startTime)} - {formatLocalTime(appointmentPreview.endTime)}
                                        </div>
                                    )}
                                    {currentLineStyle && (
                                        <div className="pointer-events-none absolute left-0 right-0 z-[5] h-0.5 bg-red-500" style={currentLineStyle} />
                                    )}
                                    {barberBookings.map(({ booking, style }) => (
                                        <BookingCard
                                            key={booking.id}
                                            booking={booking}
                                            user={user}
                                            pending={pendingDragId === booking.id}
                                            offSchedule={bookingFallsOutsideWorkingWindows(booking, item.workingWindows)}
                                            style={style}
                                            onOpen={onOpen}
                                            onDragStart={onDragStart}
                                            onDragEnd={onDragEnd}
                                        />
                                    ))}
                                </div>
                            );
                        })}
                    </div>
                    <div className="grid border-t-2 border-[#9fb29f] bg-[#f7faf7]" style={{ gridTemplateColumns, minHeight: 52 }}>
                        <div className="sticky left-0 z-[5] border-r border-[#c5d0c5] bg-[#f7faf7] px-2 py-3 text-right text-sm font-black text-forest 2xl:px-5 2xl:text-lg">
                            {formatClockLabel(boardRows.closeBoundary)}
                        </div>
                        {barberItems.map((item) => (
                            <div
                                key={`${item.barber.id}-${boardRows.closeBoundary}-close`}
                                className="border-r border-[#d8e1d8] px-2 py-3 text-xs font-black uppercase tracking-[0.12em] text-charcoal/45 last:border-r-0 sm:px-3 sm:py-4 sm:text-sm"
                                aria-label={`Closed after ${formatClockLabel(boardRows.closeBoundary)} for ${item.barber.displayName}`}
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
    offSchedule = false,
    style,
    onOpen,
    onDragStart,
    onDragEnd,
}: {
    booking: AdminBookingSummary;
    user: SafeAdminUser;
    pending: boolean;
    offSchedule?: boolean;
    style?: CSSProperties;
    onOpen: (bookingId: string) => void;
    onDragStart: (bookingId: string) => void;
    onDragEnd: () => void;
}) {
    const tone = getBookingCardTone(booking);
    const draggable = booking.status === "confirmed" && (user.role !== "barber" || booking.barberId === user.barberId);
    const height = Math.max(22, Math.ceil(booking.totalDurationMinutes / 15) * SLOT_HEIGHT - 2);
    const compact = height < 34;

    return (
        <button
            className={`absolute z-[6] overflow-hidden rounded-md border-l-[3px] px-2 py-1 text-left text-[11px] leading-tight shadow-sm transition hover:z-[7] hover:shadow-md ${bookingToneClasses(tone)} ${
                pending ? "opacity-60" : ""
            } ${offSchedule ? "ring-2 ring-amber-400" : ""}`}
            style={{
                minHeight: height,
                ...style,
            }}
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
            <span className="block truncate font-black leading-[14px]">
                {formatLocalTime(booking.startTime)} {booking.customerName}
            </span>
            {!compact && (
                <>
                    <span className="block truncate text-[10px] opacity-75">{booking.services.join(", ")}</span>
                    <span className="mt-0.5 inline-flex rounded-full bg-white/65 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.06em]">
                        {booking.source === "walk_in" ? "Walk-in" : formatAdminStatus(booking.status)}
                    </span>
                    {offSchedule && (
                        <span className="ml-1 mt-0.5 inline-flex rounded-full bg-amber-100 px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.06em] text-amber-900">
                            Outside hours
                        </span>
                    )}
                </>
            )}
            {compact && offSchedule && (
                <span className="sr-only">Outside hours</span>
            )}
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
    const [showEdit, setShowEdit] = useState(false);
    const [showReschedule, setShowReschedule] = useState(false);
    const canMutate = booking.status === "confirmed";
    const canNoShow = canMutate && new Date(booking.startTime).getTime() <= Date.now();
    const canComplete = canMutate && new Date(booking.startTime).getTime() <= Date.now();
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

    async function handleComplete() {
        setError("");

        try {
            await completeAdminBooking(booking.id);
            await refreshDetail();
            await onChanged("Booking completed.");
        } catch (error) {
            setError(error instanceof Error ? error.message : "Completion failed.");
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
                <div className="grid gap-2 sm:grid-cols-5">
                    <button className="icon-text-button justify-center" onClick={() => setShowEdit((value) => !value)}>
                        <ClipboardList size={16} />
                        Edit
                    </button>
                    <button className="icon-text-button justify-center" onClick={() => setShowReschedule((value) => !value)}>
                        <Clock size={16} />
                        Reschedule
                    </button>
                    <button className="danger-button justify-center" onClick={handleCancel}>
                        <X size={16} />
                        Cancel
                    </button>
                    <button className="icon-text-button justify-center" onClick={handleComplete} disabled={!canComplete} title={canComplete ? "Mark completed" : "Complete is only for current or past bookings"}>
                        <Check size={16} />
                        Complete
                    </button>
                    <button className="danger-button justify-center" onClick={handleNoShow} disabled={!canNoShow} title={canNoShow ? "Mark no-show" : "No-show is only for current or past bookings"}>
                        <Ban size={16} />
                        No-show
                    </button>
                </div>
            )}
            {showEdit && options && (
                <BookingEditForm
                    booking={booking}
                    options={options}
                    user={user}
                    onDone={async () => {
                        setShowEdit(false);
                        await refreshDetail();
                        await onChanged("Booking updated.");
                    }}
                />
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

function BookingEditForm({
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
    const initialParts = localPartsFromIso(booking.startTime);
    const [locationId, setLocationId] = useState(booking.locationId);
    const [barberId, setBarberId] = useState(booking.barberId);
    const [serviceIds, setServiceIds] = useState<string[]>(booking.serviceIds);
    const [date, setDate] = useState(initialParts.date);
    const [time, setTime] = useState(initialParts.time);
    const [customerName, setCustomerName] = useState(booking.customerName);
    const [phone, setPhone] = useState(booking.customerPhone ?? "");
    const [email, setEmail] = useState(booking.customerEmail ?? "");
    const [customerNotes, setCustomerNotes] = useState(booking.customerNotes ?? "");
    const [internalNotes, setInternalNotes] = useState(booking.internalNotes ?? "");
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const selectableBarbers = getVisibleBarbers(options, user, locationId);
    const selectedServices = options.services.filter((service) => serviceIds.includes(service.id));
    const totalDurationMinutes = selectedServices.reduce((total, service) => total + service.durationMinutes, 0);
    const startTime = localDateTimeToIso(date, time);
    const endTime = addMinutesToIso(startTime, totalDurationMinutes || booking.totalDurationMinutes);
    const canSubmit = Boolean(locationId && barberId && serviceIds.length > 0 && customerName.trim());

    useEffect(() => {
        if (user.role === "barber" && user.barberId) {
            setBarberId(user.barberId);
            return;
        }

        if (!selectableBarbers.some((barber) => barber.id === barberId)) {
            setBarberId(selectableBarbers[0]?.id ?? "");
        }
    }, [barberId, selectableBarbers, user]);

    async function submit(event: FormEvent) {
        event.preventDefault();
        if (!canSubmit) {
            setError("Choose a barber, service, date, time, and customer name first.");
            return;
        }

        setSubmitting(true);
        setError("");

        try {
            await editAdminBooking(booking.id, {
                locationId,
                barberId,
                startTime,
                serviceIds,
                customer: {
                    name: customerName,
                    phone,
                    email,
                    notes: customerNotes,
                },
                internalNotes,
            });
            await onDone();
        } catch (error) {
            setError(error instanceof Error ? error.message : "Booking update failed.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <form onSubmit={submit} className="space-y-4 rounded-md border border-forest/10 bg-[#f8fbf8] p-4">
            {error && <Notice tone="error" message={error} onClear={() => setError("")} />}
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(12rem,1fr))]">
                <SummaryMetric label="Duration" value={`${totalDurationMinutes || booking.totalDurationMinutes} min`} />
                <SummaryMetric label="Price" value={formatServiceSelectionPrice(selectedServices)} />
                <SummaryMetric label="Time" value={`${formatLocalTime(startTime)} - ${formatLocalTime(endTime)}`} />
            </div>
            <Field label="Customer name">
                <input className="input" value={customerName} onChange={(event) => setCustomerName(event.target.value)} required />
            </Field>
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(13rem,1fr))]">
                <Field label="Phone">
                    <input className="input" value={phone} onChange={(event) => setPhone(event.target.value)} />
                </Field>
                <Field label="Email">
                    <input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
                </Field>
                <Field label="Location">
                    <LocationSelect value={locationId} options={options.locations} onChange={setLocationId} />
                </Field>
                <Field label="Barber">
                    <BarberSelect value={barberId} options={selectableBarbers} user={user} onChange={setBarberId} />
                </Field>
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
            <div className="grid gap-3 md:grid-cols-2">
                <Field label="Customer notes">
                    <textarea className="input min-h-20" value={customerNotes} onChange={(event) => setCustomerNotes(event.target.value)} />
                </Field>
                <Field label="Internal notes">
                    <textarea className="input min-h-20" value={internalNotes} onChange={(event) => setInternalNotes(event.target.value)} />
                </Field>
            </div>
            <button className="primary-button" type="submit" disabled={submitting || !canSubmit}>
                {submitting ? "Saving" : "Save changes"}
            </button>
        </form>
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
    const previewStartTime = requestedStartTime;
    const previewEndTime = addMinutesToIso(previewStartTime, totalDurationMinutes || 30);
    const canSubmit = Boolean(locationId && barberId && serviceIds.length > 0 && customerName.trim());

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
        if (!canSubmit) {
            setError("Choose a barber, service, date, time, and customer name first.");
            return;
        }

        setSubmitting(true);
        setError("");

        try {
            const payload = {
                locationId,
                barberId,
                serviceIds,
                startTime: requestedStartTime,
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
        <aside data-admin-add-drawer className="fixed inset-0 z-50 flex h-dvh max-h-dvh w-full min-w-0 flex-col overflow-hidden bg-white shadow-2xl xl:static xl:inset-auto xl:z-auto xl:h-[100dvh] xl:max-w-none xl:border-l xl:border-[#cfdacf] xl:shadow-none">
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[#cfdacf] px-4 py-3 sm:px-7 sm:py-6 xl:px-5 xl:py-4 2xl:px-6 2xl:py-5">
                <div>
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-charcoal/50 sm:text-sm">Staff create</p>
                    <h2 className="text-2xl font-black text-forest sm:text-4xl xl:text-3xl 2xl:text-4xl">Add appointment</h2>
                </div>
                <button className="icon-button !min-h-10 !w-10 sm:!min-h-14 sm:!w-14" onClick={onClose} title="Close appointment drawer">
                    <X size={24} />
                </button>
            </div>
            <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
                <div data-admin-add-drawer-body className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:space-y-5 sm:px-7 sm:py-6 sm:pb-8 xl:px-5 xl:py-5 2xl:px-6">
                    {error && <Notice tone="error" message={error} onClear={() => setError("")} />}
                    <div className="rounded-md border border-[#cddbcc] bg-[#f8fbf8] p-3 sm:p-4">
                        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(12rem,1fr))]">
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
                    <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(13rem,1fr))]">
                        <Field label="Location">
                            <LocationSelect value={locationId} options={options.locations} onChange={setLocationId} />
                        </Field>
                        <Field label="Barber">
                            <BarberSelect value={barberId} options={selectableBarbers} user={user} onChange={setBarberId} />
                        </Field>
                        {selectedBarber && (
                            <div className="[grid-column:1/-1]">
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
                                This time is not available online, but staff can book it if it is not blocked and does not overlap another appointment.
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
                    <div className="rounded-md border border-[#d8e1d8] bg-[#f8fbf8] p-4">
                        <p className="mb-3 text-sm font-bold text-charcoal/55">Add a phone or email to send confirmation and reminders.</p>
                        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(13rem,1fr))]">
                            <Field label="Phone optional">
                                <input className="input" value={phone} onChange={(event) => setPhone(event.target.value)} />
                            </Field>
                            <Field label="Email optional">
                                <input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} />
                            </Field>
                        </div>
                    </div>
                    <Field label="Internal notes">
                        <textarea className="input min-h-20" value={internalNotes} onChange={(event) => setInternalNotes(event.target.value)} />
                    </Field>
                </div>
                <div data-admin-add-drawer-footer className="shrink-0 border-t border-[#d4ddd4] bg-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-12px_24px_rgba(16,56,38,0.08)] sm:px-7 sm:py-5">
                    <button className="primary-button w-full" type="submit" disabled={submitting || !canSubmit}>
                        {submitting ? "Creating" : bookingSource === "walk_in" ? "Create walk-in" : "Create appointment"}
                    </button>
                </div>
            </form>
        </aside>
    );
}

function EditShiftDrawer({
    options,
    schedule,
    user,
    barberId,
    locationId,
    date,
    onClose,
    onSaved,
}: {
    options: AdminCalendarOptions;
    schedule: AdminSchedule;
    user: SafeAdminUser;
    barberId: string;
    locationId: string;
    date: string;
    onClose: () => void;
    onSaved: () => Promise<void>;
}) {
    const initialWindows = useMemo(() => {
        const item = getScheduledCalendarBarbers({
            options,
            schedule,
            user,
            selectedDate: date,
            locationId,
            requestedBarberId: barberId,
            bookings: [],
            businessStartTime: "00:00",
            businessEndTime: "24:00",
        })[0];

        return item?.workingWindows.map((window) => ({ startTime: window.startTime, endTime: window.endTime })) ?? [];
    }, [barberId, date, locationId, options, schedule, user]);
    const [windows, setWindows] = useState<Array<{ startTime: string; endTime: string }>>(initialWindows);
    const [error, setError] = useState("");
    const [submitting, setSubmitting] = useState(false);
    const barber = options.barbers.find((candidate) => candidate.id === barberId);
    const location = options.locations.find((candidate) => candidate.id === locationId);
    const canEdit = user.role !== "barber" || user.barberId === barberId;
    const totalMinutes = windows.reduce((total, window) => total + Math.max(0, clockToMinutes(window.endTime) - clockToMinutes(window.startTime)), 0);

    function updateWindow(index: number, field: "startTime" | "endTime", value: string) {
        setWindows((current) =>
            current.map((window, candidateIndex) =>
                candidateIndex === index
                    ? {
                        ...window,
                        [field]: value,
                    }
                    : window,
            ),
        );
    }

    async function submit(event: FormEvent) {
        event.preventDefault();
        if (!canEdit) {
            setError("You can only edit your own shift.");
            return;
        }

        setSubmitting(true);
        setError("");

        try {
            await replaceAdminDayShift({ barberId, locationId, date, windows });
            await onSaved();
        } catch (error) {
            setError(error instanceof Error ? error.message : "Shift update failed.");
        } finally {
            setSubmitting(false);
        }
    }

    return (
        <aside className="fixed inset-0 z-50 flex h-dvh max-h-dvh w-full min-w-0 flex-col overflow-hidden bg-white shadow-2xl xl:static xl:inset-auto xl:z-auto xl:h-[100dvh] xl:max-w-none xl:border-l xl:border-[#cfdacf] xl:shadow-none">
            <div className="flex shrink-0 items-start justify-between gap-4 border-b border-[#cfdacf] px-4 py-3 sm:px-7 sm:py-6 xl:px-5 xl:py-4 2xl:px-6 2xl:py-5">
                <div className="min-w-0">
                    <p className="text-xs font-bold uppercase tracking-[0.14em] text-charcoal/50 sm:text-sm">One-day shift</p>
                    <h2 className="truncate text-2xl font-black text-forest sm:text-4xl xl:text-3xl 2xl:text-4xl">Edit shift</h2>
                    <p className="mt-1 truncate text-sm font-bold text-charcoal/55">
                        {barber?.displayName ?? "Barber"} - {location?.name ?? "Location"} - {date}
                    </p>
                </div>
                <button className="icon-button !min-h-10 !w-10 sm:!min-h-14 sm:!w-14" onClick={onClose} title="Close shift drawer">
                    <X size={24} />
                </button>
            </div>
            <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4 pb-[calc(1rem+env(safe-area-inset-bottom))] sm:px-7 sm:py-6 xl:px-5 xl:py-5 2xl:px-6">
                    {error && <Notice tone="error" message={error} onClear={() => setError("")} />}
                    <div className="rounded-md border border-[#cddbcc] bg-[#f8fbf8] p-3 sm:p-4">
                        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(12rem,1fr))]">
                            <SummaryMetric label="Windows" value={`${windows.length}`} />
                            <SummaryMetric label="Shift duration" value={`${Math.floor(totalMinutes / 60)} hr ${totalMinutes % 60} min`} />
                        </div>
                    </div>
                    <div className="space-y-3">
                        {windows.map((window, index) => (
                            <div key={index} className="grid items-end gap-3 rounded-md border border-[#d8e1d8] bg-[#f8fbf8] p-3 [grid-template-columns:1fr_1fr_auto]">
                                <Field label="Start time">
                                    <input
                                        className="input"
                                        type="time"
                                        step={900}
                                        value={window.startTime}
                                        onChange={(event) => updateWindow(index, "startTime", event.target.value)}
                                        required
                                    />
                                </Field>
                                <Field label="End time">
                                    <input
                                        className="input"
                                        type="time"
                                        step={900}
                                        value={window.endTime}
                                        onChange={(event) => updateWindow(index, "endTime", event.target.value)}
                                        required
                                    />
                                </Field>
                                <button
                                    type="button"
                                    className="icon-button mb-0.5 !min-h-12 !w-12"
                                    onClick={() => setWindows((current) => current.filter((_, candidateIndex) => candidateIndex !== index))}
                                    title="Remove shift window"
                                >
                                    <X size={18} />
                                </button>
                            </div>
                        ))}
                        {windows.length === 0 && (
                            <p className="rounded-md border border-dashed border-[#c8d6c8] bg-[#f8fbf8] p-4 text-sm font-bold text-charcoal/55">
                                No shift windows for this day.
                            </p>
                        )}
                    </div>
                    <div className="flex flex-wrap gap-2">
                        <button
                            type="button"
                            className="icon-text-button"
                            onClick={() => setWindows((current) => [...current, { startTime: "10:00", endTime: "19:00" }])}
                        >
                            <CalendarPlus size={16} />
                            Add shift
                        </button>
                        <button type="button" className="text-button px-3 py-2" onClick={() => setWindows([])}>
                            Clear day
                        </button>
                    </div>
                </div>
                <div className="shrink-0 border-t border-[#d4ddd4] bg-white px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-12px_24px_rgba(16,56,38,0.08)] sm:px-7 sm:py-5">
                    <button className="primary-button w-full" type="submit" disabled={submitting || !canEdit}>
                        {submitting ? "Saving" : "Save shift"}
                    </button>
                </div>
            </form>
        </aside>
    );
}

function SummaryMetric({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-md bg-white px-3 py-3 sm:px-4">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-charcoal/45">{label}</p>
            <p className="break-words text-lg font-black leading-tight text-forest sm:text-xl">{value}</p>
        </div>
    );
}

function CalendarGrid({
    days,
    bookingsByDate,
    view,
    onOpen,
    onDayOpen,
}: {
    days: ReturnType<typeof buildWeekDays>;
    bookingsByDate: Record<string, AdminBookingSummary[]>;
    view: Exclude<AdminView, "day" | "list">;
    onOpen: (bookingId: string) => void;
    onDayOpen: (date: string) => void;
}) {
    return (
        <section className="grid gap-px overflow-hidden rounded-md border border-forest/10 bg-forest/10 md:grid-cols-7">
            {days.map((day) => (
                <div
                    key={day.date}
                    className={`group relative min-h-36 overflow-hidden bg-white p-3 ${day.inCurrentMonth ? "" : "opacity-60"}`}
                >
                    <button
                        type="button"
                        className="absolute inset-0 z-0 bg-white transition hover:bg-[#f8fbf8] focus:bg-[#f8fbf8] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-green/35"
                        onClick={() => onDayOpen(day.date)}
                        title={`Open ${day.label}`}
                        aria-label={`Open ${day.label}`}
                    />
                    <div className="pointer-events-none relative z-10 mb-2 flex items-center justify-between gap-2">
                        <span className="rounded-md px-1 py-0.5 text-left text-sm font-black text-forest transition group-hover:bg-[#eef5f1]">
                            {day.label}
                        </span>
                        {day.isToday && <span className="rounded-full bg-green px-2 py-0.5 text-xs font-bold text-forest">Today</span>}
                    </div>
                    <div className={`relative z-10 ${view === "month" ? "space-y-1" : "space-y-2"}`}>
                        {(bookingsByDate[day.date] ?? []).map((booking) => (
                            <button
                                key={booking.id}
                                className={`w-full rounded-md border-l-4 p-2 text-left text-sm transition hover:shadow-sm ${bookingToneClasses(getBookingCardTone(booking))}`}
                                onClick={(event) => {
                                    event.stopPropagation();
                                    onOpen(booking.id);
                                }}
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
    const initialParts = localPartsFromIso(booking.startTime);
    const [locationId, setLocationId] = useState(booking.locationId);
    const [barberId, setBarberId] = useState(booking.barberId);
    const [date, setDate] = useState(initialParts.date);
    const [time, setTime] = useState(initialParts.time);
    const [availability, setAvailability] = useState<AdminAvailability | null>(null);
    const [selectedSlot, setSelectedSlot] = useState<AdminSlot | null>(null);
    const [error, setError] = useState("");
    const startTime = localDateTimeToIso(date, time);

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

        try {
            await rescheduleAdminBooking(booking.id, {
                locationId,
                barberId,
                startTime,
            });
            await onDone();
        } catch (error) {
            setError(error instanceof Error ? error.message : "Reschedule failed.");
        }
    }

    function handleSlotSelect(slot: AdminSlot) {
        setSelectedSlot(slot);
        setLocationId(slot.locationId);
        setBarberId(slot.barberId);
        const parts = localPartsFromIso(slot.startTime);
        setDate(parts.date);
        setTime(parts.time);
    }

    return (
        <form onSubmit={submit} className="space-y-4 rounded-md border border-forest/10 bg-[#f3f8f4] p-4">
            {error && <Notice tone="error" message={error} onClear={() => setError("")} />}
            <div className="grid gap-3 md:grid-cols-4">
                <Field label="Location">
                    <LocationSelect value={locationId} options={options.locations} onChange={setLocationId} />
                </Field>
                <Field label="Barber">
                    <BarberSelect value={barberId} options={options.barbers} user={user} onChange={setBarberId} />
                </Field>
                <Field label="Date">
                    <input className="input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
                </Field>
                <Field label="Start time">
                    <input className="input" type="time" step={900} value={time} onChange={(event) => setTime(event.target.value)} />
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
                onSelect={handleSlotSelect}
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
        <div className="grid gap-2 [grid-template-columns:repeat(auto-fit,minmax(9.5rem,1fr))]">
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
    barber: Pick<AdminBarberOption, "displayName" | "slug" | "profileImageUrl">;
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
        ["Men", "bg-blue-500"],
        ["Women", "bg-pink-500"],
        ["Boys", "bg-yellow-400"],
        ["Mixed", "bg-violet-100"],
        ["No-show", "bg-red-600"],
        ["Completed", "bg-emerald-100"],
        ["Blocked", "bg-charcoal/10"],
    ];

    return (
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.72rem] font-black text-charcoal/60 sm:gap-3 sm:text-sm">
            {items.map(([label, color]) => (
                <span key={label} className="inline-flex items-center gap-1.5">
                    <span className={`size-2.5 rounded-full sm:size-3 ${color}`} />
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

function bookingsForBarberDay(
    bookings: AdminBookingSummary[],
    selectedDate: string,
    locationId: string,
    barberId: string,
) {
    return bookings
        .filter(
            (booking) =>
                booking.barberId === barberId &&
                booking.locationId === locationId &&
                localDateFromIso(booking.startTime) === selectedDate,
        )
        .sort((a, b) => a.startTime.localeCompare(b.startTime));
}

function layoutCalendarBookings(bookings: AdminBookingSummary[], businessStartTime: string, businessEndTime: string) {
    const lanes: number[] = [];
    const positioned = bookings.map((booking) => {
        const start = new Date(booking.startTime).getTime();
        const end = new Date(booking.endTime).getTime();
        let lane = lanes.findIndex((laneEnd) => laneEnd <= start);

        if (lane === -1) {
            lane = lanes.length;
            lanes.push(end);
        } else {
            lanes[lane] = end;
        }

        return { booking, lane };
    });
    const laneCount = Math.max(1, lanes.length);

    return positioned.map(({ booking, lane }) => ({
        booking,
        style: {
            ...rangeStyleFromIso(booking.startTime, booking.endTime, businessStartTime, businessEndTime),
            left: `calc(${(lane / laneCount) * 100}% + 6px)`,
            width: `calc(${100 / laneCount}% - 12px)`,
        } satisfies CSSProperties,
    }));
}

function blockedTimeOverlaysForBarber(
    blockedTimes: AdminBlockedTime[],
    input: {
        barberId: string;
        locationId: string;
        selectedDate: string;
        businessWindow: { start: string; end: string };
    },
): Array<{ id: string; reason: string | null; style: CSSProperties }> {
    const boardStart = new Date(localDateTimeToIso(input.selectedDate, input.businessWindow.start));
    const boardEnd = new Date(localDateTimeToIso(input.selectedDate, input.businessWindow.end));

    return blockedTimes
        .filter((blockedTime) => blockedAppliesToCell(blockedTime, input.barberId, input.locationId))
        .map((blockedTime) => {
            const start = new Date(blockedTime.startTime);
            const end = new Date(blockedTime.endTime);
            if (start >= boardEnd || end <= boardStart) {
                return null;
            }

            const clippedStart = new Date(Math.max(start.getTime(), boardStart.getTime()));
            const clippedEnd = new Date(Math.min(end.getTime(), boardEnd.getTime()));
            return {
                id: blockedTime.id,
                reason: blockedTime.reason,
                style: rangeStyleFromIso(
                    clippedStart.toISOString(),
                    clippedEnd.toISOString(),
                    input.businessWindow.start,
                    input.businessWindow.end,
                ),
            };
        })
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
}

function rangeStyleFromClock(startTime: string, endTime: string, businessStartTime: string, businessEndTime: string) {
    const businessStart = clockToMinutes(businessStartTime);
    const businessEnd = clockToMinutes(businessEndTime);
    const start = Math.max(clockToMinutes(startTime), businessStart);
    const end = Math.min(clockToMinutes(endTime), businessEnd);

    return {
        top: Math.max(0, ((start - businessStart) / 15) * SLOT_HEIGHT),
        height: Math.max(18, ((end - start) / 15) * SLOT_HEIGHT),
    } satisfies CSSProperties;
}

function rangeStyleFromIso(startTime: string, endTime: string, businessStartTime: string, businessEndTime: string) {
    return rangeStyleFromClock(localClockFromIso(startTime), localClockFromIso(endTime), businessStartTime, businessEndTime);
}

function timeTopFromClock(time: string, businessStartTime: string) {
    return Math.max(0, ((clockToMinutes(time) - clockToMinutes(businessStartTime)) / 15) * SLOT_HEIGHT);
}

function currentTimeLineStyle(window: { start: string; end: string }) {
    const now = clockToMinutes(localClockFromDate(new Date()));
    const start = clockToMinutes(window.start);
    const end = clockToMinutes(window.end);

    if (now < start || now > end) {
        return null;
    }

    return {
        top: ((now - start) / 15) * SLOT_HEIGHT,
    } satisfies CSSProperties;
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

function blockedTimesOverlapRange(
    blockedTimes: AdminBlockedTime[],
    input: { barberId: string; locationId: string; startTime: string; endTime: string },
) {
    const start = new Date(input.startTime);
    const end = new Date(input.endTime);

    return blockedTimes.some((blockedTime) => {
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

function businessWindowForDate(_date: string) {
    return { start: "00:00", end: "24:00" };
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
    const defaultStart = "10:00";
    const defaultEnd = "19:00";
    const windowStart = clockToMinutes(defaultStart);
    const windowEnd = clockToMinutes(defaultEnd);

    if (date !== todayLocalDate()) {
        return defaultStart;
    }

    const nextQuarter = clockToMinutes(nextQuarterClock());
    if (nextQuarter < windowStart || nextQuarter >= windowEnd) {
        return defaultStart;
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

function chartPointX(index: number, count: number, left: number, width: number) {
    return count <= 1 ? left + width / 2 : left + (index / (count - 1)) * width;
}

function chartPointY(value: number, max: number, top: number, height: number) {
    return top + (1 - Math.min(1, Math.max(0, value / Math.max(1, max)))) * height;
}

function shouldShowRevenueChartLabel(index: number, count: number, period: AdminDashboardPeriod) {
    if (count <= 12 || period === "year") {
        return true;
    }

    if (period === "all-time") {
        return index === 0 || index === count - 1 || index % 6 === 0;
    }

    return index === 0 || index === count - 1 || index % 7 === 0;
}

function buildDashboardCountScale(maxValue: number) {
    const max = Math.max(4, Math.ceil(maxValue / 4) * 4);
    const step = max / 4;

    return {
        max,
        ticks: [max, max - step, max - step * 2, max - step * 3, 0],
    };
}

function formatDashboardSeriesDate(date: string) {
    if (!date) return "";

    return new Intl.DateTimeFormat("en-US", {
        timeZone: "UTC",
        month: "short",
        day: "numeric",
    }).format(parseLocalDate(date));
}

function formatDashboardUpdatedAt(value: string) {
    return new Intl.DateTimeFormat("en-CA", {
        timeZone: TIME_ZONE,
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
    }).format(new Date(value));
}

function dashboardDateParts(value: string) {
    const parts = new Intl.DateTimeFormat("en-US", {
        timeZone: TIME_ZONE,
        month: "short",
        day: "numeric",
    }).formatToParts(new Date(value));

    return {
        month: parts.find((part) => part.type === "month")?.value ?? "",
        day: parts.find((part) => part.type === "day")?.value ?? "",
    };
}

function formatBookingSourceLabel(source: AdminBookingSummary["source"]) {
    if (source === "walk_in") return "Walk-in";
    return source[0].toUpperCase() + source.slice(1);
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

function notificationFilterLabel(filter: NotificationCenterFilter) {
    if (filter === "sms") return "SMS";
    return filter[0].toUpperCase() + filter.slice(1);
}

function channelLabel(channel: AdminDashboardActivity["channel"] | AdminUpcomingReminderPreview["channel"]) {
    if (channel === "sms") return "SMS";
    if (channel === "email") return "Email";
    return "Calendar";
}

function ChannelIcon({ channel }: { channel: AdminDashboardActivity["channel"] | AdminUpcomingReminderPreview["channel"] }) {
    if (channel === "sms") return <MessageSquare size={15} />;
    if (channel === "email") return <Mail size={15} />;
    return <CalendarClock size={15} />;
}

function deliveryModeTone(mode: AdminDashboardSnapshot["notificationDeliveryMode"]) {
    if (mode === "live") return "bg-green/20 text-forest";
    if (mode === "dev") return "bg-amber-100 text-amber-800";
    return "bg-[#eef5f1] text-charcoal/65";
}

function reminderSchedulerTone(state: AdminDashboardSnapshot["notificationHealth"]["reminderScheduler"]["state"]) {
    if (state === "healthy") return "bg-green/20 text-forest";
    if (state === "failing") return "bg-red-100 text-red-800";
    if (state === "stale") return "bg-amber-100 text-amber-800";
    return "bg-[#eef5f1] text-charcoal/65";
}

function reminderSchedulerLabel(state: AdminDashboardSnapshot["notificationHealth"]["reminderScheduler"]["state"]) {
    if (state === "healthy") return "Running";
    if (state === "failing") return "Failed";
    if (state === "stale") return "Stale";
    return "Unknown";
}

function formatNullableDashboardDateTime(value: string | null) {
    return value ? formatLocalDateTime(value) : "Not recorded";
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
    josef: josefThumb,
};

function barberPhotoUrl(barber: Pick<AdminBarberOption, "displayName" | "slug" | "profileImageUrl">) {
    if (barber.profileImageUrl) {
        return barber.profileImageUrl;
    }

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
    return getBookingToneClasses(tone);
}
