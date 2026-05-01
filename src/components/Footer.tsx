import LocationActionMenu from "@/components/LocationActionMenu";
import { SHOP_LOCATIONS } from "@/data/locations";

export default function Footer() {
    const [eglinton, millwood] = SHOP_LOCATIONS;

    return (
        <footer className="bg-charcoal text-white">
            <div className="max-w-7xl mx-auto px-4 md:px-8 py-16">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
                    <div className="lg:col-span-1">
                        <div className="flex items-center gap-3 mb-4">
                            <img src="/assets/logo-transparent.png" alt="Leaside Fades" className="h-12" />
                            <span className="font-display text-xl text-white tracking-wider">
                                LEASIDE FADES
                            </span>
                        </div>
                        <p className="text-white/60 text-sm leading-relaxed">
                            East York's neighbourhood barbershop with locations on Eglinton and
                            Millwood.
                        </p>
                    </div>

                    <div>
                        <h4 className="font-display text-lg tracking-wider mb-4 text-green">
                            QUICK LINKS
                        </h4>
                        <ul className="space-y-2">
                            {[
                                { label: "Services", href: "#services" },
                                { label: "Gallery", href: "#gallery" },
                                { label: "Reviews", href: "#reviews" },
                                { label: "Team", href: "#team" },
                                { label: "FAQ", href: "#faq" },
                                { label: "Contact", href: "#contact" },
                            ].map((link) => (
                                <li key={link.href}>
                                    <a
                                        href={link.href}
                                        className="text-white/50 text-sm hover:text-green transition-colors"
                                    >
                                        {link.label}
                                    </a>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div>
                        <h4 className="font-display text-lg tracking-wider mb-4 text-green">HOURS</h4>
                        <ul className="space-y-2 text-white/50 text-sm">
                            <li className="flex justify-between">
                                <span>Monday - Saturday</span>
                                <span className="text-white/70">10AM - 7PM</span>
                            </li>
                            <li className="flex justify-between">
                                <span>Sunday</span>
                                <span className="text-white/70">10AM - 5PM</span>
                            </li>
                        </ul>
                    </div>

                    <div>
                        <h4 className="font-display text-lg tracking-wider mb-4 text-green">CONTACT</h4>
                        <ul className="space-y-3 text-white/50 text-sm mb-4">
                            <li>
                                <span className="text-white/80">Eglinton:</span> {eglinton.addressLine}, {" "}
                                {eglinton.cityLine}
                            </li>
                            <li>
                                <span className="text-white/80">Millwood:</span> {millwood.addressLine}, {" "}
                                {millwood.cityLine}
                            </li>
                            <li>
                                <a
                                    href={`tel:${eglinton.phoneE164}`}
                                    className="hover:text-green transition-colors"
                                >
                                    Eglinton: {eglinton.phoneDisplay}
                                </a>
                            </li>
                            <li>
                                <a
                                    href={`tel:${millwood.phoneE164}`}
                                    className="hover:text-green transition-colors"
                                >
                                    Millwood: {millwood.phoneDisplay}
                                </a>
                            </li>
                        </ul>
                        <div className="flex flex-wrap gap-2">
                            <LocationActionMenu
                                action="book"
                                label="Book"
                                align="right"
                                buttonClassName="bg-white text-charcoal hover:bg-cream px-4"
                            />
                            <LocationActionMenu
                                action="call"
                                label="Call"
                                align="right"
                                buttonClassName="bg-white/10 text-white border border-white/20 hover:bg-white/20 px-4"
                            />
                        </div>
                    </div>
                </div>

                <div className="mt-12 pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
                    <p className="text-white/30 text-xs">
                        © {new Date().getFullYear()} Leaside Fades. All rights reserved.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-4 md:justify-end">
                        <a
                            href="/admin/login"
                            className="text-white/30 text-xs hover:text-green transition-colors"
                        >
                            Staff login
                        </a>
                        <a
                            href={eglinton.mapsUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-white/30 text-xs hover:text-green transition-colors"
                        >
                            View Eglinton and Millwood on Google Maps
                        </a>
                    </div>
                </div>
            </div>
        </footer>
    );
}
