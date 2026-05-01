import { describe, expect, test } from "vitest";

import {
    NotificationProviderConfigurationError,
    createNotificationProviders,
} from "./providers.ts";

describe("Phase 9 notification providers", () => {
    test("mock mode returns deterministic provider ids without credentials", async () => {
        const providers = createNotificationProviders({ mode: "mock" });

        await expect(
            providers.sms.send({
                idempotencyKey: "booking-1:sms",
                to: "+16475550199",
                body: "Hello",
            }),
        ).resolves.toEqual({
            provider: "mock",
            providerMessageId: "mock-sms-booking-1-sms",
        });
    });

    test("mock mode can force delivery failures for lifecycle tests", async () => {
        const providers = createNotificationProviders({
            mode: "mock",
            failChannels: new Set(["sms"]),
        });

        await expect(
            providers.sms.send({
                idempotencyKey: "booking-1:sms",
                to: "+16475550199",
                body: "Hello",
            }),
        ).rejects.toThrow("Mock sms delivery failed.");
    });

    test("live mode fails clearly when Twilio credentials are missing", async () => {
        const providers = createNotificationProviders({
            mode: "live",
            env: {
                TWILIO_ACCOUNT_SID: "",
                TWILIO_AUTH_TOKEN: "",
                TWILIO_FROM_NUMBER: "",
                RESEND_API_KEY: "",
                EMAIL_FROM: "",
            },
        });

        await expect(
            providers.sms.send({
                idempotencyKey: "booking-1:sms",
                to: "+16475550199",
                body: "Hello",
            }),
        ).rejects.toBeInstanceOf(NotificationProviderConfigurationError);
    });
});
