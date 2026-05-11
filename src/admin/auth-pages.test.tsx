import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, test } from "vitest";

import {
    AcceptInvitePage,
    ForgotPasswordPage,
    ResetPasswordPage,
    isStandaloneAdminAuthPath,
} from "./AdminApp";

describe("admin account recovery pages", () => {
    test("treats reset and invite pages as standalone unauthenticated admin routes", () => {
        expect(isStandaloneAdminAuthPath("/admin/forgot-password")).toBe(true);
        expect(isStandaloneAdminAuthPath("/admin/reset-password")).toBe(true);
        expect(isStandaloneAdminAuthPath("/admin/accept-invite")).toBe(true);
        expect(isStandaloneAdminAuthPath("/admin/login")).toBe(false);
    });

    test("renders the forgot password form on the unauthenticated admin surface", () => {
        const html = renderToStaticMarkup(<ForgotPasswordPage onNavigate={() => {}} />);

        expect(html).toContain("Reset password");
        expect(html).toContain("type=\"email\"");
    });

    test("renders the reset password form with the URL token", () => {
        const html = renderToStaticMarkup(
            <ResetPasswordPage token="reset-token" onNavigate={() => {}} onPasswordReset={() => {}} />,
        );

        expect(html).toContain("Set new password");
        expect(html).toContain("type=\"password\"");
        expect(html).not.toContain("reset-token");
    });

    test("renders the invite acceptance form with the URL token", () => {
        const html = renderToStaticMarkup(
            <AcceptInvitePage token="invite-token" onNavigate={() => {}} onAccepted={() => {}} />,
        );

        expect(html).toContain("Set up account");
        expect(html).toContain("type=\"password\"");
        expect(html).not.toContain("invite-token");
    });
});
