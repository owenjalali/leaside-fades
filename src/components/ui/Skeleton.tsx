import { cn } from "../../lib/utils.ts";

export interface SkeletonProps {
    /**
     * Size the skeleton with utility classes, e.g.
     * `<Skeleton className="h-4 w-32" />` or `<Skeleton className="size-9 rounded-full" />`.
     */
    className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
    return (
        <div
            aria-hidden="true"
            className={cn("animate-pulse rounded-control bg-surface-muted motion-reduce:animate-none", className)}
        />
    );
}
