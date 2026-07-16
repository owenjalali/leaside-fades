import { beforeEach, describe, expect, test, vi } from "vitest";

import { createTeamInviteDelivery } from "./team-invite-delivery.ts";

describe("team invite delivery", () => {
    const send = vi.fn();

    beforeEach(() => {
        send.mockReset();
    });

    test("production delivery sends barber invite email through the configured provider", async () => {
        send.mockResolvedValue({ provider: "brevo", providerMessageId: "brevo-invite-1" });
        const delivery = createTeamInviteDelivery({
            env: { NODE_ENV: "production" },
            emailProvider: {
                provider: "brevo",
                deliveryState: "active",
                send,
            },
        });

        await delivery.sendBarberInvite({
            email: "barber@example.com",
            inviteUrl: "https://leasidefades.com/admin/accept-invite?token=invite-token",
            expiresAt: new Date("2026-05-18T15:00:00.000Z"),
        });

        expect(send).toHaveBeenCalledWith(
            expect.objectContaining({
                to: "barber@example.com",
                subject: "Set up your Leaside Fades barber account",
                text: expect.stringContaining("https://leasidefades.com/admin/accept-invite?token=invite-token"),
                html: expect.stringContaining("https://leasidefades.com/admin/accept-invite?token=invite-token"),
            }),
        );
    });
});
