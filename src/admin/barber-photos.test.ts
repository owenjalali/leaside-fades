import { describe, expect, test } from "vitest";

import { getAdminBarberPhotoUrl } from "./barber-photos";

describe("admin barber photos", () => {
    test("resolves launch barbers to their repo profile assets by slug", () => {
        expect(getAdminBarberPhotoUrl({ displayName: "Sam To", slug: "sam-to" })).toContain("sam-thumb");
        expect(getAdminBarberPhotoUrl({ displayName: "Laura Nguyen", slug: "laura-nguyen" })).toContain("laura-thumb");
        expect(getAdminBarberPhotoUrl({ displayName: "Yogesh Kumar", slug: "yogesh-kumar" })).toContain("yogesh-thumb");
        expect(getAdminBarberPhotoUrl({ displayName: "Shayan Hussain", slug: "shayan-hussain" })).toContain("shayon-thumb");
    });

    test("falls back to the display name when a slug is unavailable", () => {
        expect(getAdminBarberPhotoUrl({ displayName: "Laura Nguyen" })).toContain("laura-thumb");
        expect(getAdminBarberPhotoUrl({ displayName: "  Yogesh Kumar  " })).toContain("yogesh-thumb");
    });

    test("returns undefined when no repo profile asset exists", () => {
        expect(getAdminBarberPhotoUrl({ displayName: "Future Barber", slug: "future-barber" })).toBeUndefined();
    });
});
