import { describe, expect, test } from "vitest";

import { getAppSurface } from "./app-routing";

describe("app route selection", () => {
    test("routes customer management before the public booking wizard", () => {
        expect(getAppSurface("/booking/token-123/reschedule")).toBe("customer-booking");
        expect(getAppSurface("/booking/token-123/cancel")).toBe("customer-booking");
        expect(getAppSurface("/book/time")).toBe("booking");
        expect(getAppSurface("/admin/calendar")).toBe("admin");
        expect(getAppSurface("/")).toBe("marketing");
    });
});
