import { MapPin, Phone, Clock, Navigation } from "lucide-react";
import AnimateOnScroll from "@/components/AnimateOnScroll";

export default function Contact() {
    return (
        <section id="contact" className="section-padding bg-white">
            <div className="max-w-7xl mx-auto">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
                    {/* Info */}
                    <div className="space-y-8">
                        <AnimateOnScroll animation="fade-right">
                            <div>
                                <p className="text-green text-sm font-semibold tracking-widest uppercase mb-3">
                                    Find Us
                                </p>
                                <h2 className="font-display text-4xl md:text-5xl text-charcoal tracking-wide">
                                    COME THROUGH
                                </h2>
                                <p className="text-gray-500 mt-4 max-w-lg">
                                    Located on Bayview Ave in East York. Easy TTC access, street
                                    parking available.
                                </p>
                            </div>
                        </AnimateOnScroll>

                        <AnimateOnScroll animation="fade-right" delay={100}>
                            <div className="space-y-5">
                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-green/10 flex items-center justify-center shrink-0 mt-0.5">
                                        <MapPin size={18} className="text-green" />
                                    </div>
                                    <div>
                                        <p className="text-charcoal font-medium">Address</p>
                                        <p className="text-gray-500 text-sm">
                                            1680 Bayview Ave, East York, ON M4G 3C4
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
                                            href="tel:+16474715485"
                                            className="text-gray-500 text-sm hover:text-green transition-colors"
                                        >
                                            (647) 471-5485
                                        </a>
                                    </div>
                                </div>

                                <div className="flex items-start gap-4">
                                    <div className="w-10 h-10 rounded-lg bg-green/10 flex items-center justify-center shrink-0 mt-0.5">
                                        <Clock size={18} className="text-green" />
                                    </div>
                                    <div>
                                        <p className="text-charcoal font-medium">Hours</p>
                                        <p className="text-gray-500 text-sm">
                                            Mon–Sat: 9AM – 7PM
                                            <br />
                                            Sun: 10AM – 5PM
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </AnimateOnScroll>

                        <AnimateOnScroll animation="fade-right" delay={200}>
                            <div className="flex flex-wrap gap-4">
                                <a
                                    href="https://maps.app.goo.gl/UbEJ2VDyDjNXhRsQA"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-green text-white font-medium hover:bg-emerald transition-colors shadow-md"
                                >
                                    <Navigation size={16} />
                                    Get Directions
                                </a>
                                <a
                                    href="tel:+16474715485"
                                    className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-charcoal/5 text-charcoal font-medium hover:bg-charcoal/10 transition-colors"
                                >
                                    <Phone size={16} />
                                    Call Now
                                </a>
                            </div>
                        </AnimateOnScroll>
                    </div>

                    {/* Map */}
                    <AnimateOnScroll animation="fade-left" delay={200}>
                        <div className="relative rounded-2xl overflow-hidden h-[400px] lg:h-[500px] border border-gray-100 shadow-sm">
                            <iframe
                                src="https://maps.google.com/maps?q=Leaside+Fades+1680+Bayview+Ave+East+York+ON&t=&z=15&ie=UTF8&iwloc=&output=embed"
                                width="100%"
                                height="100%"
                                style={{ border: 0 }}
                                allowFullScreen
                                loading="lazy"
                                referrerPolicy="no-referrer-when-downgrade"
                                title="Leaside Fades location"
                            />
                        </div>
                    </AnimateOnScroll>
                </div>
            </div>
        </section>
    );
}
