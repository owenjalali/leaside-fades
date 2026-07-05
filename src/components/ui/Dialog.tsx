import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import type { ComponentPropsWithoutRef, ReactNode, Ref } from "react";

import { cn } from "../../lib/utils.ts";

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export const dialogSizeClasses = {
    sm: "max-w-sm",
    md: "max-w-md",
    lg: "max-w-lg",
} as const;

export type DialogSize = keyof typeof dialogSizeClasses;

export const dialogScrimClasses =
    "fixed inset-0 z-50 bg-rail/40 animate-fade-in motion-reduce:animate-none";

export const dialogContentClasses =
    "fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-h-[85vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-card border border-border bg-surface p-6 shadow-overlay animate-pop-in motion-reduce:animate-none outline-none";

export const dialogCloseButtonClasses =
    "absolute right-4 top-4 inline-flex h-8 w-8 items-center justify-center rounded-control text-ink-muted transition-colors duration-150 hover:bg-surface-muted hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

export interface DialogContentProps
    extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
    size?: DialogSize;
    className?: string;
    /** Disables the built-in X control (e.g. while a save is in flight). */
    closeDisabled?: boolean;
    ref?: Ref<HTMLDivElement>;
}

/**
 * Radix sets aria-describedby on the content unconditionally, so either render
 * a DialogDescription inside, or pass aria-describedby={undefined} when the
 * dialog has no description (avoids a dangling ARIA reference).
 */
export function DialogContent({
    size = "md",
    className,
    closeDisabled = false,
    children,
    ref,
    ...props
}: DialogContentProps) {
    return (
        <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className={dialogScrimClasses} />
            <DialogPrimitive.Content
                ref={ref}
                className={cn(dialogContentClasses, dialogSizeClasses[size], className)}
                {...props}
            >
                {children}
                <DialogPrimitive.Close
                    aria-label="Close"
                    disabled={closeDisabled}
                    className={cn(dialogCloseButtonClasses, "disabled:pointer-events-none disabled:opacity-40")}
                >
                    <X size={16} />
                </DialogPrimitive.Close>
            </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
    );
}

export interface DialogTitleProps
    extends ComponentPropsWithoutRef<typeof DialogPrimitive.Title> {
    className?: string;
    children?: ReactNode;
    ref?: Ref<HTMLHeadingElement>;
}

export function DialogTitle({ className, ref, ...props }: DialogTitleProps) {
    return (
        <DialogPrimitive.Title
            ref={ref}
            className={cn("text-xl font-semibold text-ink", className)}
            {...props}
        />
    );
}

export interface DialogDescriptionProps
    extends ComponentPropsWithoutRef<typeof DialogPrimitive.Description> {
    className?: string;
    children?: ReactNode;
    ref?: Ref<HTMLParagraphElement>;
}

export function DialogDescription({ className, ref, ...props }: DialogDescriptionProps) {
    return (
        <DialogPrimitive.Description
            ref={ref}
            className={cn("text-sm text-ink-muted", className)}
            {...props}
        />
    );
}
