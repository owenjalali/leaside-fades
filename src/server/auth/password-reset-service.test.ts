import { afterEach, describe, expect, test, vi } from "vitest";

import { hashPassword, verifyPassword } from "./password.ts";
import { hashPasswordResetToken } from "./reset-tokens.ts";
import {
    PASSWORD_RESET_GENERIC_MESSAGE,
    requestPasswordReset,
    resetAdminPassword,
    type PasswordResetDelivery,
    type PasswordResetRepository,
    type PasswordResetTokenRecord,
    type PasswordResetUserRecord,
} from "./password-reset-service.ts";
import { hashSessionToken } from "./session-tokens.ts";
import type { AuthSessionRecord } from "./service.ts";

const ownerId = "11111111-1111-1111-1111-111111111111";
const now = new Date("2026-04-27T15:00:00.000Z");

class InMemoryPasswordResetRepository implements PasswordResetRepository {
    users: PasswordResetUserRecord[] = [];
    resetTokens: PasswordResetTokenRecord[] = [];
    sessions: AuthSessionRecord[] = [];

    async findActiveUserByEmail(email: string) {
        return this.users.find((user) => user.email === email && user.active) ?? null;
    }

    async createPasswordResetToken(
        token: Omit<PasswordResetTokenRecord, "id" | "usedAt">,
    ) {
        const created: PasswordResetTokenRecord = {
            id: `reset-token-${this.resetTokens.length + 1}`,
            usedAt: null,
            ...token,
        };
        this.resetTokens.push(created);
        return created;
    }

    async findPasswordResetTokenByHash(tokenHash: string) {
        const token = this.resetTokens.find((candidate) => candidate.tokenHash === tokenHash);
        const user = token
            ? this.users.find((candidate) => candidate.id === token.userId && candidate.active)
            : undefined;

        return token && user ? { token, user } : null;
    }

    async completePasswordReset(input: {
        tokenId: string;
        userId: string;
        passwordHash: string;
        usedAt: Date;
    }) {
        const token = this.resetTokens.find((candidate) => candidate.id === input.tokenId);
        const user = this.users.find((candidate) => candidate.id === input.userId);

        if (token) {
            token.usedAt = input.usedAt;
        }

        if (user) {
            user.passwordHash = input.passwordHash;
        }

        for (const session of this.sessions) {
            if (session.userId === input.userId && !session.revokedAt) {
                session.revokedAt = input.usedAt;
            }
        }
    }
}

class InMemoryPasswordResetDelivery implements PasswordResetDelivery {
    deliveries: Array<{ email: string; resetUrl: string; expiresAt: Date }> = [];

    async sendPasswordResetLink(input: {
        email: string;
        resetUrl: string;
        expiresAt: Date;
    }) {
        this.deliveries.push(input);
    }
}

async function repositoryWithOwner() {
    const repository = new InMemoryPasswordResetRepository();
    repository.users.push({
        id: ownerId,
        email: "owner@example.com",
        displayName: "Owner User",
        role: "owner",
        barberId: null,
        active: true,
        passwordHash: await hashPassword("old-password"),
    });
    repository.sessions.push({
        id: "session-1",
        userId: ownerId,
        tokenHash: hashSessionToken("existing-session"),
        expiresAt: new Date("2026-05-04T15:00:00.000Z"),
        revokedAt: null,
        lastSeenAt: null,
    });
    return repository;
}

function tokenFromResetUrl(resetUrl: string) {
    return new URL(resetUrl).searchParams.get("token") ?? "";
}

