import {
    buildDashboardChartScale,
    formatCompactDashboardCurrency,
    formatDashboardCurrency,
    seriesHasDashboardData,
} from "../admin-utils";
import type { AdminDashboardPeriod, AdminDashboardSnapshot } from "../types";
import { parseLocalDate } from "./format";

export function RevenueChart({
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

export function UpcomingAppointmentsChart({
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

export function DashboardHealthMeter({ value }: { value: number }) {
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
