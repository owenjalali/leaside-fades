import { describe, expect, test } from "vitest";

import { verifyPassword } from "../auth/password.ts";
import { hashUserInviteToken } from "../auth/invite-tokens.ts";
import type { AuthSessionRecord, SafeAdminUser } from "../auth/service.ts";
import {
    acceptBarberInvite,
    createBarberOnboarding,
    deactivateBarberAccess,
    type TeamInviteDelivery,
    type TeamOnboardingRepository,
    type UserInviteTokenRecord,
    type TeamBarberRecord,
    type TeamUserRecord,
} from "./team-service.ts";

const ownerUser: SafeAdminUser = {
    id: "11111111-1111-1111-1111-111111111111",
    email: "owner@example.com",
    displayName: "Owner User",
    role: "owner",
    barberId: null,
};
const adminUser: SafeAdminUser = {
    ...ownerUser,
    id: "11111111-1111-1111-1111-111111111112",
    email: "admin@example.com",
    role: "admin",
};
const barberUser: SafeAdminUser = {
    id: "22222222-2222-2222-2222-222222222222",
    email: "barber@example.com",
    displayName: "Barber User",
    role: "barber",
    barberId: "barber-existing",
};
const eglintonId = "33333333-3333-3333-3333-333333333333";
const millwoodId = "44444444-4444-4444-4444-444444444444";
const now = new Date("2026-04-27T15:00:00.000Z");

class InMemoryTeamRepository implements TeamOnboardingRepository {
    activeLocationIds = [eglintonId, millwoodId];
    barbers: TeamBarberRecord[] = [];
    users: TeamUserRecord[] = [];
    inviteTokens: UserInviteTokenRecord[] = [];
    sessions: AuthSessionRecord[] = [];

    async findActiveLocationIds(locationIds: string[]) {
        return locationIds.filter((id) => this.activeLocationIds.includes(id));
    }

    async createBarberWithInvite(input: {
        barber: {
            slug: string;
            displayName: string;
            email: string;
            phoneE164: string | null;
            locationIds: string[];
        };
        user: {
            email: string;
            displayName: string;
        };
        invite: {
            tokenHash: string;
            expiresAt: Date;
            createdByUserId: string;
        };
    }) {
        const barber: TeamBarberRecord = {
            id: `barber-${this.barbers.length + 1}`,
            slug: input.barber.slug,
            displayName: input.barber.displayName,
            email: input.barber.email,
            phoneE164: input.barber.phoneE164,
            active: true,
            locationIds: input.barber.locationIds,
        };
        const user: TeamUserRecord = {
            id: `user-${this.users.length + 1}`,
            email: input.user.email,
            displayName: input.user.displayName,
            role: "barber",
            barberId: barber.id,
            active: false,
            passwordHash: null,
        };
        const inviteToken: UserInviteTokenRecord = {
            id: `invite-${this.inviteTokens.length + 1}`,
            userId: user.id,
            tokenHash: input.invite.tokenHash,
            expiresAt: input.invite.expiresAt,
            usedAt: null,
            createdByUserId: input.invite.createdByUserId,
        };

        this.barbers.push(barber);
        this.users.push(user);
        this.inviteTokens.push(inviteToken);

        return { barber, user, inviteToken };
    }

    async findInviteByTokenHash(tokenHash: string) {
        const inviteToken = this.inviteTokens.find((candidate) => candidate.tokenHash === tokenHash);
        const user = inviteToken ? this.users.find((candidate) => candidate.id === inviteToken.userId) : undefined;

        return inviteToken && user ? { inviteToken, user } : null;
    }

    async acceptInvite(input: {
        inviteTokenId: string;
        userId: string;
        passwordHash: string;
        acceptedAt: Date;
    }) {
        const inviteToken = this.inviteTokens.find((candidate) => candidate.id === input.inviteTokenId);
        const user = this.users.find((candidate) => candidate.id === input.userId);

        if (inviteToken) {
            inviteToken.usedAt = input.acceptedAt;
        }

        if (user) {
            user.active = true;
            user.passwordHash = input.passwordHash;
        }
    }

