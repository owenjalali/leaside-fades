import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { Spinner } from "./Spinner.tsx";

describe("Spinner", () => {
    test("renders a status region with sr-only label and spinning icon", () => {
        const html = renderToStaticMarkup(<Spinner />);

        expect(html).toContain('role="status"');
        expect(html).toContain("sr-only");
        expect(html).toContain("Loading");
        expect(html).toContain("animate-spin");
        expect(html).toContain("text-ink-muted");
        expect(html).toContain("motion-reduce:animate-none");
        expect(html).toContain('width="20"');
    });

    test("supports the sm size and a custom label", () => {
        const html = renderToStaticMarkup(<Spinner size="sm" label="Saving" />);

        expect(html).toContain('width="16"');
        expect(html).toContain("Saving");
    });
});
