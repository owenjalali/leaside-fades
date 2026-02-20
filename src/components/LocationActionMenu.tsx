import { useEffect, useId, useRef, useState } from "react";
import { CalendarCheck2, ChevronDown, Phone } from "lucide-react";
import { cn } from "@/lib/utils";
import { SHOP_LOCATIONS, type ShopLocation } from "@/data/locations";

type LocationAction = "book" | "call";
type MenuAlign = "left" | "right";

interface LocationActionMenuProps {
    action: LocationAction;
    label: string;
    align?: MenuAlign;
    buttonClassName?: string;
    menuClassName?: string;
    itemClassName?: string;
    locations?: readonly ShopLocation[];
    onActionSelect?: () => void;
}

function getHref(location: ShopLocation, action: LocationAction): string {
    if (action === "call") {
        return `tel:${location.phoneE164}`;
    }
    return location.bookingUrl;
}

function getDetailLabel(location: ShopLocation, action: LocationAction): string {
    if (action === "call") {
        return location.phoneDisplay;
    }
    return `${location.addressLine}, ${location.cityLine}`;
}

export default function LocationActionMenu({
    action,
    label,
    align = "left",
    buttonClassName,
    menuClassName,
    itemClassName,
    locations = SHOP_LOCATIONS,
    onActionSelect,
}: LocationActionMenuProps) {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const instanceId = useId().replace(/:/g, "");
    const buttonId = `${action}-location-menu-button-${instanceId}`;
    const menuId = `${action}-location-menu-${instanceId}`;
    const Icon = action === "book" ? CalendarCheck2 : Phone;

    useEffect(() => {
        const handlePointerDown = (event: MouseEvent | TouchEvent) => {
            const target = event.target as Node | null;
            if (!target) return;
            if (!containerRef.current?.contains(target)) {
                setOpen(false);
            }
        };

        const handleKeyDown = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                setOpen(false);
            }
        };

        document.addEventListener("mousedown", handlePointerDown);
        document.addEventListener("touchstart", handlePointerDown);
        document.addEventListener("keydown", handleKeyDown);

        return () => {
            document.removeEventListener("mousedown", handlePointerDown);
            document.removeEventListener("touchstart", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, []);

    return (
        <div ref={containerRef} className={cn("relative", open && "z-[200]")}>
            <button
                type="button"
                id={buttonId}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-controls={open ? menuId : undefined}
                onClick={() => setOpen((current) => !current)}
                className={cn(
                    "inline-flex min-h-[44px] items-center gap-2 rounded-full px-6 py-2.5 text-sm font-medium transition-colors",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green/50 focus-visible:ring-offset-2",
                    buttonClassName,
                )}
            >
                <Icon size={16} />
                <span>{label}</span>
                <ChevronDown
                    size={16}
                    className={cn("transition-transform duration-200", open && "rotate-180")}
                />
            </button>

            {open && (
                <div
                    id={menuId}
                    role="menu"
                    aria-labelledby={buttonId}
                    className={cn(
                        "absolute z-[210] mt-2 w-[280px] rounded-xl border border-charcoal/10 bg-white p-2 shadow-xl",
                        align === "right" ? "right-0" : "left-0",
                        menuClassName,
                    )}
                >
                    {locations.map((location) => {
                        const href = getHref(location, action);
                        const detail = getDetailLabel(location, action);

                        return (
                            <a
                                key={`${action}-${location.id}`}
                                role="menuitem"
                                href={href}
                                target={action === "book" ? "_blank" : undefined}
                                rel={action === "book" ? "noopener noreferrer" : undefined}
                                onClick={() => {
                                    setOpen(false);
                                    onActionSelect?.();
                                }}
                                className={cn(
                                    "flex cursor-pointer flex-col rounded-lg px-3 py-2.5 transition-colors hover:bg-charcoal/5",
                                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green/50",
                                    itemClassName,
                                )}
                            >
                                <span className="text-sm font-semibold text-charcoal">
                                    {location.fullName}
                                </span>
                                <span className="text-xs text-charcoal/60">{detail}</span>
                            </a>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
