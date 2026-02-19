import { cn } from "@/lib/utils";
import type { ReactNode } from "react";

interface AuroraBackgroundProps {
    children: ReactNode;
    className?: string;
}

export default function AuroraBackground({
    children,
    className,
}: AuroraBackgroundProps) {
    return (
        <div
            className={cn(
                "relative overflow-hidden bg-forest",
                className
            )}
        >
            {/* Aurora blobs */}
            <div className="absolute inset-0 overflow-hidden">
                <div
                    className="absolute -top-1/2 -left-1/4 w-[80vw] h-[80vw] rounded-full opacity-30 blur-[120px] animate-aurora"
                    style={{
                        background:
                            "radial-gradient(ellipse at center, #52b788 0%, #2d6a4f 40%, transparent 70%)",
                        backgroundSize: "200% 200%",
                    }}
                />
                <div
                    className="absolute -bottom-1/3 -right-1/4 w-[70vw] h-[70vw] rounded-full opacity-20 blur-[100px] animate-aurora"
                    style={{
                        background:
                            "radial-gradient(ellipse at center, #74c69d 0%, #1a3a2a 50%, transparent 70%)",
                        backgroundSize: "200% 200%",
                        animationDelay: "4s",
                        animationDirection: "reverse",
                    }}
                />
                <div
                    className="absolute top-1/4 left-1/2 w-[50vw] h-[50vw] rounded-full opacity-15 blur-[80px] animate-aurora"
                    style={{
                        background:
                            "radial-gradient(ellipse at center, #b7e4c7 0%, transparent 60%)",
                        backgroundSize: "200% 200%",
                        animationDelay: "2s",
                    }}
                />
            </div>

            {/* Content */}
            <div className="relative z-10">{children}</div>
        </div>
    );
}
