import { useEffect, useState } from "react";
import AnimateOnScroll from "@/components/AnimateOnScroll";

interface HeroProps {
    overallRating: number | null;
    totalReviews: number | null;
}

type Weekday =
    | "Sunday"
    | "Monday"
    | "Tuesday"
    | "Wednesday"
    | "Thursday"
    | "Friday"
    | "Saturday";

type DayHours = {
    open: number;
    close: number;
};

type OpenStatus = {
    isOpen: boolean;
    label: string;
};

const WEEKDAY_ORDER: Weekday[] = [
    "Sunday",
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
    "Saturday",
];

const BUSINESS_HOURS: Partial<Record<Weekday, DayHours>> = {
    Monday: { open: 10, close: 19 },
    Tuesday: { open: 10, close: 19 },
    Wednesday: { open: 10, close: 19 },
    Thursday: { open: 10, close: 19 },
    Friday: { open: 10, close: 19 },
    Saturday: { open: 10, close: 19 },
};

const torontoTimeFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Toronto",
    weekday: "long",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
});

function getTorontoTimeParts() {
    const parts = torontoTimeFormatter.formatToParts(new Date());
    const lookup = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    const weekday = lookup.weekday as Weekday | undefined;

    return {
        weekday: weekday && WEEKDAY_ORDER.includes(weekday) ? weekday : "Monday",
        hour: Number(lookup.hour),
        minute: Number(lookup.minute),
    };
}

function formatHour(hour24: number) {
    if (hour24 === 0) return "12 a.m.";
    if (hour24 < 12) return `${hour24} a.m.`;
    if (hour24 === 12) return "12 p.m.";
    return `${hour24 - 12} p.m.`;
}

function getNextOpening(todayIndex: number) {
    for (let offset = 1; offset <= WEEKDAY_ORDER.length; offset += 1) {
        const nextDay = WEEKDAY_ORDER[(todayIndex + offset) % WEEKDAY_ORDER.length];
        const nextHours = BUSINESS_HOURS[nextDay];
        if (nextHours) {
            return { day: nextDay, hours: nextHours, offset };
        }
    }
    return null;
}

function getOpenStatus(): OpenStatus {
    const { weekday, hour, minute } = getTorontoTimeParts();
    const todayHours = BUSINESS_HOURS[weekday];
    const todayIndex = WEEKDAY_ORDER.indexOf(weekday);
    const nowMinutes = hour * 60 + minute;

    if (todayHours) {
        const openMinutes = todayHours.open * 60;
        const closeMinutes = todayHours.close * 60;

        if (nowMinutes >= openMinutes && nowMinutes < closeMinutes) {
            return { isOpen: true, label: "Open today" };
        }

        if (nowMinutes < openMinutes) {
            return {
                isOpen: false,
                label: `Closed today. Opens at ${formatHour(todayHours.open)}.`,
            };
        }
    }

    const nextOpening = getNextOpening(todayIndex);
    if (!nextOpening) {
        return { isOpen: false, label: "Closed today." };
    }

    const dayLabel = nextOpening.offset === 1 ? "tomorrow" : nextOpening.day;
    return {
        isOpen: false,
        label: `Closed today. Opens ${dayLabel} at ${formatHour(nextOpening.hours.open)}.`,
    };
}

