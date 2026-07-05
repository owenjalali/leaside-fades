import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { Button, IconButton } from "./Button.tsx";

describe("Button", () => {
    test("defaults to type=button with primary md recipe classes", () => {
        const html = renderToStaticMarkup(<Button>Save</Button>);

        expect(html).toContain('type="button"');
        expect(html).toContain("rounded-control");
        expect(html).toContain("bg-forest");
        expect(html).toContain("hover:bg-emerald");
        expect(html).toContain("h-10");
        expect(html).toContain("px-4");
        expect(html).toContain("Save");
    });

    test("secondary variant emits its recipe classes", () => {
        const html = renderToStaticMarkup(<Button variant="secondary">Cancel</Button>);

        expect(html).toContain("border-border");
        expect(html).toContain("bg-surface");
        expect(html).toContain("hover:bg-surface-muted");
    });

    test("ghost variant emits its recipe classes", () => {
        const html = renderToStaticMarkup(<Button variant="ghost">More</Button>);

        expect(html).toContain("text-ink");
        expect(html).toContain("hover:bg-surface-muted");
        expect(html).not.toContain("bg-forest");
    });

    test("danger variant emits its recipe classes", () => {
        const html = renderToStaticMarkup(<Button variant="danger">Delete</Button>);

        expect(html).toContain("bg-danger");
        expect(html).toContain("hover:bg-danger/90");
    });

    test("sm and lg sizes emit their recipe classes", () => {
        const sm = renderToStaticMarkup(<Button size="sm">Small</Button>);
        const lg = renderToStaticMarkup(<Button size="lg">Large</Button>);

        expect(sm).toContain("h-9");
        expect(sm).toContain("px-3");
        expect(lg).toContain("h-12");
        expect(lg).toContain("px-5");
        expect(lg).toContain("text-base");
    });

    test("loading renders spinner, disables the button, and sets aria-busy", () => {
        const html = renderToStaticMarkup(<Button loading>Saving</Button>);

        expect(html).toContain("disabled");
        expect(html).toContain('aria-busy="true"');
        expect(html).toContain("animate-spin");
    });

    test("supports submit type override", () => {
        const html = renderToStaticMarkup(<Button type="submit">Send</Button>);

        expect(html).toContain('type="submit"');
    });
});

describe("IconButton", () => {
    test("renders its required aria-label with square default size", () => {
        const html = renderToStaticMarkup(<IconButton aria-label="Close">x</IconButton>);

        expect(html).toContain('aria-label="Close"');
        expect(html).toContain("size-10");
        expect(html).toContain('type="button"');
    });

    test("sm and lg sizes stay square", () => {
        const sm = renderToStaticMarkup(<IconButton aria-label="Edit" size="sm">e</IconButton>);
        const lg = renderToStaticMarkup(<IconButton aria-label="Edit" size="lg">e</IconButton>);

        expect(sm).toContain("size-9");
        expect(lg).toContain("size-12");
    });

    test("defaults to the ghost variant but accepts overrides", () => {
        const ghost = renderToStaticMarkup(<IconButton aria-label="More">m</IconButton>);
        const danger = renderToStaticMarkup(
            <IconButton aria-label="Delete" variant="danger">d</IconButton>,
        );

        expect(ghost).toContain("hover:bg-surface-muted");
        expect(ghost).not.toContain("bg-forest");
        expect(danger).toContain("bg-danger");
    });

    test("loading disables and replaces the icon with a spinner", () => {
        const html = renderToStaticMarkup(<IconButton aria-label="Save" loading>s</IconButton>);

        expect(html).toContain("disabled");
        expect(html).toContain('aria-busy="true"');
        expect(html).toContain("animate-spin");
    });
});
