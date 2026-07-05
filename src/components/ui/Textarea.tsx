import type { ComponentProps } from "react";

import { cn } from "../../lib/utils.ts";
import { inputControlClassName } from "./Input.tsx";

export type TextareaProps = ComponentProps<"textarea">;

export function Textarea({ className, ...props }: TextareaProps) {
    return <textarea className={cn(inputControlClassName, "h-auto min-h-24 py-2.5", className)} {...props} />;
}
