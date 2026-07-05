import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import type { ReactNode } from "react";

import { cn } from "../../lib/utils.ts";

export type NoticeTone = "success" | "error" | "warning" | "info";

const noticeToneConfig: Record<NoticeTone, { className: string; Icon: typeof Info }> = {
    success: { className: "bg-success-soft text-success", Icon: CheckCircle2 },
    error: { className: "bg-danger-soft text-danger", Icon: AlertCircle },
    warning: { className: "bg-warning-soft text-warning", Icon: AlertTriangle },
    info: { className: "bg-info-soft text-info", Icon: Info },
};

export interface NoticeProps {
    tone: NoticeTone;
    children: ReactNode;
    onClear?: () => void;
    className?: string;
}

export function Notice({ tone, children, onClear, className }: NoticeProps) {
    const { className: toneClassName, Icon } = noticeToneConfig[tone];
    return (
        <div
            role={tone === "error" ? "alert" : "status"}
            className={cn("flex items-start gap-2.5 rounded-control px-4 py-3 text-sm font-medium", toneClassName, className)}
        >
            <Icon size={16} aria-hidden="true" className="mt-0.5 shrink-0" />
            <div className="flex-1">{children}</div>
            {onClear ? (
                <button
                    type="button"
                    aria-label="Dismiss"
                    onClick={onClear}
                    className="shrink-0 rounded-md text-current/70 outline-none transition-colors duration-150 hover:text-current focus-visible:ring-2 focus-visible:ring-green focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
                >
                    <X size={16} aria-hidden="true" />
                </button>
            ) : null}
        </div>
    );
}
