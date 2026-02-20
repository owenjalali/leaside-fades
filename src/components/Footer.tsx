export default function Footer() {
    return (
        <footer className="bg-charcoal text-white">
            <div className="max-w-7xl mx-auto px-4 md:px-8 py-16">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10">
                    {/* Brand */}
                    <div className="lg:col-span-1">
                        <div className="flex items-center gap-3 mb-4">
                            <img
                                src="/assets/logo-transparent.png"
                                alt="Leaside Fades"
                                className="h-12"
                            />
                            <span className="font-display text-xl text-white tracking-wider">
                                LEASIDE FADES
                            </span>
                        </div>
                        <p className="text-white/50 text-sm leading-relaxed">
                            East York's neighbourhood barbershop. Precision cuts, walk-ins
                            welcome, and a fresh experience every time.
                        </p>
                    </div>

                    {/* Quick Links */}
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

                    {/* Hours */}
                    <div>
                        <h4 className="font-display text-lg tracking-wider mb-4 text-green">
                            HOURS
                        </h4>
                        <ul className="space-y-2 text-white/50 text-sm">
                            <li className="flex justify-between">
                                <span>Monday – Saturday</span>
                                <span className="text-white/70">10AM – 7PM</span>
                            </li>
                            <li className="flex justify-between">
                                <span>Sunday</span>
                                <span className="text-white/70">10AM – 5PM</span>
                            </li>
                        </ul>
                    </div>

                    {/* Contact */}
                    <div>
                        <h4 className="font-display text-lg tracking-wider mb-4 text-green">
                            CONTACT
                        </h4>
                        <ul className="space-y-3 text-white/50 text-sm">
                            <li>1680 Bayview Ave, East York, ON M4G 3C4</li>
                            <li>
                                <a
                                    href="tel:+16474715485"
                                    className="hover:text-green transition-colors"
                                >
                                    (647) 471-5485
                                </a>
                            </li>
                            <li>
                                <a
                                    href="https://www.fresha.com/a/leasidefades-toronto-866-eglinton-avenue-east-oyz3pt1m?preview=35767ad4-91b3-4aea-a890-bf79b66c2a81&pId=2797003&_gl=1*1essaaw*_gcl_aw*R0NMLjE3NzE1MjY0ODIuQ2owS0NRaUFodHZNQmhEQkFSSXNBTDI2cGpId29mSEkxZl9WYWtabkdWOU5DbHJrLVF2SEwxc2pjWnctZ0Z5MU0xeEIzbFhpZ1hNUlk4WWFBaDhsRUFMd193Y0I.*_gcl_au*MTQzOTg5MjA1MS4xNzY5NDU5MjI4LjEwNDY3OTA5OTAuMTc3MTUyNjUyMi4xNzcxNTI2NTIy*_ga*MTI1OTQ0MDQxNC4xNzY5NDU5MjI4*_ga_SMQNG7NE8C*czE3NzE1MzYxNjckbzEyJGcxJHQxNzcxNTQ1MjQ3JGozMiRsMCRoMA.."
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="hover:text-green transition-colors"
                                >
                                    Book on Fresha →
                                </a>
                            </li>
                        </ul>
                    </div>
                </div>

                {/* Bottom bar */}
                <div className="mt-12 pt-8 border-t border-white/10 flex flex-col md:flex-row items-center justify-between gap-4">
                    <p className="text-white/30 text-xs">
                        © {new Date().getFullYear()} Leaside Fades. All rights reserved.
                    </p>
                    <a
                        href="https://maps.app.goo.gl/UbEJ2VDyDjNXhRsQA"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-white/30 text-xs hover:text-green transition-colors"
                    >
                        📍 1680 Bayview Ave, East York
                    </a>
                </div>
            </div>
        </footer>
    );
}
