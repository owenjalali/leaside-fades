import type { ComponentProps, ReactNode } from "react";

import { cn } from "../../lib/utils.ts";

export interface CheckboxProps extends Omit<ComponentProps<"input">, "type"> {
    label?: ReactNode;
}

export function Checkbox({ label, className, children, ...props }: CheckboxProps) {
    return (
        <label className={cn("inline-flex cursor-pointer items-center gap-2.5 text-sm text-ink", className)}>
            <input
                type="checkbox"
                className={cn(
                    "size-4 rounded accent-forest",
                    "outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
                    "disabled:opacity-50 disabled:pointer-events-none",
                )}
                {...props}
            />
            {label ?? children}
        </label>
    );
}
