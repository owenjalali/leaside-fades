import type { NotificationDeliveryMode } from "./types.ts";

export type NotificationRuntimeEnv = Partial<Record<string, string | undefined>>;

export interface NotificationRuntimeConfigIssue {
    key: string;
    message: string;
}

export interface NotificationRuntimeConfigResult {
    ok: boolean;
    mode: NotificationDeliveryMode;
    issues: NotificationRuntimeConfigIssue[];
}

export interface ValidateNotificationRuntimeConfigOptions {
    requireLiveDelivery?: boolean;
}

const COMMON_REMINDER_JOB_ENV_KEYS = ["DATABASE_URL"];
const LIVE_NOTIFICATION_ENV_KEYS = [
    "TWILIO_ACCOUNT_SID",
    "TWILIO_AUTH_TOKEN",
    "TWILIO_FROM_NUMBER",
    "RESEND_API_KEY",
    "EMAIL_FROM",
];

export class NotificationRuntimeConfigurationError extends Error {
    readonly issues: NotificationRuntimeConfigIssue[];

    constructor(issues: NotificationRuntimeConfigIssue[]) {
        super(
            `Notification runtime configuration is incomplete: ${issues
                .map((issue) => issue.key)
                .join(", ")}`,
        );
        this.name = "NotificationRuntimeConfigurationError";
        this.issues = issues;
    }
}

export function resolveNotificationDeliveryMode(
    env: NotificationRuntimeEnv = process.env,
): NotificationDeliveryMode {
    const rawMode = env.NOTIFICATION_DELIVERY_MODE?.trim().toLowerCase();

    if (rawMode === "live" || rawMode === "dev" || rawMode === "mock") {
        return rawMode;
    }

    return env.NODE_ENV === "production" ? "live" : "mock";
}

export function validateNotificationRuntimeConfig(
    env: NotificationRuntimeEnv = process.env,
    options: ValidateNotificationRuntimeConfigOptions = {},
): NotificationRuntimeConfigResult {
    const mode = resolveNotificationDeliveryMode(env);
    const issues: NotificationRuntimeConfigIssue[] = [];

    for (const key of COMMON_REMINDER_JOB_ENV_KEYS) {
        if (!hasEnvValue(env, key)) {
            issues.push({
                key,
                message: `${key} is required for reminder job database access.`,
            });
        }
    }

    if (options.requireLiveDelivery && env.NOTIFICATION_DELIVERY_MODE?.trim().toLowerCase() !== "live") {
        issues.push({
            key: "NOTIFICATION_DELIVERY_MODE",
            message: "NOTIFICATION_DELIVERY_MODE must be live for production reminder delivery.",
        });
    }

    if (mode === "live" || options.requireLiveDelivery) {
        for (const key of LIVE_NOTIFICATION_ENV_KEYS) {
            if (!hasEnvValue(env, key)) {
                issues.push({
                    key,
                    message: `${key} is required for live Twilio/Resend notification delivery.`,
                });
            }
        }
    }

    return {
        ok: issues.length === 0,
        mode,
        issues,
    };
}

export function assertNotificationRuntimeConfig(
    env: NotificationRuntimeEnv = process.env,
    options: ValidateNotificationRuntimeConfigOptions = {},
) {
    const result = validateNotificationRuntimeConfig(env, options);

    if (!result.ok) {
        throw new NotificationRuntimeConfigurationError(result.issues);
    }

    return result;
}

function hasEnvValue(env: NotificationRuntimeEnv, key: string) {
    return Boolean(env[key]?.trim());
}
