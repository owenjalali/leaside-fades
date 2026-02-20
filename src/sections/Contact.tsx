import { useState } from "react";
import { MapPin, Phone, Clock, Navigation } from "lucide-react";
import AnimateOnScroll from "@/components/AnimateOnScroll";
import LocationActionMenu from "@/components/LocationActionMenu";
import {
    DEFAULT_LOCATION_ID,
    SHOP_LOCATIONS,
    getLocationById,
    type ShopLocationId,
} from "@/data/locations";

export default function Contact() {
    const [activeLocationId, setActiveLocationId] =
        useState<ShopLocationId>(DEFAULT_LOCATION_ID);
    const activeLocation = getLocationById(activeLocationId);

    return (
        <section id="contact" className="section-padding bg-white relative z-30">
            <div className="max-w-7xl mx-auto">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-start">
                    <div className="space-y-8">
                        <AnimateOnScroll animation="fade-right">
                            <div>
                                <p className="text-green text-sm font-semibold tracking-widest uppercase mb-3">
                                    Find Us
                                </p>
                                <h2 className="font-display text-4xl md:text-5xl text-charcoal tracking-wide">
                                    TWO LOCATIONS
                                </h2>
                                <p className="text-gray-500 mt-4 max-w-lg">
                                    Choose your closest shop and book or call directly. Both locations
                                    follow the same schedule.
                                </p>
                            </div>
                        </AnimateOnScroll>

                        <AnimateOnScroll animation="fade-right" delay={100}>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                {SHOP_LOCATIONS.map((location) => {
                                    const isActive = location.id === activeLocationId;

                                    return (
                                        <button
                                            type="button"
                                            key={location.id}
                                            onClick={() => setActiveLocationId(location.id)}
                                            className={`text-left rounded-2xl border p-4 transition-all min-h-[132px] ${
                                                isActive
                                                    ? "border-green bg-green/5 shadow-sm"
                                                    : "border-gray-100 hover:border-green/50"
                                            }`}
                                        >
                                            <p className="text-charcoal font-semibold text-sm">
                                                {location.fullName}
                                            </p>
                                            <p className="text-charcoal/60 text-xs mt-2 leading-relaxed">
                                                {location.addressLine}
                                                <br />
                                                {location.cityLine}
                                            </p>
                                            <p className="text-charcoal/70 text-xs mt-3">
                                                {location.phoneDisplay}
                                            </p>
                                        </button>
                                    );
                                })}
                            </div>
                        </AnimateOnScroll>

                        <AnimateOnScroll animation="fade-right" delay={160}>
                            <div className="space-y-5">
                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-green/10 flex items-center justify-center shrink-0 mt-0.5">
                                        <MapPin size={18} className="text-green" />
                                    </div>
                                    <div>
                                        <p className="text-charcoal font-medium">Address</p>
                                        <p className="text-gray-500 text-sm">
                                            {activeLocation.addressLine}, {activeLocation.cityLine}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-green/10 flex items-center justify-center shrink-0 mt-0.5">
                                        <Phone size={18} className="text-green" />
                                    </div>
                                    <div>
                                        <p className="text-charcoal font-medium">Phone</p>
                                        <a
                                            href={`tel:${activeLocation.phoneE164}`}
                                            className="text-gray-500 text-sm hover:text-green transition-colors"
                                        >
                                            {activeLocation.phoneDisplay}
                                        </a>
                                    </div>
                                </div>

                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-green/10 flex items-center justify-center shrink-0 mt-0.5">
                                        <Clock size={18} className="text-green" />
                                    </div>
                                    <div>
                                        <p className="text-charcoal font-medium">Hours</p>
                                        <p className="text-gray-500 text-sm">{activeLocation.hoursLabel}</p>
                                    </div>
                                </div>
                            </div>
                        </AnimateOnScroll>

                        <AnimateOnScroll animation="fade-right" delay={220} className="relative z-40">
                            <div className="flex flex-wrap gap-3">
                                <a
                                    href={activeLocation.mapsUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-green text-white font-medium hover:bg-emerald transition-colors shadow-md min-h-[44px]"
                                >
                                    <Navigation size={16} />
                                    Get Directions
                                </a>
                                <LocationActionMenu
                                    action="book"
                                    label="Book Now"
                                    buttonClassName="bg-charcoal text-white hover:bg-charcoal/90"
                                />
                                <LocationActionMenu
                                    action="call"
                                    label="Call"
                                    buttonClassName="bg-charcoal/5 text-charcoal border border-charcoal/10 hover:bg-charcoal/10"
                                />
                            </div>
                        </AnimateOnScroll>
                    </div>

                    <AnimateOnScroll animation="fade-left" delay={200}>
                        <div className="relative rounded-2xl overflow-hidden h-[400px] lg:h-[500px] border border-gray-100 shadow-sm">
                            <iframe
                                src={activeLocation.mapEmbedUrl}
                                width="100%"
                                height="100%"
                                style={{ border: 0 }}
                                allowFullScreen
                                loading="lazy"
                                referrerPolicy="no-referrer-when-downgrade"
                                title={`${activeLocation.fullName} map`}
                            />
                        </div>
                    </AnimateOnScroll>
                </div>
            </div>
        </section>
    );
}