describe("Phase 5B password reset service", () => {
    afterEach(() => {
        vi.unstubAllEnvs();
    });

    test("forgot-password always returns a generic response and does not deliver for unknown email", async () => {
        const repository = await repositoryWithOwner();
        const delivery = new InMemoryPasswordResetDelivery();

        const result = await requestPasswordReset(
            { email: "missing@example.com" },
            repository,
            delivery,
            { now, appUrl: "http://localhost:3000" },
        );

        expect(result).toEqual({ message: PASSWORD_RESET_GENERIC_MESSAGE });
        expect(repository.resetTokens).toHaveLength(0);
        expect(delivery.deliveries).toHaveLength(0);
    });

    test("forgot-password creates a hashed single-use token with a 45-minute expiry", async () => {
        const repository = await repositoryWithOwner();
        const delivery = new InMemoryPasswordResetDelivery();

        const result = await requestPasswordReset(
            { email: " OWNER@EXAMPLE.COM " },
            repository,
            delivery,
            { now, appUrl: "https://example.com" },
        );

        expect(result).toEqual({ message: PASSWORD_RESET_GENERIC_MESSAGE });
        expect(repository.resetTokens).toHaveLength(1);
        expect(delivery.deliveries).toHaveLength(1);

        const rawToken = tokenFromResetUrl(delivery.deliveries[0].resetUrl);
        expect(rawToken).toEqual(expect.any(String));
        expect(rawToken).not.toBe(repository.resetTokens[0].tokenHash);
        expect(repository.resetTokens[0]).toMatchObject({
            userId: ownerId,
            tokenHash: hashPasswordResetToken(rawToken),
            expiresAt: new Date("2026-04-27T15:45:00.000Z"),
            usedAt: null,
        });
        expect(delivery.deliveries[0]).toMatchObject({
            email: "owner@example.com",
            resetUrl: `https://example.com/admin/reset-password?token=${rawToken}`,
            expiresAt: new Date("2026-04-27T15:45:00.000Z"),
        });
    });

    test("production forgot-password fails loudly when APP_URL is missing", async () => {
        vi.stubEnv("NODE_ENV", "production");
        vi.stubEnv("APP_URL", "");
        const repository = await repositoryWithOwner();
        const delivery = new InMemoryPasswordResetDelivery();

        await expect(
            requestPasswordReset(
                { email: "owner@example.com" },
                repository,
                delivery,
                { now },
            ),
        ).rejects.toMatchObject({
            status: 500,
            message: "APP_URL is required for password reset links in production.",
        });
        expect(delivery.deliveries).toHaveLength(0);
    });


    test("reset rejects invalid, used, expired, and short-password requests", async () => {
        const repository = await repositoryWithOwner();
        const delivery = new InMemoryPasswordResetDelivery();
        await requestPasswordReset(
            { email: "owner@example.com" },
            repository,
            delivery,
            { now, appUrl: "http://localhost:3000" },
        );
        const rawToken = tokenFromResetUrl(delivery.deliveries[0].resetUrl);

        await expect(
            resetAdminPassword({ token: "not-the-token", password: "new-password" }, repository, {
                now,
            }),
        ).rejects.toMatchObject({
            status: 400,
            message: "Password reset link is invalid or expired.",
        });

        await expect(
            resetAdminPassword({ token: rawToken, password: "short" }, repository, { now }),
        ).rejects.toMatchObject({
            status: 400,
            message: "Password must be at least 8 characters.",
        });

        await expect(
            resetAdminPassword(
                { token: rawToken, password: "new-password" },
                repository,
                { now: new Date("2026-04-27T15:45:01.000Z") },
            ),
        ).rejects.toMatchObject({
            status: 400,
            message: "Password reset link is invalid or expired.",
        });

        repository.resetTokens[0].usedAt = now;
        await expect(
            resetAdminPassword({ token: rawToken, password: "new-password" }, repository, {
                now,
            }),
        ).rejects.toMatchObject({
            status: 400,
            message: "Password reset link is invalid or expired.",
        });
    });

    test("reset sets an Argon2id password hash, marks the token used, and revokes active sessions", async () => {
        const repository = await repositoryWithOwner();
        const delivery = new InMemoryPasswordResetDelivery();
        await requestPasswordReset(
            { email: "owner@example.com" },
            repository,
            delivery,
            { now, appUrl: "http://localhost:3000" },
        );
        const rawToken = tokenFromResetUrl(delivery.deliveries[0].resetUrl);

        await resetAdminPassword(
            { token: rawToken, password: "new-password" },
            repository,
            { now },
        );

        expect(repository.resetTokens[0].usedAt).toEqual(now);
        expect(repository.sessions[0].revokedAt).toEqual(now);
        expect(repository.users[0].passwordHash).not.toBeNull();
        expect(await verifyPassword(repository.users[0].passwordHash ?? "", "new-password")).toBe(true);
        expect(await verifyPassword(repository.users[0].passwordHash ?? "", "old-password")).toBe(false);

        await expect(
            resetAdminPassword({ token: rawToken, password: "another-password" }, repository, {
                now,
            }),
        ).rejects.toMatchObject({
            status: 400,
            message: "Password reset link is invalid or expired.",
        });
    });
});
