import { useId, type ReactNode } from "react";

import { cn } from "../../lib/utils.ts";

export interface FieldAria {
    "aria-describedby": string | undefined;
    "aria-invalid": true | undefined;
}

export interface FieldProps {
    label: string;
    hint?: string;
    error?: string;
    id?: string;
    className?: string;
    children: (id: string, aria: FieldAria) => ReactNode;
}

export function Field({ label, hint, error, id, className, children }: FieldProps) {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    const description = error ?? hint;
    const descriptionId = description ? `${fieldId}-description` : undefined;
    const aria: FieldAria = {
        "aria-describedby": descriptionId,
        "aria-invalid": error ? true : undefined,
    };

    return (
        <div className={cn("space-y-1.5", className)}>
            <label htmlFor={fieldId} className="block text-xs font-medium text-ink-muted">
                {label}
            </label>
            {children(fieldId, aria)}
            {error ? (
                <p id={descriptionId} role="alert" className="text-xs font-medium text-danger">
                    {error}
                </p>
            ) : hint ? (
                <p id={descriptionId} className="text-xs text-ink-faint">
                    {hint}
                </p>
            ) : null}
        </div>
    );
}
