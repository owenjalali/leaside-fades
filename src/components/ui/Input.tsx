import type { ComponentProps } from "react";

import { cn } from "../../lib/utils.ts";

export const inputControlClassName =
    "h-10 w-full rounded-control border border-border bg-surface px-3.5 text-sm text-ink placeholder:text-ink-faint transition-colors duration-150 " +
    "focus:outline-none focus:border-emerald focus:ring-2 focus:ring-green/25 " +
    "aria-invalid:border-danger aria-invalid:ring-danger/20 " +
    "disabled:opacity-50 disabled:pointer-events-none";

export type InputProps = ComponentProps<"input">;

export function Input({ type = "text", className, ...props }: InputProps) {
    return <input type={type} className={cn(inputControlClassName, className)} {...props} />;
}
