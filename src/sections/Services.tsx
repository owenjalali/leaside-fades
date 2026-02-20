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
        <section id="services" className="section-padding bg-[#f5f5f5]">
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
                        {tabs.map((tab) => (
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
                        {services[activeTab].map((group, gi) => (
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
                                        key={service.name + group.heading}
                                        className={cn(
                                            "flex items-center justify-between px-6 md:px-8 py-4 transition-colors hover:bg-white/[0.03] lg:transition-all lg:duration-300 lg:hover:bg-[#1e5852]/45 lg:hover:ring-1 lg:hover:ring-[#9ef1e0]/75 lg:hover:shadow-[0_0_24px_rgba(83,215,189,0.45)] lg:hover:scale-[1.01]",
                                            i !== group.items.length - 1 &&
                                            "border-b border-white/[0.04]",
                                            gi !== services[activeTab].length - 1 &&
                                            i === group.items.length - 1 &&
                                            "border-b border-white/[0.08]"
                                        )}
                                    >
                                        <div className="flex items-center gap-3">
                                            <span className="text-white/90 font-medium text-sm lg:text-[#dbfff7]">
                                                {service.name}
                                            </span>
                                            {service.note && (
                                                <span className="text-xs text-green/60 bg-green/10 px-2 py-0.5 rounded-full lg:text-[#b4f8ea] lg:bg-[#72e6cf]/20">
                                                    {service.note}
                                                </span>
                                            )}
                                        </div>
                                        <span className="text-green font-bold text-base lg:text-[#96f8e5]">
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
                            href="https://www.fresha.com/a/leasidefades-toronto-866-eglinton-avenue-east-oyz3pt1m?preview=35767ad4-91b3-4aea-a890-bf79b66c2a81&pId=2797003&_gl=1*1essaaw*_gcl_aw*R0NMLjE3NzE1MjY0ODIuQ2owS0NRaUFodHZNQmhEQkFSSXNBTDI2cGpId29mSEkxZl9WYWtabkdWOU5DbHJrLVF2SEwxc2pjWnctZ0Z5MU0xeEIzbFhpZ1hNUlk4WWFBaDhsRUFMd193Y0I.*_gcl_au*MTQzOTg5MjA1MS4xNzY5NDU5MjI4LjEwNDY3OTA5OTAuMTc3MTUyNjUyMi4xNzcxNTI2NTIy*_ga*MTI1OTQ0MDQxNC4xNzY5NDU5MjI4*_ga_SMQNG7NE8C*czE3NzE1MzYxNjckbzEyJGcxJHQxNzcxNTQ1MjQ3JGozMiRsMCRoMA.."
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
