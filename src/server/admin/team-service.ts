import { generateUserInviteToken, hashUserInviteToken } from "../auth/invite-tokens.ts";
import { hashPassword } from "../auth/password.ts";
import type { SafeAdminUser, UserRole } from "../auth/service.ts";

export interface TeamBarberRecord {
    id: string;
    slug: string;
    displayName: string;
    email: string | null;
    phoneE164: string | null;
    active: boolean;
    locationIds: string[];
}

export interface TeamUserRecord {
    id: string;
    email: string;
    displayName: string;
    role: UserRole;
    barberId: string | null;
    active: boolean;
    passwordHash: string | null;
}

export interface UserInviteTokenRecord {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    usedAt: Date | null;
    createdByUserId: string | null;
}

export interface TeamOnboardingRepository {
    findActiveLocationIds(locationIds: string[]): Promise<string[]>;
    createBarberWithInvite(input: {
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
    }): Promise<{
        barber: TeamBarberRecord;
        user: TeamUserRecord;
        inviteToken: UserInviteTokenRecord;
    }>;
    findInviteByTokenHash(
        tokenHash: string,
    ): Promise<{ inviteToken: UserInviteTokenRecord; user: TeamUserRecord } | null>;
    acceptInvite(input: {
        inviteTokenId: string;
        userId: string;
        passwordHash: string;
        acceptedAt: Date;
    }): Promise<void>;
    deactivateBarberAndLinkedUsers(input: {
        barberId: string;
        deactivatedAt: Date;
    }): Promise<{ barberId: string; deactivatedUserIds: string[] }>;
}

export interface TeamInviteDelivery {
    sendBarberInvite(input: {
        email: string;
        inviteUrl: string;
        expiresAt: Date;
    }): Promise<void>;
}

export class TeamAccessError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = "TeamAccessError";
        this.status = status;
    }
}

interface TeamOptions {
    now?: Date;
    appUrl?: string;
    inviteDurationMs?: number;
}

interface CreateBarberRequest {
    displayName: unknown;
    email: unknown;
    phoneE164?: unknown;
    locationIds: unknown;
}

interface AcceptInviteRequest {
    token: unknown;
    password: unknown;
}

const DEFAULT_INVITE_DURATION_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 8;

export async function createBarberOnboarding(
    actor: SafeAdminUser,
    request: CreateBarberRequest,
    repository: TeamOnboardingRepository,
    delivery: TeamInviteDelivery,
    options: TeamOptions = {},
) {
    requireOwnerOrAdmin(actor);

    const displayName = normalizeRequiredText(request.displayName, "Display name is required.");
    const email = normalizeEmail(request.email);
    const phoneE164 = normalizeOptionalText(request.phoneE164);
    const locationIds = normalizeLocationIds(request.locationIds);

    if (!email || !email.includes("@")) {
        throw new TeamAccessError(400, "Valid email is required.");
    }

    if (locationIds.length === 0) {
        throw new TeamAccessError(400, "At least one location is required.");
    }

    const activeLocationIds = await repository.findActiveLocationIds(locationIds);

    if (activeLocationIds.length !== locationIds.length) {
        throw new TeamAccessError(400, "One or more selected locations are invalid.");
    }

    const now = options.now ?? new Date();
    const expiresAt = new Date(now.getTime() + (options.inviteDurationMs ?? DEFAULT_INVITE_DURATION_MS));
    const inviteToken = generateUserInviteToken();
    const inviteUrl = buildInviteUrl(inviteToken, options.appUrl);
    const created = await repository.createBarberWithInvite({
        barber: {
            slug: slugify(displayName),
            displayName,
            email,
            phoneE164,
            locationIds,
        },
        user: {
            email,
            displayName,
        },
        invite: {
            tokenHash: hashUserInviteToken(inviteToken),
            expiresAt,
            createdByUserId: actor.id,
        },
    });

    await delivery.sendBarberInvite({
        email,
        inviteUrl,
        expiresAt,
    });

    return {
        barber: created.barber,
        user: toSafeTeamUser(created.user),
    };
}

export async function acceptBarberInvite(
    request: AcceptInviteRequest,
    repository: TeamOnboardingRepository,
    options: TeamOptions = {},
) {
    const rawToken = typeof request.token === "string" ? request.token.trim() : "";

    if (!rawToken) {
        throw invalidInviteError();
    }

    const inviteWithUser = await repository.findInviteByTokenHash(hashUserInviteToken(rawToken));
    const now = options.now ?? new Date();

    if (
        !inviteWithUser ||
        inviteWithUser.inviteToken.usedAt ||
        inviteWithUser.inviteToken.expiresAt.getTime() <= now.getTime() ||
        inviteWithUser.user.role !== "barber" ||
        !inviteWithUser.user.barberId
    ) {
        throw invalidInviteError();
    }

    const password = typeof request.password === "string" ? request.password : "";

    if (password.length < MIN_PASSWORD_LENGTH) {
        throw new TeamAccessError(400, "Password must be at least 8 characters.");
    }

    await repository.acceptInvite({
        inviteTokenId: inviteWithUser.inviteToken.id,
        userId: inviteWithUser.user.id,
        passwordHash: await hashPassword(password),
        acceptedAt: now,
    });

    return { user: toSafeTeamUser({ ...inviteWithUser.user, active: true }) };
}

export async function deactivateBarberAccess(
    actor: SafeAdminUser,
    barberId: unknown,
    repository: TeamOnboardingRepository,
    options: TeamOptions = {},
) {
    requireOwnerOrAdmin(actor);

    const normalizedBarberId = normalizeRequiredText(barberId, "Barber id is required.");
    return repository.deactivateBarberAndLinkedUsers({
        barberId: normalizedBarberId,
        deactivatedAt: options.now ?? new Date(),
    });
}

function requireOwnerOrAdmin(actor: SafeAdminUser) {
    if (actor.role !== "owner" && actor.role !== "admin") {
        throw new TeamAccessError(403, "Owner or admin access is required.");
    }
}

function toSafeTeamUser(user: TeamUserRecord) {
    return {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        barberId: user.barberId,
        active: user.active,
    };
}

function normalizeRequiredText(value: unknown, message: string) {
    const normalized = normalizeOptionalText(value);

    if (!normalized) {
        throw new TeamAccessError(400, message);
    }

    return normalized;
}

function normalizeOptionalText(value: unknown) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

function normalizeEmail(value: unknown) {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function normalizeLocationIds(value: unknown) {
    if (!Array.isArray(value)) {
        return [];
    }

    return Array.from(
        new Set(
            value
                .filter((locationId): locationId is string => typeof locationId === "string")
                .map((locationId) => locationId.trim())
                .filter(Boolean),
        ),
    );
}

function slugify(value: string) {
    const slug = value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 70);

    return slug || "barber";
}

function buildInviteUrl(token: string, appUrl?: string) {
    const baseUrl = resolveAppUrl(appUrl);
    const inviteUrl = new URL("/admin/accept-invite", `${baseUrl.replace(/\/+$/, "")}/`);
    inviteUrl.searchParams.set("token", token);
    return inviteUrl.toString();
}

function resolveAppUrl(appUrl: string | undefined) {
    const resolved = (appUrl || process.env.APP_URL || "").trim();

    if (!resolved && process.env.NODE_ENV === "production") {
        throw new TeamAccessError(500, "APP_URL is required for barber invite links in production.");
    }

    return resolved || "http://localhost:3000";
}

function invalidInviteError() {
    return new TeamAccessError(400, "Invite link is invalid or expired.");
}
