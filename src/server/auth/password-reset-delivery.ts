import type { PasswordResetDelivery } from "./password-reset-service.ts";

export function createPasswordResetDelivery(): PasswordResetDelivery {
    return new DevModePasswordResetDelivery();
}

class DevModePasswordResetDelivery implements PasswordResetDelivery {
    async sendPasswordResetLink(input: {
        email: string;
        resetUrl: string;
        expiresAt: Date;
    }) {
        if (process.env.NODE_ENV === "production") {
            // Email delivery is intentionally deferred until the notifications phase.
            console.warn("Password reset requested, but no email provider is configured.");
            return;
        }

        console.info(
            `Dev password reset for ${input.email}: ${input.resetUrl} (expires ${input.expiresAt.toISOString()})`,
        );
    }
}
