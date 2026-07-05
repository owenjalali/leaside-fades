import type { ReactNode } from "react";

import { cn } from "../../lib/utils.ts";

export interface EmptyStateProps {
    icon?: ReactNode;
    title: string;
    description?: string;
    action?: ReactNode;
    className?: string;
}

export function EmptyState({ icon, title, description, action, className }: EmptyStateProps) {
    return (
        <div className={cn("flex flex-col items-center gap-2 px-6 py-12 text-center", className)}>
            {icon ? (
                <div className="mb-1 flex size-11 items-center justify-center rounded-full bg-surface-muted text-ink-faint">
                    {icon}
                </div>
            ) : null}
            <p className="text-sm font-semibold text-ink">{title}</p>
            {description ? <p className="max-w-sm text-sm text-ink-muted">{description}</p> : null}
            {action ? <div className="mt-3">{action}</div> : null}
        </div>
    );
}
