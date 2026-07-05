import { describe, expect, test } from "vitest";

import {
    DEFAULT_DRAG_CONFIG,
    IDLE_DRAG_STATE,
    dragTransition,
} from "./usePointerDrag.ts";
import type {
    ActiveDragState,
    DragConfig,
    DragMachineEvent,
    DragPointerType,
    DragState,
} from "./usePointerDrag.ts";

function down(pointerType: DragPointerType, x = 0, y = 0, timeMs = 0): DragMachineEvent {
    return { type: "pointerDown", pointerType, x, y, timeMs };
}

function move(x: number, y: number, timeMs = 0): DragMachineEvent {
    return { type: "pointerMove", x, y, timeMs };
}

/** Runs a sequence of events from idle; returns the final state and the effects of the LAST event. */
function sequence(
    events: DragMachineEvent[],
    config: DragConfig = DEFAULT_DRAG_CONFIG,
): { state: DragState; effects: string[] } {
    let state: DragState = IDLE_DRAG_STATE;
    let effects: string[] = [];
    for (const event of events) {
        const result = dragTransition(state, event, config);
        state = result.state;
        effects = result.effects;
    }
    return { state, effects };
}

function active(state: DragState): ActiveDragState {
    if (state.phase === "idle") {
        throw new Error("expected an active (pending/dragging) state");
    }
    return state;
}

describe("dragTransition config defaults", () => {
    test("DEFAULT_DRAG_CONFIG matches the approved thresholds", () => {
        expect(DEFAULT_DRAG_CONFIG).toEqual({
            mouseDistancePx: 4,
            touchHoldMs: 250,
            touchDriftPx: 8,
        });
    });
});

describe("idle no-ops", () => {
    const nonStartEvents: DragMachineEvent[] = [
        move(10, 10),
        { type: "pointerUp" },
        { type: "holdTimerFired" },
        { type: "escape" },
        { type: "pointerCancel" },
        { type: "lostCapture" },
    ];

    test.each(nonStartEvents.map((event) => [event.type, event] as const))(
        "%s in idle stays idle with no effects",
        (_type, event) => {
            const result = dragTransition(IDLE_DRAG_STATE, event);
            expect(result.state).toBe(IDLE_DRAG_STATE);
            expect(result.effects).toEqual([]);
        },
    );
});

describe("pointerDown", () => {
    test("mouse enters pending with no effects and zeroed deltas", () => {
        const result = dragTransition(IDLE_DRAG_STATE, down("mouse", 100, 200, 5));
        expect(result.effects).toEqual([]);
        expect(result.state).toEqual({
            phase: "pending",
            pointerType: "mouse",
            startX: 100,
            startY: 200,
            x: 100,
            y: 200,
            dx: 0,
            dy: 0,
            maxDriftPx: 0,
        });
    });

    test("pen enters pending with no effects", () => {
        const result = dragTransition(IDLE_DRAG_STATE, down("pen", 1, 2));
        expect(result.state.phase).toBe("pending");
        expect(result.effects).toEqual([]);
    });

    test("touch enters pending and starts the hold timer", () => {
        const result = dragTransition(IDLE_DRAG_STATE, down("touch", 50, 60));
        expect(result.state.phase).toBe("pending");
        expect(result.effects).toEqual(["startHoldTimer"]);
    });

    test("pointerDown while pending or dragging is a no-op", () => {
        const pending = sequence([down("mouse", 0, 0)]);
        const rePressed = dragTransition(pending.state, down("mouse", 99, 99));
        expect(rePressed.state).toEqual(pending.state);
        expect(rePressed.effects).toEqual([]);

        const dragging = sequence([down("mouse", 0, 0), move(10, 0)]);
        expect(dragging.state.phase).toBe("dragging");
        const rePressedDragging = dragTransition(dragging.state, down("touch", 1, 1));
        expect(rePressedDragging.state).toEqual(dragging.state);
        expect(rePressedDragging.effects).toEqual([]);
    });
});

