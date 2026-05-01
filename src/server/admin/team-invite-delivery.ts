import type { TeamInviteDelivery } from "./team-service.ts";

export function createTeamInviteDelivery(): TeamInviteDelivery {
    return new DevModeTeamInviteDelivery();
}

class DevModeTeamInviteDelivery implements TeamInviteDelivery {
    async sendBarberInvite(input: {
        email: string;
        inviteUrl: string;
        expiresAt: Date;
    }) {
        if (process.env.NODE_ENV === "production") {
            console.warn("Barber invite requested, but no email provider is configured.");
            return;
        }

        console.info(
            `Dev barber invite for ${input.email}: ${input.inviteUrl} (expires ${input.expiresAt.toISOString()})`,
        );
    }
}
