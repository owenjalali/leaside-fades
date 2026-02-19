import { MapPin, Star, Clock, Phone } from "lucide-react";

const stats = [
    { icon: Star, label: "5.0 Rating", sub: "Google Reviews" },
    { icon: Clock, label: "Mon–Sat", sub: "Open 9AM–7PM" },
    { icon: MapPin, label: "Bayview Ave", sub: "East York, ON" },
    { icon: Phone, label: "(647) 471-5485", sub: "Call or Text" },
];

export default function TrustStrip() {
    return (
        <section className="bg-cream py-8 border-b border-green/10">
            <div className="max-w-7xl mx-auto px-4 md:px-8">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    {stats.map((stat) => (
                        <div key={stat.label} className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl bg-green/10 flex items-center justify-center shrink-0">
                                <stat.icon size={18} className="text-green" />
                            </div>
                            <div>
                                <p className="text-charcoal font-semibold text-sm">
                                    {stat.label}
                                </p>
                                <p className="text-charcoal/50 text-xs">{stat.sub}</p>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
