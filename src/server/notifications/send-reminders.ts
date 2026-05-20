import "dotenv/config";

import { runConfiguredBookingReminderJob } from "./reminder-job-runner.ts";

async function main() {
    const result = await runConfiguredBookingReminderJob(process.env, { trigger: "cli" });

    console.log(
        [
            "[notifications:reminders]",
            `scanned=${result.scanned}`,
            `totalAttempts=${result.totalAttempts}`,
            `sent=${result.sent}`,
            `failed=${result.failed}`,
            `skipped=${result.skipped}`,
            `duplicate=${result.duplicate}`,
        ].join(" "),
    );
}

main().catch((error) => {
    console.error("[notifications:reminders] job failed");
    console.error(error);
    process.exit(1);
});
