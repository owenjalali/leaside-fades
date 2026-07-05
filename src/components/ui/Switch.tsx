import * as SwitchPrimitive from "@radix-ui/react-switch";
import type { ComponentProps } from "react";

import { cn } from "../../lib/utils.ts";

export interface SwitchProps extends ComponentProps<typeof SwitchPrimitive.Root> {
    /** Optional inline label rendered to the right of the control. */
    label?: string;
}

export function Switch({ label, className, ...props }: SwitchProps) {
    const control = (
        <SwitchPrimitive.Root
            className={cn(
                "h-6 w-10 shrink-0 rounded-full bg-border-strong transition-colors duration-150 data-[state=checked]:bg-forest",
                "outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 focus-visible:ring-offset-canvas",
                "disabled:opacity-50 disabled:pointer-events-none",
                className,
            )}
            {...props}
        >
            <SwitchPrimitive.Thumb className="block size-5 translate-x-0.5 rounded-full bg-surface shadow-card transition-transform duration-150 data-[state=checked]:translate-x-[18px]" />
        </SwitchPrimitive.Root>
    );

    if (!label) {
        return control;
    }

    return (
        <label className="inline-flex items-center gap-2.5 text-sm text-ink">
            {control}
            <span>{label}</span>
        </label>
    );
}
