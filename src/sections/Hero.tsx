import { useEffect, useState } from "react";
import AnimateOnScroll from "@/components/AnimateOnScroll";
import LocationActionMenu from "@/components/LocationActionMenu";

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
    Sunday: { open: 10, close: 17 },
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
            return { isOpen: true, label: "Open now" };
        }

        if (nowMinutes < openMinutes) {
            return {
                isOpen: false,
                label: `Closed now. Opens at ${formatHour(todayHours.open)}.`,
            };
        }
    }

    const nextOpening = getNextOpening(todayIndex);
    if (!nextOpening) {
        return { isOpen: false, label: "Closed now." };
    }

    const dayLabel = nextOpening.offset === 1 ? "tomorrow" : nextOpening.day;
    return {
        isOpen: false,
        label: `Closed now. Opens ${dayLabel} at ${formatHour(nextOpening.hours.open)}.`,
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
            className="relative min-h-screen flex items-center justify-center overflow-x-hidden"
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
                    <p className="text-white/80 text-lg md:text-xl max-w-2xl mx-auto mt-6 leading-relaxed">
                        Two East York locations. One Leaside Fades standard. Walk in or book the
                        shop that works best for you.
                    </p>
                </AnimateOnScroll>

                <AnimateOnScroll animation="fade-up" delay={600} className="relative z-40">
                    <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
                        <LocationActionMenu
                            action="book"
                            label="Book Now"
                            buttonClassName="bg-green text-white hover:bg-emerald px-8 py-4 text-lg font-bold shadow-xl shadow-green/30"
                            menuClassName="left-1/2 -translate-x-1/2 sm:left-0 sm:translate-x-0"
                        />
                        <LocationActionMenu
                            action="call"
                            label="Call"
                            buttonClassName="bg-white/10 backdrop-blur-md border border-white/20 text-white hover:bg-white/20 px-8 py-4 text-lg"
                            menuClassName="left-1/2 -translate-x-1/2 sm:left-0 sm:translate-x-0"
                        />
                    </div>
                </AnimateOnScroll>

                <AnimateOnScroll animation="fade-in" delay={800} className="relative z-10">
                    <div className="mt-12 mx-auto w-full max-w-xl rounded-2xl border border-white/15 bg-black/20 backdrop-blur-md px-4 py-3">
                        <div className="grid grid-cols-1 sm:grid-cols-3 text-center text-white/75 text-xs sm:text-sm leading-relaxed">
                            <div className="py-2 sm:py-1 sm:px-4">
                                {hasLiveRating ? (
                                    <>
                                        <strong className="text-white">{ratingLabel}</strong> on Google (
                                        {reviewCountLabel}, Eglinton)
                                    </>
                                ) : (
                                    "Live Google reviews (Eglinton)"
                                )}
                            </div>
                            <div className="py-2 sm:py-1 sm:px-4 border-t border-white/10 sm:border-t-0 sm:border-l">
                                866 Eglinton Ave E and 909 Millwood Rd
                            </div>
                            <div className="py-2 sm:py-1 sm:px-4 border-t border-white/10 sm:border-t-0 sm:border-l">
                                Mon-Sat: 10AM-7PM | Sun: 10AM-5PM
                            </div>
                        </div>
                    </div>
                </AnimateOnScroll>
            </div>

            <div className="absolute bottom-0 left-0 right-0 h-16 bg-gradient-to-t from-white/60 to-transparent" />
        </section>
    );
}
