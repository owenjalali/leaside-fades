import { beforeEach, describe, expect, test, vi } from "vitest";

const resendMocks = vi.hoisted(() => ({
    send: vi.fn(),
    Resend: vi.fn(function Resend() {
        return {
            emails: {
                send: resendMocks.send,
            },
        };
    }),
}));

vi.mock("resend", () => ({
    Resend: resendMocks.Resend,
}));

import { createPasswordResetDelivery } from "./password-reset-delivery.ts";

describe("password reset delivery", () => {
    beforeEach(() => {
        resendMocks.send.mockReset();
        resendMocks.Resend.mockClear();
    });

    test("production delivery sends password reset email through Resend", async () => {
        resendMocks.send.mockResolvedValue({ data: { id: "resend-reset-1" }, error: null });
        const delivery = createPasswordResetDelivery({
            env: {
                NODE_ENV: "production",
                RESEND_API_KEY: "re_test",
                EMAIL_FROM: "Leaside Fades <bookings@example.com>",
            },
        });

        await delivery.sendPasswordResetLink({
            email: "owner@example.com",
            resetUrl: "https://leasidefades.com/admin/reset-password?token=reset-token",
            expiresAt: new Date("2026-05-11T15:45:00.000Z"),
        });

        expect(resendMocks.Resend).toHaveBeenCalledWith("re_test");
        expect(resendMocks.send).toHaveBeenCalledWith(
            expect.objectContaining({
                from: "Leaside Fades <bookings@example.com>",
                to: "owner@example.com",
                subject: "Reset your Leaside Fades admin password",
                text: expect.stringContaining("https://leasidefades.com/admin/reset-password?token=reset-token"),
                html: expect.stringContaining("https://leasidefades.com/admin/reset-password?token=reset-token"),
            }),
        );
    });
});
