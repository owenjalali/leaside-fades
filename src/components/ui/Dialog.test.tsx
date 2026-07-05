import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogTitle,
    DialogTrigger,
    dialogCloseButtonClasses,
    dialogContentClasses,
    dialogScrimClasses,
    dialogSizeClasses,
} from "./Dialog.tsx";

describe("Dialog", () => {
    test("closed dialog renders the trigger only (portal content emits nothing)", () => {
        const html = renderToStaticMarkup(
            <Dialog>
                <DialogTrigger>Open settings</DialogTrigger>
                <DialogContent>
                    <DialogTitle>Settings</DialogTitle>
                </DialogContent>
            </Dialog>,
        );

        expect(html).toContain("Open settings");
        expect(html).toContain('aria-haspopup="dialog"');
        expect(html).toContain('data-state="closed"');
        expect(html).not.toContain("Settings");
    });

    test("title and description carry the type recipes", () => {
        const html = renderToStaticMarkup(
            <Dialog open>
                <DialogTitle>Edit booking</DialogTitle>
                <DialogDescription>Change the time or barber.</DialogDescription>
            </Dialog>,
        );

        expect(html).toContain("Edit booking");
        expect(html).toContain("text-xl font-semibold text-ink");
        expect(html).toContain("Change the time or barber.");
        expect(html).toContain("text-sm text-ink-muted");
    });

    test("size map covers sm/md/lg", () => {
        expect(dialogSizeClasses.sm).toBe("max-w-sm");
        expect(dialogSizeClasses.md).toBe("max-w-md");
        expect(dialogSizeClasses.lg).toBe("max-w-lg");
    });

    test("content recipe uses the overlay surface and motion tokens", () => {
        expect(dialogContentClasses).toContain("rounded-card");
        expect(dialogContentClasses).toContain("border-border");
        expect(dialogContentClasses).toContain("bg-surface");
        expect(dialogContentClasses).toContain("shadow-overlay");
        expect(dialogContentClasses).toContain("animate-pop-in");
        expect(dialogContentClasses).toContain("motion-reduce:animate-none");
        expect(dialogContentClasses).toContain("p-6");
    });

    test("scrim and close button recipes are correct", () => {
        expect(dialogScrimClasses).toContain("fixed inset-0");
        expect(dialogScrimClasses).toContain("bg-rail/40");
        expect(dialogScrimClasses).toContain("animate-fade-in");
        expect(dialogScrimClasses).toContain("motion-reduce:animate-none");
        expect(dialogCloseButtonClasses).toContain("absolute right-4 top-4");
        expect(dialogCloseButtonClasses).toContain("hover:bg-surface-muted");
    });
});
