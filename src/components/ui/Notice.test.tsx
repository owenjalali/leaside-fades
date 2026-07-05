import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { Notice } from "./Notice.tsx";

describe("Notice", () => {
    test.each([
        ["success", "bg-success-soft", "text-success", "status"],
        ["error", "bg-danger-soft", "text-danger", "alert"],
        ["warning", "bg-warning-soft", "text-warning", "status"],
        ["info", "bg-info-soft", "text-info", "status"],
    ] as const)("maps the %s tone to soft bg + strong text with an icon", (tone, bg, text, role) => {
        const html = renderToStaticMarkup(<Notice tone={tone}>Saved</Notice>);

        expect(html).toContain(bg);
        expect(html).toContain(text);
        expect(html).toContain("<svg");
        expect(html).toContain(`role="${role}"`);
        expect(html).toContain("rounded-control");
        expect(html).toContain("Saved");
    });

    test("renders a dismiss button only when onClear is provided", () => {
        const withClear = renderToStaticMarkup(
            <Notice tone="info" onClear={() => {}}>
                Heads up
            </Notice>,
        );
        const withoutClear = renderToStaticMarkup(<Notice tone="info">Heads up</Notice>);

        expect(withClear).toContain('aria-label="Dismiss"');
        expect(withClear).toContain('type="button"');
        expect(withoutClear).not.toContain('aria-label="Dismiss"');
    });
});
