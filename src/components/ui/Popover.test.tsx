import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { Popover, PopoverContent, PopoverTrigger, popoverContentClasses } from "./Popover.tsx";

describe("Popover", () => {
    test("closed popover renders the trigger only (portal content emits nothing)", () => {
        const html = renderToStaticMarkup(
            <Popover>
                <PopoverTrigger>Filters</PopoverTrigger>
                <PopoverContent>Hidden panel</PopoverContent>
            </Popover>,
        );

        expect(html).toContain("Filters");
        expect(html).toContain('aria-haspopup="dialog"');
        expect(html).toContain('data-state="closed"');
        expect(html).not.toContain("Hidden panel");
    });

    test("content recipe uses popover-tier styling", () => {
        expect(popoverContentClasses).toContain("rounded-card");
        expect(popoverContentClasses).toContain("border-border");
        expect(popoverContentClasses).toContain("bg-surface");
        expect(popoverContentClasses).toContain("p-4");
        expect(popoverContentClasses).toContain("shadow-pop");
        expect(popoverContentClasses).toContain("animate-pop-in");
        expect(popoverContentClasses).toContain("motion-reduce:animate-none");
        expect(popoverContentClasses).toContain("min-w-[240px]");
        expect(popoverContentClasses).toContain("outline-none");
    });
});
