import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { Input } from "./Input.tsx";

describe("Input", () => {
    test("renders a text input with the control base and focus recipes", () => {
        const html = renderToStaticMarkup(<Input placeholder="Name" />);

        expect(html).toContain('type="text"');
        expect(html).toContain("h-10");
        expect(html).toContain("rounded-control");
        expect(html).toContain("border-border");
        expect(html).toContain("placeholder:text-ink-faint");
        expect(html).toContain("focus:border-emerald");
        expect(html).toContain("focus:ring-green/25");
    });

    test("accepts other input types", () => {
        const html = renderToStaticMarkup(<Input type="email" />);

        expect(html).toContain('type="email"');
    });

    test("carries aria-invalid styling hooks", () => {
        const html = renderToStaticMarkup(<Input aria-invalid />);

        expect(html).toContain('aria-invalid="true"');
        expect(html).toContain("aria-invalid:border-danger");
        expect(html).toContain("aria-invalid:ring-danger/20");
    });

    test("merges custom className", () => {
        const html = renderToStaticMarkup(<Input className="max-w-40" />);

        expect(html).toContain("max-w-40");
    });
});
