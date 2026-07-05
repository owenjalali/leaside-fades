import { describe, expect, test } from "vitest";

import { bookingTone, statusTone } from "./status-tones.ts";

const STATUS_TONES = ["success", "danger", "warning", "info"] as const;
const BOOKING_TONES = ["men", "women", "boys", "mixed", "noshow", "completed", "cancelled"] as const;

describe("statusTone", () => {
    test("defines every status tone", () => {
        expect(Object.keys(statusTone).sort()).toEqual([...STATUS_TONES].sort());
    });

    test.each(STATUS_TONES)("%s classes reference the tone token", (tone) => {
        const classes = statusTone[tone];
        expect(classes.text).toBe(`text-${tone}`);
        expect(classes.softBg).toBe(`bg-${tone}-soft`);
        expect(classes.solidBg).toBe(`bg-${tone}`);
        expect(classes.solidText.length).toBeGreaterThan(0);
    });
});

describe("bookingTone", () => {
    test("defines every booking tone", () => {
        expect(Object.keys(bookingTone).sort()).toEqual([...BOOKING_TONES].sort());
    });

    test.each(BOOKING_TONES)("%s classes reference only the tone token utilities", (tone) => {
        const classes = bookingTone[tone];
        expect(classes.text).toBe(`text-tone-${tone}`);
        expect(classes.softBg).toBe(`bg-tone-${tone}-soft`);
        expect(classes.border).toBe(`border-tone-${tone}`);
    });
});
