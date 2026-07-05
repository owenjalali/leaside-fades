/**
 * usePointerDrag — the single drag engine for the admin (shift timeline
 * drag-move/resize, drag-to-create, booking reschedule).
 *
 * Consumer touch-action guidance:
 * - Drag surfaces that must still scroll vertically (e.g. the timeline body)
 *   need `touch-action: pan-y` (Tailwind: `touch-pan-y`) so the browser keeps
 *   vertical scrolling while this hook's touch hold-to-drag can still win a
 *   held gesture.
 * - Dedicated resize handles need `touch-action: none` (Tailwind: `touch-none`)
 *   so the browser never claims the gesture at all.
 * Without these CSS hints the browser may fire `pointercancel` mid-gesture and
 * the drag will (safely) cancel.
 *
 * Architecture: a pure, fully tested state machine (`dragTransition`) plus a
 * thin React/DOM glue layer. Global listeners exist ONLY while a gesture is
 * live, and every settle path (commit / cancel / clickThrough / silent settle
 * / unmount) funnels through one idempotent `teardown()`. Machine invariant:
 * every active -> idle transition carries exactly one settle-class effect
 * (commit | cancel | clickThrough | settle), each of which maps to teardown().
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

// ---------------------------------------------------------------------------
// Pure state machine
// ---------------------------------------------------------------------------

export type DragPhase = "idle" | "pending" | "dragging";

export type DragPointerType = "mouse" | "pen" | "touch";

export interface DragConfig {
    /** Mouse/pen: distance from the start point that activates the drag. */
    mouseDistancePx: number;
    /** Touch: how long the finger must hold before the drag activates. */
    touchHoldMs: number;
    /** Touch: cumulative drift >= this before the hold timer fires means scroll wins. */
    touchDriftPx: number;
}

export const DEFAULT_DRAG_CONFIG: DragConfig = {
    mouseDistancePx: 4,
    touchHoldMs: 250,
    touchDriftPx: 8,
};

export type DragMachineEvent =
    | { type: "pointerDown"; pointerType: DragPointerType; x: number; y: number; timeMs: number }
    | { type: "pointerMove"; x: number; y: number; timeMs: number }
    | { type: "holdTimerFired" }
    | { type: "pointerUp" }
    | { type: "escape" }
    | { type: "pointerCancel" }
    | { type: "lostCapture" };

export type DragEffect =
    | "activate"
    | "commit"
    | "cancel"
    | "clickThrough"
    /** Silent settle: tear the gesture down without invoking any handler. */
    | "settle"
    | "startHoldTimer"
    | "clearHoldTimer";

export interface ActiveDragState {
    phase: "pending" | "dragging";
    pointerType: DragPointerType;
    startX: number;
    startY: number;
    x: number;
    y: number;
    dx: number;
    dy: number;
    /** Largest distance from the start point seen so far (touch scroll detection). */
    maxDriftPx: number;
}

export type DragState = { phase: "idle" } | ActiveDragState;

export const IDLE_DRAG_STATE: DragState = { phase: "idle" };

export interface DragTransitionResult {
    state: DragState;
    effects: DragEffect[];
}

function withPosition(state: ActiveDragState, x: number, y: number): ActiveDragState {
    const dx = x - state.startX;
    const dy = y - state.startY;
    const drift = Math.hypot(dx, dy);
    return { ...state, x, y, dx, dy, maxDriftPx: Math.max(state.maxDriftPx, drift) };
}

