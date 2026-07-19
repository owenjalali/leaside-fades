import { syncEnvVars } from "@trigger.dev/build/extensions/core";
import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
    project: "proj_wuzcnpvcgrcswqpushpt",
    dirs: ["./src/trigger"],
    build: {
        extensions: [
            // Deploy-time sync: CRON_SECRET is read from the deploying shell's env
            // (pull it from Vercel first) so it never needs to be entered in the dashboard.
            syncEnvVars(() => {
                const cronSecret = process.env.CRON_SECRET;
                return cronSecret ? [{ name: "CRON_SECRET", value: cronSecret }] : [];
            }),
        ],
    },
    maxDuration: 300,
    retries: {
        enabledInDev: false,
        default: {
            maxAttempts: 3,
            minTimeoutInMs: 5_000,
            maxTimeoutInMs: 30_000,
            factor: 2,
            randomize: true,
        },
    },
});
