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
        desc: "Drop by anytime we're open and we'll get you right in the chair.",
    },
    {
        icon: Award,
        title: "Premium Experience",
        desc: "Hot towels, quality products, and attention to detail. A barbershop experience done right.",
    },
];

export default function Features() {
    return (
        <section className="section-padding bg-[#fafafa]">
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
                            <div className="group text-center p-8 rounded-2xl border border-[#8ae9d6]/40 bg-gradient-to-br from-[#dffdf6] via-[#d3f6ed] to-[#c5efe5] shadow-[0_14px_32px_rgba(27,128,112,0.16)] transition-all duration-500 lg:hover:-translate-y-1.5 lg:hover:scale-[1.02] lg:hover:border-[#6de7d0] lg:hover:shadow-[0_0_30px_rgba(83,215,189,0.45),0_22px_40px_rgba(16,98,85,0.28)]">
                                <div className="w-14 h-14 rounded-2xl bg-[#8deedc]/30 flex items-center justify-center mx-auto mb-6 transition-colors lg:group-hover:bg-[#74e7d2]/45">
                                    <f.icon size={24} className="text-green" />
                                </div>
                                <h3 className="font-display text-2xl text-[#134139] tracking-wider mb-3">
                                    {f.title.toUpperCase()}
                                </h3>
                                <p className="text-[#24524a]/85 text-sm leading-relaxed">
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