describe("mouse/pen activation threshold", () => {
    test("movement of 3.9px stays pending with no effects", () => {
        const result = sequence([down("mouse", 0, 0), move(3.9, 0)]);
        expect(result.state.phase).toBe("pending");
        expect(result.effects).toEqual([]);
    });

    test("movement of exactly 4.0px activates", () => {
        const result = sequence([down("mouse", 0, 0), move(4, 0)]);
        expect(result.state.phase).toBe("dragging");
        expect(result.effects).toEqual(["activate"]);
    });

    test("distance is euclidean: (3,3) diagonal exceeds the 4px threshold, (2,3) does not", () => {
        const short = sequence([down("mouse", 0, 0), move(2, 3)]); // hypot = 3.6
        expect(short.state.phase).toBe("pending");

        const long = sequence([down("mouse", 0, 0), move(3, 3)]); // hypot ≈ 4.24
        expect(long.state.phase).toBe("dragging");
        expect(long.effects).toEqual(["activate"]);
    });

    test("pen activates at the same mouse distance threshold", () => {
        const result = sequence([down("pen", 10, 10), move(10, 14)]);
        expect(result.state.phase).toBe("dragging");
        expect(result.effects).toEqual(["activate"]);
    });

    test("custom mouseDistancePx is honoured at the boundary", () => {
        const config: DragConfig = { ...DEFAULT_DRAG_CONFIG, mouseDistancePx: 10 };
        const under = sequence([down("mouse", 0, 0), move(9.9, 0)], config);
        expect(under.state.phase).toBe("pending");
        const at = sequence([down("mouse", 0, 0), move(10, 0)], config);
        expect(at.state.phase).toBe("dragging");
    });

    test("holdTimerFired while pending with a mouse is a no-op", () => {
        const pending = sequence([down("mouse", 0, 0), move(2, 0)]);
        const result = dragTransition(pending.state, { type: "holdTimerFired" });
        expect(result.state).toEqual(pending.state);
        expect(result.effects).toEqual([]);
    });
});

describe("touch hold-to-activate", () => {
    test("holdTimerFired with no movement activates", () => {
        const result = sequence([down("touch", 0, 0), { type: "holdTimerFired" }]);
        expect(result.state.phase).toBe("dragging");
        expect(result.effects).toEqual(["activate"]);
    });

    test("drift of 7.9px keeps the gesture pending and the timer still activates", () => {
        const moved = sequence([down("touch", 0, 0), move(7.9, 0)]);
        expect(moved.state.phase).toBe("pending");
        expect(moved.effects).toEqual([]);

        const fired = dragTransition(moved.state, { type: "holdTimerFired" });
        expect(fired.state.phase).toBe("dragging");
        expect(fired.effects).toEqual(["activate"]);
    });

    test("drift of exactly 8.0px settles to idle silently — scroll wins, no cancel effect, teardown via settle", () => {
        const result = sequence([down("touch", 0, 0), move(8, 0)]);
        expect(result.state).toBe(IDLE_DRAG_STATE);
        expect(result.effects).toEqual(["clearHoldTimer", "settle"]);
        expect(result.effects).not.toContain("cancel");
        expect(result.effects).not.toContain("commit");
    });

    test("drift is cumulative: returning towards the start does not forgive earlier drift", () => {
        // Out to 7px, back to 1px: maxDrift stays 7 (< 8) so the timer still activates.
        const wandered = sequence([down("touch", 0, 0), move(7, 0), move(1, 0)]);
        expect(wandered.state.phase).toBe("pending");
        expect(active(wandered.state).maxDriftPx).toBe(7);
        const fired = dragTransition(wandered.state, { type: "holdTimerFired" });
        expect(fired.state.phase).toBe("dragging");

        // Crossing the threshold on a later move still settles.
        const crossed = sequence([down("touch", 0, 0), move(5, 0), move(8, 0)]);
        expect(crossed.state).toBe(IDLE_DRAG_STATE);
        expect(crossed.effects).toEqual(["clearHoldTimer", "settle"]);
    });

    test("custom touchDriftPx is honoured at the boundary", () => {
        const config: DragConfig = { ...DEFAULT_DRAG_CONFIG, touchDriftPx: 12 };
        const under = sequence([down("touch", 0, 0), move(11.9, 0)], config);
        expect(under.state.phase).toBe("pending");
        const at = sequence([down("touch", 0, 0), move(12, 0)], config);
        expect(at.state).toBe(IDLE_DRAG_STATE);
    });

    test("defensive: holdTimerFired after drift already exceeded settles silently to idle", () => {
        const stale: ActiveDragState = {
            phase: "pending",
            pointerType: "touch",
            startX: 0,
            startY: 0,
            x: 9,
            y: 0,
            dx: 9,
            dy: 0,
            maxDriftPx: 9,
        };
        const result = dragTransition(stale, { type: "holdTimerFired" });
        expect(result.state).toBe(IDLE_DRAG_STATE);
        expect(result.effects).toEqual(["settle"]);
    });
});

