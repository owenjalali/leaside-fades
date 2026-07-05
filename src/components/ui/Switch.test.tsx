import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { Switch } from "./Switch.tsx";

describe("Switch", () => {
    test("renders an unchecked switch with track and thumb recipes", () => {
        const html = renderToStaticMarkup(<Switch />);

        expect(html).toContain('role="switch"');
        expect(html).toContain('aria-checked="false"');
        expect(html).toContain('data-state="unchecked"');
        expect(html).toContain("bg-border-strong");
        expect(html).toContain("data-[state=checked]:bg-forest");
        expect(html).toContain("translate-x-0.5");
        expect(html).toContain("data-[state=checked]:translate-x-[18px]");
        expect(html).toContain("focus-visible:ring-2");
        expect(html).not.toContain("<label");
    });

    test("reflects defaultChecked in aria state", () => {
        const html = renderToStaticMarkup(<Switch defaultChecked />);

        expect(html).toContain('aria-checked="true"');
        expect(html).toContain('data-state="checked"');
    });

    test("renders an inline label row when label is provided", () => {
        const html = renderToStaticMarkup(<Switch label="Enable reminders" />);

        expect(html).toContain("<label");
        expect(html).toContain("inline-flex");
        expect(html).toContain("gap-2.5");
        expect(html).toContain("Enable reminders");
        expect(html).toContain('role="switch"');
    });

    test("supports disabled state", () => {
        const html = renderToStaticMarkup(<Switch disabled />);

        expect(html).toContain("disabled");
        expect(html).toContain("disabled:opacity-50");
    });
});
