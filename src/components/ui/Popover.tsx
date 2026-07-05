import * as PopoverPrimitive from "@radix-ui/react-popover";
import type { ComponentPropsWithoutRef, Ref } from "react";

import { cn } from "../../lib/utils.ts";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverClose = PopoverPrimitive.Close;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export const popoverContentClasses =
    "z-50 w-auto min-w-[240px] rounded-card border border-border bg-surface p-4 shadow-pop animate-pop-in motion-reduce:animate-none outline-none";

export interface PopoverContentProps
    extends ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> {
    className?: string;
    ref?: Ref<HTMLDivElement>;
}

export function PopoverContent({
    className,
    sideOffset = 6,
    align = "center",
    ref,
    ...props
}: PopoverContentProps) {
    return (
        <PopoverPrimitive.Portal>
            <PopoverPrimitive.Content
                ref={ref}
                sideOffset={sideOffset}
                align={align}
                className={cn(popoverContentClasses, className)}
                {...props}
            />
        </PopoverPrimitive.Portal>
    );
}
