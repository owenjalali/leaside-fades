import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import {
    TOAST_DEFAULT_DURATION_MS,
    TOAST_MAX_VISIBLE,
    ToastItem,
    ToastProvider,
    toastItemClasses,
    toastToneIconClasses,
    toastToneIcons,
    toastViewportClasses,
    useToast,
} from "./toast.tsx";

function HookConsumer() {
    useToast();
    return <span>ok</span>;
}

describe("ToastItem", () => {
    test("renders as a polite status with the rail surface", () => {
        const html = renderToStaticMarkup(
            <ToastItem message="Booking saved" title="Success" tone="success" />,
        );

        expect(html).toContain('role="status"');
        expect(html).toContain("bg-rail");
        expect(html).toContain("text-white");
        expect(html).toContain("rounded-card");
        expect(html).toContain("shadow-overlay");
        expect(html).toContain("animate-pop-in");
        expect(html).toContain("motion-reduce:animate-none");
        expect(html).toContain("Booking saved");
        expect(html).toContain("font-semibold");
        expect(html).toContain("Success");
        expect(html).toContain('aria-label="Dismiss"');
    });

    test("tone icons carry their color classes", () => {
        const success = renderToStaticMarkup(<ToastItem message="m" tone="success" />);
        const error = renderToStaticMarkup(<ToastItem message="m" tone="error" />);
        const info = renderToStaticMarkup(<ToastItem message="m" tone="info" />);

        expect(success).toContain("text-success-soft");
        expect(error).toContain("text-danger-soft");
        expect(info).toContain("text-info-soft");
        // lucide renders svg icons at size 16
        expect(success).toContain("<svg");
        expect(success).toContain('width="16"');
    });

    test("tone defaults to info and title is optional", () => {
        const html = renderToStaticMarkup(<ToastItem message="Just a note" />);

        expect(html).toContain("text-info-soft");
        expect(html).not.toContain("font-semibold");
    });

    test("tone maps stay in sync", () => {
        expect(Object.keys(toastToneIcons).sort()).toEqual(["error", "info", "success"]);
        expect(Object.keys(toastToneIconClasses).sort()).toEqual(["error", "info", "success"]);
        expect(toastItemClasses).toContain("items-start gap-3");
    });
});

describe("ToastProvider", () => {
    test("renders children plus a fixed polite viewport (no portal)", () => {
        const html = renderToStaticMarkup(
            <ToastProvider>
                <p>App content</p>
            </ToastProvider>,
        );

        expect(html).toContain("App content");
        expect(html).toContain('aria-live="polite"');
        expect(html).toContain("fixed bottom-4 right-4");
        expect(html).toContain("z-[100]");
        expect(html).toContain("w-[min(380px,calc(100vw-2rem))]");
        expect(toastViewportClasses).toContain("space-y-2");
    });

    test("useToast works inside the provider and throws outside", () => {
        const html = renderToStaticMarkup(
            <ToastProvider>
                <HookConsumer />
            </ToastProvider>,
        );
        expect(html).toContain("ok");

        expect(() => renderToStaticMarkup(<HookConsumer />)).toThrowError(
            /within a ToastProvider/,
        );
    });

    test("timing constants match the contract", () => {
        expect(TOAST_DEFAULT_DURATION_MS).toBe(4500);
        expect(TOAST_MAX_VISIBLE).toBe(3);
    });
});
