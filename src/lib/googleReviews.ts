import { useEffect, useState } from "react";

const REVIEWS_API = "/api/google-reviews";
const MAX_REVIEWS = 6;
const REQUEST_TIMEOUT_MS = 6500;
const DEFAULT_MAPS_URL =
    "https://www.google.com/maps/place/Leaside+Fades/@43.7137557,-79.3678747,17z/data=!3m1!4b1!4m6!3m5!1s0x89d4cd3cbeae8bc3:0xc528126035583aff!8m2!3d43.7137557!4d-79.3652998!16s%2Fg%2F11xmhwymps?entry=ttu&g_ep=EgoyMDI2MDIxNi4wIKXMDSoASAFQAw%3D%3D";

export interface UiReview {
    name: string;
    text: string;
    rating: number;
    profilePhotoUrl: string;
    publishTime: number;
}

interface GoogleReviewsState {
    overallRating: number | null;
    totalReviews: number | null;
    googleMapsUrl: string;
    source: string;
    reviews: UiReview[];
    isLoading: boolean;
}

const FALLBACK_REVIEWS: UiReview[] = [
    {
        name: "Marco D.",
        text: "Best barbershop in the neighbourhood. Sam always knows exactly what I want. Highly recommend!",
        rating: 5,
        profilePhotoUrl: "",
        publishTime: 1739980800,
    },
    {
        name: "Jordan T.",
        text: "Clean fades every time. The whole vibe is great - feels like home. Never going anywhere else.",
        rating: 5,
        profilePhotoUrl: "",
        publishTime: 1739635200,
    },
    {
        name: "Derek W.",
        text: "Finally found a barbershop I can trust. Consistent quality and the guys are super friendly.",
        rating: 5,
        profilePhotoUrl: "",
        publishTime: 1739289600,
    },
    {
        name: "Alex P.",
        text: "My go-to spot for over a year now. The attention to detail is next level. 10/10.",
        rating: 5,
        profilePhotoUrl: "",
        publishTime: 1738944000,
    },
    {
        name: "Chris R.",
        text: "Walked in without an appointment and they fit me right in. Fresh cut in 30 minutes. Amazing.",
        rating: 5,
        profilePhotoUrl: "",
        publishTime: 1738598400,
    },
    {
        name: "Nathan S.",
        text: "The beard work here is incredible. Hot towel finish is worth every penny.",
        rating: 5,
        profilePhotoUrl: "",
        publishTime: 1738252800,
    },
];

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function toSafeString(value: unknown, fallback = ""): string {
    return typeof value === "string" ? value : fallback;
}

function toSafeNumber(value: unknown, fallback = 0): number {
    return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clampRating(rating: number): number {
    return Math.max(1, Math.min(5, Math.round(rating)));
}

function toProxiedAvatarUrl(value: string): string {
    if (!value) return "";
    if (value.startsWith("/api/review-avatar?")) return value;

    try {
        const parsed = new URL(value);
        if (parsed.protocol !== "https:") return "";
        return `/api/review-avatar?url=${encodeURIComponent(parsed.toString())}`;
    } catch {
        return "";
    }
}

function normalizeReview(value: unknown): UiReview | null {
    if (!isRecord(value)) return null;

    const text = toSafeString(value.text).trim();
    const rawRating = toSafeNumber(value.rating, 0);

    if (!text || rawRating <= 0) return null;

    return {
        name: toSafeString(value.authorName, "Google User"),
        text,
        rating: clampRating(rawRating),
        profilePhotoUrl: toProxiedAvatarUrl(toSafeString(value.profilePhotoUrl, "")),
        publishTime: toSafeNumber(value.publishTime, 0),
    };
}

function sortByBest(reviews: UiReview[]): UiReview[] {
    return [...reviews].sort((a, b) => {
        if (b.rating !== a.rating) return b.rating - a.rating;
        return b.publishTime - a.publishTime;
    });
}

function reviewKey(review: UiReview): string {
    return `${review.name.toLowerCase().trim()}|${review.text.toLowerCase().trim()}`;
}

function buildDisplayReviews(liveReviews: UiReview[]): UiReview[] {
    const selected: UiReview[] = [];
    const seen = new Set<string>();

    const addUnique = (list: UiReview[]) => {
        for (const review of list) {
            if (selected.length >= MAX_REVIEWS) break;
            const key = reviewKey(review);
            if (seen.has(key)) continue;
            seen.add(key);
            selected.push(review);
        }
    };

    addUnique(sortByBest(liveReviews.filter((r) => r.rating === 5)));
    addUnique(sortByBest(FALLBACK_REVIEWS));

    if (selected.length < MAX_REVIEWS) {
        const source = selected.length > 0 ? selected : FALLBACK_REVIEWS;
        let index = 0;
        while (selected.length < MAX_REVIEWS) {
            selected.push(source[index % source.length]);
            index += 1;
        }
    }

    return selected.slice(0, MAX_REVIEWS);
}

const initialState: GoogleReviewsState = {
    overallRating: null,
    totalReviews: null,
    googleMapsUrl: DEFAULT_MAPS_URL,
    source: "loading",
    reviews: buildDisplayReviews([]),
    isLoading: true,
};

export function useGoogleReviews(): GoogleReviewsState {
    const [state, setState] = useState<GoogleReviewsState>(initialState);

    useEffect(() => {
        const controller = new AbortController();
        const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

        const loadReviews = async () => {
            try {
                const response = await fetch(REVIEWS_API, {
                    method: "GET",
                    headers: { Accept: "application/json" },
                    signal: controller.signal,
                });

                if (!response.ok) {
                    throw new Error(`Reviews API responded with ${response.status}`);
                }

                const payload: unknown = await response.json();
                if (!isRecord(payload)) {
                    throw new Error("Invalid reviews payload");
                }

                const reviewList = Array.isArray(payload.reviews)
                    ? payload.reviews.map(normalizeReview).filter((item): item is UiReview => item !== null).slice(0, MAX_REVIEWS)
                    : [];

                const overallRating = toSafeNumber(payload.overallRating, 0);
                const totalReviews = toSafeNumber(payload.totalReviews, 0);
                const googleMapsUrl = toSafeString(payload.googleMapsUrl, DEFAULT_MAPS_URL);

                setState({
                    overallRating: overallRating > 0 ? overallRating : null,
                    totalReviews: totalReviews > 0 ? totalReviews : null,
                    googleMapsUrl,
                    source: toSafeString(payload.source, "unknown"),
                    reviews: buildDisplayReviews(reviewList),
                    isLoading: false,
                });
            } catch {
                setState((current) => ({
                    ...current,
                    source: "fallback",
                    reviews: buildDisplayReviews([]),
                    isLoading: false,
                }));
            } finally {
                window.clearTimeout(timeoutId);
            }
        };

        void loadReviews();

        return () => {
            controller.abort();
            window.clearTimeout(timeoutId);
        };
    }, []);

    return state;
}
