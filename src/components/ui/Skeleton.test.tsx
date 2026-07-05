import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { Skeleton } from "./Skeleton.tsx";

describe("Skeleton", () => {
    test("renders a hidden pulsing placeholder", () => {
        const html = renderToStaticMarkup(<Skeleton />);

        expect(html).toContain('aria-hidden="true"');
        expect(html).toContain("animate-pulse");
        expect(html).toContain("bg-surface-muted");
        expect(html).toContain("rounded-control");
        expect(html).toContain("motion-reduce:animate-none");
    });

    test("accepts sizing via className", () => {
        const html = renderToStaticMarkup(<Skeleton className="h-4 w-32" />);

        expect(html).toContain("h-4");
        expect(html).toContain("w-32");
    });
});
