import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    dropdownMenuContentClasses,
    dropdownMenuItemClasses,
    dropdownMenuItemDestructiveClasses,
    dropdownMenuLabelClasses,
    dropdownMenuSeparatorClasses,
} from "./DropdownMenu.tsx";

describe("DropdownMenu", () => {
    test("closed menu renders the trigger only (portal content emits nothing)", () => {
        const html = renderToStaticMarkup(
            <DropdownMenu>
                <DropdownMenuTrigger>Actions</DropdownMenuTrigger>
                <DropdownMenuContent>
                    <DropdownMenuLabel>Booking</DropdownMenuLabel>
                    <DropdownMenuItem>Edit</DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem destructive>Delete</DropdownMenuItem>
                </DropdownMenuContent>
            </DropdownMenu>,
        );

        expect(html).toContain("Actions");
        expect(html).toContain('aria-haspopup="menu"');
        expect(html).toContain('data-state="closed"');
        expect(html).not.toContain("Edit");
        expect(html).not.toContain("Delete");
    });

    test("content recipe uses popover-tier styling", () => {
        expect(dropdownMenuContentClasses).toContain("min-w-[180px]");
        expect(dropdownMenuContentClasses).toContain("rounded-card");
        expect(dropdownMenuContentClasses).toContain("border-border");
        expect(dropdownMenuContentClasses).toContain("bg-surface");
        expect(dropdownMenuContentClasses).toContain("p-1");
        expect(dropdownMenuContentClasses).toContain("shadow-pop");
        expect(dropdownMenuContentClasses).toContain("animate-pop-in");
    });

    test("item recipe covers highlight, disabled, and destructive states", () => {
        expect(dropdownMenuItemClasses).toContain("rounded-control");
        expect(dropdownMenuItemClasses).toContain("px-2.5 py-2");
        expect(dropdownMenuItemClasses).toContain("text-sm text-ink");
        expect(dropdownMenuItemClasses).toContain("data-[highlighted]:bg-surface-muted");
        expect(dropdownMenuItemClasses).toContain("data-[disabled]:opacity-50");
        expect(dropdownMenuItemDestructiveClasses).toContain("text-danger");
        expect(dropdownMenuItemDestructiveClasses).toContain("data-[highlighted]:bg-danger-soft");
    });

    test("separator and label recipes are hairline-quiet", () => {
        expect(dropdownMenuSeparatorClasses).toBe("my-1 h-px bg-border");
        expect(dropdownMenuLabelClasses).toBe("px-2.5 py-1.5 text-xs font-medium text-ink-muted");
    });
});
