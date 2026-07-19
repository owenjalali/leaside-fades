import { schedules } from "@trigger.dev/sdk";

const REMINDER_ENDPOINT = "https://www.leasidefades.com/api/jobs/send-reminders";

interface ReminderEndpointBody {
    ok?: boolean;
    skipped?: boolean;
    reason?: string;
}

// Replaces the cron-job.org job and the GitHub Actions canary. Mirrors the canary's
// contract: non-2xx, ok!=true, and unexpected skips all throw so platform retries
// (and failure alerts) kick in; a "recent_success" skip counts as a healthy run.
export const sendReminders = schedules.task({
    id: "leaside-send-reminders",
    cron: {
        pattern: "*/30 6-21 * * *",
        timezone: "America/Toronto",
    },
    retry: {
        maxAttempts: 3,
        minTimeoutInMs: 5_000,
        maxTimeoutInMs: 30_000,
        factor: 2,
    },
    run: async () => {
        const cronSecret = process.env.CRON_SECRET;
        if (!cronSecret) {
            throw new Error("CRON_SECRET is not set in this Trigger.dev environment.");
        }

        const response = await fetch(REMINDER_ENDPOINT, {
            headers: {
                Authorization: `Bearer ${cronSecret}`,
                "User-Agent": "leaside-fades-trigger-dev-reminder/1.0",
                "X-Scheduler-Source": "trigger-dev",
            },
            signal: AbortSignal.timeout(60_000),
        });

        const text = await response.text();
        if (!response.ok) {
            throw new Error(`Reminder endpoint returned HTTP ${response.status}: ${text.slice(0, 300)}`);
        }

        let body: ReminderEndpointBody;
        try {
            body = JSON.parse(text) as ReminderEndpointBody;
        } catch {
            throw new Error(`Reminder endpoint returned a non-JSON body: ${text.slice(0, 300)}`);
        }

        if (!body.ok) {
            throw new Error(`Reminder endpoint did not report ok=true: ${text.slice(0, 300)}`);
        }
        if (body.skipped && body.reason !== "recent_success") {
            throw new Error(`Reminder endpoint skipped instead of running: ${body.reason ?? "unknown reason"}`);
        }

        return {
            status: response.status,
            skipped: body.skipped ?? false,
            reason: body.reason ?? null,
        };
    },
});