describe("click-through", () => {
    test.each(["mouse", "pen"] as const)(
        "%s pointerUp while pending emits exactly clickThrough — no commit, no cancel",
        (pointerType) => {
            const result = sequence([down(pointerType, 0, 0), move(2, 1), { type: "pointerUp" }]);
            expect(result.state).toBe(IDLE_DRAG_STATE);
            expect(result.effects).toEqual(["clickThrough"]);
        },
    );

    test("touch pointerUp before the hold timer clears the timer and clicks through", () => {
        const result = sequence([down("touch", 0, 0), { type: "pointerUp" }]);
        expect(result.state).toBe(IDLE_DRAG_STATE);
        expect(result.effects).toEqual(["clearHoldTimer", "clickThrough"]);
        expect(result.effects).not.toContain("commit");
        expect(result.effects).not.toContain("cancel");
    });
});

describe("commit", () => {
    test("mouse pointerUp while dragging commits", () => {
        const result = sequence([down("mouse", 0, 0), move(10, 0), { type: "pointerUp" }]);
        expect(result.state).toBe(IDLE_DRAG_STATE);
        expect(result.effects).toEqual(["commit"]);
    });

    test("touch pointerUp after hold activation and movement commits", () => {
        const result = sequence([
            down("touch", 0, 0),
            { type: "holdTimerFired" },
            move(30, 40),
            { type: "pointerUp" },
        ]);
        expect(result.state).toBe(IDLE_DRAG_STATE);
        expect(result.effects).toEqual(["commit"]);
    });
});

describe("cancel paths", () => {
    const interrupts: DragMachineEvent[] = [
        { type: "escape" },
        { type: "pointerCancel" },
        { type: "lostCapture" },
    ];

    const nonTouchPointerTypes = ["mouse", "pen"] as const;

    test.each(
        nonTouchPointerTypes.flatMap((pointerType) =>
            interrupts.map((event) => [event.type, pointerType, event] as const),
        ),
    )("%s while pending (%s) cancels", (_type, pointerType, event) => {
        const result = sequence([down(pointerType, 0, 0), move(2, 0), event]);
        expect(result.state).toBe(IDLE_DRAG_STATE);
        expect(result.effects).toEqual(["cancel"]);
    });

    test.each(interrupts.map((event) => [event.type, event] as const))(
        "%s while pending (touch) clears the hold timer and cancels",
        (_type, event) => {
            const result = sequence([down("touch", 0, 0), event]);
            expect(result.state).toBe(IDLE_DRAG_STATE);
            expect(result.effects).toEqual(["clearHoldTimer", "cancel"]);
        },
    );

    test.each(interrupts.map((event) => [event.type, event] as const))(
        "%s while dragging (mouse) cancels",
        (_type, event) => {
            const result = sequence([down("mouse", 0, 0), move(10, 0), event]);
            expect(result.state).toBe(IDLE_DRAG_STATE);
            expect(result.effects).toEqual(["cancel"]);
        },
    );

    test("escape while dragging (touch, timer already consumed) emits cancel only", () => {
        const result = sequence([down("touch", 0, 0), { type: "holdTimerFired" }, { type: "escape" }]);
        expect(result.state).toBe(IDLE_DRAG_STATE);
        expect(result.effects).toEqual(["cancel"]);
    });
});

