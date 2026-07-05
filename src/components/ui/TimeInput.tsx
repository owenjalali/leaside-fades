import type { ComponentProps, FocusEvent } from "react";

import { snapWeeklyScheduleClock } from "../../admin/admin-utils.ts";
import { cn } from "../../lib/utils.ts";
import { inputControlClassName } from "./Input.tsx";

export function snapTimeInputValue(value: string): string {
    return snapWeeklyScheduleClock(value) ?? value;
}

export interface TimeInputProps
    extends Omit<ComponentProps<"input">, "type" | "step" | "value" | "onChange"> {
    value: string;
    onChange: (next: string) => void;
}

export function TimeInput({ value, onChange, onBlur, className, ...props }: TimeInputProps) {
    const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
        const snapped = snapTimeInputValue(event.target.value);
        if (snapped !== event.target.value) {
            onChange(snapped);
        }
        onBlur?.(event);
    };

    return (
        <input
            type="time"
            step={900}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            onBlur={handleBlur}
            className={cn(inputControlClassName, className)}
            {...props}
        />
    );
}
