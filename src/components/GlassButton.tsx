import { cn } from "@/lib/utils";
import type { ReactNode, ButtonHTMLAttributes } from "react";

interface GlassButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
    children: ReactNode;
    className?: string;
}

export default function GlassButton({
    children,
    className,
    ...props
}: GlassButtonProps) {
    return (
        <button
            className={cn(
                "relative inline-flex items-center justify-center px-7 py-3 rounded-full font-semibold text-white border border-white/20 backdrop-blur-md bg-white/10 transition-all duration-300 hover:bg-white/20 hover:border-white/40 hover:shadow-lg hover:shadow-green/10 active:scale-95",
                className
            )}
            {...props}
        >
            <span className="relative z-10 flex items-center gap-2">{children}</span>
        </button>
    );
}
