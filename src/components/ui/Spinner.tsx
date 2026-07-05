import { Loader2 } from "lucide-react";

import { cn } from "../../lib/utils.ts";

export interface SpinnerProps {
    size?: "sm" | "md";
    label?: string;
    className?: string;
}

export function Spinner({ size = "md", label = "Loading", className }: SpinnerProps) {
    return (
        <span role="status" className={cn("inline-flex items-center justify-center", className)}>
            <Loader2
                size={size === "sm" ? 16 : 20}
                aria-hidden="true"
                className="animate-spin text-ink-muted motion-reduce:animate-none"
            />
            <span className="sr-only">{label}</span>
        </span>
    );
}
