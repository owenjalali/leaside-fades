import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { Menu, X } from "lucide-react";

const navLinks = [
    { label: "Services", href: "#services" },
    { label: "Gallery", href: "#gallery" },
    { label: "Reviews", href: "#reviews" },
    { label: "Team", href: "#team" },
    { label: "FAQ", href: "#faq" },
    { label: "Contact", href: "#contact" },
];

export default function Navbar() {
    const [scrolled, setScrolled] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 50);
        window.addEventListener("scroll", onScroll);
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    return (
        <>
            <nav
                className={cn(
                    "fixed top-0 left-0 right-0 z-50 transition-all duration-500",
                    scrolled
                        ? "bg-white/95 backdrop-blur-md shadow-lg py-3"
                        : "bg-black/20 backdrop-blur-sm py-5"
                )}
            >
                <div className="max-w-7xl mx-auto px-4 md:px-8 flex items-center justify-between">
                    {/* Logo */}
                    <a href="#" className="flex items-center gap-3 group">
                        <img
                            src="/assets/logo.png"
                            alt="Leaside Fades"
                            className={cn(
                                "transition-all duration-500 mix-blend-multiply",
                                scrolled ? "h-10" : "h-14"
                            )}
                        />
                        <span
                            className={cn(
                                "font-display tracking-wider transition-all duration-500",
                                scrolled
                                    ? "text-xl text-charcoal"
                                    : "text-2xl text-white drop-shadow-lg"
                            )}
                        >
                            LEASIDE FADES
                        </span>
                    </a>

                    {/* Desktop Links */}
                    <div className="hidden md:flex items-center gap-8">
                        {navLinks.map((link) => (
                            <a
                                key={link.href}
                                href={link.href}
                                className={cn(
                                    "transition-colors text-sm font-medium tracking-wide uppercase",
                                    scrolled
                                        ? "text-charcoal/70 hover:text-green"
                                        : "text-white/90 hover:text-green-light"
                                )}
                            >
                                {link.label}
                            </a>
                        ))}
                        <a
                            href="https://www.fresha.com/a/leaside-fades-east-york-1680-bayview-avenue-e5v8n6i4/booking"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="relative inline-flex items-center justify-center px-6 py-2.5 overflow-hidden font-medium text-white bg-green rounded-full group hover:bg-emerald transition-all duration-300 text-sm shadow-md"
                        >
                            <span className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-700" />
                            <span className="relative">Book Now</span>
                        </a>
                    </div>

                    {/* Mobile Hamburger */}
                    <button
                        className={cn("md:hidden p-2", scrolled ? "text-charcoal" : "text-white")}
                        onClick={() => setMobileOpen(!mobileOpen)}
                        aria-label="Toggle menu"
                    >
                        {mobileOpen ? <X size={24} /> : <Menu size={24} />}
                    </button>
                </div>
            </nav>

            {/* Mobile Drawer */}
            <div
                className={cn(
                    "fixed inset-0 z-40 bg-white/98 backdrop-blur-lg flex flex-col items-center justify-center gap-8 transition-all duration-500 md:hidden",
                    mobileOpen
                        ? "opacity-100 pointer-events-auto"
                        : "opacity-0 pointer-events-none"
                )}
            >
                {navLinks.map((link) => (
                    <a
                        key={link.href}
                        href={link.href}
                        onClick={() => setMobileOpen(false)}
                        className="text-charcoal text-2xl font-display tracking-widest hover:text-green transition-colors"
                    >
                        {link.label}
                    </a>
                ))}
                <a
                    href="https://www.fresha.com/a/leaside-fades-east-york-1680-bayview-avenue-e5v8n6i4/booking"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-4 px-8 py-3 bg-green text-white font-bold rounded-full text-lg hover:bg-emerald transition-colors"
                    onClick={() => setMobileOpen(false)}
                >
                    Book Now
                </a>
            </div>
        </>
    );
}
