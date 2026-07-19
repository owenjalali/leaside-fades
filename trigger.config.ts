import { defineConfig } from "@trigger.dev/sdk";

export default defineConfig({
    // Paste your project ref from the Trigger.dev dashboard (Project settings → Project ref).
    project: "proj_REPLACE_WITH_YOUR_PROJECT_REF",
    dirs: ["./src/trigger"],
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
