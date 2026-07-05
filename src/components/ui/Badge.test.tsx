import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { Badge } from "./Badge.tsx";

describe("Badge", () => {
    test("defaults to the neutral tone", () => {
        const html = renderToStaticMarkup(<Badge>Draft</Badge>);

        expect(html).toContain("bg-surface-muted");
        expect(html).toContain("text-ink-muted");
        expect(html).toContain("border-border");
        expect(html).toContain("rounded-full");
        expect(html).toContain("text-xs");
        expect(html).toContain("Draft");
    });

    test.each([
        ["success", "bg-success-soft", "text-success"],
        ["danger", "bg-danger-soft", "text-danger"],
        ["warning", "bg-warning-soft", "text-warning"],
        ["info", "bg-info-soft", "text-info"],
    ] as const)("maps the %s tone to soft bg + strong text", (tone, bg, text) => {
        const html = renderToStaticMarkup(<Badge tone={tone}>Label</Badge>);

        expect(html).toContain(bg);
        expect(html).toContain(text);
        expect(html).not.toContain("border-border");
    });

    test("merges className", () => {
        const html = renderToStaticMarkup(<Badge className="ml-2">Late</Badge>);

        expect(html).toContain("ml-2");
    });
});
