import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
} from "react";
import type { ReactNode } from "react";

import { cn } from "../../lib/utils.ts";

export type ToastTone = "success" | "error" | "info";

export interface ToastOptions {
    message: string;
    title?: string;
    tone?: ToastTone;
    durationMs?: number;
}

export const TOAST_DEFAULT_DURATION_MS = 4500;
export const TOAST_MAX_VISIBLE = 3;

export const toastToneIcons = {
    success: CheckCircle2,
    error: AlertCircle,
    info: Info,
} as const;

// One rule for icon tints on the dark rail: the status-soft pairs. They are all
// light enough for bg-rail and keep hue semantics (green / red-pink / blue), and
// they stay coherent with Notice/Badge/status-tones which map info to blue.
export const toastToneIconClasses = {
    success: "text-success-soft",
    error: "text-danger-soft",
    info: "text-info-soft",
} as const;

export const toastItemClasses =
    "flex items-start gap-3 rounded-card bg-rail px-4 py-3 text-sm text-white shadow-overlay animate-pop-in motion-reduce:animate-none";

export const toastViewportClasses =
    "fixed bottom-4 right-4 z-[100] w-[min(380px,calc(100vw-2rem))] space-y-2";

export interface ToastItemProps {
    message: string;
    title?: string;
    tone?: ToastTone;
    onDismiss?: () => void;
    className?: string;
}

export function ToastItem({
    message,
    title,
    tone = "info",
    onDismiss,
    className,
}: ToastItemProps) {
    const Icon = toastToneIcons[tone];

    return (
        <div role="status" className={cn(toastItemClasses, className)}>
            <Icon size={16} className={cn("mt-0.5 shrink-0", toastToneIconClasses[tone])} />
            <div className="min-w-0 flex-1">
                {title ? <p className="font-semibold">{title}</p> : null}
                <p>{message}</p>
            </div>
            <button
                type="button"
                aria-label="Dismiss"
                onClick={onDismiss}
                className="shrink-0 rounded-control p-0.5 text-white/70 transition-colors duration-150 hover:text-white outline-none focus-visible:ring-2 focus-visible:ring-green"
            >
                <X size={16} />
            </button>
        </div>
    );
}

interface ToastRecord extends ToastOptions {
    id: number;
}

interface ToastContextValue {
    toast: (t: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
    const value = useContext(ToastContext);
    if (!value) {
        throw new Error("useToast must be used within a ToastProvider");
    }
    return value;
}

export interface ToastProviderProps {
    children?: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
    const [toasts, setToasts] = useState<ToastRecord[]>([]);
    const timersRef = useRef(new Map<number, ReturnType<typeof setTimeout>>());
    const idRef = useRef(0);

    const clearTimer = useCallback((id: number) => {
        const timer = timersRef.current.get(id);
        if (timer !== undefined) {
            clearTimeout(timer);
            timersRef.current.delete(id);
        }
    }, []);

    const dismiss = useCallback(
        (id: number) => {
            clearTimer(id);
            setToasts((prev) => prev.filter((t) => t.id !== id));
        },
        [clearTimer],
    );

    const toast = useCallback(
        (options: ToastOptions) => {
            idRef.current += 1;
            const id = idRef.current;
            const timer = setTimeout(() => {
                dismiss(id);
            }, options.durationMs ?? TOAST_DEFAULT_DURATION_MS);
            timersRef.current.set(id, timer);
            // Keep the updater pure (no timer side effects): just cap the list.
            // Timers of dropped toasts are reconciled after commit, below.
            setToasts((prev) => [...prev, { ...options, id }].slice(-TOAST_MAX_VISIBLE));
        },
        [dismiss],
    );

    // Reconcile timers with the committed list: clear any timer whose toast is no
    // longer visible (dropped by the cap). Running after commit means a discarded
    // render can never clear the auto-dismiss timer of a toast that stays visible.
    useEffect(() => {
        const visible = new Set(toasts.map((t) => t.id));
        timersRef.current.forEach((timer, id) => {
            if (!visible.has(id)) {
                clearTimeout(timer);
                timersRef.current.delete(id);
            }
        });
    }, [toasts]);

    useEffect(() => {
        const timers = timersRef.current;
        return () => {
            timers.forEach((timer) => clearTimeout(timer));
            timers.clear();
        };
    }, []);

    const contextValue = useMemo(() => ({ toast }), [toast]);

    return (
        <ToastContext.Provider value={contextValue}>
            {children}
            <div aria-live="polite" className={toastViewportClasses}>
                {toasts.map((t) => (
                    <ToastItem
                        key={t.id}
                        message={t.message}
                        title={t.title}
                        tone={t.tone}
                        onDismiss={() => dismiss(t.id)}
                    />
                ))}
            </div>
        </ToastContext.Provider>
    );
}
