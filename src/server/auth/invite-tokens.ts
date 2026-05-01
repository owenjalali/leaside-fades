import { createHash, randomBytes } from "node:crypto";

export function generateUserInviteToken() {
    return randomBytes(32).toString("base64url");
}

export function hashUserInviteToken(token: string) {
    return createHash("sha256").update(token).digest("hex");
}
