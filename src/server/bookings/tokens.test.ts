import { describe, expect, test } from "vitest";

import {
    generateBookingManagementToken,
    hashBookingManagementToken,
} from "./tokens.ts";

describe("Phase 8 booking management tokens", () => {
    test("generates opaque random tokens and stores only deterministic hashes", () => {
        const tokenA = generateBookingManagementToken();
        const tokenB = generateBookingManagementToken();

        expect(tokenA).toMatch(/^[A-Za-z0-9_-]{40,}$/);
        expect(tokenB).toMatch(/^[A-Za-z0-9_-]{40,}$/);
        expect(tokenA).not.toBe(tokenB);
        expect(hashBookingManagementToken(tokenA)).toBe(hashBookingManagementToken(tokenA));
        expect(hashBookingManagementToken(tokenA)).not.toBe(tokenA);
        expect(hashBookingManagementToken(tokenA)).not.toBe(hashBookingManagementToken(tokenB));
    });
});