export function dragTransition(
    state: DragState,
    event: DragMachineEvent,
    config: DragConfig = DEFAULT_DRAG_CONFIG,
): DragTransitionResult {
    if (state.phase === "idle") {
        if (event.type === "pointerDown") {
            const next: ActiveDragState = {
                phase: "pending",
                pointerType: event.pointerType,
                startX: event.x,
                startY: event.y,
                x: event.x,
                y: event.y,
                dx: 0,
                dy: 0,
                maxDriftPx: 0,
            };
            return {
                state: next,
                effects: event.pointerType === "touch" ? ["startHoldTimer"] : [],
            };
        }
        return { state, effects: [] };
    }

    const isTouch = state.pointerType === "touch";

    if (state.phase === "pending") {
        switch (event.type) {
            case "pointerMove": {
                const moved = withPosition(state, event.x, event.y);
                if (isTouch) {
                    if (moved.maxDriftPx >= config.touchDriftPx) {
                        // Scroll wins: silent return to idle, no cancel callback;
                        // "settle" still tears the gesture (listeners etc.) down.
                        return { state: IDLE_DRAG_STATE, effects: ["clearHoldTimer", "settle"] };
                    }
                    return { state: moved, effects: [] };
                }
                if (Math.hypot(moved.dx, moved.dy) >= config.mouseDistancePx) {
                    return { state: { ...moved, phase: "dragging" }, effects: ["activate"] };
                }
                return { state: moved, effects: [] };
            }
            case "holdTimerFired": {
                if (!isTouch) {
                    return { state, effects: [] };
                }
                if (state.maxDriftPx < config.touchDriftPx) {
                    return { state: { ...state, phase: "dragging" }, effects: ["activate"] };
                }
                // Defensive: drift already exceeded — the timer should have been
                // cleared, so settle silently.
                return { state: IDLE_DRAG_STATE, effects: ["settle"] };
            }
            case "pointerUp":
                return {
                    state: IDLE_DRAG_STATE,
                    effects: isTouch ? ["clearHoldTimer", "clickThrough"] : ["clickThrough"],
                };
            case "escape":
            case "pointerCancel":
            case "lostCapture":
                return {
                    state: IDLE_DRAG_STATE,
                    effects: isTouch ? ["clearHoldTimer", "cancel"] : ["cancel"],
                };
            case "pointerDown":
                return { state, effects: [] };
        }
    }

    // phase === "dragging"
    switch (event.type) {
        case "pointerMove":
            return { state: withPosition(state, event.x, event.y), effects: [] };
        case "pointerUp":
            return { state: IDLE_DRAG_STATE, effects: ["commit"] };
        case "escape":
        case "pointerCancel":
        case "lostCapture":
            return { state: IDLE_DRAG_STATE, effects: ["cancel"] };
        case "pointerDown":
        case "holdTimerFired":
            return { state, effects: [] };
    }
}

// ---------------------------------------------------------------------------
// React/DOM glue
// ---------------------------------------------------------------------------

export interface DragContext {
    startX: number;
    startY: number;
    x: number;
    y: number;
    dx: number;
    dy: number;
    pointerType: DragPointerType;
}

export interface PointerDragHandlers {
    onActivate?: (ctx: DragContext) => void;
    onMove: (ctx: DragContext) => void;
    onCommit: (ctx: DragContext) => void;
    onCancel?: () => void;
}

export interface PointerDragResult {
    onPointerDown: (event: ReactPointerEvent<Element>) => void;
    phase: DragPhase;
    cancel: () => void;
}

function toContext(state: ActiveDragState): DragContext {
    return {
        startX: state.startX,
        startY: state.startY,
        x: state.x,
        y: state.y,
        dx: state.dx,
        dy: state.dy,
        pointerType: state.pointerType,
    };
}

