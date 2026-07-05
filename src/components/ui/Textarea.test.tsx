import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { Textarea } from "./Textarea.tsx";

describe("Textarea", () => {
    test("renders a textarea with the control recipe and multiline sizing", () => {
        const html = renderToStaticMarkup(<Textarea placeholder="Notes" />);

        expect(html).toContain("<textarea");
        expect(html).toContain("h-auto");
        expect(html).toContain("min-h-24");
        expect(html).toContain("py-2.5");
        expect(html).toContain("rounded-control");
        expect(html).toContain("focus:border-emerald");
        expect(html).not.toContain("h-10");
    });

    test("carries aria-invalid styling hooks", () => {
        const html = renderToStaticMarkup(<Textarea aria-invalid />);

        expect(html).toContain('aria-invalid="true"');
        expect(html).toContain("aria-invalid:border-danger");
    });
});
