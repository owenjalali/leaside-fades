import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test, vi } from "vitest";

import {
    ConfirmDialogProvider,
    confirmToneButtonVariant,
    emptyConfirmQueue,
    enqueueConfirm,
    flushConfirm,
    settleConfirm,
    useConfirm,
} from "./ConfirmDialog.tsx";
import type { ConfirmRequest } from "./ConfirmDialog.tsx";

function makeRequest(title: string): ConfirmRequest {
    return { opts: { title }, resolve: vi.fn() };
}

function HookConsumer() {
    useConfirm();
    return <span>ok</span>;
}

describe("ConfirmDialog", () => {
    test("provider renders children; idle dialog portals nothing", () => {
        const html = renderToStaticMarkup(
            <ConfirmDialogProvider>
                <p>App content</p>
            </ConfirmDialogProvider>,
        );

        expect(html).toContain("App content");
        expect(html).not.toContain('role="dialog"');
        expect(html).not.toContain("Confirm");
    });

    test("useConfirm resolves from the provider without throwing", () => {
        const html = renderToStaticMarkup(
            <ConfirmDialogProvider>
                <HookConsumer />
            </ConfirmDialogProvider>,
        );

        expect(html).toContain("ok");
    });

    test("useConfirm throws outside the provider", () => {
        expect(() => renderToStaticMarkup(<HookConsumer />)).toThrowError(
            /within a ConfirmDialogProvider/,
        );
    });

    test("tone map routes danger to the danger button variant", () => {
        expect(confirmToneButtonVariant.danger).toBe("danger");
        expect(confirmToneButtonVariant.default).toBe("primary");
    });
});

describe("confirm queue", () => {
    test("first request becomes active; later requests queue FIFO", () => {
        const a = makeRequest("a");
        const b = makeRequest("b");
        const c = makeRequest("c");

        let state = enqueueConfirm(emptyConfirmQueue, a);
        expect(state.active).toBe(a);
        expect(state.pending).toEqual([]);

        state = enqueueConfirm(state, b);
        state = enqueueConfirm(state, c);
        expect(state.active).toBe(a);
        expect(state.pending).toEqual([b, c]);
        expect(a.resolve).not.toHaveBeenCalled();
    });

    test("settle resolves the active request and promotes the next in order", () => {
        const a = makeRequest("a");
        const b = makeRequest("b");
        const c = makeRequest("c");
        let state = enqueueConfirm(emptyConfirmQueue, a);
        state = enqueueConfirm(state, b);
        state = enqueueConfirm(state, c);

        state = settleConfirm(state, true);
        expect(a.resolve).toHaveBeenCalledExactlyOnceWith(true);
        expect(state.active).toBe(b);
        expect(state.pending).toEqual([c]);

        state = settleConfirm(state, false);
        expect(b.resolve).toHaveBeenCalledExactlyOnceWith(false);
        expect(state.active).toBe(c);

        state = settleConfirm(state, true);
        expect(c.resolve).toHaveBeenCalledExactlyOnceWith(true);
        expect(state.active).toBeNull();
        expect(state.pending).toEqual([]);
    });

    test("settle with no active request is a no-op", () => {
        const state = settleConfirm(emptyConfirmQueue, false);
        expect(state.active).toBeNull();
        expect(state.pending).toEqual([]);
    });

    test("flush resolves every outstanding request with false", () => {
        const a = makeRequest("a");
        const b = makeRequest("b");
        let state = enqueueConfirm(emptyConfirmQueue, a);
        state = enqueueConfirm(state, b);

        state = flushConfirm(state);
        expect(a.resolve).toHaveBeenCalledExactlyOnceWith(false);
        expect(b.resolve).toHaveBeenCalledExactlyOnceWith(false);
        expect(state.active).toBeNull();
        expect(state.pending).toEqual([]);
    });
});
