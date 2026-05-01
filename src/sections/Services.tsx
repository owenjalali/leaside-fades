import { useState } from "react";
import { cn } from "@/lib/utils";
import AnimateOnScroll from "@/components/AnimateOnScroll";
import LocationActionMenu from "@/components/LocationActionMenu";
import {
    marketingServiceTabs,
    serviceTabLabels,
    type MarketingServiceTab,
} from "@/data/marketing-services";

export default function Services() {
    const [activeTab, setActiveTab] = useState<MarketingServiceTab>("Men");

    return (
        <section id="services" className="section-padding bg-[#f5f5f5] relative z-20">
            <div className="max-w-4xl mx-auto">
                <AnimateOnScroll animation="fade-up">
                    <div className="text-center mb-10">
                        <p className="text-green text-sm font-semibold tracking-widest uppercase mb-3">
                            Our Services
                        </p>
                        <h2 className="font-display text-4xl md:text-5xl text-charcoal tracking-wide">
                            SERVICES & PRICING
                        </h2>
                    </div>
                </AnimateOnScroll>

                {/* Tabs */}
                <AnimateOnScroll animation="fade-up" delay={100}>
                    <div className="flex justify-center gap-2 mb-8">
                        {serviceTabLabels.map((tab) => (
                            <button
                                key={tab}
                                onClick={() => setActiveTab(tab)}
                                className={cn(
                                    "px-6 py-2.5 rounded-full text-sm font-semibold transition-all duration-300",
                                    activeTab === tab
                                        ? "bg-green text-white shadow-lg shadow-green/30"
                                        : "bg-charcoal/5 text-charcoal/50 hover:bg-charcoal/10 hover:text-charcoal"
                                )}
                            >
                                {tab}
                            </button>
                        ))}
                    </div>
                </AnimateOnScroll>

                {/* Service List */}
                <AnimateOnScroll animation="fade-up" delay={200}>
                    <div className="rounded-2xl border border-[#83ecd8]/35 overflow-hidden bg-gradient-to-br from-[#0f2b2a] via-[#153d39] to-[#1a4a44] shadow-[0_22px_48px_rgba(13,85,78,0.35)]">
                        {marketingServiceTabs[activeTab].map((group, gi) => (
                            <div key={gi}>
                                {group.heading && (
                                    <div className="px-6 md:px-8 pt-6 pb-2">
                                        <h3 className="text-green/80 text-xs font-semibold tracking-widest uppercase lg:text-[#9ef1e0]">
                                            {group.heading}
                                        </h3>
                                    </div>
                                )}
                                {group.items.map((service, i) => (
                                    <div
                                        key={service.slug}
                                        className={cn(
                                            "flex items-center justify-between px-6 md:px-8 py-4 transition-colors hover:bg-white/[0.03] lg:transition-all lg:duration-300 lg:hover:bg-[#1e5852]/45 lg:hover:ring-1 lg:hover:ring-[#9ef1e0]/75 lg:hover:shadow-[0_0_24px_rgba(83,215,189,0.45)] lg:hover:scale-[1.01]",
                                            i !== group.items.length - 1 &&
                                            "border-b border-white/[0.04]",
                                            gi !== marketingServiceTabs[activeTab].length - 1 &&
                                            i === group.items.length - 1 &&
                                            "border-b border-white/[0.08]"
                                        )}
                                    >
                                        <div className="flex min-w-0 flex-1 flex-col gap-1 pr-4 sm:flex-row sm:items-center sm:gap-3">
                                            <span className="min-w-0 break-words text-white/90 font-medium text-sm lg:text-[#dbfff7]">
                                                {service.name}
                                            </span>
                                            <span className="w-fit shrink-0 text-xs text-green/60 bg-green/10 px-2 py-0.5 rounded-full lg:text-[#b4f8ea] lg:bg-[#72e6cf]/20">
                                                {service.durationMinutes} min
                                            </span>
                                        </div>
                                        <span className="shrink-0 text-green font-bold text-base lg:text-[#96f8e5]">
                                            {service.displayPrice}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                </AnimateOnScroll>

                {/* CTA */}
                <AnimateOnScroll animation="fade-up" delay={300} className="relative z-40">
                    <div className="text-center mt-8">
                        <LocationActionMenu
                            action="book"
                            label="Book Now"
                            position="static"
                            buttonClassName="bg-green text-white font-bold hover:bg-green-light px-8 py-3 shadow-lg shadow-green/20"
                        />
                    </div>
                </AnimateOnScroll>
            </div>
        </section>
    );
}
