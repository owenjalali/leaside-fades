import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { DateInput } from "./DateInput.tsx";

describe("DateInput", () => {
    test("always renders type=date with the control recipe", () => {
        const html = renderToStaticMarkup(<DateInput />);

        expect(html).toContain('type="date"');
        expect(html).toContain("h-10");
        expect(html).toContain("rounded-control");
        expect(html).toContain("focus:border-emerald");
    });

    test("carries aria-invalid styling hooks", () => {
        const html = renderToStaticMarkup(<DateInput aria-invalid />);

        expect(html).toContain('aria-invalid="true"');
        expect(html).toContain("aria-invalid:border-danger");
    });
});
