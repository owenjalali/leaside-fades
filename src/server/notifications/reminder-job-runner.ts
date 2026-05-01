import { createDatabaseClient } from "../db/client.ts";
import { assertNotificationRuntimeConfig } from "./config.ts";
import { createNotificationProviders } from "./providers.ts";
import { createDrizzleNotificationRepository } from "./repository.ts";
import {
    reminderJobWindowFromEnv,
    runBookingReminderJob,
} from "./reminders.ts";

export async function runConfiguredBookingReminderJob(env: NodeJS.ProcessEnv = process.env) {
    assertNotificationRuntimeConfig(env);

    const { db, pool } = createDatabaseClient(env.DATABASE_URL);

    try {
        return await runBookingReminderJob({
            repository: createDrizzleNotificationRepository(db),
            providers: createNotificationProviders(),
            ...reminderJobWindowFromEnv(env),
        });
    } finally {
        await pool.end();
    }
}
