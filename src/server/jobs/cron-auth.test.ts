import { describe, expect, test } from "vitest";

import { matchesCronBearer } from "./cron-auth.ts";

describe("cron bearer authentication", () => {
    const secret = "cron-secret-for-test";

    test.each([
        undefined,
        "",
        "Basic cron-secret-for-test",
        "Bearer",
        "Bearer ",
        "Bearer short",
        "Bearer cron-secret-for-tesu",
    ])("rejects an invalid authorization value: %s", (authorization) => {
        expect(matchesCronBearer(authorization, secret)).toBe(false);
    });

    test("accepts the exact bearer secret", () => {
        expect(matchesCronBearer(`Bearer ${secret}`, secret)).toBe(true);
    });
});
