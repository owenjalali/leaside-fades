import type { ReactNode } from "react";

import { cn } from "../../lib/utils.ts";

export interface CardSectionProps {
    children?: ReactNode;
    className?: string;
}

export function Card({ children, className }: CardSectionProps) {
    return (
        <div className={cn("rounded-card border border-border bg-surface shadow-card", className)}>
            {children}
        </div>
    );
}

export function CardHeader({ children, className }: CardSectionProps) {
    return (
        <div className={cn("flex items-start justify-between gap-3 px-5 pt-5", className)}>
            {children}
        </div>
    );
}

export function CardTitle({ children, className }: CardSectionProps) {
    return <h2 className={cn("text-xl font-semibold text-ink", className)}>{children}</h2>;
}

export function CardBody({ children, className }: CardSectionProps) {
    return <div className={cn("px-5 py-4", className)}>{children}</div>;
}

export function CardFooter({ children, className }: CardSectionProps) {
    return <div className={cn("px-5 pb-5", className)}>{children}</div>;
}

export interface MetricProps {
    label: string;
    value: ReactNode;
    hint?: string;
    className?: string;
}

export function Metric({ label, value, hint, className }: MetricProps) {
    return (
        <div className={cn("flex flex-col gap-1", className)}>
            <span className="text-xs font-medium text-ink-muted">{label}</span>
            <span className="text-2xl font-semibold tabular-nums text-ink">{value}</span>
            {hint ? <span className="text-xs text-ink-faint">{hint}</span> : null}
        </div>
    );
}
