import type { PasswordResetDelivery } from "./password-reset-service.ts";
import { createNotificationProviders } from "../notifications/providers.ts";
import type { EmailNotificationProvider } from "../notifications/types.ts";

type DeliveryEnv = Partial<Record<string, string | undefined>>;

interface PasswordResetDeliveryOptions {
    env?: DeliveryEnv;
    emailProvider?: EmailNotificationProvider;
}

export function createPasswordResetDelivery(
    options: PasswordResetDeliveryOptions = {},
): PasswordResetDelivery {
    const env = options.env ?? process.env;

    if (env.NODE_ENV === "production") {
        return new ResendPasswordResetDelivery(
            options.emailProvider ?? createNotificationProviders({ mode: "live", env }).email,
        );
    }

    return new DevModePasswordResetDelivery();
}

class DevModePasswordResetDelivery implements PasswordResetDelivery {
    async sendPasswordResetLink(input: {
        email: string;
        resetUrl: string;
        expiresAt: Date;
    }) {
        console.info(
            `Dev password reset for ${input.email}: ${input.resetUrl} (expires ${input.expiresAt.toISOString()})`,
        );
    }
}

class ResendPasswordResetDelivery implements PasswordResetDelivery {
    private readonly emailProvider: EmailNotificationProvider;

    constructor(emailProvider: EmailNotificationProvider) {
        this.emailProvider = emailProvider;
    }

    async sendPasswordResetLink(input: {
        email: string;
        resetUrl: string;
        expiresAt: Date;
    }) {
        const text = [
            "Reset your Leaside Fades admin password.",
            `Open this secure link to choose a new password: ${input.resetUrl}`,
            `This link expires at ${input.expiresAt.toISOString()}.`,
            "If you did not request this, you can ignore this email.",
        ].join("\n\n");

        await this.emailProvider.send({
            idempotencyKey: `password-reset:${input.email}:${input.expiresAt.toISOString()}`,
            to: input.email,
            subject: "Reset your Leaside Fades admin password",
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
