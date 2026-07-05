import { Loader2 } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "../../lib/utils.ts";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

const buttonBase =
    "inline-flex items-center justify-center gap-2 rounded-control text-sm font-medium transition-colors duration-150 " +
    "outline-none focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 focus-visible:ring-offset-canvas " +
    "disabled:opacity-50 disabled:pointer-events-none";

const variantClasses: Record<ButtonVariant, string> = {
    primary: "bg-forest text-white hover:bg-emerald",
    secondary: "border border-border bg-surface text-ink hover:bg-surface-muted",
    ghost: "text-ink hover:bg-surface-muted",
    danger: "bg-danger text-white hover:bg-danger/90",
};

const sizeClasses: Record<ButtonSize, string> = {
    sm: "h-9 px-3",
    md: "h-10 px-4",
    lg: "h-12 px-5 text-base",
};

const iconSizeClasses: Record<ButtonSize, string> = {
    sm: "size-9",
    md: "size-10",
    lg: "size-12",
};

export interface ButtonProps extends ComponentProps<"button"> {
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
}

export function Button({
    variant = "primary",
    size = "md",
    loading = false,
    type = "button",
    disabled,
    className,
    children,
    ...props
}: ButtonProps) {
    return (
        <button
            type={type}
            disabled={disabled || loading}
            aria-busy={loading || undefined}
            className={cn(buttonBase, variantClasses[variant], sizeClasses[size], className)}
            {...props}
        >
            {loading ? <Loader2 size={16} aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : null}
            {children}
        </button>
    );
}

export interface IconButtonProps extends ComponentProps<"button"> {
    "aria-label": string;
    variant?: ButtonVariant;
    size?: ButtonSize;
    loading?: boolean;
}

export function IconButton({
    variant = "ghost",
    size = "md",
    loading = false,
    type = "button",
    disabled,
    className,
    children,
    ...props
}: IconButtonProps) {
    return (
        <button
            type={type}
            disabled={disabled || loading}
            aria-busy={loading || undefined}
            className={cn(buttonBase, variantClasses[variant], iconSizeClasses[size], className)}
            {...props}
        >
            {loading ? <Loader2 size={16} aria-hidden="true" className="animate-spin motion-reduce:animate-none" /> : children}
        </button>
    );
}
