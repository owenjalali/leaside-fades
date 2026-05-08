import { verifyPassword } from "./password.ts";
import { generateSessionToken, hashSessionToken } from "./session-tokens.ts";

export type UserRole = "owner" | "admin" | "barber";

export interface SafeAdminUser {
    id: string;
    email: string;
    displayName: string;
    role: UserRole;
    barberId: string | null;
}

export interface AuthUserRecord extends SafeAdminUser {
    active: boolean;
    passwordHash: string | null;
}

export interface AuthSessionRecord {
    id: string;
    userId: string;
    tokenHash: string;
    expiresAt: Date;
    revokedAt: Date | null;
    lastSeenAt: Date | null;
}

export interface AuthRepository {
    findActiveUserByEmail(email: string): Promise<AuthUserRecord | null>;
    createSession(
        session: Omit<AuthSessionRecord, "id" | "revokedAt" | "lastSeenAt">,
    ): Promise<AuthSessionRecord>;
    findSessionByTokenHash(
        tokenHash: string,
    ): Promise<{ session: AuthSessionRecord; user: AuthUserRecord } | null>;
    revokeSession(tokenHash: string, revokedAt: Date): Promise<void>;
    touchSession(sessionId: string, seenAt: Date, expiresAt: Date): Promise<void>;
}

export class AuthError extends Error {
    readonly status: number;

    constructor(status: number, message: string) {
        super(message);
        this.name = "AuthError";
        this.status = status;
    }
}

interface LoginRequest {
    email: string;
    password: string;
}

interface AuthOptions {
    now?: Date;
    sessionDurationMs?: number;
}

export const DEFAULT_SESSION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;

export async function loginAdminUser(
    request: LoginRequest,
    repository: AuthRepository,
    options: AuthOptions = {},
) {
    const email = normalizeEmail(request.email);
    const password = typeof request.password === "string" ? request.password : "";

    if (!email || !password) {
        throw invalidCredentialsError();
    }

    const user = await repository.findActiveUserByEmail(email);

    if (!user?.passwordHash) {
        throw invalidCredentialsError();
    }

    const validPassword = await verifyPassword(user.passwordHash, password);

    if (!validPassword) {
        throw invalidCredentialsError();
    }

    const now = options.now ?? new Date();
    const expiresAt = new Date(now.getTime() + (options.sessionDurationMs ?? DEFAULT_SESSION_DURATION_MS));
    const sessionToken = generateSessionToken();
    await repository.createSession({
        userId: user.id,
        tokenHash: hashSessionToken(sessionToken),
        expiresAt,
    });

    return {
        user: toSafeAdminUser(user),
        sessionToken,
        expiresAt,
    };
}

export async function getAdminSession(
    sessionToken: string,
    repository: AuthRepository,
    options: AuthOptions = {},
) {
    if (!sessionToken) {
        throw authenticationRequiredError();
    }

    const now = options.now ?? new Date();
    const sessionWithUser = await repository.findSessionByTokenHash(hashSessionToken(sessionToken));

    if (!sessionWithUser) {
        throw authenticationRequiredError();
    }

    const { session, user } = sessionWithUser;

    if (session.revokedAt || session.expiresAt.getTime() <= now.getTime()) {
        throw authenticationRequiredError();
    }

    const expiresAt = new Date(now.getTime() + (options.sessionDurationMs ?? DEFAULT_SESSION_DURATION_MS));
    await repository.touchSession(session.id, now, expiresAt);

    return {
        user: toSafeAdminUser(user),
        session: {
            ...session,
            expiresAt,
            lastSeenAt: now,
        },
    };
}

export async function logoutAdminSession(
    sessionToken: string,
    repository: AuthRepository,
    options: AuthOptions = {},
) {
    if (!sessionToken) {
        return;
    }

    await repository.revokeSession(hashSessionToken(sessionToken), options.now ?? new Date());
}

export function toSafeAdminUser(user: AuthUserRecord): SafeAdminUser {
    return {
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        role: user.role,
        barberId: user.barberId,
    };
}

function normalizeEmail(email: unknown) {
    return typeof email === "string" ? email.trim().toLowerCase() : "";
}

function invalidCredentialsError() {
    return new AuthError(401, "Invalid email or password.");
}

function authenticationRequiredError() {
    return new AuthError(401, "Authentication required.");
}
