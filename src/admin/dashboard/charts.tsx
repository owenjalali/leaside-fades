import { motion, useReducedMotion } from "framer-motion";
import { useState } from "react";

import {
    buildDashboardChartScale,
    formatCompactDashboardCurrency,
    formatDashboardCurrency,
    seriesHasDashboardData,
} from "../admin-utils";
import type { AdminDashboardPeriod, AdminDashboardSnapshot } from "../types";
import { parseLocalDate } from "./format";

const CHART_COLORS = {
    green: "var(--dv2-green, #00814f)",
    rose: "var(--dv2-rose, #c81e4e)",
    warn: "var(--dv2-warn, #b07818)",
    grid: "var(--dv2-grid, #e6ece4)",
    baseline: "var(--dv2-baseline, #cdd7cb)",
    track: "var(--dv2-track, #e8eee6)",
};

export function RevenueChart({
    series,
    period,
}: {
    series: AdminDashboardSnapshot["revenue"]["series"];
    period: AdminDashboardPeriod;
}) {
    const reduceMotion = useReducedMotion();
    const [hoverIndex, setHoverIndex] = useState<number | null>(null);
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
    const linePath = smoothLinePath(points, frame.top, baseline);
    const areaPath = points.length
        ? `${linePath} L ${points[points.length - 1].x} ${baseline} L ${points[0].x} ${baseline} Z`
        : "";
    const hovered = hoverIndex !== null ? points[hoverIndex] : null;
    const seriesKey = `${period}-${chartSeries.length}-${chartSeries[0]?.key ?? ""}`;

    const handlePointerMove = (event: React.MouseEvent<SVGSVGElement>) => {
        if (!hasData || points.length === 0) return;
        const rect = event.currentTarget.getBoundingClientRect();
        const x = ((event.clientX - rect.left) / rect.width) * width;
        let nearest = 0;
        let nearestDistance = Number.POSITIVE_INFINITY;
        points.forEach((point, index) => {
            const distance = Math.abs(point.x - x);
            if (distance < nearestDistance) {
                nearest = index;
                nearestDistance = distance;
            }
        });
        setHoverIndex(nearest);
    };

    return (
        <div className="relative aspect-[16/9] min-h-[260px] w-full overflow-hidden rounded-xl bg-[#fafcf9]">
            <svg
                role="img"
                aria-label={`Tracked revenue by ${period === "year" || period === "all-time" ? "month" : "day"}`}
                viewBox={`0 0 ${width} ${height}`}
                className="h-full w-full"
                onMouseMove={handlePointerMove}
                onMouseLeave={() => setHoverIndex(null)}
            >
                <defs>
                    <linearGradient id="completedRevenueArea" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="#00814f" stopOpacity="0.20" />
                        <stop offset="100%" stopColor="#00814f" stopOpacity="0.02" />
                    </linearGradient>
                </defs>
                {scale.ticks.map((tick) => {
                    const y = chartPointY(tick, scale.max, frame.top, plotHeight);
                    return (
                        <g key={`value-tick-${tick}`}>
                            <line x1={frame.left} x2={width - frame.right} y1={y} y2={y} stroke={CHART_COLORS.grid} strokeWidth="1" />
                            <text x={frame.left - 12} y={y + 4} textAnchor="end" className="fill-charcoal/50 text-[0.68rem] font-black">
                                {hasData || tick === 0 ? formatCompactDashboardCurrency(tick) : ""}
                            </text>
                        </g>
                    );
                })}
                <line x1={frame.left} x2={width - frame.right} y1={baseline} y2={baseline} stroke={CHART_COLORS.baseline} strokeWidth="1.5" />
                {areaPath && (
                    <motion.path
                        key={`area-${seriesKey}`}
                        d={areaPath}
                        fill="url(#completedRevenueArea)"
                        initial={reduceMotion ? false : { opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ duration: 0.5, delay: 0.35 }}
                    />
                )}
                {linePath && (
                    <motion.path
                        key={`line-${seriesKey}`}
                        d={linePath}
                        fill="none"
                        stroke={CHART_COLORS.green}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth="2.5"
                        initial={reduceMotion ? false : { pathLength: 0 }}
                        animate={{ pathLength: 1 }}
                        transition={{ duration: 0.8, ease: [0.2, 0.7, 0.2, 1] }}
                    />
                )}
                {hovered && (
                    <line
                        x1={hovered.x}
                        x2={hovered.x}
                        y1={frame.top}
                        y2={baseline}
                        stroke={CHART_COLORS.baseline}
                        strokeWidth="1"
                        strokeDasharray="3 4"
                    />
                )}
                {points.map((point, index) => (
                    <g key={`revenue-point-${point.key || index}`}>
                        <circle
                            cx={point.x}
                            cy={point.y}
                            r={hoverIndex === index ? 6.5 : 4.5}
                            fill={CHART_COLORS.green}
                            stroke="#ffffff"
                            strokeWidth={hoverIndex === index ? 3 : 2.5}
                        >
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
            {hovered && hasData && (
                <div
                    className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-lg border border-[var(--dv2-hairline,#dfe6dd)] bg-white px-3 py-2 shadow-lg"
                    style={{
                        left: `${(hovered.x / width) * 100}%`,
                        top: `${(hovered.y / height) * 100}%`,
                        marginTop: "-10px",
                    }}
                >
                    <p className="whitespace-nowrap text-[0.65rem] font-black uppercase tracking-[0.1em] text-charcoal/50">{hovered.label}</p>
                    <p className="dv2-num whitespace-nowrap text-xl leading-tight text-forest">{formatDashboardCurrency(hovered.totalCents)}</p>
                    <p className="whitespace-nowrap text-[0.7rem] font-bold text-charcoal/55">
                        {hovered.appointmentCount} appointment{hovered.appointmentCount === 1 ? "" : "s"}
                    </p>
                </div>
            )}
            {!hasData && <ChartEmptyState title="No tracked revenue yet" detail="Past appointments with service price snapshots will draw this line." />}
        </div>
    );
}

export function UpcomingAppointmentsChart({
    series,
}: {
    series: AdminDashboardSnapshot["upcomingAppointments"]["dailySeries"];
}) {
    const reduceMotion = useReducedMotion();
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
        <div className="relative aspect-[16/9] min-h-[260px] w-full overflow-hidden rounded-xl bg-[#fafcf9]">
            <svg role="img" aria-label="Confirmed and cancelled upcoming appointments by day" viewBox={`0 0 ${width} ${height}`} className="h-full w-full">
                {scale.ticks.map((tick) => {
                    const y = chartPointY(tick, scale.max, frame.top, plotHeight);
                    return (
                        <g key={`upcoming-tick-${tick}`}>
                            <line x1={frame.left} x2={width - frame.right} y1={y} y2={y} stroke={CHART_COLORS.grid} strokeWidth="1" />
                            <text x={frame.left - 12} y={y + 4} textAnchor="end" className="fill-charcoal/50 text-[0.7rem] font-black">
                                {hasData || tick === 0 ? tick : ""}
                            </text>
                        </g>
                    );
                })}
                <line x1={frame.left} x2={width - frame.right} y1={baseline} y2={baseline} stroke={CHART_COLORS.baseline} strokeWidth="1.5" />
                {chartSeries.map((point, index) => {
                    const x = chartPointX(index, chartSeries.length, frame.left, plotWidth);
                    const confirmedY = chartPointY(point.confirmedCount, scale.max, frame.top, plotHeight);
                    const cancelledY = chartPointY(point.cancelledCount, scale.max, frame.top, plotHeight);
                    const confirmedHeight = Math.max(0, baseline - confirmedY);
                    const cancelledHeight = Math.max(0, baseline - cancelledY);

                    return (
                        <g key={`upcoming-bar-${point.date}`}>
                            <motion.rect
                                x={x - barWidth - 3}
                                y={confirmedY}
                                width={barWidth}
                                height={confirmedHeight}
                                rx="4"
                                fill={CHART_COLORS.green}
                                opacity={point.confirmedCount > 0 ? "1" : "0.18"}
                                className="transition-opacity hover:opacity-75"
                                style={{ transformBox: "fill-box", transformOrigin: "bottom" }}
                                initial={reduceMotion ? false : { scaleY: 0 }}
                                animate={{ scaleY: 1 }}
                                transition={{ duration: 0.45, delay: index * 0.04, ease: [0.2, 0.7, 0.2, 1] }}
                            >
                                <title>{`${formatDashboardSeriesDate(point.date)}: ${point.confirmedCount} confirmed`}</title>
                            </motion.rect>
                            <motion.rect
                                x={x + 3}
                                y={cancelledY}
                                width={barWidth}
                                height={cancelledHeight}
                                rx="4"
                                fill={CHART_COLORS.rose}
                                opacity={point.cancelledCount > 0 ? "1" : "0.18"}
                                className="transition-opacity hover:opacity-75"
                                style={{ transformBox: "fill-box", transformOrigin: "bottom" }}
                                initial={reduceMotion ? false : { scaleY: 0 }}
                                animate={{ scaleY: 1 }}
                                transition={{ duration: 0.45, delay: 0.05 + index * 0.04, ease: [0.2, 0.7, 0.2, 1] }}
                            >
                                <title>{`${formatDashboardSeriesDate(point.date)}: ${point.cancelledCount} cancelled`}</title>
                            </motion.rect>
                            <text x={x} y={height - 17} textAnchor="middle" className="fill-charcoal/50 text-[0.72rem] font-black">
                                {formatDashboardSeriesDate(point.date)}
                            </text>
                        </g>
                    );
                })}
            </svg>
            {!hasData && <ChartEmptyState title="No upcoming appointment movement" detail="Confirmed and cancelled appointments will appear here as the week fills in." />}
            <div className="absolute right-3 top-3 flex flex-wrap justify-end gap-2 text-[0.7rem] font-black">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--dv2-hairline,#dfe6dd)] bg-white/95 px-2.5 py-1 text-charcoal/70 shadow-sm">
                    <span className="size-2 rounded-[3px] bg-[var(--dv2-green,#00814f)]" />
                    Confirmed
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-[var(--dv2-hairline,#dfe6dd)] bg-white/95 px-2.5 py-1 text-charcoal/70 shadow-sm">
                    <span className="size-2 rounded-[3px] bg-[var(--dv2-rose,#c81e4e)]" />
                    Cancelled
                </span>
            </div>
        </div>
    );
}

function ChartEmptyState({ title, detail }: { title: string; detail: string }) {
    return (
        <div className="pointer-events-none absolute inset-x-4 top-1/2 mx-auto max-w-sm -translate-y-1/2 rounded-xl border border-dashed border-[var(--dv2-baseline,#cdd7cb)] bg-white/90 p-4 text-center shadow-sm">
            <p className="text-base font-black text-forest">{title}</p>
            <p className="mt-1 text-sm font-bold text-charcoal/55">{detail}</p>
        </div>
    );
}

export function DashboardHealthMeter({ value }: { value: number }) {
    const reduceMotion = useReducedMotion();
    const bounded = Math.max(0, Math.min(100, value));
    const radius = 34;
    const circumference = 2 * Math.PI * radius;
    const dashOffset = circumference - (bounded / 100) * circumference;
    const meterColor = bounded >= 90 ? CHART_COLORS.green : bounded >= 70 ? CHART_COLORS.warn : CHART_COLORS.rose;

    return (
        <div className="flex items-center justify-center rounded-xl border border-[var(--dv2-hairline,#dfe6dd)] bg-[#fafcf9] p-4">
            <svg viewBox="0 0 88 88" className="size-28" role="img" aria-label={`${bounded}% notification delivery success`}>
                <circle cx="44" cy="44" r={radius} fill="none" stroke={CHART_COLORS.track} strokeWidth="9" />
                <motion.circle
                    cx="44"
                    cy="44"
                    r={radius}
                    fill="none"
                    stroke={meterColor}
                    strokeLinecap="round"
                    strokeWidth="9"
                    strokeDasharray={circumference}
                    transform="rotate(-90 44 44)"
                    initial={reduceMotion ? false : { strokeDashoffset: circumference }}
                    animate={{ strokeDashoffset: dashOffset }}
                    transition={{ duration: 0.9, ease: [0.2, 0.7, 0.2, 1] }}
                />
                <text x="44" y="46" textAnchor="middle" className="dv2-num fill-forest text-[1.35rem]">
                    {bounded}%
                </text>
                <text x="44" y="60" textAnchor="middle" className="fill-charcoal/45 text-[0.55rem] font-black uppercase tracking-[0.08em]">
                    success
                </text>
            </svg>
        </div>
    );
}

function smoothLinePath(points: Array<{ x: number; y: number }>, top: number, baseline: number) {
    if (points.length === 0) return "";
    if (points.length === 1) return `M ${points[0].x} ${points[0].y}`;
    if (points.length === 2) return `M ${points[0].x} ${points[0].y} L ${points[1].x} ${points[1].y}`;

    const clampY = (value: number) => Math.min(baseline, Math.max(top, value));
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let index = 0; index < points.length - 1; index += 1) {
        const p0 = points[Math.max(0, index - 1)];
        const p1 = points[index];
        const p2 = points[index + 1];
        const p3 = points[Math.min(points.length - 1, index + 2)];
        const c1x = p1.x + (p2.x - p0.x) / 6;
        const c1y = clampY(p1.y + (p2.y - p0.y) / 6);
        const c2x = p2.x - (p3.x - p1.x) / 6;
        const c2y = clampY(p2.y - (p3.y - p1.y) / 6);
        path += ` C ${round2(c1x)} ${round2(c1y)}, ${round2(c2x)} ${round2(c2y)}, ${round2(p2.x)} ${round2(p2.y)}`;
    }
    return path;
}

function round2(value: number) {
    return Math.round(value * 100) / 100;
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
