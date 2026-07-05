import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import {
    Drawer,
    DrawerBody,
    DrawerContent,
    DrawerDescription,
    DrawerFooter,
    DrawerHeader,
    DrawerTitle,
    DrawerTrigger,
    drawerFrameClasses,
    drawerOverlayContentClasses,
    drawerOverlayOnlyPropKeys,
    drawerScrimClasses,
} from "./Drawer.tsx";

function asideClassTokens(html: string): string[] {
    const classAttr = /<aside[^>]*class="([^"]*)"/.exec(html)?.[1] ?? "";
    return classAttr.split(/\s+/).filter(Boolean);
}

describe("Drawer", () => {
    test("docked mode renders a plain aside with the full frame, no portal", () => {
        const html = renderToStaticMarkup(
            <DrawerContent docked>
                <DrawerHeader onClose={() => undefined}>
                    <DrawerTitle>Booking details</DrawerTitle>
                </DrawerHeader>
                <DrawerBody>Body copy</DrawerBody>
                <DrawerFooter>Footer actions</DrawerFooter>
            </DrawerContent>,
        );

        expect(html).toContain("<aside");
        expect(html).toContain("max-w-md");
        expect(html).toContain("border-l");
        expect(html).toContain("bg-surface");
        expect(html).toContain("flex-col");
        expect(html).toContain("Booking details");
        expect(html).toContain("text-xl font-semibold text-ink");
        expect(html).toContain('aria-label="Close"');
        expect(html).toContain("overflow-y-auto");
        expect(html).toContain("Body copy");
        expect(html).toContain("border-t");
        expect(html).toContain("Footer actions");
        // Docked column stays in flow: the aside itself carries no fixed
        // positioning and no floating shadow (checked on its class list, not
        // the whole markup string, to avoid substring false positives).
        const tokens = asideClassTokens(html);
        expect(tokens.length).toBeGreaterThan(0);
        expect(tokens).not.toContain("fixed");
        expect(tokens).not.toContain("shadow-overlay");
    });

    test("docked mode strips Radix overlay-only props before spreading on the aside", () => {
        const html = renderToStaticMarkup(
            <DrawerContent
                docked
                forceMount
                onEscapeKeyDown={() => undefined}
                data-testid="docked-drawer"
            >
                <DrawerBody>Body</DrawerBody>
            </DrawerContent>,
        );

        expect(drawerOverlayOnlyPropKeys).toContain("forceMount");
        expect(html).not.toContain("forceMount");
        expect(html).not.toContain("forcemount");
        // Regular HTML attributes still pass through.
        expect(html).toContain('data-testid="docked-drawer"');
    });

    test("DrawerDescription renders a plain paragraph with muted body classes in docked mode", () => {
        const html = renderToStaticMarkup(
            <DrawerContent docked>
                <DrawerHeader>
                    <DrawerTitle>Docked panel</DrawerTitle>
                    <DrawerDescription>Quiet supporting copy</DrawerDescription>
                </DrawerHeader>
            </DrawerContent>,
        );

        expect(html).toContain("<p");
        expect(html).toContain("text-sm text-ink-muted");
        expect(html).toContain("Quiet supporting copy");
    });

    test("docked header omits the close button when onClose is not provided", () => {
        const html = renderToStaticMarkup(
            <DrawerContent docked>
                <DrawerHeader>
                    <DrawerTitle>Docked panel</DrawerTitle>
                </DrawerHeader>
            </DrawerContent>,
        );

        expect(html).not.toContain('aria-label="Close"');
    });

    test("overlay mode renders trigger only while closed (portal emits nothing)", () => {
        const html = renderToStaticMarkup(
            <Drawer>
                <DrawerTrigger>Open drawer</DrawerTrigger>
                <DrawerContent>
                    <DrawerBody>Hidden body</DrawerBody>
                </DrawerContent>
            </Drawer>,
        );

        expect(html).toContain("Open drawer");
        expect(html).toContain('aria-haspopup="dialog"');
        expect(html).not.toContain("Hidden body");
    });

    test("overlay recipes pin the sheet right with scrim and shadow", () => {
        expect(drawerFrameClasses).toContain("h-full");
        expect(drawerFrameClasses).toContain("w-full max-w-md");
        expect(drawerOverlayContentClasses).toContain("fixed inset-y-0 right-0");
        expect(drawerOverlayContentClasses).toContain("shadow-overlay");
        expect(drawerOverlayContentClasses).toContain("animate-pop-in");
        expect(drawerScrimClasses).toContain("bg-rail/40");
    });
});
