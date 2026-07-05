import { useEffect, useState } from "react";

import { cn } from "../../lib/utils.ts";

export interface AvatarProps {
    name: string;
    photoUrl?: string;
    size?: "sm" | "md" | "lg";
    className?: string;
}

const avatarSizeClasses: Record<NonNullable<AvatarProps["size"]>, string> = {
    sm: "size-7 text-[10px]",
    md: "size-9 text-xs",
    lg: "size-12 text-sm",
};

function initialsOf(name: string): string {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map((part) => part[0]?.toUpperCase() ?? "")
        .join("");
}

export function Avatar({ name, photoUrl, size = "md", className }: AvatarProps) {
    const [imageFailed, setImageFailed] = useState(false);
    const photo = imageFailed ? undefined : photoUrl;

    useEffect(() => {
        setImageFailed(false);
    }, [photoUrl]);

    if (photo) {
        return (
            <img
                src={photo}
                alt={name}
                className={cn(avatarSizeClasses[size], "shrink-0 rounded-full border border-border object-cover", className)}
                decoding="async"
                loading="lazy"
                onError={() => setImageFailed(true)}
            />
        );
    }

    return (
        <div
            title={name}
            className={cn(
                avatarSizeClasses[size],
                "flex shrink-0 items-center justify-center rounded-full bg-mint font-semibold text-forest",
                className,
            )}
        >
            <span aria-hidden="true">{initialsOf(name)}</span>
            <span className="sr-only">{name}</span>
        </div>
    );
}