export function usePointerDrag(
    handlers: PointerDragHandlers,
    config?: Partial<DragConfig>,
): PointerDragResult {
    const [phase, setPhase] = useState<DragPhase>("idle");

    // Latest handlers/config live in refs so gesture listeners attached on an
    // earlier render can never fire stale closures.
    const handlersRef = useRef(handlers);
    const configRef = useRef(DEFAULT_DRAG_CONFIG);
    useEffect(() => {
        handlersRef.current = handlers;
        configRef.current = { ...DEFAULT_DRAG_CONFIG, ...config };
    });

    const stateRef = useRef<DragState>(IDLE_DRAG_STATE);
    const targetRef = useRef<Element | null>(null);
    const pointerIdRef = useRef<number | null>(null);
    const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const rafRef = useRef<number | null>(null);
    const pendingMoveRef = useRef<DragContext | null>(null);
    const capturedRef = useRef(false);
    const previousUserSelectRef = useRef<string | null>(null);
    // Removal closure over the exact listener instances attached for the live
    // gesture, so re-renders mid-gesture can never orphan a listener.
    const detachListenersRef = useRef<(() => void) | null>(null);

    // Teardown invariants — called on EVERY settle (commit / cancel /
    // clickThrough / settle) AND on unmount; idempotent; afterwards there are:
    // no window/element listeners, no hold timer, no pending rAF, no pointer
    // capture, and body user-select is restored.
    const teardown = useCallback(() => {
        detachListenersRef.current?.();
        detachListenersRef.current = null;
        if (holdTimerRef.current !== null) {
            clearTimeout(holdTimerRef.current);
            holdTimerRef.current = null;
        }
        if (rafRef.current !== null) {
            cancelAnimationFrame(rafRef.current);
            rafRef.current = null;
        }
        pendingMoveRef.current = null;
        if (capturedRef.current) {
            const target = targetRef.current;
            const pointerId = pointerIdRef.current;
            if (target !== null && pointerId !== null) {
                try {
                    // Listeners are already detached above, so the resulting
                    // lostpointercapture event cannot re-enter the machine.
                    target.releasePointerCapture(pointerId);
                } catch {
                    // Pointer already gone; nothing to release.
                }
            }
            capturedRef.current = false;
        }
        if (previousUserSelectRef.current !== null) {
            document.body.style.userSelect = previousUserSelectRef.current;
            previousUserSelectRef.current = null;
        }
        targetRef.current = null;
        pointerIdRef.current = null;
    }, []);

    useEffect(() => {
        return () => {
            stateRef.current = IDLE_DRAG_STATE;
            teardown();
        };
    }, [teardown]);

    function scheduleMove(state: ActiveDragState): void {
        // rAF throttle: at most one onMove per frame, always with the latest
        // coordinates; a settle cancels any pending frame via teardown().
        pendingMoveRef.current = toContext(state);
        if (rafRef.current !== null) {
            return;
        }
        rafRef.current = requestAnimationFrame(() => {
            rafRef.current = null;
            const ctx = pendingMoveRef.current;
            pendingMoveRef.current = null;
            if (ctx !== null && stateRef.current.phase === "dragging") {
                handlersRef.current.onMove(ctx);
            }
        });
    }

    function runEffect(effect: DragEffect, next: DragState, previous: DragState): void {
        switch (effect) {
            case "startHoldTimer":
                holdTimerRef.current = setTimeout(() => {
                    holdTimerRef.current = null;
                    dispatch({ type: "holdTimerFired" });
                }, configRef.current.touchHoldMs);
                break;
            case "clearHoldTimer":
                if (holdTimerRef.current !== null) {
                    clearTimeout(holdTimerRef.current);
                    holdTimerRef.current = null;
                }
                break;
            case "activate": {
                const target = targetRef.current;
                const pointerId = pointerIdRef.current;
                if (target !== null && pointerId !== null) {
                    try {
                        target.setPointerCapture(pointerId);
                        capturedRef.current = true;
                    } catch {
                        // Capture is best-effort; window listeners still track the gesture.
                    }
                }
                previousUserSelectRef.current = document.body.style.userSelect;
                document.body.style.userSelect = "none";
                if (next.phase !== "idle") {
                    handlersRef.current.onActivate?.(toContext(next));
                }
                break;
            }
            case "commit":
                teardown();
                if (previous.phase !== "idle") {
                    handlersRef.current.onCommit(toContext(previous));
                }
                break;
            case "cancel":
                teardown();
                handlersRef.current.onCancel?.();
                break;
            case "clickThrough":
                // Preserve the click: settle silently, never preventDefault.
                teardown();
                break;
            case "settle":
                // Silent settle (touch scroll wins, defensive paths): no handler
                // fires, but listeners/timer/rAF/capture must still be released.
                teardown();
                break;
        }
    }

    function dispatch(event: DragMachineEvent): void {
        const previous = stateRef.current;
        const { state: next, effects } = dragTransition(previous, event, configRef.current);
        stateRef.current = next;
        if (next.phase !== previous.phase) {
            setPhase(next.phase);
        }
        for (const effect of effects) {
            runEffect(effect, next, previous);
        }
        if (
            event.type === "pointerMove" &&
            next.phase === "dragging" &&
            previous.phase === "dragging"
        ) {
            scheduleMove(next);
        }
    }

    function onPointerDown(event: ReactPointerEvent<Element>): void {
        if (stateRef.current.phase !== "idle") {
            return;
        }
        if (!event.isPrimary || (event.pointerType === "mouse" && event.button !== 0)) {
            return;
        }
        const target = event.currentTarget;
        targetRef.current = target;
        pointerIdRef.current = event.pointerId;
        const pointerType: DragPointerType =
            event.pointerType === "touch" ? "touch" : event.pointerType === "pen" ? "pen" : "mouse";

        const onWindowPointerMove = (nativeEvent: globalThis.PointerEvent): void => {
            if (nativeEvent.pointerId !== pointerIdRef.current) {
                return;
            }
            dispatch({
                type: "pointerMove",
                x: nativeEvent.clientX,
                y: nativeEvent.clientY,
                timeMs: nativeEvent.timeStamp,
            });
        };
        const onWindowPointerUp = (nativeEvent: globalThis.PointerEvent): void => {
            if (nativeEvent.pointerId !== pointerIdRef.current) {
                return;
            }
            dispatch({ type: "pointerUp" });
        };
        const onWindowPointerCancel = (nativeEvent: globalThis.PointerEvent): void => {
            if (nativeEvent.pointerId !== pointerIdRef.current) {
                return;
            }
            dispatch({ type: "pointerCancel" });
        };
        const onWindowKeyDown = (nativeEvent: KeyboardEvent): void => {
            if (nativeEvent.key !== "Escape" || stateRef.current.phase === "idle") {
                return;
            }
            nativeEvent.preventDefault();
            nativeEvent.stopPropagation();
            dispatch({ type: "escape" });
        };
        const onLostPointerCapture = (nativeEvent: Event): void => {
            if ((nativeEvent as globalThis.PointerEvent).pointerId !== pointerIdRef.current) {
                return;
            }
            dispatch({ type: "lostCapture" });
        };

        window.addEventListener("pointermove", onWindowPointerMove);
        window.addEventListener("pointerup", onWindowPointerUp);
        window.addEventListener("pointercancel", onWindowPointerCancel);
        window.addEventListener("keydown", onWindowKeyDown, true);
        target.addEventListener("lostpointercapture", onLostPointerCapture);
        detachListenersRef.current = () => {
            window.removeEventListener("pointermove", onWindowPointerMove);
            window.removeEventListener("pointerup", onWindowPointerUp);
            window.removeEventListener("pointercancel", onWindowPointerCancel);
            window.removeEventListener("keydown", onWindowKeyDown, true);
            target.removeEventListener("lostpointercapture", onLostPointerCapture);
        };

        dispatch({
            type: "pointerDown",
            pointerType,
            x: event.clientX,
            y: event.clientY,
            timeMs: event.timeStamp,
        });
    }

    function cancel(): void {
        if (stateRef.current.phase === "idle") {
            return;
        }
        dispatch({ type: "escape" });
    }

    return { onPointerDown, phase, cancel };
}
