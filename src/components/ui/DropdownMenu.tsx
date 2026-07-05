import * as DropdownMenuPrimitive from "@radix-ui/react-dropdown-menu";
import type { ComponentPropsWithoutRef, Ref } from "react";

import { cn } from "../../lib/utils.ts";

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;

export const dropdownMenuContentClasses =
    "z-50 min-w-[180px] rounded-card border border-border bg-surface p-1 shadow-pop animate-pop-in motion-reduce:animate-none";

export const dropdownMenuItemClasses =
    "flex items-center gap-2 rounded-control px-2.5 py-2 text-sm text-ink outline-none cursor-default data-[highlighted]:bg-surface-muted data-[disabled]:opacity-50 data-[disabled]:pointer-events-none";

export const dropdownMenuItemDestructiveClasses =
    "text-danger data-[highlighted]:bg-danger-soft";

export const dropdownMenuSeparatorClasses = "my-1 h-px bg-border";

export const dropdownMenuLabelClasses = "px-2.5 py-1.5 text-xs font-medium text-ink-muted";

export interface DropdownMenuContentProps
    extends ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content> {
    className?: string;
    ref?: Ref<HTMLDivElement>;
}

export function DropdownMenuContent({
    className,
    sideOffset = 6,
    align = "end",
    ref,
    ...props
}: DropdownMenuContentProps) {
    return (
        <DropdownMenuPrimitive.Portal>
            <DropdownMenuPrimitive.Content
                ref={ref}
                sideOffset={sideOffset}
                align={align}
                className={cn(dropdownMenuContentClasses, className)}
                {...props}
            />
        </DropdownMenuPrimitive.Portal>
    );
}

export interface DropdownMenuItemProps
    extends ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> {
    destructive?: boolean;
    className?: string;
    ref?: Ref<HTMLDivElement>;
}

export function DropdownMenuItem({
    destructive = false,
    className,
    ref,
    ...props
}: DropdownMenuItemProps) {
    return (
        <DropdownMenuPrimitive.Item
            ref={ref}
            className={cn(
                dropdownMenuItemClasses,
                destructive && dropdownMenuItemDestructiveClasses,
                className,
            )}
            {...props}
        />
    );
}

export interface DropdownMenuSeparatorProps
    extends ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator> {
    className?: string;
    ref?: Ref<HTMLDivElement>;
}

export function DropdownMenuSeparator({ className, ref, ...props }: DropdownMenuSeparatorProps) {
    return (
        <DropdownMenuPrimitive.Separator
            ref={ref}
            className={cn(dropdownMenuSeparatorClasses, className)}
            {...props}
        />
    );
}

export interface DropdownMenuLabelProps
    extends ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label> {
    className?: string;
    ref?: Ref<HTMLDivElement>;
}

export function DropdownMenuLabel({ className, ref, ...props }: DropdownMenuLabelProps) {
    return (
        <DropdownMenuPrimitive.Label
            ref={ref}
            className={cn(dropdownMenuLabelClasses, className)}
            {...props}
        />
    );
}
