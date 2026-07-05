import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { createContext, useContext } from "react";
import type { ComponentPropsWithoutRef, HTMLAttributes, ReactNode, Ref } from "react";

import { cn } from "../../lib/utils.ts";

export const Drawer = DialogPrimitive.Root;
export const DrawerTrigger = DialogPrimitive.Trigger;
export const DrawerClose = DialogPrimitive.Close;

/**
 * Shared frame classes used by both the overlay sheet and the docked column so the
 * same children render identically in either mode. The overlay adds positioning,
 * z-index, and shadow-overlay; the docked column stays in normal flow with
 * hairlines only (a permanently docked panel should not float above the page).
 */
export const drawerFrameClasses =
    "flex h-full w-full max-w-md flex-col border-l border-border bg-surface";

export const drawerOverlayContentClasses =
    "fixed inset-y-0 right-0 z-50 shadow-overlay animate-pop-in motion-reduce:animate-none outline-none";

export const drawerScrimClasses =
    "fixed inset-0 z-50 bg-rail/40 animate-fade-in motion-reduce:animate-none";

export const drawerCloseButtonClasses =
    "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-control text-ink-muted transition-colors duration-150 hover:bg-surface-muted hover:text-ink outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 focus-visible:ring-offset-canvas";

const DrawerDockedContext = createContext(false);

/**
 * Props that only exist on Radix Dialog.Content. They are stripped in docked
 * mode so they never land on the plain <aside>: forceMount would emit a
 * non-boolean DOM attribute, and the Radix callbacks would silently do nothing.
 */
export const drawerOverlayOnlyPropKeys = [
    "forceMount",
    "onOpenAutoFocus",
    "onCloseAutoFocus",
    "onEscapeKeyDown",
    "onPointerDownOutside",
    "onInteractOutside",
] as const;

export interface DrawerContentProps
    extends ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
    /**
     * When true, renders a plain static <aside> — no portal, no scrim, no focus
     * trap — so xl layouts can dock the drawer as a column. The same children
     * (DrawerHeader/DrawerBody/DrawerFooter) work in both modes.
     */
    docked?: boolean;
    className?: string;
    ref?: Ref<HTMLDivElement>;
}

/**
 * Overlay mode: Radix sets aria-describedby on the content unconditionally, so
 * either render a DrawerDescription inside, or pass aria-describedby={undefined}
 * when the drawer has no description (avoids a dangling ARIA reference).
 */
export function DrawerContent({
    docked = false,
    className,
    children,
    ref,
    ...props
}: DrawerContentProps) {
    if (docked) {
        const asideProps: Record<string, unknown> = { ...props };
        for (const key of drawerOverlayOnlyPropKeys) {
            delete asideProps[key];
        }
        return (
            <DrawerDockedContext.Provider value={true}>
                <aside
                    ref={ref}
                    className={cn(drawerFrameClasses, className)}
                    {...(asideProps as HTMLAttributes<HTMLElement>)}
                >
                    {children}
                </aside>
            </DrawerDockedContext.Provider>
        );
    }

    return (
        <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className={drawerScrimClasses} />
            <DialogPrimitive.Content
                ref={ref}
                className={cn(drawerFrameClasses, drawerOverlayContentClasses, className)}
                {...props}
            >
                {children}
            </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
    );
}

export interface DrawerHeaderProps {
    children?: ReactNode;
    /**
     * Close handler for docked mode (no Radix context exists there). In overlay
     * mode the X is a Radix Close button and this handler is optional extra.
     * In docked mode the X is omitted entirely when onClose is not provided.
     */
    onClose?: () => void;
    className?: string;
}

export function DrawerHeader({ children, onClose, className }: DrawerHeaderProps) {
    const docked = useContext(DrawerDockedContext);

    return (
        <div
            className={cn(
                "flex items-center justify-between gap-3 border-b border-border px-6 py-4",
                className,
            )}
        >
            <div className="min-w-0 flex-1">{children}</div>
            {docked ? (
                onClose ? (
                    <button
                        type="button"
                        aria-label="Close"
                        onClick={onClose}
                        className={drawerCloseButtonClasses}
                    >
                        <X size={16} />
                    </button>
                ) : null
            ) : (
                <DialogPrimitive.Close
                    aria-label="Close"
                    onClick={onClose}
                    className={drawerCloseButtonClasses}
                >
                    <X size={16} />
                </DialogPrimitive.Close>
            )}
        </div>
    );
}

export interface DrawerTitleProps
    extends ComponentPropsWithoutRef<typeof DialogPrimitive.Title> {
    className?: string;
    ref?: Ref<HTMLHeadingElement>;
}

export function DrawerTitle({ className, ref, ...props }: DrawerTitleProps) {
    const docked = useContext(DrawerDockedContext);
    const classes = cn("text-xl font-semibold text-ink", className);

    if (docked) {
        return <h2 ref={ref} className={classes} {...(props as HTMLAttributes<HTMLHeadingElement>)} />;
    }

    return <DialogPrimitive.Title ref={ref} className={classes} {...props} />;
}

export interface DrawerDescriptionProps
    extends ComponentPropsWithoutRef<typeof DialogPrimitive.Description> {
    className?: string;
    ref?: Ref<HTMLParagraphElement>;
}

/**
 * Radix Description in overlay mode (satisfies the content's aria-describedby);
 * a plain <p> with the same classes in docked mode.
 */
export function DrawerDescription({ className, ref, ...props }: DrawerDescriptionProps) {
    const docked = useContext(DrawerDockedContext);
    const classes = cn("text-sm text-ink-muted", className);

    if (docked) {
        return (
            <p ref={ref} className={classes} {...(props as HTMLAttributes<HTMLParagraphElement>)} />
        );
    }

    return <DialogPrimitive.Description ref={ref} className={classes} {...props} />;
}

export interface DrawerBodyProps extends HTMLAttributes<HTMLDivElement> {
    className?: string;
    ref?: Ref<HTMLDivElement>;
}

export function DrawerBody({ className, ref, ...props }: DrawerBodyProps) {
    return (
        <div
            ref={ref}
            className={cn("flex-1 overflow-y-auto px-6 py-4", className)}
            {...props}
        />
    );
}

export interface DrawerFooterProps extends HTMLAttributes<HTMLDivElement> {
    className?: string;
    ref?: Ref<HTMLDivElement>;
}

export function DrawerFooter({ className, ref, ...props }: DrawerFooterProps) {
    return (
        <div
            ref={ref}
            className={cn("flex justify-end gap-3 border-t border-border px-6 py-4", className)}
            {...props}
        />
    );
}
