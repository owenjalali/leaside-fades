import { ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";

import { cn } from "../../lib/utils.ts";
import { inputControlClassName } from "./Input.tsx";

export type SelectProps = ComponentProps<"select">;

export function Select({ className, children, ...props }: SelectProps) {
    return (
        <div className="relative w-full">
            <select className={cn(inputControlClassName, "appearance-none pr-9", className)} {...props}>
                {children}
            </select>
            <ChevronDown
                size={16}
                aria-hidden="true"
                className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint"
            />
        </div>
    );
}
