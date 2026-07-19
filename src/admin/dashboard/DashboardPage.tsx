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
                        <div className="inline-grid grid-cols-4 overflow-hidden rounded-md border border-[#d7e0d7] bg-[#f7faf7] p-1" role="group" aria-label="Revenue period">
                            {periodOptions.map((option) => (
                                <button
                                    key={`dashboard-period-${option}`}
                                    className={`rounded px-3 py-1.5 text-xs font-black uppercase tracking-[0.08em] transition ${
                                        option === period
                                            ? "bg-forest text-white shadow-sm"
                                            : "text-charcoal/58 hover:bg-white hover:text-forest"
                                    }`}
                                    aria-pressed={option === period}
                                    onClick={() => onChangePeriod(option)}
                                    type="button"
                                >
                                    {formatDashboardPeriodOption(option)}
                                </button>
                            ))}
                        </div>
                        <div className="flex min-w-0 items-center gap-1 rounded-md border border-[#d7e0d7] bg-white p-1 shadow-sm" title={`Anchor date ${anchorDate}`}>
                            {!isAllTime && (
                                <button className="icon-button size-9" onClick={() => onNavigatePeriod(-1)} type="button" title={`Previous ${period}`} aria-label={`Previous ${period}`}>
                                    <ChevronLeft size={18} />
                                </button>
                            )}
                            <span className="min-w-[9rem] truncate px-2 text-center text-sm font-black text-forest">
                                {periodLabel}
                            </span>
                            {!isAllTime && (
                                <button className="icon-button size-9" onClick={() => onNavigatePeriod(1)} type="button" title={`Next ${period}`} aria-label={`Next ${period}`}>
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
            <p className="truncate text-xs font-black uppercase tracking-[0.12em] text-charcoal/70">{label}</p>
            <p className="mt-1 text-2xl font-black text-forest sm:text-3xl" title={value}>{value}</p>
            <p className="truncate text-sm font-bold text-charcoal/60">{detail}</p>
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
    const schedulerPresentation = reminderSchedulerPresentation(health.reminderScheduler.state);
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
                    {deliveryModeLabel(deliveryMode)} mode
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
                        <span className={`rounded-full px-3 py-1 text-xs font-black uppercase tracking-[0.1em] ${schedulerPresentation.className}`}>
                            {schedulerPresentation.label}
                        </span>
                    </div>
                    <p className="mt-2 text-sm font-bold text-charcoal/65">{health.reminderScheduler.message}</p>
                    <div className="mt-3 flex flex-wrap gap-2 text-xs font-black text-charcoal/65">
                        <span className="rounded-full bg-white px-3 py-1.5 ring-1 ring-[#d7e0d7]">
                            Email - {providerDisplayName(health.providers.email.provider)} {health.providers.email.state}
                        </span>
                        <span className="rounded-full bg-white px-3 py-1.5 ring-1 ring-[#d7e0d7]">
                            SMS - {providerDisplayName(health.providers.sms.provider)} {health.providers.sms.state}
                        </span>
                    </div>
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
    return "bg-[#eef5f1] text-charcoal/65";
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
