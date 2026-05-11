import type { TeamInviteDelivery } from "./team-service.ts";
import { createNotificationProviders } from "../notifications/providers.ts";
import type { EmailNotificationProvider } from "../notifications/types.ts";

type DeliveryEnv = Partial<Record<string, string | undefined>>;

interface TeamInviteDeliveryOptions {
    env?: DeliveryEnv;
    emailProvider?: EmailNotificationProvider;
}

export function createTeamInviteDelivery(
    options: TeamInviteDeliveryOptions = {},
): TeamInviteDelivery {
    const env = options.env ?? process.env;

    if (env.NODE_ENV === "production") {
        return new ResendTeamInviteDelivery(
            options.emailProvider ?? createNotificationProviders({ mode: "live", env }).email,
        );
    }

    return new DevModeTeamInviteDelivery();
}

class DevModeTeamInviteDelivery implements TeamInviteDelivery {
    async sendBarberInvite(input: {
        email: string;
        inviteUrl: string;
        expiresAt: Date;
    }) {
        console.info(
            `Dev barber invite for ${input.email}: ${input.inviteUrl} (expires ${input.expiresAt.toISOString()})`,
        );
    }
}

class ResendTeamInviteDelivery implements TeamInviteDelivery {
    private readonly emailProvider: EmailNotificationProvider;

    constructor(emailProvider: EmailNotificationProvider) {
        this.emailProvider = emailProvider;
    }

    async sendBarberInvite(input: {
        email: string;
        inviteUrl: string;
        expiresAt: Date;
    }) {
        const text = [
            "Set up your Leaside Fades barber account.",
            `Open this secure invite link to choose your password: ${input.inviteUrl}`,
            `This invite expires at ${input.expiresAt.toISOString()}.`,
        ].join("\n\n");

        await this.emailProvider.send({
            idempotencyKey: `barber-invite:${input.email}:${input.expiresAt.toISOString()}`,
            to: input.email,
            subject: "Set up your Leaside Fades barber account",
            text,
            html: text
                .split("\n\n")
                .map((line) => `<p>${escapeHtml(line)}</p>`)
                .join(""),
        });
    }
}

function escapeHtml(value: string) {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
}
