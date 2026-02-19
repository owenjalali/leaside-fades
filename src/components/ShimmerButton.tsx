import { cn } from "@/lib/utils";
import type { ReactNode, ButtonHTMLAttributes } from "react";

interface ShimmerButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    children: ReactNode;
    className?: string;
    shimmerColor?: string;
    background?: string;
}

export default function ShimmerButton({
    children,
    className,
    shimmerColor = "rgba(255,255,255,0.3)",
    background = "#52b788",
    ...props
}: ShimmerButtonProps) {
    return (
        <button
            className={cn(
                "relative inline-flex items-center justify-center overflow-hidden rounded-full px-8 py-3.5 font-bold text-charcoal transition-all duration-300 hover:scale-105 hover:shadow-xl hover:shadow-green/20 active:scale-95",
                className
            )}
            style={{ background }}
            {...props}
        >
            {/* Shimmer effect */}
            <span
                className="absolute inset-0 animate-shimmer"
                style={{
                    background: `linear-gradient(110deg, transparent 25%, ${shimmerColor} 50%, transparent 75%)`,
                    backgroundSize: "200% 100%",
                }}
            />
            <span className="relative z-10 flex items-center gap-2">{children}</span>
        </button>
    );
}
