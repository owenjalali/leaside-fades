import { describe, expect, test, vi } from "vitest";

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
                BREVO_API_KEY: "",
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

    test("live mode exposes intentionally paused Twilio without credentials", () => {
        const providers = createNotificationProviders({
            mode: "live",
            env: {
                SMS_DELIVERY_MODE: "paused",
                BREVO_API_KEY: "brevo-test-key",
                EMAIL_FROM: "Leaside Fades <bookings@leasidefades.com>",
            },
        });

        expect(providers.sms).toMatchObject({
            provider: "twilio",
            deliveryState: "paused",
            pauseReason: "provider_paused",
        });
    });

    test("live Brevo sends a bounded transactional email", async () => {
        const fetchImpl = vi.fn<typeof fetch>(async (_input, _init) => new Response(
            JSON.stringify({ messageId: "brevo-message-id" }),
            { status: 201, headers: { "content-type": "application/json" } },
        ));
        const providers = createNotificationProviders({
            mode: "live",
            env: {
                SMS_DELIVERY_MODE: "paused",
                BREVO_API_KEY: "brevo-test-key",
                EMAIL_FROM: "Leaside Fades <bookings@leasidefades.com>",
                EMAIL_REPLY_TO: "owner@leasidefades.com",
                NOTIFICATION_PROVIDER_TIMEOUT_MS: "5000",
            },
            fetch: fetchImpl,
        });

        await expect(providers.email.send({
            idempotencyKey: "booking-1:email",
            to: "customer@example.com",
            subject: "Booking confirmed",
            text: "Confirmed",
            html: "<p>Confirmed</p>",
        })).resolves.toEqual({
            provider: "brevo",
            providerMessageId: "brevo-message-id",
        });

        expect(fetchImpl).toHaveBeenCalledTimes(1);
        const [url, init] = fetchImpl.mock.calls[0]!;
        expect(url).toBe("https://api.brevo.com/v3/smtp/email");
        expect(init).toMatchObject({
            method: "POST",
            signal: expect.any(AbortSignal),
            headers: {
                accept: "application/json",
                "api-key": "brevo-test-key",
                "content-type": "application/json",
            },
        });
        expect(JSON.parse(String(init?.body))).toEqual({
            sender: { name: "Leaside Fades", email: "bookings@leasidefades.com" },
            to: [{ email: "customer@example.com" }],
            subject: "Booking confirmed",
            textContent: "Confirmed",
            htmlContent: "<p>Confirmed</p>",
            replyTo: { email: "owner@leasidefades.com" },
        });
    });

    test("Brevo failures expose only the HTTP status", async () => {
        const providers = createNotificationProviders({
            mode: "live",
            env: {
                SMS_DELIVERY_MODE: "paused",
                BREVO_API_KEY: "brevo-test-key",
                EMAIL_FROM: "bookings@leasidefades.com",
            },
            fetch: vi.fn(async () => new Response(
                JSON.stringify({ message: "sensitive provider response" }),
                { status: 401 },
            )),
        });

        await expect(providers.email.send({
            idempotencyKey: "booking-1:email",
            to: "customer@example.com",
            subject: "Booking confirmed",
            text: "Confirmed",
        })).rejects.toThrow("Brevo email delivery failed (HTTP 401).");
    });

    test("rejects malformed Brevo sender configuration", async () => {
        const providers = createNotificationProviders({
            mode: "live",
            env: {
                SMS_DELIVERY_MODE: "paused",
                BREVO_API_KEY: "brevo-test-key",
                EMAIL_FROM: "Leaside Fades bookings-at-leasidefades.com",
            },
            fetch: vi.fn(),
        });

        await expect(providers.email.send({
            idempotencyKey: "booking-1:email",
            to: "customer@example.com",
            subject: "Booking confirmed",
            text: "Confirmed",
        })).rejects.toBeInstanceOf(NotificationProviderConfigurationError);
    });
});
