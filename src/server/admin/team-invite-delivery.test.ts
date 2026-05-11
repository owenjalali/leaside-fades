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

import { createTeamInviteDelivery } from "./team-invite-delivery.ts";

describe("team invite delivery", () => {
    beforeEach(() => {
        resendMocks.send.mockReset();
        resendMocks.Resend.mockClear();
    });

    test("production delivery sends barber invite email through Resend", async () => {
        resendMocks.send.mockResolvedValue({ data: { id: "resend-invite-1" }, error: null });
        const delivery = createTeamInviteDelivery({
            env: {
                NODE_ENV: "production",
                RESEND_API_KEY: "re_test",
                EMAIL_FROM: "Leaside Fades <bookings@example.com>",
            },
        });

        await delivery.sendBarberInvite({
            email: "barber@example.com",
            inviteUrl: "https://leasidefades.com/admin/accept-invite?token=invite-token",
            expiresAt: new Date("2026-05-18T15:00:00.000Z"),
        });

        expect(resendMocks.Resend).toHaveBeenCalledWith("re_test");
        expect(resendMocks.send).toHaveBeenCalledWith(
            expect.objectContaining({
                from: "Leaside Fades <bookings@example.com>",
                to: "barber@example.com",
                subject: "Set up your Leaside Fades barber account",
                text: expect.stringContaining("https://leasidefades.com/admin/accept-invite?token=invite-token"),
                html: expect.stringContaining("https://leasidefades.com/admin/accept-invite?token=invite-token"),
            }),
        );
    });
});
