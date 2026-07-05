import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { EmptyState } from "./EmptyState.tsx";

describe("EmptyState", () => {
    test("renders title only by default", () => {
        const html = renderToStaticMarkup(<EmptyState title="No bookings yet" />);

        expect(html).toContain("No bookings yet");
        expect(html).toContain("text-sm font-semibold text-ink");
        expect(html).toContain("text-center");
        expect(html).toContain("py-12");
        expect(html).not.toContain("size-11");
        expect(html).not.toContain("mt-3");
    });

    test("renders icon wrapper, description and action when provided", () => {
        const html = renderToStaticMarkup(
            <EmptyState
                icon={<svg data-testid="icon" />}
                title="No bookings yet"
                description="New bookings will appear here."
                action={<button type="button">Add booking</button>}
            />,
        );

        expect(html).toContain("size-11");
        expect(html).toContain("rounded-full");
        expect(html).toContain("bg-surface-muted");
        expect(html).toContain("text-ink-faint");
        expect(html).toContain("New bookings will appear here.");
        expect(html).toContain("max-w-sm");
        expect(html).toContain("mt-3");
        expect(html).toContain("Add booking");
    });
});
