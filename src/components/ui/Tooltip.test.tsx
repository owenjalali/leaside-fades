import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { Tooltip, TooltipProvider, tooltipContentClasses } from "./Tooltip.tsx";

describe("Tooltip", () => {
    test("wraps the child as trigger; closed content emits nothing", () => {
        const html = renderToStaticMarkup(
            <TooltipProvider>
                <Tooltip content="Delete booking">
                    <button type="button">Delete</button>
                </Tooltip>
            </TooltipProvider>,
        );

        expect(html).toContain("Delete</button>");
        expect(html).toContain('data-state="closed"');
        expect(html).not.toContain("Delete booking");
    });

    test("content recipe is a quiet rail chip", () => {
        expect(tooltipContentClasses).toContain("bg-rail");
        expect(tooltipContentClasses).toContain("text-white");
        expect(tooltipContentClasses).toContain("text-xs font-medium");
        expect(tooltipContentClasses).toContain("rounded-control");
        expect(tooltipContentClasses).toContain("px-2 py-1");
        expect(tooltipContentClasses).toContain("shadow-pop");
        expect(tooltipContentClasses).toContain("animate-fade-in");
        expect(tooltipContentClasses).toContain("motion-reduce:animate-none");
    });
});
