import { hashPassword } from "./password.ts";
import { generatePasswordResetToken, hashPasswordResetToken } from "./reset-tokens.ts";
import { AuthError, toSafeAdminUser, type AuthUserRecord } from "./service.ts";

export const PASSWORD_RESET_GENERIC_MESSAGE =
    "If that email can reset a password, a reset link has been sent.";

export type PasswordResetUserRecord = AuthUserRecord;

export interface PasswordResetTokenRecord {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    usedAt: Date | null;
}

export interface PasswordResetRepository {
    findActiveUserByEmail(email: string): Promise<PasswordResetUserRecord | null>;
    createPasswordResetToken(
        token: Omit<PasswordResetTokenRecord, "id" | "usedAt">,
    ): Promise<PasswordResetTokenRecord>;
    findPasswordResetTokenByHash(
        tokenHash: string,
    ): Promise<{ token: PasswordResetTokenRecord; user: PasswordResetUserRecord } | null>;
    completePasswordReset(input: {
        tokenId: string;
        userId: string;
        passwordHash: string;
        usedAt: Date;
    }): Promise<void>;
}

export interface PasswordResetDelivery {
    sendPasswordResetLink(input: {
        email: string;
        resetUrl: string;
        expiresAt: Date;
    }): Promise<void>;
}

interface PasswordResetOptions {
    now?: Date;
    appUrl?: string;
    tokenDurationMs?: number;
}

interface ForgotPasswordRequest {
    email: unknown;
}

interface ResetPasswordRequest {
    token: unknown;
    password: unknown;
}

const DEFAULT_RESET_TOKEN_DURATION_MS = 45 * 60 * 1000;
const MIN_PASSWORD_LENGTH = 8;

export async function requestPasswordReset(
    request: ForgotPasswordRequest,
    repository: PasswordResetRepository,
    delivery: PasswordResetDelivery,
    options: PasswordResetOptions = {},
) {
    const email = normalizeEmail(request.email);

    if (!email) {
        return genericPasswordResetResponse();
    }

    const user = await repository.findActiveUserByEmail(email);

    if (!user) {
        return genericPasswordResetResponse();
    }

    const now = options.now ?? new Date();
    const expiresAt = new Date(
        now.getTime() + (options.tokenDurationMs ?? DEFAULT_RESET_TOKEN_DURATION_MS),
    );
    const resetToken = generatePasswordResetToken();

    await repository.createPasswordResetToken({
        userId: user.id,
        tokenHash: hashPasswordResetToken(resetToken),
        expiresAt,
    });

    await delivery.sendPasswordResetLink({
        email: user.email,
        resetUrl: buildPasswordResetUrl(resetToken, options.appUrl),
        expiresAt,
    });

    return genericPasswordResetResponse();
}

export async function resetAdminPassword(
    request: ResetPasswordRequest,
    repository: PasswordResetRepository,
    options: PasswordResetOptions = {},
) {
    const rawToken = typeof request.token === "string" ? request.token.trim() : "";

    if (!rawToken) {
        throw invalidOrExpiredResetTokenError();
    }

    const tokenWithUser = await repository.findPasswordResetTokenByHash(
        hashPasswordResetToken(rawToken),
    );
    const now = options.now ?? new Date();

    if (
        !tokenWithUser ||
        tokenWithUser.token.usedAt ||
        tokenWithUser.token.expiresAt.getTime() <= now.getTime()
    ) {
        throw invalidOrExpiredResetTokenError();
    }

    const password = typeof request.password === "string" ? request.password : "";

    if (password.length < MIN_PASSWORD_LENGTH) {
        throw new AuthError(400, "Password must be at least 8 characters.");
    }

    const passwordHash = await hashPassword(password);
    await repository.completePasswordReset({
        tokenId: tokenWithUser.token.id,
        userId: tokenWithUser.user.id,
        passwordHash,
        usedAt: now,
    });

    return {
        user: toSafeAdminUser(tokenWithUser.user),
    };
}

function genericPasswordResetResponse() {
    return { message: PASSWORD_RESET_GENERIC_MESSAGE };
}

function normalizeEmail(email: unknown) {
    return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function buildPasswordResetUrl(token: string, appUrl?: string) {
    const baseUrl = (appUrl || process.env.APP_URL || "http://localhost:3000").trim();
    const resetUrl = new URL("/admin/reset-password", `${baseUrl.replace(/\/+$/, "")}/`);
    resetUrl.searchParams.set("token", token);
    return resetUrl.toString();
}

function invalidOrExpiredResetTokenError() {
    return new AuthError(400, "Password reset link is invalid or expired.");
}
