import { describe, expect, test } from "vitest";

import {
    resolveNotificationDeliveryMode,
    validateNotificationRuntimeConfig,
} from "./config.ts";

describe("notification runtime configuration", () => {
    test("defaults production notification delivery to live", () => {
        expect(resolveNotificationDeliveryMode({ NODE_ENV: "production" })).toBe("live");
    });

    test("requires live provider credentials for production reminder delivery", () => {
        const result = validateNotificationRuntimeConfig(
            {
                NODE_ENV: "production",
                NOTIFICATION_DELIVERY_MODE: "live",
                DATABASE_URL: "postgres://example",
                TWILIO_ACCOUNT_SID: "",
                TWILIO_AUTH_TOKEN: "",
                TWILIO_FROM_NUMBER: "",
                RESEND_API_KEY: "",
                EMAIL_FROM: "",
            },
            { requireLiveDelivery: true },
        );

        expect(result.ok).toBe(false);
        expect(result.issues.map((issue) => issue.key)).toEqual([
            "APP_URL",
            "TWILIO_ACCOUNT_SID",
            "TWILIO_AUTH_TOKEN",
            "TWILIO_FROM_NUMBER",
            "RESEND_API_KEY",
            "EMAIL_FROM",
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
                RESEND_API_KEY: "re_123",
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
                TWILIO_ACCOUNT_SID: "AC123",
                TWILIO_AUTH_TOKEN: "secret",
                TWILIO_FROM_NUMBER: "+16475550199",
                RESEND_API_KEY: "re_123",
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
