import { describe, expect, test } from "vitest";

import { hashPassword } from "./password.ts";
import { hashSessionToken } from "./session-tokens.ts";
import {
    AuthError,
    getAdminSession,
    loginAdminUser,
    logoutAdminSession,
    type AuthRepository,
    type AuthSessionRecord,
    type AuthUserRecord,
} from "./service.ts";

const ownerId = "11111111-1111-1111-1111-111111111111";
const barberId = "22222222-2222-2222-2222-222222222222";
const now = new Date("2026-04-27T15:00:00.000Z");

class InMemoryAuthRepository implements AuthRepository {
    users: AuthUserRecord[] = [];
    sessions: AuthSessionRecord[] = [];

    async findActiveUserByEmail(email: string) {
        return this.users.find((user) => user.email === email && user.active) ?? null;
    }

    async createSession(session: Omit<AuthSessionRecord, "id" | "revokedAt" | "lastSeenAt">) {
        const created: AuthSessionRecord = {
            id: `session-${this.sessions.length + 1}`,
            revokedAt: null,
            lastSeenAt: null,
            ...session,
        };
        this.sessions.push(created);
        return created;
    }

    async findSessionByTokenHash(tokenHash: string) {
        const session = this.sessions.find((candidate) => candidate.tokenHash === tokenHash);
        const user = session
            ? this.users.find((candidate) => candidate.id === session.userId && candidate.active)
            : undefined;

        return session && user ? { session, user } : null;
    }

    async revokeSession(tokenHash: string) {
        const session = this.sessions.find((candidate) => candidate.tokenHash === tokenHash);

        if (session) {
            session.revokedAt = now;
        }
    }

    async touchSession(sessionId: string, seenAt: Date, expiresAt?: Date) {
        const session = this.sessions.find((candidate) => candidate.id === sessionId);

        if (session) {
            session.lastSeenAt = seenAt;
            if (expiresAt) {
                session.expiresAt = expiresAt;
            }
        }
    }
}

async function repositoryWithUser(overrides: Partial<AuthUserRecord> = {}) {
    const repository = new InMemoryAuthRepository();
    repository.users.push({
        id: ownerId,
        email: "owner@example.com",
        displayName: "Owner User",
        role: "owner",
        barberId: null,
        active: true,
        passwordHash: await hashPassword("correct-password"),
        ...overrides,
    });
    return repository;
}

describe("Phase 5A auth service", () => {
    test("valid login creates an opaque hashed session and returns a safe user", async () => {
        const repository = await repositoryWithUser();

        const result = await loginAdminUser(
            { email: " OWNER@EXAMPLE.COM ", password: "correct-password" },
            repository,
            { now },
        );

        expect(result.user).toEqual({
            id: ownerId,
            email: "owner@example.com",
            displayName: "Owner User",
            role: "owner",
            barberId: null,
        });
        expect(result.sessionToken).toEqual(expect.any(String));
        expect(result.sessionToken).not.toBe(repository.sessions[0].tokenHash);
        expect(repository.sessions[0]).toMatchObject({
            userId: ownerId,
            tokenHash: hashSessionToken(result.sessionToken),
        });
        expect(repository.sessions[0].expiresAt.toISOString()).toBe("2026-05-27T15:00:00.000Z");
    });

    test("barber users can log in with their linked barberId", async () => {
        const repository = await repositoryWithUser({
            id: "barber-user",
            email: "sam@example.com",
            displayName: "Sam To",
            role: "barber",
            barberId,
        });

        const result = await loginAdminUser(
            { email: "sam@example.com", password: "correct-password" },
            repository,
            { now },
        );

        expect(result.user).toEqual({
            id: "barber-user",
            email: "sam@example.com",
            displayName: "Sam To",
            role: "barber",
            barberId,
        });
    });

    test("invalid, inactive, and no-password logins fail generically", async () => {
        const invalidPasswordRepository = await repositoryWithUser();
        const inactiveRepository = await repositoryWithUser({ active: false });
        const noPasswordRepository = await repositoryWithUser({ passwordHash: null });

        for (const repository of [invalidPasswordRepository, inactiveRepository, noPasswordRepository]) {
            await expect(
                loginAdminUser(
                    { email: "owner@example.com", password: "wrong-password" },
                    repository,
                    { now },
                ),
            ).rejects.toMatchObject({
                name: "AuthError",
                status: 401,
                message: "Invalid email or password.",
            } satisfies Partial<AuthError>);
        }
    });

    test("session lookup rejects missing, expired, and revoked sessions", async () => {
        const repository = await repositoryWithUser();
        const login = await loginAdminUser(
            { email: "owner@example.com", password: "correct-password" },
            repository,
            { now },
        );

        await expect(getAdminSession("", repository, { now })).rejects.toMatchObject({ status: 401 });
        await expect(
            getAdminSession(login.sessionToken, repository, {
                now: new Date("2026-05-27T15:00:01.000Z"),
            }),
        ).rejects.toMatchObject({ status: 401 });

        repository.sessions[0].revokedAt = now;
        await expect(getAdminSession(login.sessionToken, repository, { now })).rejects.toMatchObject({
            status: 401,
        });
    });

    test("session lookup renews an active session from the latest activity time", async () => {
        const repository = await repositoryWithUser();
        const login = await loginAdminUser(
            { email: "owner@example.com", password: "correct-password" },
            repository,
            { now },
        );

        const activityNow = new Date("2026-05-20T15:00:00.000Z");
        const session = await getAdminSession(login.sessionToken, repository, { now: activityNow });

        expect(session.session.lastSeenAt?.toISOString()).toBe("2026-05-20T15:00:00.000Z");
        expect(session.session.expiresAt.toISOString()).toBe("2026-06-19T15:00:00.000Z");
        expect(repository.sessions[0].lastSeenAt?.toISOString()).toBe("2026-05-20T15:00:00.000Z");
        expect(repository.sessions[0].expiresAt.toISOString()).toBe("2026-06-19T15:00:00.000Z");
    });

    test("logout revokes the current session", async () => {
        const repository = await repositoryWithUser({
            role: "barber",
            barberId,
        });
        const login = await loginAdminUser(
            { email: "owner@example.com", password: "correct-password" },
            repository,
            { now },
        );

        await logoutAdminSession(login.sessionToken, repository);

        await expect(getAdminSession(login.sessionToken, repository, { now })).rejects.toMatchObject({
            status: 401,
        });
        expect(repository.sessions[0].revokedAt).toBeInstanceOf(Date);
    });
});
