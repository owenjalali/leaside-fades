import {
    AlertTriangle,
    Bell,
    CalendarClock,
    CalendarDays,
    Check,
    ChevronLeft,
    ChevronRight,
    Mail,
    MessageSquare,
    RefreshCw,
} from "lucide-react";

import {
    compactNotificationFailureMessage,
    formatAdminStatus,
    formatDashboardCurrency,
    formatDashboardPeriodLabel,
    formatLocalDateTime,
    formatLocalTime,
    getActiveNotificationFailures,
    reminderSchedulerPresentation,
    summarizeNotificationHealth,
} from "../admin-utils";
import type {
    AdminBookingSummary,
    AdminDashboardActivity,
    AdminDashboardPeriod,
    AdminDashboardSnapshot,
    AdminUpcomingReminderPreview,
} from "../types";
import { DashboardHealthMeter, RevenueChart, UpcomingAppointmentsChart } from "./charts";
import { TIME_ZONE } from "./format";

export function DashboardPage({
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
            <section className="flex min-h-[560px] items-center justify-center rounded-2xl border border-[var(--dv2-hairline)] bg-white text-xl font-bold text-charcoal/60">
                <RefreshCw size={24} className="mr-3 animate-spin" />
                Loading dashboard
            </section>
        );
    }

    if (!dashboard) {
        return (
            <section className="flex min-h-[560px] flex-col items-center justify-center rounded-2xl border border-[var(--dv2-hairline)] bg-white p-6 text-center shadow-sm">
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
                    <p className="text-xs font-black uppercase tracking-[0.16em] text-[var(--dv2-ink-mut)]">Operating dashboard</p>
                    <h1 className="mt-1 text-3xl font-black leading-tight tracking-tight text-forest sm:text-4xl">
                        Revenue, bookings, and notification health
                    </h1>
                </div>
                <div className="flex flex-wrap items-center gap-2 text-sm font-black text-charcoal/55">
                    <span className="inline-flex items-center gap-2 rounded-full border border-[var(--dv2-hairline)] bg-white px-3 py-2 shadow-sm">
                        <span className="size-1.5 rounded-full bg-[var(--dv2-green)]" />
                        Last updated {lastUpdated}
                    </span>
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
            <DashboardFascia
                revenue={dashboard.revenue}
                upcoming={dashboard.upcomingAppointments}
                period={period}
                anchorDate={anchorDate}
                onChangePeriod={onChangePeriod}
                onNavigatePeriod={onNavigatePeriod}
            />
            <section className="grid gap-5 xl:grid-cols-2">
                <TrackedRevenueCard revenue={dashboard.revenue} />
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

function DashboardFascia({
    revenue,
    upcoming,
    period,
    anchorDate,
    onChangePeriod,
    onNavigatePeriod,
}: {
    revenue: AdminDashboardSnapshot["revenue"];
    upcoming: AdminDashboardSnapshot["upcomingAppointments"];
    period: AdminDashboardPeriod;
    anchorDate: string;
    onChangePeriod: (period: AdminDashboardPeriod) => void;
    onNavigatePeriod: (direction: -1 | 1) => void;
}) {
    const periodOptions: AdminDashboardPeriod[] = ["week", "month", "year", "all-time"];
    const periodLabel = formatDashboardPeriodLabel(revenue.period, revenue.periodStart, revenue.periodEnd);
    const isAllTime = period === "all-time";
    const bookedCount = upcoming.confirmedCount + upcoming.cancelledCount;

    return (
        <section className="dv2-fascia px-6 pb-6 pt-6 sm:px-7">
            <div className="mb-5 flex flex-wrap items-center gap-3">
                <span className="dv2-wordmark text-lg leading-none">Leaside Fades</span>
                <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
                    <div
                        className="inline-grid grid-cols-4 rounded-[10px] border border-[var(--dv2-fascia-line)] bg-black/25 p-[3px]"
                        role="group"
                        aria-label="Revenue period"
                    >
                        {periodOptions.map((option) => (
                            <button
                                key={`dashboard-period-${option}`}
                                className={`rounded-[7px] px-3 py-1.5 text-xs font-black uppercase tracking-[0.06em] transition ${
                                    option === period
                                        ? "bg-[var(--dv2-mint)] text-[#0c281b]"
                                        : "text-[var(--dv2-mint-dim)] hover:text-[var(--dv2-mint)]"
                                }`}
                                aria-pressed={option === period}
                                onClick={() => onChangePeriod(option)}
                                type="button"
                            >
                                {formatDashboardPeriodOption(option)}
                            </button>
                        ))}
                    </div>
                    <div
                        className="flex min-w-0 items-center gap-1 rounded-[10px] border border-[var(--dv2-fascia-line)] bg-black/25 p-[3px]"
                        title={`Anchor date ${anchorDate}`}
                    >
                        {!isAllTime && (
                            <button
                                className="grid size-8 place-items-center rounded-[7px] text-[var(--dv2-mint-dim)] transition hover:text-[var(--dv2-mint)]"
                                onClick={() => onNavigatePeriod(-1)}
                                type="button"
                                title={`Previous ${period}`}
                                aria-label={`Previous ${period}`}
                            >
                                <ChevronLeft size={16} />
                            </button>
                        )}
                        <span className="min-w-[8rem] truncate px-2 text-center text-xs font-black uppercase tracking-[0.06em] text-[var(--dv2-mint)]">
                            {periodLabel}
                        </span>
                        {!isAllTime && (
                            <button
                                className="grid size-8 place-items-center rounded-[7px] text-[var(--dv2-mint-dim)] transition hover:text-[var(--dv2-mint)]"
                                onClick={() => onNavigatePeriod(1)}
                                type="button"
                                title={`Next ${period}`}
                                aria-label={`Next ${period}`}
                            >
                                <ChevronRight size={16} />
                            </button>
                        )}
                    </div>
                </div>
            </div>
            <div className="grid grid-cols-2 gap-x-0 gap-y-6 sm:grid-cols-3 xl:grid-cols-[1.3fr_1fr_1fr_1fr_1fr_0.9fr]">
                <FasciaKpi
                    group="Stored snapshots"
                    label="Revenue"
                    value={formatDashboardCurrency(revenue.totalCents)}
                    sub={`${revenue.pricedAppointmentCount} priced`}
                    hero
                    first
                />
                <FasciaKpi
                    label="Appointments"
                    value={`${revenue.appointmentCount}`}
                    sub={`${revenue.completedAppointmentCount} completed`}
                />
                <FasciaKpi
                    label="Average"
                    value={formatDashboardCurrency(revenue.averageRevenueCents)}
                    sub="per priced appt"
                />
                <FasciaKpi group="Next 7 days" label="Booked" value={`${bookedCount}`} sub="tracked" />
                <FasciaKpi label="Confirmed" value={`${upcoming.confirmedCount}`} sub="active" />
                <FasciaKpi label="Cancelled" value={`${upcoming.cancelledCount}`} sub="removed" rose />
            </div>
        </section>
    );
}

function FasciaKpi({
    group,
    label,
    value,
    sub,
    hero = false,
    rose = false,
    first = false,
}: {
    group?: string;
    label: string;
    value: string;
    sub: string;
    hero?: boolean;
    rose?: boolean;
    first?: boolean;
}) {
    const parts = splitDashboardValue(value);

    return (
        <div className={`min-w-0 ${first ? "" : "xl:border-l xl:border-[var(--dv2-fascia-line)] xl:pl-6"}`}>
            <p className="mb-2 text-[0.6rem] font-black uppercase tracking-[0.16em] text-[var(--dv2-mint)]/40">
                {group ?? " "}
            </p>
            <p className="truncate text-[0.65rem] font-black uppercase tracking-[0.14em] text-[var(--dv2-mint-dim)]">{label}</p>
            <p
                className={`dv2-num mt-1.5 truncate leading-none ${
                    hero ? "text-[3.4rem] text-[var(--dv2-mint)]" : "text-[2.6rem]"
                } ${rose ? "text-[var(--dv2-rose-soft)]" : hero ? "" : "text-[var(--dv2-cream)]"}`}
                title={value}
            >
                {parts.prefix && <span className="mr-0.5 text-[0.5em] text-[var(--dv2-mint-dim)]">{parts.prefix}</span>}
                {parts.rest}
            </p>
            <p className="truncate text-[0.7rem] font-bold text-[var(--dv2-mint-dim)]">{sub}</p>
        </div>
    );
}

function splitDashboardValue(value: string) {
    const match = /^(\D+)(.*)$/.exec(value);
    if (match && match[2]) {
        return { prefix: match[1], rest: match[2] };
    }
    return { prefix: "", rest: value };
}

function TrackedRevenueCard({ revenue }: { revenue: AdminDashboardSnapshot["revenue"] }) {
    const hasUnpriced = revenue.unpricedAppointmentCount > 0;
    const hasFromPrices = revenue.fromPriceAppointmentCount > 0;
    const hasPastConfirmed = revenue.pastConfirmedAppointmentCount > 0;
    const periodLabel = formatDashboardPeriodLabel(revenue.period, revenue.periodStart, revenue.periodEnd);

    return (
        <section className="dv2-card overflow-hidden">
            <div className="space-y-4 p-5 sm:p-6">
                <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--dv2-ink-mut)]">
                        Stored service snapshots · {periodLabel}
                    </p>
                    <h2 className="mt-1 text-2xl font-black tracking-tight text-forest">Tracked revenue</h2>
                </div>
                {(hasUnpriced || hasFromPrices || hasPastConfirmed) && (
                    <div className="flex flex-wrap gap-2 text-[0.65rem] font-black uppercase tracking-[0.08em]">
                        {hasPastConfirmed && (
                            <span className="rounded-md bg-[#eef2ec] px-2.5 py-1.5 text-charcoal/60">
                                {revenue.pastConfirmedAppointmentCount} past confirmed booking{revenue.pastConfirmedAppointmentCount === 1 ? "" : "s"} counted
                            </span>
                        )}
                        {hasUnpriced && (
                            <span className="rounded-md bg-amber-50 px-2.5 py-1.5 text-amber-800">
                                {revenue.unpricedAppointmentCount} unpriced appointment{revenue.unpricedAppointmentCount === 1 ? "" : "s"}
                            </span>
                        )}
                        {hasFromPrices && (
                            <span className="rounded-md bg-[#eef2ec] px-2.5 py-1.5 text-charcoal/60">
                                {revenue.fromPriceAppointmentCount} from-price snapshot{revenue.fromPriceAppointmentCount === 1 ? "" : "s"} counted at stored total
                            </span>
                        )}
                    </div>
                )}
            </div>
            <div className="px-3 pb-4 sm:px-5">
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
        <section className="dv2-card overflow-hidden">
            <div className="flex items-start justify-between gap-4 p-5 sm:p-6">
                <div className="min-w-0">
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-[var(--dv2-ink-mut)]">All locations, next 7 days</p>
                    <h2 className="mt-1 text-2xl font-black tracking-tight text-forest">Upcoming appointments</h2>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-green/25 bg-white px-3 py-1 text-[0.65rem] font-black uppercase tracking-[0.1em] text-[var(--dv2-green)]">
                    <span className="size-1.5 rounded-full bg-[var(--dv2-green)]" />
                    Live schedule
                </span>
            </div>
            <div className="px-3 pb-4 sm:px-5">
                <UpcomingAppointmentsChart series={upcoming.dailySeries} />
            </div>
        </section>
    );
}