export default function Hero({ overallRating, totalReviews }: HeroProps) {
    const hasLiveRating = typeof overallRating === "number" && overallRating > 0;
    const ratingLabel = hasLiveRating ? overallRating.toFixed(1) : null;
    const reviewCountLabel =
        typeof totalReviews === "number" && totalReviews > 0
            ? `${totalReviews}+ reviews`
            : "Google reviews";
    const [openStatus, setOpenStatus] = useState<OpenStatus>(() => getOpenStatus());

    useEffect(() => {
        const refreshStatus = () => setOpenStatus(getOpenStatus());
        refreshStatus();
        const intervalId = window.setInterval(refreshStatus, 60_000);
        return () => window.clearInterval(intervalId);
    }, []);

    return (
        <section
            id="hero"
            className="relative min-h-screen flex items-center justify-center overflow-hidden"
        >
            <div
                className="absolute inset-0 bg-cover bg-center bg-no-repeat"
                style={{ backgroundImage: "url('/assets/hero-bg.jpg')" }}
            />
            <div className="absolute inset-0 bg-black/40" />

            <div className="relative z-10 text-center px-4 max-w-4xl mx-auto pt-20">
                <AnimateOnScroll animation="fade-in" duration={1000}>
                    <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 backdrop-blur-md border border-white/20 mb-8">
                        <div
                            className={`w-2 h-2 rounded-full ${
                                openStatus.isOpen ? "bg-green animate-pulse" : "bg-white/70"
                            }`}
                        />
                        <span className="text-white/90 text-sm font-medium" aria-live="polite">
                            {openStatus.label}
                        </span>
                    </div>
                </AnimateOnScroll>

                <AnimateOnScroll animation="fade-up" delay={200}>
                    <h1 className="font-display text-6xl md:text-8xl lg:text-9xl text-white tracking-wider leading-[0.9] drop-shadow-2xl">
                        PRECISION CUTS.
                        <br />
                        <span className="text-green-light">LOCAL CRAFT.</span>
                    </h1>
                </AnimateOnScroll>

                <AnimateOnScroll animation="fade-up" delay={400}>
                    <p className="text-white/70 text-lg md:text-xl max-w-2xl mx-auto mt-6 leading-relaxed">
                        East York&apos;s neighbourhood barbershop on Bayview Ave. Classic
                        technique, modern style, and a fresh cut every time.
                    </p>
                </AnimateOnScroll>

                <AnimateOnScroll animation="fade-up" delay={600}>
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
                        <a
                            href="https://www.fresha.com/a/leasidefades-toronto-866-eglinton-avenue-east-oyz3pt1m?preview=35767ad4-91b3-4aea-a890-bf79b66c2a81&pId=2797003&_gl=1*1essaaw*_gcl_aw*R0NMLjE3NzE1MjY0ODIuQ2owS0NRaUFodHZNQmhEQkFSSXNBTDI2cGpId29mSEkxZl9WYWtabkdWOU5DbHJrLVF2SEwxc2pjWnctZ0Z5MU0xeEIzbFhpZ1hNUlk4WWFBaDhsRUFMd193Y0I.*_gcl_au*MTQzOTg5MjA1MS4xNzY5NDU5MjI4LjEwNDY3OTA5OTAuMTc3MTUyNjUyMi4xNzcxNTI2NTIy*_ga*MTI1OTQ0MDQxNC4xNzY5NDU5MjI4*_ga_SMQNG7NE8C*czE3NzE1MzYxNjckbzEyJGcxJHQxNzcxNTQ1MjQ3JGozMiRsMCRoMA.."
                            target="_blank"
                            rel="noopener noreferrer"
                            className="relative inline-flex items-center justify-center px-8 py-4 overflow-hidden font-bold text-white bg-green rounded-full group hover:bg-emerald transition-all duration-300 text-lg shadow-xl shadow-green/30"
                        >
                            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                            <span className="relative">Book Your Cut</span>
                        </a>
                        <a
                            href="tel:+16474715485"
                            className="inline-flex items-center gap-2 px-8 py-4 rounded-full bg-white/10 backdrop-blur-md border border-white/20 text-white font-medium hover:bg-white/20 transition-all duration-300"
                        >
                            📞 (647) 471-5485
                        </a>
                    </div>
                </AnimateOnScroll>

                <AnimateOnScroll animation="fade-in" delay={800}>
                    <div className="flex flex-wrap items-center justify-center gap-6 mt-12 text-white/60 text-sm">
                        <span className="flex items-center gap-1.5">
                            ⭐{" "}
                            {hasLiveRating ? (
                                <>
                                    <strong className="text-white">{ratingLabel}</strong> on Google (
                                    {reviewCountLabel})
                                </>
                            ) : (
                                "Live Google reviews"
                            )}
                        </span>
                        <span className="w-px h-4 bg-white/20" />
                        <span>📍 1680 Bayview Ave</span>
                        <span className="w-px h-4 bg-white/20 hidden sm:block" />
                        <span className="hidden sm:inline">🕐 Mon-Sat: 10AM-7PM</span>
                    </div>
                </AnimateOnScroll>
            </div>

            <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white/60 to-transparent" />
        </section>
    );
}
