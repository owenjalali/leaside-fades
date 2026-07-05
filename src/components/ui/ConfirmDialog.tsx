import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";

import { Button } from "./Button.tsx";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "./Dialog.tsx";

export type ConfirmTone = "danger" | "default";

export interface ConfirmOptions {
    title: string;
    description?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    tone?: ConfirmTone;
}

export type ConfirmFn = (opts: ConfirmOptions) => Promise<boolean>;

export const confirmToneButtonVariant = {
    danger: "danger",
    default: "primary",
} as const;

export interface ConfirmRequest {
    opts: ConfirmOptions;
    resolve: (value: boolean) => void;
}

export interface ConfirmQueueState {
    active: ConfirmRequest | null;
    pending: ConfirmRequest[];
}

export const emptyConfirmQueue: ConfirmQueueState = { active: null, pending: [] };

/**
 * Pure FIFO queue transitions for the confirm dialog, extracted so the promise
 * contract is unit-testable in the node environment (the dialog itself portals
 * nothing in static markup).
 */
export function enqueueConfirm(state: ConfirmQueueState, request: ConfirmRequest): ConfirmQueueState {
    if (state.active) {
        return { active: state.active, pending: [...state.pending, request] };
    }
    return { active: request, pending: state.pending };
}

/** Resolves the active request with `value` and promotes the next queued one. */
export function settleConfirm(state: ConfirmQueueState, value: boolean): ConfirmQueueState {
    if (!state.active) {
        return state;
    }
    state.active.resolve(value);
    const [next = null, ...pending] = state.pending;
    return { active: next, pending };
}

/** Resolves every outstanding request with false (provider unmount). */
export function flushConfirm(state: ConfirmQueueState): ConfirmQueueState {
    state.active?.resolve(false);
    for (const request of state.pending) {
        request.resolve(false);
    }
    return emptyConfirmQueue;
}

const ConfirmContext = createContext<ConfirmFn | null>(null);

export function useConfirm(): ConfirmFn {
    const confirm = useContext(ConfirmContext);
    if (!confirm) {
        throw new Error("useConfirm must be used within a ConfirmDialogProvider");
    }
    return confirm;
}

export interface ConfirmDialogProviderProps {
    children?: ReactNode;
}

/**
 * Hosts a single confirm dialog. Overlapping confirm() calls are queued FIFO:
 * the active request keeps the dialog, and each queued request opens (with its
 * own options) as soon as the previous one resolves. No call is ever rejected;
 * every returned promise resolves true (confirm) or false (cancel/Esc/scrim/X).
 */
export function ConfirmDialogProvider({ children }: ConfirmDialogProviderProps) {
    const [request, setRequest] = useState<ConfirmRequest | null>(null);
    const queueRef = useRef<ConfirmQueueState>(emptyConfirmQueue);

    const confirm = useCallback<ConfirmFn>((opts) => {
        return new Promise<boolean>((resolve) => {
            queueRef.current = enqueueConfirm(queueRef.current, { opts, resolve });
            setRequest(queueRef.current.active);
        });
    }, []);

    const settle = useCallback((value: boolean) => {
        if (!queueRef.current.active) {
            return;
        }
        queueRef.current = settleConfirm(queueRef.current, value);
        setRequest(queueRef.current.active);
    }, []);

    // If the provider unmounts while requests are outstanding, resolve them all
    // with false so awaiting callers never hang.
    useEffect(() => {
        const queue = queueRef;
        return () => {
            queue.current = flushConfirm(queue.current);
        };
    }, []);

    const handleOpenChange = useCallback(
        (open: boolean) => {
            if (!open) {
                settle(false);
            }
        },
        [settle],
    );

    const contextValue = useMemo(() => confirm, [confirm]);
    const opts = request?.opts;
    const tone: ConfirmTone = opts?.tone ?? "default";

    return (
        <ConfirmContext.Provider value={contextValue}>
            {children}
            <Dialog open={request !== null} onOpenChange={handleOpenChange}>
                <DialogContent
                    size="sm"
                    {...(opts?.description ? {} : { "aria-describedby": undefined })}
                >
                    <DialogTitle>{opts?.title}</DialogTitle>
                    {opts?.description ? (
                        <DialogDescription className="mt-2">{opts.description}</DialogDescription>
                    ) : null}
                    <div className="mt-6 flex justify-end gap-3">
                        <Button variant="secondary" onClick={() => settle(false)}>
                            {opts?.cancelLabel ?? "Cancel"}
                        </Button>
                        <Button variant={confirmToneButtonVariant[tone]} onClick={() => settle(true)}>
                            {opts?.confirmLabel ?? "Confirm"}
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </ConfirmContext.Provider>
    );
}
