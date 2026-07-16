import { createHash, timingSafeEqual } from "node:crypto";

export function matchesCronBearer(
    authorization: string | undefined,
    secret: string,
): boolean {
    const match = authorization?.match(/^Bearer ([^\s]+)$/);

    if (!match) {
        return false;
    }

    const actual = createHash("sha256").update(match[1], "utf8").digest();
    const expected = createHash("sha256").update(secret, "utf8").digest();

    return timingSafeEqual(actual, expected);
}
