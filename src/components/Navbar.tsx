import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { Menu, X } from "lucide-react";
import LocationActionMenu from "@/components/LocationActionMenu";

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
                        : "bg-black/20 backdrop-blur-sm py-5",
                )}
            >
                <div className="max-w-7xl mx-auto px-4 md:px-8 flex items-center justify-between">
                    <a href="#" className="flex items-center gap-3 group">
                        <img
                            src="/assets/logo-transparent.png"
                            alt="Leaside Fades"
                            className={cn("transition-all duration-500", scrolled ? "h-10" : "h-14")}
                        />
                        <span
                            className={cn(
                                "font-display tracking-wider transition-all duration-500",
                                scrolled
                                    ? "text-xl text-charcoal"
                                    : "text-2xl text-white drop-shadow-lg",
                            )}
                        >
                            LEASIDE FADES
                        </span>
                    </a>

                    <div className="hidden md:flex items-center gap-5">
                        {navLinks.map((link) => (
                            <a
                                key={link.href}
                                href={link.href}
                                className={cn(
                                    "transition-colors text-sm font-medium tracking-wide uppercase",
                                    scrolled
                                        ? "text-charcoal/70 hover:text-green"
                                        : "text-white/90 hover:text-green-light",
                                )}
                            >
                                {link.label}
                            </a>
                        ))}

                        <LocationActionMenu
                            action="book"
                            label="Book Now"
                            align="right"
                            buttonClassName="bg-green text-white hover:bg-emerald shadow-md"
                        />

                        <LocationActionMenu
                            action="call"
                            label="Call"
                            align="right"
                            buttonClassName={cn(
                                "border",
                                scrolled
                                    ? "bg-charcoal/5 text-charcoal border-charcoal/10 hover:bg-charcoal/10"
                                    : "bg-white/10 text-white border-white/25 hover:bg-white/20",
                            )}
                            menuClassName="right-0"
                        />
                    </div>

                    <button
                        className={cn("md:hidden p-2", scrolled ? "text-charcoal" : "text-white")}
                        onClick={() => setMobileOpen(!mobileOpen)}
                        aria-label="Toggle menu"
                    >
                        {mobileOpen ? <X size={24} /> : <Menu size={24} />}
                    </button>
                </div>
            </nav>

            <div
                className={cn(
                    "fixed inset-0 z-40 bg-white/98 backdrop-blur-lg flex flex-col items-center justify-center gap-8 px-6 transition-all duration-500 md:hidden",
                    mobileOpen ? "opacity-100 pointer-events-auto" : "opacity-0 pointer-events-none",
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

                <div className="w-full max-w-xs space-y-3 mt-2">
                    <LocationActionMenu
                        action="book"
                        label="Book Now"
                        buttonClassName="w-full justify-between bg-green text-white hover:bg-emerald"
                        menuClassName="left-0 w-full"
                        onActionSelect={() => setMobileOpen(false)}
                    />

                    <LocationActionMenu
                        action="call"
                        label="Call"
                        buttonClassName="w-full justify-between bg-charcoal/5 text-charcoal border border-charcoal/10 hover:bg-charcoal/10"
                        menuClassName="left-0 w-full"
                        onActionSelect={() => setMobileOpen(false)}
                    />
                </div>
            </div>
        </>
    );
}
