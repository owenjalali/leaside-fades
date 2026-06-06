import { generateUserInviteToken, hashUserInviteToken } from "../auth/invite-tokens.ts";
import { hashPassword } from "../auth/password.ts";
import type { SafeAdminUser, UserRole } from "../auth/service.ts";

export interface TeamBarberRecord {
    id: string;
    slug: string;
    displayName: string;
    email: string | null;
    phoneE164: string | null;
    profileImageUrl: string | null;
    profileImagePathname: string | null;
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

export interface TeamShiftRecord {
    id?: string;
    barberId: string;
    locationId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    effectiveFrom: string | null;
    effectiveTo: string | null;
    active: boolean;
}

export interface TeamListBarberRecord extends TeamBarberRecord {
    user: TeamUserRecord | null;
    weeklyShifts: TeamShiftRecord[];
    futureConfirmedBookingCount: number;
}

export interface TeamOnboardingRepository {
    findActiveLocationIds(locationIds: string[]): Promise<string[]>;
    findExistingBarberSlugs(baseSlug: string): Promise<string[]>;
    findActiveServiceIds(): Promise<string[]>;
    countFutureConfirmedBookings(barberId: string, now: Date): Promise<number>;
    listTeamBarbers(now: Date): Promise<TeamListBarberRecord[]>;
    createBarberWithInvite(input: {
        barber: {
            slug: string;
            displayName: string;
            email: string;
            phoneE164: string | null;
            profileImageUrl: string;
            profileImagePathname: string;
            locationIds: string[];
        };
        weeklyShifts: TeamWeeklyShiftInput[];
        serviceIds: string[];
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

export interface TeamWeeklyShiftInput {
    locationId: string;
    dayOfWeek: number;
    startTime: string;
    endTime: string;
    effectiveFrom: string | null;
    effectiveTo: string | null;
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
    profileImageUrl?: unknown;
    profileImagePathname?: unknown;
    locationIds: unknown;
    weeklyShifts?: unknown;
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
    const profileImageUrl = normalizeProfileImageUrl(request.profileImageUrl);
    const profileImagePathname = normalizeRequiredText(
        request.profileImagePathname,
        "Profile image upload is required.",
    );

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

    const weeklyShifts = normalizeWeeklyShifts(request.weeklyShifts, locationIds);
    const serviceIds = await repository.findActiveServiceIds();

    if (serviceIds.length === 0) {
        throw new TeamAccessError(500, "At least one active service is required before creating a barber.");
    }

    const slug = await buildAvailableSlug(slugify(displayName), repository);
    const now = options.now ?? new Date();
    const expiresAt = new Date(now.getTime() + (options.inviteDurationMs ?? DEFAULT_INVITE_DURATION_MS));
    const inviteToken = generateUserInviteToken();
    const inviteUrl = buildInviteUrl(inviteToken, options.appUrl);
    const created = await repository.createBarberWithInvite({
        barber: {
            slug,
            displayName,
            email,
            phoneE164,
            profileImageUrl,
            profileImagePathname,
            locationIds,
        },
        weeklyShifts,
        serviceIds,
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

export async function listTeamBarbers(
    actor: SafeAdminUser,
    repository: TeamOnboardingRepository,
    options: TeamOptions = {},
) {
    requireOwnerOrAdmin(actor);

    const barbers = await repository.listTeamBarbers(options.now ?? new Date());

    return {
        barbers: barbers.map((barber) => ({
            ...barber,
            user: barber.user ? toSafeTeamUser(barber.user) : null,
        })),
    };
}

export async function deactivateBarberAccess(
    actor: SafeAdminUser,
    barberId: unknown,
    repository: TeamOnboardingRepository,
    options: TeamOptions = {},
) {
    requireOwnerOrAdmin(actor);

    const normalizedBarberId = normalizeRequiredText(barberId, "Barber id is required.");
    const deactivatedAt = options.now ?? new Date();
    const futureConfirmedBookings = await repository.countFutureConfirmedBookings(normalizedBarberId, deactivatedAt);

    if (futureConfirmedBookings > 0) {
        throw new TeamAccessError(
            409,
            "This barber has future confirmed bookings. Reschedule or cancel those bookings before removing the barber.",
        );
    }

    return repository.deactivateBarberAndLinkedUsers({
        barberId: normalizedBarberId,
        deactivatedAt,
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

function normalizeProfileImageUrl(value: unknown) {
    const url = normalizeRequiredText(value, "Profile image upload is required.");

    try {
        const parsed = new URL(url);

        if (parsed.protocol !== "https:") {
            throw new Error("Profile image URL must be HTTPS.");
        }
    } catch {
        throw new TeamAccessError(400, "Profile image URL must be a valid HTTPS URL.");
    }

    return url;
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

function normalizeWeeklyShifts(value: unknown, locationIds: string[]): TeamWeeklyShiftInput[] {
    if (!Array.isArray(value) || value.length === 0) {
        throw new TeamAccessError(400, "At least one weekly shift is required.");
    }

    const selectedLocations = new Set(locationIds);
    const shifts = value.map((raw) => normalizeWeeklyShift(raw, selectedLocations));

    for (let index = 0; index < shifts.length; index += 1) {
        for (let nextIndex = index + 1; nextIndex < shifts.length; nextIndex += 1) {
            const first = shifts[index];
            const second = shifts[nextIndex];

            if (
                first.dayOfWeek === second.dayOfWeek &&
                timeToMinutes(first.startTime) < timeToMinutes(second.endTime) &&
                timeToMinutes(first.endTime) > timeToMinutes(second.startTime)
            ) {
                throw new TeamAccessError(400, "Weekly shifts for a barber cannot overlap.");
            }
        }
    }

    return shifts;
}

function normalizeWeeklyShift(raw: unknown, selectedLocations: Set<string>): TeamWeeklyShiftInput {
    const input = typeof raw === "object" && raw ? raw as Record<string, unknown> : {};
    const locationId = normalizeRequiredText(input.locationId, "Weekly shift location is required.");

    if (!selectedLocations.has(locationId)) {
        throw new TeamAccessError(400, "Weekly shifts must use one of the selected barber locations.");
    }

    const dayOfWeek = normalizeDayOfWeek(input.dayOfWeek);
    const startTime = normalizeQuarterHourTime(input.startTime, "Weekly shift start time is required.");
    const endTime = normalizeQuarterHourTime(input.endTime, "Weekly shift end time is required.");
    const effectiveFrom = normalizeOptionalLocalDate(input.effectiveFrom, "Weekly shift effective start date is invalid.");
    const effectiveTo = normalizeOptionalLocalDate(input.effectiveTo, "Weekly shift effective end date is invalid.");

    if (startTime >= endTime) {
        throw new TeamAccessError(400, "Weekly shift start time must be before end time.");
    }

    if (effectiveFrom && effectiveTo && effectiveFrom > effectiveTo) {
        throw new TeamAccessError(400, "Weekly shift effective start date must be on or before end date.");
    }

    return { locationId, dayOfWeek, startTime, endTime, effectiveFrom, effectiveTo };
}

function normalizeDayOfWeek(value: unknown) {
    const dayOfWeek = typeof value === "number" ? value : Number(value);

    if (!Number.isInteger(dayOfWeek) || dayOfWeek < 0 || dayOfWeek > 6) {
        throw new TeamAccessError(400, "Weekly shift day must be between 0 and 6.");
    }

    return dayOfWeek;
}

function normalizeQuarterHourTime(value: unknown, message: string) {
    const time = normalizeRequiredText(value, message);
    const normalized = time.slice(0, 5);

    if (!/^\d{2}:\d{2}$/.test(normalized)) {
        throw new TeamAccessError(400, message);
    }

    const minutes = timeToMinutes(normalized);

    if (minutes < 0 || minutes > 24 * 60 || minutes % 15 !== 0) {
        throw new TeamAccessError(400, "Weekly shift times must use 15-minute increments.");
    }

    return normalized;
}

function normalizeOptionalLocalDate(value: unknown, message: string) {
    const normalized = normalizeOptionalText(value);

    if (!normalized) {
        return null;
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
        throw new TeamAccessError(400, message);
    }

    return normalized;
}

async function buildAvailableSlug(baseSlug: string, repository: TeamOnboardingRepository) {
    const existingSlugs = new Set(await repository.findExistingBarberSlugs(baseSlug));

    if (!existingSlugs.has(baseSlug)) {
        return baseSlug;
    }

    for (let suffix = 2; suffix < 10_000; suffix += 1) {
        const candidate = `${baseSlug}-${suffix}`;

        if (!existingSlugs.has(candidate)) {
            return candidate;
        }
    }

    throw new TeamAccessError(409, "Could not generate a unique barber slug.");
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

function timeToMinutes(value: string) {
    const [hours, minutes] = value.split(":").map(Number);

    if (!Number.isInteger(hours) || !Number.isInteger(minutes) || hours < 0 || hours > 24 || minutes < 0 || minutes > 59) {
        return -1;
    }

    if (hours === 24 && minutes !== 0) {
        return -1;
    }

    return hours * 60 + minutes;
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
