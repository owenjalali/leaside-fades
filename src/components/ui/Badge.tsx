import type { ReactNode } from "react";

import { cn } from "../../lib/utils.ts";

export type BadgeTone = "neutral" | "success" | "danger" | "warning" | "info";

const badgeToneClasses: Record<BadgeTone, string> = {
    neutral: "border border-border bg-surface-muted text-ink-muted",
    success: "bg-success-soft text-success",
    danger: "bg-danger-soft text-danger",
    warning: "bg-warning-soft text-warning",
    info: "bg-info-soft text-info",
};

export interface BadgeProps {
    tone?: BadgeTone;
    children: ReactNode;
    className?: string;
}

export function Badge({ tone = "neutral", children, className }: BadgeProps) {
    return (
        <span
            className={cn(
                "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
                badgeToneClasses[tone],
                className,
            )}
        >
            {children}
        </span>
    );
}
