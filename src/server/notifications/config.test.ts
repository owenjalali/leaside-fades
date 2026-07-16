import { describe, expect, test } from "vitest";

import {
    resolveNotificationDeliveryMode,
    validateNotificationRuntimeConfig,
} from "./config.ts";

describe("notification runtime configuration", () => {
    test("defaults production notification delivery to live", () => {
        expect(resolveNotificationDeliveryMode({ NODE_ENV: "production" })).toBe("live");
    });

    test("requires Brevo credentials but not Twilio credentials when SMS is paused", () => {
        const result = validateNotificationRuntimeConfig(
            {
                NODE_ENV: "production",
                NOTIFICATION_DELIVERY_MODE: "live",
                DATABASE_URL: "postgres://example",
                APP_URL: "https://leasidefades.example",
                SMS_DELIVERY_MODE: "paused",
                TWILIO_ACCOUNT_SID: "",
                TWILIO_AUTH_TOKEN: "",
                TWILIO_FROM_NUMBER: "",
                BREVO_API_KEY: "",
                EMAIL_FROM: "",
            },
            { requireLiveDelivery: true },
        );

        expect(result.ok).toBe(false);
        expect(result.issues.map((issue) => issue.key)).toEqual([
            "BREVO_API_KEY",
            "EMAIL_FROM",
        ]);
    });

    test("requires Twilio credentials when SMS delivery is live", () => {
        const result = validateNotificationRuntimeConfig(
            {
                NODE_ENV: "production",
                NOTIFICATION_DELIVERY_MODE: "live",
                DATABASE_URL: "postgres://example",
                APP_URL: "https://leasidefades.example",
                SMS_DELIVERY_MODE: "live",
                BREVO_API_KEY: "brevo-key",
                EMAIL_FROM: "Leaside Fades <bookings@example.com>",
            },
            { requireLiveDelivery: true },
        );

        expect(result.ok).toBe(false);
        expect(result.issues.map((issue) => issue.key)).toEqual([
            "TWILIO_ACCOUNT_SID",
            "TWILIO_AUTH_TOKEN",
            "TWILIO_FROM_NUMBER",
        ]);
    });

    test("requires explicit live delivery mode for production reminder preflight", () => {
        const result = validateNotificationRuntimeConfig(
            {
                NODE_ENV: "production",
                DATABASE_URL: "postgres://example",
                APP_URL: "https://leasidefades.example",
                TWILIO_ACCOUNT_SID: "AC123",
                TWILIO_AUTH_TOKEN: "secret",
                TWILIO_FROM_NUMBER: "+16475550199",
                BREVO_API_KEY: "brevo-key",
                EMAIL_FROM: "Leaside Fades <bookings@example.com>",
            },
            { requireLiveDelivery: true },
        );

        expect(result.ok).toBe(false);
        expect(result.issues.map((issue) => issue.key)).toEqual(["NOTIFICATION_DELIVERY_MODE"]);
    });

    test("accepts complete live reminder configuration", () => {
        const result = validateNotificationRuntimeConfig(
            {
                NODE_ENV: "production",
                NOTIFICATION_DELIVERY_MODE: "live",
                DATABASE_URL: "postgres://example",
                APP_URL: "https://leasidefades.example",
                SMS_DELIVERY_MODE: "paused",
                BREVO_API_KEY: "brevo-key",
                EMAIL_FROM: "Leaside Fades <bookings@example.com>",
            },
            { requireLiveDelivery: true },
        );

        expect(result).toEqual({
            ok: true,
            mode: "live",
            issues: [],
        });
    });
});
