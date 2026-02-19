import { Star } from "lucide-react";
import AnimateOnScroll from "@/components/AnimateOnScroll";

const testimonials = [
    {
        name: "Marco D.",
        text: "Best barbershop in the neighbourhood. Sam always knows exactly what I want. Highly recommend!",
        rating: 5,
    },
    {
        name: "Jordan T.",
        text: "Clean fades every time. The whole vibe is great — feels like home. Never going anywhere else.",
        rating: 5,
    },
    {
        name: "Derek W.",
        text: "Finally found a barbershop I can trust. Consistent quality and the guys are super friendly.",
        rating: 5,
    },
    {
        name: "Alex P.",
        text: "My go-to spot for over a year now. The attention to detail is next level. 10/10.",
        rating: 5,
    },
    {
        name: "Chris R.",
        text: "Walked in without an appointment and they fit me right in. Fresh cut in 30 minutes. Amazing.",
        rating: 5,
    },
    {
        name: "Nathan S.",
        text: "The beard work here is incredible. Hot towel finish is *chef's kiss*. Worth every penny.",
        rating: 5,
    },
];

export default function Testimonials() {
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
                    {testimonials.map((t, i) => (
                        <AnimateOnScroll key={t.name} animation="fade-up" delay={i * 100}>
                            <div className="bg-white rounded-2xl p-6 border border-gray-100 shadow-sm hover:shadow-lg hover:border-green/20 transition-all duration-500">
                                <div className="flex gap-1 mb-4">
                                    {Array.from({ length: t.rating }).map((_, j) => (
                                        <Star
                                            key={j}
                                            size={16}
                                            className="text-green fill-green"
                                        />
                                    ))}
                                </div>
                                <p className="text-charcoal/70 text-sm leading-relaxed mb-4 italic">
                                    "{t.text}"
                                </p>
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-green/10 flex items-center justify-center">
                                        <span className="text-green font-bold text-xs">
                                            {t.name[0]}
                                        </span>
                                    </div>
                                    <span className="text-charcoal font-medium text-sm">
                                        {t.name}
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
