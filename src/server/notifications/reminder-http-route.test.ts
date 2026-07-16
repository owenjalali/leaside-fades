import request from "supertest";
import { afterEach, describe, expect, test } from "vitest";

async function loadApp() {
    // @ts-expect-error server.js is the plain ESM entrypoint exercised by this route smoke test.
    const imported = await import("../../../server.js");
    return imported.default;
}

const originalCronSecret = process.env.CRON_SECRET;
const originalReminderInterval = process.env.REMINDER_HTTP_MIN_INTERVAL_MINUTES;
const originalDatabaseUrl = process.env.DATABASE_URL;

afterEach(() => {
    restoreEnv("CRON_SECRET", originalCronSecret);
    restoreEnv("REMINDER_HTTP_MIN_INTERVAL_MINUTES", originalReminderInterval);
    restoreEnv("DATABASE_URL", originalDatabaseUrl);
});

describe("secured reminder HTTP route", () => {
    test("fails closed when CRON_SECRET is missing", async () => {
        delete process.env.CRON_SECRET;
        const app = await loadApp();

        await request(app).get("/api/jobs/send-reminders?dryRun=1").expect(503);
    });

    test("rejects dry-run checks without the cron bearer secret", async () => {
        process.env.CRON_SECRET = "cron-secret-for-test";
        delete process.env.DATABASE_URL;
        const app = await loadApp();

        await request(app)
            .get("/api/jobs/send-reminders?dryRun=1")
            .set("Authorization", "Bearer wrong-secret")
            .expect(401);
    });

    test("allows authenticated dry-run checks without running the reminder job", async () => {
        process.env.CRON_SECRET = "cron-secret-for-test";
        process.env.REMINDER_HTTP_MIN_INTERVAL_MINUTES = "30";
        const app = await loadApp();

        const response = await request(app)
            .get("/api/jobs/send-reminders?dryRun=1")
            .set("Authorization", "Bearer cron-secret-for-test")
            .expect(200);

        expect(response.body).toMatchObject({
            ok: true,
            dryRun: true,
            schedule: {
                intervalMinutes: 30,
                boundaryGraceMinutes: 2,
            },
        });
        expect(response.body.schedule).toHaveProperty("shouldRun");
    });

    test("maps bounded database initialization failures to a generic 503", async () => {
        process.env.CRON_SECRET = "cron-secret-for-test";
        delete process.env.DATABASE_URL;
        const app = await loadApp();

        const response = await request(app)
            .get("/api/jobs/send-reminders")
            .set("Authorization", "Bearer cron-secret-for-test")
            .expect(503);

        expect(response.body).toEqual({
            ok: false,
            error: "Reminder service initialization timed out.",
        });
        expect(response.text).not.toContain("DATABASE_URL");
    });
});

function restoreEnv(name: string, value: string | undefined) {
    if (value === undefined) {
        delete process.env[name];
        return;
    }

    process.env[name] = value;
}
