import { createDatabaseClient } from "../db/client.ts";
import {
    BOOKING_REMINDER_JOB_NAME,
    createDrizzleSchedulerJobRunRepository,
    runTrackedSchedulerJob,
    type SchedulerJobRunRepository,
} from "../jobs/scheduler-runs.ts";
import { assertNotificationRuntimeConfig } from "./config.ts";
import { createNotificationProviders } from "./providers.ts";
import { createDrizzleNotificationRepository } from "./repository.ts";
import {
    reminderJobWindowFromEnv,
    runBookingReminderJob,
} from "./reminders.ts";

export async function runConfiguredBookingReminderJob(
    env: NodeJS.ProcessEnv = process.env,
    options: {
        trigger?: "http" | "cli" | string;
        schedulerRepository?: SchedulerJobRunRepository;
        now?: () => Date;
    } = {},
) {
    assertNotificationRuntimeConfig(env);

    const { db, pool } = createDatabaseClient(env.DATABASE_URL);
    const schedulerRepository =
        options.schedulerRepository ?? createDrizzleSchedulerJobRunRepository(db);

    try {
        return await runTrackedSchedulerJob({
            jobName: BOOKING_REMINDER_JOB_NAME,
            trigger: options.trigger ?? "cli",
            repository: schedulerRepository,
            now: options.now,
            run: () =>
                runBookingReminderJob({
                    repository: createDrizzleNotificationRepository(db),
                    providers: createNotificationProviders(),
                    ...reminderJobWindowFromEnv(env),
                }),
        });
    } finally {
        await pool.end();
    }
}
