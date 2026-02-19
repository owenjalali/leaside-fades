import { useState } from "react";
import { cn } from "@/lib/utils";
import AnimateOnScroll from "@/components/AnimateOnScroll";

const tabs = ["Men", "Ladies", "Boys"] as const;

interface Service {
    name: string;
    price: string;
    note?: string;
}

interface ServiceGroup {
    heading?: string;
    items: Service[];
}

const services: Record<(typeof tabs)[number], ServiceGroup[]> = {
    Men: [
        {
            items: [
                { name: "Cut", price: "$30" },
                { name: "Long Hair", price: "$35" },
                { name: "Senior Citizens", price: "$28" },
                { name: "Fade", price: "$35" },
                { name: "Bald Fade", price: "$45" },
                { name: "Line Up", price: "$15" },
                { name: "Beard Trim", price: "$15" },
                { name: "Beard Shave (Machine)", price: "$25" },
                { name: "Hot Lather Shave", price: "$55" },
                { name: "Hot Lather Head Shave", price: "$55" },
                { name: "Wash & Style", price: "$15" },
                { name: "Wash", price: "$5" },
            ],
        },
    ],
    Ladies: [
        {
            items: [
                { name: "Cut", price: "$45" },
                { name: "Wash & Blow Dry", price: "$35" },
                { name: "Wash", price: "$15" },
                { name: "Colour", price: "$80" },
                { name: "Root Touch Up", price: "$55" },
            ],
        },
        {
            heading: "Foil Highlight",
            items: [
                { name: "Half Head", price: "$95" },
                { name: "Full Head", price: "$150" },
                { name: "Single Pack", price: "$15" },
                { name: "Eight Pack", price: "$55" },
            ],
        },
        {
            heading: "Long Hair (Extra Charge)",
            items: [{ name: "Wash", price: "$10" }],
        },
    ],
    Boys: [
        {
            items: [{ name: "Cut", price: "$25", note: "Ages 9 & under" }],
        },
    ],
};

export default function Services() {
    const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("Men");

    return (
        <section id="services" className="section-padding bg-[#0a0a0a]">
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
                                        : "bg-white/5 text-white/50 hover:bg-white/10 hover:text-white"
                                )}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                </AnimateOnScroll>

                {/* Service List */}
                <AnimateOnScroll animation="fade-up" delay={200}>
                    <div className="bg-white/[0.03] backdrop-blur-sm rounded-2xl border border-white/[0.06] overflow-hidden">
                        {services[activeTab].map((group, gi) => (
                            <div key={gi}>
                                {group.heading && (
                                    <div className="px-6 md:px-8 pt-6 pb-2">
                                        <h3 className="text-green/80 text-xs font-semibold tracking-widest uppercase">
                                            {group.heading}
                                        </h3>
                                    </div>
                                )}
                                {group.items.map((service, i) => (
                                    <div
                                        key={service.name + group.heading}
                                        className={cn(
                                            "flex items-center justify-between px-6 md:px-8 py-4 transition-colors hover:bg-white/[0.03]",
                                            i !== group.items.length - 1 &&
                                            "border-b border-white/[0.04]",
                                            gi !== services[activeTab].length - 1 &&
                                            i === group.items.length - 1 &&
                                            "border-b border-white/[0.08]"
                                        )}
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="text-white/90 font-medium text-sm">
                                                {service.name}
                                            </span>
                                            {service.note && (
                                                <span className="text-xs text-green/60 bg-green/10 px-2 py-0.5 rounded-full">
                                                    {service.note}
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-green font-bold text-base">
                                            {service.price}
                                        </span>
                                    </div>
                                ))}
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
