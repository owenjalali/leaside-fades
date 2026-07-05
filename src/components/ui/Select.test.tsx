import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { Select } from "./Select.tsx";

describe("Select", () => {
    test("renders a native select with appearance-none and chevron room", () => {
        const html = renderToStaticMarkup(
            <Select defaultValue="men">
                <option value="men">Men</option>
                <option value="women">Women</option>
            </Select>,
        );

        expect(html).toContain("<select");
        expect(html).toContain("appearance-none");
        expect(html).toContain("pr-9");
        expect(html).toContain("rounded-control");
        expect(html).toContain("Men");
    });

    test("renders the decorative chevron outside the select", () => {
        const html = renderToStaticMarkup(
            <Select>
                <option>One</option>
            </Select>,
        );

        expect(html).toContain("lucide-chevron-down");
        expect(html).toContain("pointer-events-none");
        expect(html).toContain('aria-hidden="true"');
        expect(html).toContain("text-ink-faint");
    });
});
