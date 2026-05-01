import twilio from "twilio";
import { Resend } from "resend";

import type {
    EmailNotificationProvider,
    EmailSendInput,
    NotificationChannel,
    NotificationDeliveryMode,
    NotificationProviderSet,
    NotificationSendResult,
    SmsNotificationProvider,
    SmsSendInput,
} from "./types.ts";
import { resolveNotificationDeliveryMode } from "./config.ts";

type NotificationProviderEnv = Partial<Record<string, string | undefined>>;

export class NotificationProviderConfigurationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = "NotificationProviderConfigurationError";
    }
}

export interface CreateNotificationProviderOptions {
    mode?: NotificationDeliveryMode;
    env?: NotificationProviderEnv;
    failChannels?: Set<NotificationChannel>;
}

export function createNotificationProviders(
    options: CreateNotificationProviderOptions = {},
): NotificationProviderSet {
    const mode = options.mode ?? resolveNotificationDeliveryMode(options.env ?? process.env);

    if (mode === "live") {
        return {
            mode,
            sms: new TwilioSmsProvider(options.env ?? process.env),
            email: new ResendEmailProvider(options.env ?? process.env),
        };
    }

    if (mode === "dev") {
        return {
            mode,
            sms: new DevSmsProvider(options.failChannels),
            email: new DevEmailProvider(options.failChannels),
        };
    }

    return {
        mode: "mock",
        sms: new MockSmsProvider(options.failChannels),
        email: new MockEmailProvider(options.failChannels),
    };
}

class MockSmsProvider implements SmsNotificationProvider {
    readonly provider = "mock";
    private readonly failChannels?: Set<NotificationChannel>;

    constructor(failChannels?: Set<NotificationChannel>) {
        this.failChannels = failChannels;
    }

    async send(input: SmsSendInput): Promise<NotificationSendResult> {
        if (this.failChannels?.has("sms")) {
            throw new Error("Mock sms delivery failed.");
        }

        return {
            provider: this.provider,
            providerMessageId: `mock-sms-${safeProviderId(input.idempotencyKey)}`,
        };
    }
}

class MockEmailProvider implements EmailNotificationProvider {
    readonly provider = "mock";
    private readonly failChannels?: Set<NotificationChannel>;

    constructor(failChannels?: Set<NotificationChannel>) {
        this.failChannels = failChannels;
    }

    async send(input: EmailSendInput): Promise<NotificationSendResult> {
        if (this.failChannels?.has("email")) {
            throw new Error("Mock email delivery failed.");
        }

        return {
            provider: this.provider,
            providerMessageId: `mock-email-${safeProviderId(input.idempotencyKey)}`,
        };
    }
}

class DevSmsProvider implements SmsNotificationProvider {
    readonly provider = "dev";
    private readonly failChannels?: Set<NotificationChannel>;

    constructor(failChannels?: Set<NotificationChannel>) {
        this.failChannels = failChannels;
    }

    async send(input: SmsSendInput): Promise<NotificationSendResult> {
        if (this.failChannels?.has("sms")) {
            throw new Error("Dev sms delivery failed.");
        }

        console.info(`[notification:dev:sms] to=${input.to} body=${input.body}`);
        return {
            provider: this.provider,
            providerMessageId: `dev-sms-${safeProviderId(input.idempotencyKey)}`,
        };
    }
}

class DevEmailProvider implements EmailNotificationProvider {
    readonly provider = "dev";
    private readonly failChannels?: Set<NotificationChannel>;

    constructor(failChannels?: Set<NotificationChannel>) {
        this.failChannels = failChannels;
    }

    async send(input: EmailSendInput): Promise<NotificationSendResult> {
        if (this.failChannels?.has("email")) {
            throw new Error("Dev email delivery failed.");
        }

        console.info(`[notification:dev:email] to=${input.to} subject=${input.subject}`);
        return {
            provider: this.provider,
            providerMessageId: `dev-email-${safeProviderId(input.idempotencyKey)}`,
        };
    }
}

class TwilioSmsProvider implements SmsNotificationProvider {
    readonly provider = "twilio";
    private readonly env: NotificationProviderEnv;

    constructor(env: NotificationProviderEnv) {
        this.env = env;
    }

    async send(input: SmsSendInput): Promise<NotificationSendResult> {
        const accountSid = requiredEnv(this.env, "TWILIO_ACCOUNT_SID");
        const authToken = requiredEnv(this.env, "TWILIO_AUTH_TOKEN");
        const from = requiredEnv(this.env, "TWILIO_FROM_NUMBER");
        const client = twilio(accountSid, authToken);
        const message = await client.messages.create({
            from,
            to: input.to,
            body: input.body,
        });

        return {
            provider: this.provider,
            providerMessageId: message.sid,
        };
    }
}

class ResendEmailProvider implements EmailNotificationProvider {
    readonly provider = "resend";
    private readonly env: NotificationProviderEnv;

    constructor(env: NotificationProviderEnv) {
        this.env = env;
    }

    async send(input: EmailSendInput): Promise<NotificationSendResult> {
        const apiKey = requiredEnv(this.env, "RESEND_API_KEY");
        const from = requiredEnv(this.env, "EMAIL_FROM");
        const resend = new Resend(apiKey);
        const response = await resend.emails.send({
            from,
            to: input.to,
            subject: input.subject,
            text: input.text,
            html: input.html,
        });

        if (response.error) {
            throw new Error(response.error.message);
        }

        return {
            provider: this.provider,
            providerMessageId: response.data?.id ?? `resend-${safeProviderId(input.idempotencyKey)}`,
        };
    }
}

function requiredEnv(env: NotificationProviderEnv, key: string) {
    const value = env[key]?.trim();

    if (!value) {
        throw new NotificationProviderConfigurationError(`${key} is required for live notification delivery.`);
    }

    return value;
}

function safeProviderId(value: string) {
    return value.replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80);
}
