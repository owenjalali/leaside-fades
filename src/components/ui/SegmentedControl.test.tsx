import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { SegmentedControl } from "./SegmentedControl.tsx";

const options = [
    { value: "week", label: "Week" },
    { value: "month", label: "Month" },
];

describe("SegmentedControl", () => {
    test("renders a labelled radiogroup with one radio per option", () => {
        const html = renderToStaticMarkup(
            <SegmentedControl options={options} value="week" onChange={() => {}} aria-label="Calendar view" />,
        );

        expect(html).toContain('role="radiogroup"');
        expect(html).toContain('aria-label="Calendar view"');
        expect((html.match(/role="radio"/g) ?? []).length).toBe(2);
        expect(html).toContain('type="button"');
        expect(html).toContain("Week");
        expect(html).toContain("Month");
    });

    test("marks only the active option as checked with the active recipe", () => {
        const html = renderToStaticMarkup(
            <SegmentedControl options={options} value="month" onChange={() => {}} aria-label="Calendar view" />,
        );

        expect((html.match(/aria-checked="true"/g) ?? []).length).toBe(1);
        expect((html.match(/aria-checked="false"/g) ?? []).length).toBe(1);
        expect(html).toContain("bg-surface");
        expect(html).toContain("shadow-card");
        expect(html).toContain("text-ink-muted");
    });

    test("container uses the muted well recipe", () => {
        const html = renderToStaticMarkup(
            <SegmentedControl options={options} value="week" onChange={() => {}} aria-label="Calendar view" />,
        );

        expect(html).toContain("bg-surface-muted");
        expect(html).toContain("rounded-control");
        expect(html).toContain("p-1");
    });
});
