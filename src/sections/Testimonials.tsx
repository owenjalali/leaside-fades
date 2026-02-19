import { useState } from "react";
import { Star } from "lucide-react";
import AnimateOnScroll from "@/components/AnimateOnScroll";
import type { UiReview } from "@/lib/googleReviews";

interface TestimonialsProps {
    reviews: UiReview[];
}

function initials(name: string): string {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return "G";
    return parts
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("");
}

function normalizeStars(rating: number): number {
    return Math.max(1, Math.min(5, Math.round(rating)));
}

function truncateText(text: string, maxChars: number): string {
    const normalized = text.trim();
    if (normalized.length <= maxChars) return normalized;
    return `${normalized.slice(0, maxChars).trimEnd()}...`;
}

function ReviewAvatar({ name, profilePhotoUrl }: { name: string; profilePhotoUrl: string }) {
    const [imageError, setImageError] = useState(false);
    const showImage = !!profilePhotoUrl && !imageError;

    if (showImage) {
        return (
            <img
                src={profilePhotoUrl}
                alt={`${name} profile`}
                className="w-8 h-8 rounded-full object-cover"
                loading="lazy"
                decoding="async"
                referrerPolicy="no-referrer"
                onError={() => setImageError(true)}
            />
        );
    }

    return (
        <div className="w-8 h-8 rounded-full bg-green/10 flex items-center justify-center">
            <span className="text-green font-bold text-xs">{initials(name)}</span>
        </div>
    );
}

export default function Testimonials({ reviews }: TestimonialsProps) {
    return (
        <section id="reviews" className="section-padding bg-cream">
            <div className="max-w-7xl mx-auto">
                <AnimateOnScroll animation="fade-up">
                    <div className="text-center mb-14">
                        <p className="text-green text-sm font-semibold tracking-widest uppercase mb-3">
                            Reviews
                        </p>
                        <h2 className="font-display text-4xl md:text-5xl text-charcoal tracking-wide">
                            WHAT CLIENTS SAY
                        </h2>
                    </div>
                </AnimateOnScroll>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {reviews.map((review, i) => (
                        <AnimateOnScroll
                            key={`${review.name}-${i}`}
                            animation="fade-up"
                            delay={i * 100}
                        >
                            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-lg hover:border-green/20 transition-all duration-500 h-full flex flex-col">
                                <div className="flex gap-1 mb-4">
                                    {Array.from({ length: normalizeStars(review.rating) }).map(
                                        (_, j) => (
                                            <Star
                                                key={j}
                                                size={16}
                                                className="text-green fill-green"
                                            />
                                        ),
                                    )}
                                </div>
                                <p
                                    className="text-charcoal/70 text-sm leading-relaxed mb-4 italic min-h-[88px]"
                                    title={review.text}
                                >
                                    "{truncateText(review.text, 165)}"
                                </p>
                                <div className="flex items-center gap-3 mt-auto">
                                    <ReviewAvatar
                                        name={review.name}
                                        profilePhotoUrl={review.profilePhotoUrl}
                                    />
                                    <span className="text-charcoal font-medium text-sm">
                                        {review.name}
                                    </span>
                                </div>
                            </div>
                        </AnimateOnScroll>
                    ))}
                </div>
            </div>
        </section>
    );
}