describe("dx/dy tracking", () => {
    test("negative deltas: start (100,200) moving to (90,185)", () => {
        const result = sequence([down("mouse", 100, 200), move(90, 185)]);
        const state = active(result.state);
        expect(state.phase).toBe("dragging"); // hypot(10,15) ≈ 18 >= 4
        expect(state.startX).toBe(100);
        expect(state.startY).toBe(200);
        expect(state.x).toBe(90);
        expect(state.y).toBe(185);
        expect(state.dx).toBe(-10);
        expect(state.dy).toBe(-15);
    });

    test("deltas keep updating while dragging and start point is retained", () => {
        const result = sequence([down("mouse", 100, 200), move(90, 185), move(120, 230)]);
        const state = active(result.state);
        expect(state.phase).toBe("dragging");
        expect(state.startX).toBe(100);
        expect(state.startY).toBe(200);
        expect(state.dx).toBe(20);
        expect(state.dy).toBe(30);
        // The machine emits NO effect for dragging moves (the hook rAF-throttles
        // onMove itself off the dragging->dragging phase pair).
        expect(result.effects).toEqual([]);
    });

    test("moves after activation never re-emit activate and carry no effects", () => {
        const activated = dragTransition(
            dragTransition(IDLE_DRAG_STATE, down("mouse", 0, 0)).state,
            move(10, 0),
        );
        expect(activated.effects).toEqual(["activate"]);

        let state = activated.state;
        for (const event of [move(20, 5), move(30, 9), move(1, 1)]) {
            const result = dragTransition(state, event);
            expect(result.state.phase).toBe("dragging");
            expect(result.effects).toEqual([]);
            state = result.state;
        }
    });

    test("small pending moves update deltas without activating", () => {
        const result = sequence([down("mouse", 10, 10), move(8, 9)]);
        const state = active(result.state);
        expect(state.phase).toBe("pending");
        expect(state.dx).toBe(-2);
        expect(state.dy).toBe(-1);
    });
});

describe("dragging no-ops and purity", () => {
    test("holdTimerFired while dragging is a no-op", () => {
        const dragging = sequence([down("mouse", 0, 0), move(10, 0)]);
        const result = dragTransition(dragging.state, { type: "holdTimerFired" });
        expect(result.state).toEqual(dragging.state);
        expect(result.effects).toEqual([]);
    });

    test("dragTransition never mutates the input state", () => {
        const pending = dragTransition(IDLE_DRAG_STATE, down("mouse", 0, 0)).state;
        const snapshot = structuredClone(pending);
        dragTransition(pending, move(50, 50));
        dragTransition(pending, { type: "pointerUp" });
        expect(pending).toEqual(snapshot);
    });
});

describe("settle invariant — teardown is part of the machine contract", () => {
    // Every settle-class effect maps to teardown() in the hook's runEffect, so
    // any active -> idle transition MUST carry exactly one of them or gesture
    // listeners leak (the touch "scroll wins" path regression).
    const settleEffects = ["commit", "cancel", "clickThrough", "settle"] as const;

    const staleDrift: ActiveDragState = {
        phase: "pending",
        pointerType: "touch",
        startX: 0,
        startY: 0,
        x: 9,
        y: 0,
        dx: 9,
        dy: 0,
        maxDriftPx: 9,
    };

    const activeStates: [string, DragState][] = [
        ["pending mouse", sequence([down("mouse", 0, 0)]).state],
        ["pending pen", sequence([down("pen", 0, 0)]).state],
        ["pending touch (no drift)", sequence([down("touch", 0, 0)]).state],
        ["pending touch (drift 7.9)", sequence([down("touch", 0, 0), move(7.9, 0)]).state],
        ["pending touch (stale drift 9)", staleDrift],
        ["dragging mouse", sequence([down("mouse", 0, 0), move(10, 0)]).state],
        ["dragging pen", sequence([down("pen", 0, 0), move(10, 0)]).state],
        ["dragging touch", sequence([down("touch", 0, 0), { type: "holdTimerFired" }]).state],
    ];

    const events: DragMachineEvent[] = [
        down("mouse", 1, 1),
        down("touch", 1, 1),
        move(1, 0),
        move(100, 100),
        { type: "holdTimerFired" },
        { type: "pointerUp" },
        { type: "escape" },
        { type: "pointerCancel" },
        { type: "lostCapture" },
    ];

    test("every active -> idle transition carries exactly one settle-class effect; non-settling transitions carry none", () => {
        for (const [label, state] of activeStates) {
            for (const event of events) {
                const result = dragTransition(state, event);
                const count = result.effects.filter((effect) =>
                    (settleEffects as readonly string[]).includes(effect),
                ).length;
                const description = `${label} + ${event.type}`;
                if (result.state.phase === "idle") {
                    expect(count, `${description} settled to idle without exactly one settle-class effect`).toBe(1);
                } else {
                    expect(count, `${description} emitted a settle-class effect without settling`).toBe(0);
                }
            }
        }
    });
});
