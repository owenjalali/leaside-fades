import { MapPin, Star, Clock } from "lucide-react";

interface TrustStripProps {
    overallRating: number | null;
    totalReviews: number | null;
}

export default function TrustStrip({ overallRating, totalReviews }: TrustStripProps) {
    const ratingLabel =
        typeof overallRating === "number" && overallRating > 0
            ? `${overallRating.toFixed(1)} / 5`
            : "Google Rating";
    const reviewsSubLabel =
        typeof totalReviews === "number" && totalReviews > 0
            ? `${totalReviews}+ Google reviews (Eglinton)`
            : "Google Reviews (Eglinton)";

    const stats = [
        { icon: Star, label: ratingLabel, sub: reviewsSubLabel },
        { icon: Clock, label: "Mon-Sat", sub: "Open 10AM-7PM" },
        { icon: MapPin, label: "2 East York Locations", sub: "Eglinton + Millwood" },
    ];

    return (
        <section className="bg-cream py-8 border-b border-green/10">
            <div className="max-w-5xl mx-auto px-4 md:px-8">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                    {stats.map((stat) => (
                        <div
                            key={stat.label}
                            className="mx-auto flex w-full max-w-[290px] items-center justify-start gap-3 sm:max-w-none sm:justify-center"
                        >
                            <div className="w-10 h-10 rounded-xl bg-green/10 flex items-center justify-center shrink-0">
                                <stat.icon size={18} className="text-green" />
                            </div>
                            <div className="text-left">
                                <p className="text-charcoal font-semibold text-sm">{stat.label}</p>
                                <p className="text-charcoal/50 text-xs">{stat.sub}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