    async deactivateBarberAndLinkedUsers(input: { barberId: string; deactivatedAt: Date }) {
        const barber = this.barbers.find((candidate) => candidate.id === input.barberId);
        const deactivatedUserIds: string[] = [];

        if (barber) {
            barber.active = false;
        }

        for (const user of this.users) {
            if (user.barberId === input.barberId) {
                user.active = false;
                deactivatedUserIds.push(user.id);
            }
        }

        for (const session of this.sessions) {
            if (deactivatedUserIds.includes(session.userId) && !session.revokedAt) {
                session.revokedAt = input.deactivatedAt;
            }
        }

        return { barberId: input.barberId, deactivatedUserIds };
    }
}

class InMemoryTeamInviteDelivery implements TeamInviteDelivery {
    deliveries: Array<{ email: string; inviteUrl: string; expiresAt: Date }> = [];

    async sendBarberInvite(input: { email: string; inviteUrl: string; expiresAt: Date }) {
        this.deliveries.push(input);
    }
}

function tokenFromInviteUrl(inviteUrl: string) {
    return new URL(inviteUrl).searchParams.get("token") ?? "";
}

describe("Phase 5C team onboarding service", () => {
    test("owner creates a linked pending barber user and hashed invite token for Eglinton", async () => {
        const repository = new InMemoryTeamRepository();
        const delivery = new InMemoryTeamInviteDelivery();

        const result = await createBarberOnboarding(
            ownerUser,
            {
                displayName: "New Barber",
                email: " NEW.BARBER@EXAMPLE.COM ",
                phoneE164: "+16475550123",
                locationIds: [eglintonId],
            },
            repository,
            delivery,
            { now, appUrl: "https://example.com" },
        );

        expect(result.barber).toMatchObject({
            id: "barber-1",
            slug: "new-barber",
            displayName: "New Barber",
            email: "new.barber@example.com",
            phoneE164: "+16475550123",
            active: true,
            locationIds: [eglintonId],
        });
        expect(result.user).toMatchObject({
            id: "user-1",
            email: "new.barber@example.com",
            displayName: "New Barber",
            role: "barber",
            barberId: "barber-1",
            active: false,
        });
        expect(repository.users[0].passwordHash).toBeNull();
        expect(repository.inviteTokens).toHaveLength(1);
        expect(delivery.deliveries).toHaveLength(1);

        const rawToken = tokenFromInviteUrl(delivery.deliveries[0].inviteUrl);
        expect(repository.inviteTokens[0]).toMatchObject({
            userId: "user-1",
            tokenHash: hashUserInviteToken(rawToken),
            expiresAt: new Date("2026-05-04T15:00:00.000Z"),
            usedAt: null,
            createdByUserId: ownerUser.id,
        });
        expect(delivery.deliveries[0]).toMatchObject({
            email: "new.barber@example.com",
            inviteUrl: `https://example.com/admin/accept-invite?token=${rawToken}`,
            expiresAt: new Date("2026-05-04T15:00:00.000Z"),
        });
    });

    test("admin can assign a barber to Millwood or both locations", async () => {
        const repository = new InMemoryTeamRepository();
        const delivery = new InMemoryTeamInviteDelivery();

        const millwood = await createBarberOnboarding(
            adminUser,
            {
                displayName: "Mill Barber",
                email: "mill@example.com",
                locationIds: [millwoodId],
            },
            repository,
            delivery,
            { now },
        );
        const both = await createBarberOnboarding(
            adminUser,
            {
                displayName: "Both Barber",
                email: "both@example.com",
                locationIds: [eglintonId, millwoodId],
            },
            repository,
            delivery,
            { now },
        );

        expect(millwood.barber.locationIds).toEqual([millwoodId]);
        expect(both.barber.locationIds).toEqual([eglintonId, millwoodId]);
    });

    test("barbers cannot create other barber accounts", async () => {
        const repository = new InMemoryTeamRepository();

        await expect(
            createBarberOnboarding(
                barberUser,
                {
                    displayName: "Blocked Barber",
                    email: "blocked@example.com",
                    locationIds: [eglintonId],
                },
                repository,
                new InMemoryTeamInviteDelivery(),
                { now },
            ),
        ).rejects.toMatchObject({
            status: 403,
            message: "Owner or admin access is required.",
        });
        expect(repository.barbers).toHaveLength(0);
    });

    test("invalid locations and missing fields are rejected before creating records", async () => {
        const repository = new InMemoryTeamRepository();

        await expect(
            createBarberOnboarding(
                ownerUser,
                { displayName: "", email: "bad", locationIds: [] },
                repository,
                new InMemoryTeamInviteDelivery(),
                { now },
            ),
        ).rejects.toMatchObject({ status: 400 });

        await expect(
            createBarberOnboarding(
                ownerUser,
                {
                    displayName: "Invalid Location",
                    email: "invalid-location@example.com",
                    locationIds: ["missing-location"],
                },
                repository,
                new InMemoryTeamInviteDelivery(),
                { now },
            ),
        ).rejects.toMatchObject({
            status: 400,
            message: "One or more selected locations are invalid.",
        });
        expect(repository.barbers).toHaveLength(0);
    });

    test("accepted invite sets an Argon2id password hash and activates the linked barber user", async () => {
        const repository = new InMemoryTeamRepository();
        const delivery = new InMemoryTeamInviteDelivery();
        await createBarberOnboarding(
            ownerUser,
            {
                displayName: "Invite Barber",
                email: "invite@example.com",
                locationIds: [eglintonId],
            },
            repository,
            delivery,
            { now },
        );
        const rawToken = tokenFromInviteUrl(delivery.deliveries[0].inviteUrl);

        await acceptBarberInvite(
            { token: rawToken, password: "setup-password" },
            repository,
            { now },
        );

        expect(repository.inviteTokens[0].usedAt).toEqual(now);
        expect(repository.users[0].active).toBe(true);
        expect(repository.users[0].passwordHash).not.toBeNull();
        expect(await verifyPassword(repository.users[0].passwordHash ?? "", "setup-password")).toBe(true);
    });

    test("invite tokens are single-use and expire", async () => {
        const repository = new InMemoryTeamRepository();
        const delivery = new InMemoryTeamInviteDelivery();
        await createBarberOnboarding(
            ownerUser,
            {
                displayName: "Invite Barber",
                email: "invite@example.com",
                locationIds: [eglintonId],
            },
            repository,
            delivery,
            { now },
        );
        const rawToken = tokenFromInviteUrl(delivery.deliveries[0].inviteUrl);

        await expect(
            acceptBarberInvite(
                { token: rawToken, password: "setup-password" },
                repository,
                { now: new Date("2026-05-04T15:00:01.000Z") },
            ),
        ).rejects.toMatchObject({
            status: 400,
            message: "Invite link is invalid or expired.",
        });

        await acceptBarberInvite(
            { token: rawToken, password: "setup-password" },
            repository,
            { now },
        );
        await expect(
            acceptBarberInvite(
                { token: rawToken, password: "another-password" },
                repository,
                { now },
            ),
        ).rejects.toMatchObject({
            status: 400,
            message: "Invite link is invalid or expired.",
        });
    });

    test("deactivation disables the barber, linked user, and active sessions", async () => {
        const repository = new InMemoryTeamRepository();
        repository.barbers.push({
            id: "barber-1",
            slug: "deactivate-me",
            displayName: "Deactivate Me",
            email: "deactivate@example.com",
            phoneE164: null,
            active: true,
            locationIds: [eglintonId],
        });
        repository.users.push({
            id: "user-1",
            email: "deactivate@example.com",
            displayName: "Deactivate Me",
            role: "barber",
            barberId: "barber-1",
            active: true,
            passwordHash: "hash",
        });
        repository.sessions.push({
            id: "session-1",
            userId: "user-1",
            tokenHash: "token-hash",
            expiresAt: new Date("2026-05-04T15:00:00.000Z"),
            revokedAt: null,
            lastSeenAt: null,
        });

        const result = await deactivateBarberAccess(ownerUser, "barber-1", repository, { now });

        expect(result).toEqual({ barberId: "barber-1", deactivatedUserIds: ["user-1"] });
        expect(repository.barbers[0].active).toBe(false);
        expect(repository.users[0].active).toBe(false);
        expect(repository.sessions[0].revokedAt).toEqual(now);
    });
});
