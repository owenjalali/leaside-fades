import { Scissors, Clock, Award } from "lucide-react";
import AnimateOnScroll from "@/components/AnimateOnScroll";

const features = [
    {
        icon: Scissors,
        title: "Precision Fades",
        desc: "Master-level fades, tapers, and lineups. Every cut is crafted with surgical precision.",
    },
    {
        icon: Clock,
        title: "Walk-Ins Welcome",
        desc: "No appointment needed. Drop by anytime we're open and we'll get you right in the chair.",
    },
    {
        icon: Award,
        title: "Premium Experience",
        desc: "Hot towels, quality products, and attention to detail. A barbershop experience done right.",
    },
];

export default function Features() {
    return (
        <section className="section-padding bg-white">
            <div className="max-w-7xl mx-auto">
                <AnimateOnScroll animation="fade-up">
                    <div className="text-center mb-14">
                        <p className="text-green text-sm font-semibold tracking-widest uppercase mb-3">
                            Why Leaside Fades
                        </p>
                        <h2 className="font-display text-4xl md:text-5xl text-charcoal tracking-wide">
                            THE DIFFERENCE
                        </h2>
                    </div>
                </AnimateOnScroll>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {features.map((f, i) => (
                        <AnimateOnScroll key={f.title} animation="fade-up" delay={i * 150}>
                            <div className="group text-center p-8 rounded-2xl border border-gray-100 hover:border-green/20 hover:shadow-xl hover:shadow-green/5 transition-all duration-500 bg-white">
                                <div className="w-14 h-14 rounded-2xl bg-green/10 flex items-center justify-center mx-auto mb-6 group-hover:bg-green/20 transition-colors">
                                    <f.icon size={24} className="text-green" />
                                </div>
                                <h3 className="font-display text-2xl text-charcoal tracking-wider mb-3">
                                    {f.title.toUpperCase()}
                                </h3>
                                <p className="text-charcoal/60 text-sm leading-relaxed">
                                    {f.desc}
                                </p>
                            </div>
                        </AnimateOnScroll>
                    ))}
                </div>
            </div>
        </section>
    );
}
