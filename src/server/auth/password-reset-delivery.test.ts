import { beforeEach, describe, expect, test, vi } from "vitest";

import { createPasswordResetDelivery } from "./password-reset-delivery.ts";

describe("password reset delivery", () => {
    const send = vi.fn();

    beforeEach(() => {
        send.mockReset();
    });

    test("production delivery sends password reset email through the configured provider", async () => {
        send.mockResolvedValue({ provider: "brevo", providerMessageId: "brevo-reset-1" });
        const delivery = createPasswordResetDelivery({
            env: { NODE_ENV: "production" },
            emailProvider: {
                provider: "brevo",
                deliveryState: "active",
                send,
            },
        });

        await delivery.sendPasswordResetLink({
            email: "owner@example.com",
            resetUrl: "https://leasidefades.com/admin/reset-password?token=reset-token",
            expiresAt: new Date("2026-05-11T15:45:00.000Z"),
        });

        expect(send).toHaveBeenCalledWith(
            expect.objectContaining({
                to: "owner@example.com",
                subject: "Reset your Leaside Fades admin password",
                text: expect.stringContaining("https://leasidefades.com/admin/reset-password?token=reset-token"),
                html: expect.stringContaining("https://leasidefades.com/admin/reset-password?token=reset-token"),
            }),
        );
    });
});
