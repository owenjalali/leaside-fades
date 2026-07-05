import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { ComponentPropsWithoutRef, ReactElement, ReactNode } from "react";

import { cn } from "../../lib/utils.ts";

export const tooltipContentClasses =
    "z-50 rounded-control bg-rail px-2 py-1 text-xs font-medium text-white shadow-pop animate-fade-in motion-reduce:animate-none";

export interface TooltipProviderProps
    extends ComponentPropsWithoutRef<typeof TooltipPrimitive.Provider> {
    children: ReactNode;
}

export function TooltipProvider({ delayDuration = 300, ...props }: TooltipProviderProps) {
    return <TooltipPrimitive.Provider delayDuration={delayDuration} {...props} />;
}

export interface TooltipProps {
    content: ReactNode;
    side?: "top" | "right" | "bottom" | "left";
    /** A single focusable element; it becomes the tooltip trigger via asChild. */
    children: ReactElement;
    className?: string;
}

export function Tooltip({ content, side = "top", children, className }: TooltipProps) {
    return (
        <TooltipPrimitive.Root>
            <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
            <TooltipPrimitive.Portal>
                <TooltipPrimitive.Content
                    side={side}
                    sideOffset={6}
                    className={cn(tooltipContentClasses, className)}
                >
                    {content}
                </TooltipPrimitive.Content>
            </TooltipPrimitive.Portal>
        </TooltipPrimitive.Root>
    );
}
