import "dotenv/config";

import { validateNotificationRuntimeConfig } from "./config.ts";

const result = validateNotificationRuntimeConfig(process.env, {
    requireLiveDelivery: true,
});

if (!result.ok) {
    console.error(`[notifications:config] live reminder configuration is incomplete (mode=${result.mode})`);
    for (const issue of result.issues) {
        console.error(`- ${issue.key}: ${issue.message}`);
    }
    process.exit(1);
}

console.log("[notifications:config] live reminder configuration is ready.");
