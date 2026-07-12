import { createDatabaseClient } from "../db/client.ts";
import {
    createDrizzleSchedulerHistoryRetentionRepository,
    pruneSchedulerHistorySafely,
} from "../jobs/history-retention.ts";
import {
    BOOKING_REMINDER_JOB_NAME,
    createDrizzleSchedulerJobRunRepository,
    runTrackedSchedulerJob,
    type SchedulerJobRunSummary,
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
            run: async () => {
                const summary = await runBookingReminderJob({
                    repository: createDrizzleNotificationRepository(db),
                    providers: createNotificationProviders(),
                    ...reminderJobWindowFromEnv(env),
                });
                // Retention pruning keeps the notifications outbox and heartbeat
                // history inside Neon Free's storage allowance; failures must
                // never block reminder delivery.
                const retention = await pruneSchedulerHistorySafely({
                    repository: createDrizzleSchedulerHistoryRetentionRepository(db),
                    now: options.now?.(),
                });

                return retention ? { ...summary, retention } : summary;
            },
        });
    } finally {
        await pool.end();
    }
}

export async function getConfiguredBookingReminderJobSummary(
    env: NodeJS.ProcessEnv = process.env,
): Promise<SchedulerJobRunSummary | null> {
    const { db, pool } = createDatabaseClient(env.DATABASE_URL);

    try {
        return await createDrizzleSchedulerJobRunRepository(db).getJobRunSummary({
            jobName: BOOKING_REMINDER_JOB_NAME,
        });
    } finally {
        await pool.end();
    }
}
