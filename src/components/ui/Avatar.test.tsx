import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { Avatar } from "./Avatar.tsx";

describe("Avatar", () => {
    test("renders an img when photoUrl is provided", () => {
        const html = renderToStaticMarkup(<Avatar name="Josef K" photoUrl="/photos/josef.jpg" />);

        expect(html).toContain("<img");
        expect(html).toContain('src="/photos/josef.jpg"');
        expect(html).toContain('alt="Josef K"');
        expect(html).toContain("rounded-full");
        expect(html).toContain("object-cover");
        expect(html).toContain("border-border");
    });

    test("falls back to initials from the first two words", () => {
        const html = renderToStaticMarkup(<Avatar name="josef karim smith" />);

        expect(html).not.toContain("<img");
        expect(html).toContain(">JK<");
        expect(html).toContain('aria-hidden="true"');
        expect(html).toContain("sr-only");
        expect(html).toContain('title="josef karim smith"');
        expect(html).toContain("bg-mint");
        expect(html).toContain("text-forest");
    });

    test.each([
        ["sm", "size-7", "text-[10px]"],
        ["md", "size-9", "text-xs"],
        ["lg", "size-12", "text-sm"],
    ] as const)("size %s maps to %s / %s", (size, sizeClass, textClass) => {
        const html = renderToStaticMarkup(<Avatar name="Ana Doe" size={size} />);

        expect(html).toContain(sizeClass);
        expect(html).toContain(textClass);
    });

    test("defaults to md size", () => {
        const html = renderToStaticMarkup(<Avatar name="Ana Doe" />);

        expect(html).toContain("size-9");
    });
});
