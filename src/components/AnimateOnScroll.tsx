import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils";

interface AnimateOnScrollProps {
    children: ReactNode;
    className?: string;
    animation?: "fade-up" | "fade-left" | "fade-right" | "fade-in" | "scale-up";
    delay?: number;
    duration?: number;
    once?: boolean;
}

export default function AnimateOnScroll({
    children,
    className,
    animation = "fade-up",
    delay = 0,
    duration = 700,
    once = true,
}: AnimateOnScrollProps) {
    const ref = useRef<HTMLDivElement>(null);
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;

        const observer = new IntersectionObserver(
            ([entry]) => {
                if (entry.isIntersecting) {
                    setIsVisible(true);
                    if (once) observer.unobserve(el);
                } else if (!once) {
                    setIsVisible(false);
                }
            },
            { threshold: 0.15, rootMargin: "0px 0px -40px 0px" }
        );

        observer.observe(el);
        return () => observer.disconnect();
    }, [once]);

    const baseHidden: Record<string, string> = {
        "fade-up": "translate-y-8 opacity-0",
        "fade-left": "-translate-x-8 opacity-0",
        "fade-right": "translate-x-8 opacity-0",
        "fade-in": "opacity-0",
        "scale-up": "scale-95 opacity-0",
    };

    const baseVisible = "translate-y-0 translate-x-0 scale-100 opacity-100";

    return (
        <div
            ref={ref}
            className={cn(
                "transition-all ease-out",
                isVisible ? baseVisible : baseHidden[animation],
                className
            )}
            style={{
                transitionDuration: `${duration}ms`,
                transitionDelay: `${delay}ms`,
            }}
        >
            {children}
        </div>
    );
}
