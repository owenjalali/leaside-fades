import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { Checkbox } from "./Checkbox.tsx";

describe("Checkbox", () => {
    test("renders a native checkbox inside a label row", () => {
        const html = renderToStaticMarkup(<Checkbox label="Active on Mondays" />);

        expect(html).toContain("<label");
        expect(html).toContain('type="checkbox"');
        expect(html).toContain("accent-forest");
        expect(html).toContain("size-4");
        expect(html).toContain("inline-flex");
        expect(html).toContain("gap-2.5");
        expect(html).toContain("Active on Mondays");
    });

    test("supports children as the label content", () => {
        const html = renderToStaticMarkup(<Checkbox>Send reminder</Checkbox>);

        expect(html).toContain("Send reminder");
    });

    test("passes checkbox props through to the input", () => {
        const html = renderToStaticMarkup(<Checkbox label="On" defaultChecked name="active" />);

        expect(html).toContain("checked");
        expect(html).toContain('name="active"');
    });
});
