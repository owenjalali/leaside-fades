import type { SafeAdminUser } from "./service.ts";

export const ADMIN_SESSION_COOKIE_NAME = "lf_admin_session";
export const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000;

interface CookieResponse {
    cookie: (name: string, value: string, options: Record<string, unknown>) => void;
    clearCookie: (name: string, options: Record<string, unknown>) => void;
}

export function readAdminSessionToken(request: { headers?: { cookie?: string } }) {
    return parseCookies(request.headers?.cookie ?? "")[ADMIN_SESSION_COOKIE_NAME] ?? "";
}

export function setAdminSessionCookie(
    response: CookieResponse,
    sessionToken: string,
    expiresAt: Date,
) {
    response.cookie(ADMIN_SESSION_COOKIE_NAME, sessionToken, {
        httpOnly: true,
        sameSite: "lax",
        secure: isSecureCookieEnabled(),
        path: "/",
        expires: expiresAt,
    });
}

export function clearAdminSessionCookie(response: CookieResponse) {
    response.clearCookie(ADMIN_SESSION_COOKIE_NAME, {
        httpOnly: true,
        sameSite: "lax",
        secure: isSecureCookieEnabled(),
        path: "/",
    });
}

export function serializeSessionResponse(user: SafeAdminUser) {
    return { user };
}

function isSecureCookieEnabled() {
    return process.env.NODE_ENV === "production";
}

function parseCookies(header: string) {
    return header.split(";").reduce<Record<string, string>>((cookies, part) => {
        const separatorIndex = part.indexOf("=");

        if (separatorIndex === -1) {
            return cookies;
        }

        const name = part.slice(0, separatorIndex).trim();
        const value = part.slice(separatorIndex + 1).trim();

        if (!name) {
            return cookies;
        }

        try {
            cookies[name] = decodeURIComponent(value);
        } catch {
            cookies[name] = value;
        }

        return cookies;
    }, {});
}
