import { useState } from "react";
import { cn } from "@/lib/utils";
import AnimateOnScroll from "@/components/AnimateOnScroll";

const tabs = ["Men", "Ladies", "Boys"] as const;

interface Service {
    name: string;
    price: string;
    note?: string;
}

const services: Record<(typeof tabs)[number], Service[]> = {
    Men: [
        { name: "Haircut", price: "$30" },
        { name: "Haircut + Beard", price: "$40" },
        { name: "Buzz Cut", price: "$20" },
        { name: "Beard Trim / Line-Up", price: "$15" },
        { name: "Hair Design", price: "$10+", note: "add-on" },
        { name: "Hot Towel Shave", price: "$25" },
        { name: "Senior's Cut", price: "$22", note: "65+" },
    ],
    Ladies: [
        { name: "Short Haircut", price: "$30" },
        { name: "Buzz Cut", price: "$20" },
        { name: "Bang Trim", price: "$10" },
        { name: "Nape / Neck Cleanup", price: "$10" },
    ],
    Boys: [
        { name: "Boys Cut", price: "$22", note: "Ages 9 & under" },
        { name: "Boys Cut + Design", price: "$30", note: "Ages 9 & under" },
    ],
};

export default function Services() {
    const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("Men");

    return (
        <section id="services" className="section-padding bg-forest">
            <div className="max-w-4xl mx-auto">
                <AnimateOnScroll animation="fade-up">
                    <div className="text-center mb-10">
                        <p className="text-green text-sm font-semibold tracking-widest uppercase mb-3">
                            Our Services
                        </p>
                        <h2 className="font-display text-4xl md:text-5xl text-white tracking-wide">
                            SERVICES & PRICING
                        </h2>
                    </div>
                </AnimateOnScroll>

                {/* Tabs */}
                <AnimateOnScroll animation="fade-up" delay={100}>
                    <div className="flex justify-center gap-2 mb-8">
                        {tabs.map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={cn(
                                    "px-6 py-2.5 rounded-full text-sm font-semibold transition-all duration-300",
                                    activeTab === tab
                                        ? "bg-green text-white shadow-lg shadow-green/30"
                                        : "bg-white/10 text-white/60 hover:bg-white/15 hover:text-white"
                                )}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                </AnimateOnScroll>

                {/* Service List */}
                <AnimateOnScroll animation="fade-up" delay={200}>
                    <div className="bg-white/5 backdrop-blur-sm rounded-2xl border border-white/10 overflow-hidden">
                        {services[activeTab].map((service, i) => (
                            <div
                                key={service.name}
                                className={cn(
                                    "flex items-center justify-between px-6 md:px-8 py-5 transition-colors hover:bg-white/5",
                                    i !== services[activeTab].length - 1 &&
                                    "border-b border-white/5"
                                )}
                            >
                                <div className="flex items-center gap-3">
                                    <span className="text-white font-medium">{service.name}</span>
                                    {service.note && (
                                        <span className="text-xs text-green/70 bg-green/10 px-2 py-0.5 rounded-full">
                                            {service.note}
                                        </span>
                                    )}
                                </div>
                                <span className="text-green font-bold text-lg">
                                    {service.price}
                                </span>
                            </div>
                        ))}
                    </div>
                </AnimateOnScroll>

                {/* CTA */}
                <AnimateOnScroll animation="fade-up" delay={300}>
                    <div className="text-center mt-8">
                        <a
                            href="https://www.fresha.com/a/leaside-fades-east-york-1680-bayview-avenue-e5v8n6i4/booking"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center px-8 py-3 bg-green text-white font-bold rounded-full hover:bg-green-light transition-colors shadow-lg shadow-green/20"
                        >
                            Book Now on Fresha
                        </a>
                    </div>
                </AnimateOnScroll>
            </div>
        </section>
    );
}
