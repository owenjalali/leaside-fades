import type { ComponentProps } from "react";

import { cn } from "../../lib/utils.ts";
import { inputControlClassName } from "./Input.tsx";

export type DateInputProps = Omit<ComponentProps<"input">, "type">;

export function DateInput({ className, ...props }: DateInputProps) {
    return <input type="date" className={cn(inputControlClassName, className)} {...props} />;
}
