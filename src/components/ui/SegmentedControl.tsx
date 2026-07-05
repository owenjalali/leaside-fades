import type { ReactNode } from "react";

import { cn } from "../../lib/utils.ts";

export interface SegmentedControlOption {
    value: string;
    label: ReactNode;
}

export interface SegmentedControlProps {
    options: SegmentedControlOption[];
    value: string;
    onChange: (value: string) => void;
    "aria-label": string;
    className?: string;
}

export function SegmentedControl({
    options,
    value,
    onChange,
    "aria-label": ariaLabel,
    className,
}: SegmentedControlProps) {
    return (
        <div
            role="radiogroup"
            aria-label={ariaLabel}
            className={cn("inline-flex items-center gap-1 rounded-control bg-surface-muted p-1", className)}
        >
            {options.map((option) => {
                const active = option.value === value;
                return (
                    <button
                        key={option.value}
                        type="button"
                        role="radio"
                        aria-checked={active}
                        onClick={() => onChange(option.value)}
                        className={cn(
                            "h-8 rounded-md px-3 text-sm transition-colors duration-150",
                            "outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
                            "disabled:opacity-50 disabled:pointer-events-none",
                            active ? "bg-surface font-medium text-ink shadow-card" : "font-medium text-ink-muted hover:text-ink",
                        )}
                    >
                        {option.label}
                    </button>
                );
            })}
        </div>
    );
}
