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
import { resolveNotificationDeliveryMode, resolveSmsDeliveryMode } from "./config.ts";

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
    fetch?: typeof fetch;
}

export function createNotificationProviders(
    options: CreateNotificationProviderOptions = {},
): NotificationProviderSet {
    const mode = options.mode ?? resolveNotificationDeliveryMode(options.env ?? process.env);

    if (mode === "live") {
        return {
            mode,
            sms: resolveSmsDeliveryMode(options.env ?? process.env) === "paused"
                ? new PausedTwilioSmsProvider()
                : new TwilioSmsProvider(options.env ?? process.env),
            email: new BrevoEmailProvider(options.env ?? process.env, options.fetch),
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
    readonly deliveryState = "active" as const;
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
    readonly deliveryState = "active" as const;
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
    readonly deliveryState = "active" as const;
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
    readonly deliveryState = "active" as const;
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
    readonly deliveryState = "active" as const;
    private readonly env: NotificationProviderEnv;

    constructor(env: NotificationProviderEnv) {
        this.env = env;
    }

    async send(input: SmsSendInput): Promise<NotificationSendResult> {
        const accountSid = requiredEnv(this.env, "TWILIO_ACCOUNT_SID");
        const authToken = requiredEnv(this.env, "TWILIO_AUTH_TOKEN");
        const from = requiredEnv(this.env, "TWILIO_FROM_NUMBER");
        const { default: createTwilioClient } = await import("twilio");
        const client = createTwilioClient(accountSid, authToken);
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

class PausedTwilioSmsProvider implements SmsNotificationProvider {
    readonly provider = "twilio";
    readonly deliveryState = "paused" as const;
    readonly pauseReason = "provider_paused" as const;

    async send(): Promise<NotificationSendResult> {
        throw new Error("Paused Twilio provider must not be invoked.");
    }
}

class BrevoEmailProvider implements EmailNotificationProvider {
    readonly provider = "brevo";
    readonly deliveryState = "active" as const;
    private readonly env: NotificationProviderEnv;
    private readonly fetchImpl: typeof fetch;

    constructor(env: NotificationProviderEnv, fetchImpl: typeof fetch = fetch) {
        this.env = env;
        this.fetchImpl = fetchImpl;
    }

    async send(input: EmailSendInput): Promise<NotificationSendResult> {
        const apiKey = requiredEnv(this.env, "BREVO_API_KEY");
        const sender = parseEmailFrom(requiredEnv(this.env, "EMAIL_FROM"));
        const replyTo = optionalEmail(this.env.EMAIL_REPLY_TO, "EMAIL_REPLY_TO");
        const response = await this.fetchImpl("https://api.brevo.com/v3/smtp/email", {
            method: "POST",
            headers: {
                accept: "application/json",
                "api-key": apiKey,
                "content-type": "application/json",
            },
            redirect: "error",
            signal: AbortSignal.timeout(providerTimeoutMsFromEnv(this.env)),
            body: JSON.stringify({
                sender,
                to: [{ email: input.to }],
                subject: input.subject,
                textContent: input.text,
                ...(input.html ? { htmlContent: input.html } : {}),
                ...(replyTo ? { replyTo: { email: replyTo } } : {}),
            }),
        });

        if (!response.ok) {
            throw new Error(`Brevo email delivery failed (HTTP ${response.status}).`);
        }

        const body = await parseBrevoResponse(response);
        return {
            provider: this.provider,
            providerMessageId: body.messageId ?? `brevo-${safeProviderId(input.idempotencyKey)}`,
        };
    }
}

const SIMPLE_EMAIL_PATTERN = /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/;

function parseEmailFrom(value: string) {
    const namedMatch = value.match(/^\s*([^<>]+?)\s*<([^<>]+)>\s*$/);

    if (namedMatch) {
        const name = namedMatch[1].trim();
        const email = namedMatch[2].trim();
        if (name && SIMPLE_EMAIL_PATTERN.test(email)) {
            return { name, email };
        }
    }

    if (SIMPLE_EMAIL_PATTERN.test(value)) {
        return { email: value };
    }

    throw new NotificationProviderConfigurationError(
        "EMAIL_FROM must be a valid email address or Name <email@example.com> value.",
    );
}

function optionalEmail(value: string | undefined, key: string) {
    const normalized = value?.trim();
    if (!normalized) return undefined;
    if (!SIMPLE_EMAIL_PATTERN.test(normalized)) {
        throw new NotificationProviderConfigurationError(`${key} must be a valid email address.`);
    }
    return normalized;
}

function providerTimeoutMsFromEnv(env: NotificationProviderEnv) {
    const parsed = Number.parseInt(env.NOTIFICATION_PROVIDER_TIMEOUT_MS ?? "", 10);
    return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 1_000), 10_000) : 5_000;
}

async function parseBrevoResponse(response: Response): Promise<{ messageId?: string }> {
    try {
        const body = await response.json() as { messageId?: unknown };
        return typeof body.messageId === "string" ? { messageId: body.messageId } : {};
    } catch {
        return {};
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