function DashboardMetricTile({ label, value, detail }: { label: string; value: string; detail: string }) {
    return (
        <div className="min-w-0 rounded-xl border border-[var(--dv2-hairline)] bg-[#fafcf9] p-3">
            <p className="truncate text-[0.65rem] font-black uppercase tracking-[0.12em] text-charcoal/55">{label}</p>
            <p className="dv2-num mt-1 truncate text-[1.9rem] leading-none text-forest" title={value}>{value}</p>
            <p className="truncate text-xs font-bold text-charcoal/55">{detail}</p>
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
        <section className="dv2-card">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--dv2-hairline)] px-5 py-4">
                <div className="flex items-center gap-2">
                    <CalendarDays size={20} className="text-[var(--dv2-green)]" />
                    <h2 className="text-xl font-black tracking-tight text-forest">Appointments activity</h2>
                </div>
                <div className="flex flex-wrap gap-2 text-[0.65rem] font-black uppercase tracking-[0.08em] text-charcoal/60">
                    <span className="rounded-md bg-[#eef2ec] px-2.5 py-1.5">{todayBookings.length} today</span>
                    <span className="rounded-md bg-[#eef2ec] px-2.5 py-1.5">{upcomingBookings.length} next 7 days</span>
                    <span className="rounded-md bg-amber-50 px-2.5 py-1.5 text-amber-800">{cancellationCount} cancelled</span>
                </div>
            </div>
            <div className="max-h-[620px] divide-y divide-[var(--dv2-hairline)] overflow-y-auto">
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
            className="grid w-full gap-3 bg-white p-4 text-left transition hover:bg-[#f7faf6] sm:grid-cols-[4.5rem_1fr_auto]"
            onClick={() => onOpenBooking(item.bookingId)}
        >
            <DashboardDateBadge month={date.month} day={date.day} />
            <span className="min-w-0">
                <span className="flex min-w-0 flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-[var(--dv2-green)]">
                        <ChannelIcon channel={item.channel} />
                        {activityLabel(item.eventType)}
                    </span>
                    <span className="text-xs font-bold text-charcoal/45">{formatLocalTime(item.appointmentStartTime)}</span>
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
            className="grid w-full gap-3 bg-white p-4 text-left transition hover:bg-[#f7faf6] sm:grid-cols-[4.5rem_1fr_auto]"
            onClick={() => onOpenBooking(booking.id)}
        >
            <DashboardDateBadge month={date.month} day={date.day} />
            <span className="min-w-0">
                <span className="text-xs font-black uppercase tracking-[0.08em] text-[var(--dv2-green)]">{formatLocalTime(booking.startTime)}</span>
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
        <span className="flex w-16 shrink-0 flex-col items-center justify-center rounded-xl border border-[var(--dv2-hairline)] bg-[#f0f4ef] px-2 py-2 text-center">
            <span className="text-[0.6rem] font-black uppercase tracking-[0.1em] text-charcoal/45">{month}</span>
            <span className="dv2-num text-2xl leading-tight text-[var(--dv2-fascia-1)]">{day}</span>
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
    const schedulerPresentation = reminderSchedulerPresentation(health.reminderScheduler.state);
    const activeFailures = getActiveNotificationFailures(activity);
    const activeFailureIds = new Set(activeFailures.map((item) => item.id));
    const recentRows = [
        ...activeFailures,
        ...activity.filter((item) => !activeFailureIds.has(item.id)).slice(0, Math.max(0, 4 - activeFailures.length)),
    ].slice(0, 4);

    return (
        <section className="dv2-card">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--dv2-hairline)] px-5 py-4">
                <div className="flex items-center gap-2">
                    <Bell size={20} className="text-[var(--dv2-green)]" />
                    <h2 className="text-xl font-black tracking-tight text-forest">Notification health</h2>
                </div>
                <span className={`rounded-full px-3 py-1 text-[0.65rem] font-black uppercase tracking-[0.1em] ${deliveryModeTone(deliveryMode)}`}>
                    {deliveryModeLabel(deliveryMode)} mode
                </span>
            </div>
            <div className="space-y-4 p-4 sm:p-5">
                <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
                    <DashboardHealthMeter value={health.deliverySuccessRate} />
                    <div className="min-w-0 space-y-3">
                        <div className="grid gap-2">
                            {summary.map((item) => (
                                <p key={item} className="rounded-lg bg-[#fafcf9] px-3 py-2 text-sm font-black text-charcoal/65">
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
                <div className="rounded-xl border border-[var(--dv2-hairline)] bg-[#fafcf9] p-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <h3 className="text-base font-black text-forest">Reminder scheduler</h3>
                        <span className={`rounded-full px-3 py-1 text-[0.65rem] font-black uppercase tracking-[0.1em] ${schedulerPresentation.className}`}>
                            {schedulerPresentation.label}
                        </span>
                    </div>
                    <p className="mt-2 text-sm font-bold text-charcoal/65">{health.reminderScheduler.message}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-black text-charcoal/65">
                        <span className="rounded-full bg-white px-3 py-1.5 ring-1 ring-[var(--dv2-hairline)]">
                            Email - {providerDisplayName(health.providers.email.provider)} {health.providers.email.state}
                        </span>
                        <span className="rounded-full bg-white px-3 py-1.5 ring-1 ring-[var(--dv2-hairline)]">
                            SMS - {providerDisplayName(health.providers.sms.provider)} {health.providers.sms.state}
                        </span>
                    </div>
                    <div className="mt-3 grid gap-2 text-xs font-bold text-charcoal/50 sm:grid-cols-2">
                        <span>Last success: {formatNullableDashboardDateTime(health.reminderScheduler.lastSuccessAt)}</span>
                        <span>Last run: {formatNullableDashboardDateTime(health.reminderScheduler.latestRunAt)}</span>
                    </div>
                    {health.reminderScheduler.errorMessage ? (
                        <p className="mt-2 rounded-lg bg-red-50 px-3 py-2 text-xs font-bold text-red-700">
                            {health.reminderScheduler.errorMessage}
                        </p>
                    ) : null}
                </div>
                <div className="rounded-xl border border-[var(--dv2-hairline)] bg-[#fafcf9] p-3">
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
                                    className="min-w-0 rounded-lg bg-white p-3 text-left transition hover:bg-[#f2f8f3]"
                                    onClick={() => onOpenBooking(item.bookingId)}
                                >
                                    <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-[var(--dv2-green)]">
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
                        <p className="rounded-xl border border-dashed border-[var(--dv2-hairline)] bg-[#f7faf6] p-4 text-sm font-bold text-charcoal/55">
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

function NotificationHealthSegments({
    health,
}: {
    health: AdminDashboardSnapshot["notificationHealth"];
}) {
    const segments = [
        { label: "Sent", value: health.sentCount, className: "bg-[var(--dv2-green)]" },
        { label: "Scheduled", value: health.scheduledCount, className: "bg-[#a2ada0]" },
        { label: "Failed", value: health.failedActiveCount, className: "bg-[var(--dv2-rose)]" },
        { label: "Skipped", value: health.skippedCount, className: "bg-[var(--dv2-brass)]" },
    ];
    const total = segments.reduce((sum, item) => sum + item.value, 0);

    if (total === 0) {
        return <div className="h-2.5 rounded-full bg-[var(--dv2-track)]" aria-label="No notification delivery activity" />;
    }

    return (
        <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-full" aria-label="Notification delivery status mix">
            {segments
                .filter((item) => item.value > 0)
                .map((item) => (
                    <span
                        key={item.label}
                        className={`rounded-[2px] ${item.className}`}
                        style={{ width: `${Math.max(5, (item.value / total) * 100)}%` }}
                        title={`${item.label}: ${item.value}`}
                    />
                ))}
        </div>
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
            className="grid w-full gap-3 rounded-xl border border-[var(--dv2-hairline)] bg-white p-3 text-left transition hover:border-green/35 hover:bg-[#f7faf6] sm:grid-cols-[1fr_auto]"
            onClick={() => onOpenBooking(item.bookingId)}
        >
            <span className="min-w-0">
                <span className="flex items-center gap-2 text-xs font-black uppercase tracking-[0.08em] text-[var(--dv2-green)]">
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
              ? "bg-[#eef2ec] text-charcoal/55"
            : tone === "skipped" || tone === "cancelled" || tone === "no_show"
              ? "bg-amber-100 text-amber-800"
              : tone === "sms"
                ? "bg-blue-100 text-blue-800"
                : tone === "email"
                  ? "bg-violet-100 text-violet-800"
              : tone === "sent" || tone === "confirmed"
                ? "bg-green/20 text-forest"
                : "bg-[#eef2ec] text-charcoal/65";

    return <span className={`rounded-full px-3 py-1 text-[0.65rem] font-black uppercase tracking-[0.08em] ${classes}`}>{label}</span>;
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
    return "bg-[#eef2ec] text-charcoal/65";
}

function deliveryModeLabel(mode: AdminDashboardSnapshot["notificationDeliveryMode"]) {
    return mode === "live" ? "Live" : "Test";
}

function providerDisplayName(provider: string) {
    return provider.length > 0
        ? `${provider.charAt(0).toUpperCase()}${provider.slice(1)}`
        : "Unknown";
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
