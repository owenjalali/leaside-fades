# Production Reminder Jobs

Phase 10 reminder delivery runs through the portable CLI runner:

```sh
npm run notifications:send-reminders
```

Before enabling a production scheduler, configure live delivery secrets in the production environment and run:

```sh
npm run notifications:check-live-config
```

The preflight exits nonzero if `DATABASE_URL`, `APP_URL`, `NOTIFICATION_DELIVERY_MODE=live`, or any Twilio/Resend live-delivery variable is missing.

## Phase Timing

Phase 10 prepares reminder jobs and environment templates only. It is safe to run config checks locally, but live reminder sends to real customers should not be tested in Phase 10.

Phase 11 is read-only Fresha inspection. It may verify current Fresha services, schedules, and booking display, but it must not mutate Fresha data and must not enable production reminders.

Phase 12 launch prep owns production readiness testing:
- production environment variables on the actual host
- `https://leasidefades.com` and `https://leasidefades.com/book`
- Google Places, Google Maps, Instagram, and Facebook configuration
- Resend domain/sender verification
- Twilio SMS-capable sender verification
- controlled live SMS/email smoke tests to owner-approved test contacts only
- manual reminder job smoke test against a safe fixture or staging database
- production scheduler enablement after smoke tests pass
- A secured `GET /api/jobs/send-reminders` endpoint exists for a production scheduler.

The full Phase 12 deployment, smoke-test, rollback, and cutover procedure lives in `docs/PRODUCTION_RUNBOOK.md`.

Phase 13 is optional Fresha migration/import tooling only. It is not required for the website booking link or notification production-readiness checks.

## Environment File Setup

Use `.env.production.example` as the fill-in template.

Local production-style setup:

```sh
cp .env.production.example .env
```

Windows PowerShell equivalent:

```powershell
Copy-Item .env.production.example .env
```

Then edit `.env` and replace every placeholder. Do not commit `.env`; it is ignored by Git.

Hosted production setup:
- Do not upload `.env` to GitHub.
- Enter the same key/value pairs from `.env.production.example` in the host's environment variable settings.
- Keep the values available to both the web server process and the reminder cron/task process.

Required production notification variables:
- `DATABASE_URL`
- `APP_URL`
- `NOTIFICATION_DELIVERY_MODE=live`
- `REMINDER_JOB_LOOKBACK_MINUTES=60`
- `REMINDER_JOB_LOOKAHEAD_MINUTES=15`
- `REMINDER_HTTP_MIN_INTERVAL_MINUTES=30` on quota-limited database plans
- `REMINDER_HTTP_BOUNDARY_GRACE_MINUTES=2` for authenticated dry-run boundary reporting
- `CRON_SECRET`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
- `RESEND_API_KEY`
- `EMAIL_FROM`

Recommended schedule:
- Run every 30 minutes on quota-limited/serverless database plans.
- Run every 5 minutes only after the database plan has enough compute quota for continuous production reminder wakeups.
- Keep the default 60-minute lookback and 15-minute lookahead so a short scheduler delay does not miss due reminders.
- Capture stdout/stderr in host logs.
- Do not run multiple authorized scheduler definitions for the same environment.

Vercel setup:
- The secured endpoint is `GET /api/jobs/send-reminders`.
- Set `CRON_SECRET` in Vercel production. Vercel sends it as `Authorization: Bearer <CRON_SECRET>` when invoking cron.
- The endpoint returns `503` if `CRON_SECRET` is missing and `401` if the header does not match, so reminders cannot be triggered publicly.
- To verify the production cron secret without sending reminders or opening a database reminder job, call `GET /api/jobs/send-reminders?dryRun=1` with the same `Authorization: Bearer <CRON_SECRET>` header. A healthy dry-run response returns `200`, `dryRun: true`, and the current cadence decision.
- The endpoint checks `REMINDER_HTTP_MIN_INTERVAL_MINUTES` and the latest durable success heartbeat before running the live reminder job. The default is 30 minutes. Delayed authorized scheduler calls run when the last successful heartbeat is stale; duplicate calls skip with `reason: "recent_success"` when a recent success already satisfies the cadence.
- Vercel Hobby projects are limited to daily cron jobs. The recommended five-minute schedule requires Vercel Pro or an external scheduler.
- On a Vercel Pro project, add this to `vercel.json` before redeploying:

```json
{
  "crons": [
    {
      "path": "/api/jobs/send-reminders",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

GitHub Actions setup:
- `.github/workflows/send-reminders.yml` is available as a free backup/manual production scheduler path.
- The workflow runs on the default branch at UTC minute `13` and `43` and can also be run manually through `workflow_dispatch`.
- It calls `https://www.leasidefades.com/api/jobs/send-reminders` with `Authorization: Bearer <LEASIDE_REMINDER_CRON_SECRET>`.
- Store the same current production `CRON_SECRET` in the repository secret `LEASIDE_REMINDER_CRON_SECRET`. Do not commit the value.
- The workflow fails if production returns a non-2xx response. A `recent_success` skip exits cleanly because it means another real run already satisfied the cadence.
- cron-job.org is the primary scheduler. GitHub Actions may remain enabled as a backup because the production endpoint uses the durable heartbeat to avoid duplicate reminder sends.

cron-job.org setup:
- Production currently uses cron-job.org job `7551064`, titled `Leaside Fades reminders`.
- The job is enabled and calls `https://www.leasidefades.com/api/jobs/send-reminders` to avoid the apex-domain redirect.
- The previous launch schedule was every five minutes (`*/5 * * * *`) in `America/Toronto`. On the current quota-limited database plan, keep this at every 30 minutes or rely on the HTTP endpoint's 30-minute guard until the database plan is upgraded.
- The job sends a custom header named `Authorization` with value `Bearer <CRON_SECRET>`.
- The job can be inspected with the cron-job.org API without storing secrets in git:

```powershell
$env:CRON_JOB_ORG_API_KEY = "<cron-job.org API key>"
$env:CRON_SECRET = "<current Vercel Production CRON_SECRET>"
npm run qa:cron-job-org-reminder
```

- If the check reports a disabled job, wrong URL, stale/missing Authorization header, or wrong cadence, repair job `7551064` from the same shell:

```powershell
$env:CRON_JOB_ORG_API_KEY = "<cron-job.org API key>"
$env:CRON_SECRET = "<current Vercel Production CRON_SECRET>"
npm run ops:cron-job-org-reminder-repair
```

- If this machine has just rotated the Vercel secret, the ignored `.env.production.local` file contains the current local ops copy. Load it without printing the secret:

```powershell
$env:CRON_SECRET = (Select-String -Path .env.production.local -Pattern '^CRON_SECRET=' | Select-Object -First 1).Line -replace '^CRON_SECRET=', ''
```

- The repair command first verifies the supplied secret against `https://www.leasidefades.com/api/jobs/send-reminders?dryRun=1`. If production rejects the secret, the command stops before patching cron-job.org. If the dry-run passes, it enables the job, sets the URL to `https://www.leasidefades.com/api/jobs/send-reminders`, sets GET, stores `Authorization: Bearer <CRON_SECRET>`, saves responses, and changes the schedule to every 30 minutes. The command does not print the secret.
- Vercel encrypted secret values may pull locally as an empty quoted value. Do not use a pulled empty `CRON_SECRET`; create or retrieve a real current production secret first, then verify it with the dry-run path.
- The 10:20 PM America/Toronto run on May 1, 2026 succeeded with `200 OK` after switching from the apex domain to `www`. A prior 10:15 PM run failed with `307 Temporary Redirect` and can be ignored as setup history.
- If `CRON_SECRET` is rotated in Vercel, update the cron-job.org header value at the same time and redeploy production so the serverless function receives the new value.
- Do not create a second scheduler for the same production environment unless this job is disabled first.
- After restarting cron-job.org, run `npm run qa:production-reminder-scheduler` to confirm the selected window contains both a Vercel `200` for `/api/jobs/send-reminders` and a durable `scheduler_job_runs` success heartbeat. Use `PRODUCTION_REMINDER_LOG_SINCE=<ISO timestamp>` to narrow the check to the restart window. A dry-run or off-cadence skip can create a Vercel `200`, so the scheduler gate requires the heartbeat by default.
- If the production deploy was created from the Vercel CLI and project-level logs omit the latest request, set `PRODUCTION_REMINDER_LOG_TARGET=<deployment-domain>` to read logs from the concrete deployment URL.
- You can also run `npm run qa:production-reminder-heartbeat` directly with `PRODUCTION_REMINDER_HEARTBEAT_SINCE=<restart ISO timestamp>` to inspect the heartbeat alone. Dry-runs, unauthorized `401`s, and off-cadence HTTP skips do not write this heartbeat.

Linux cron example:

```cron
*/5 * * * * cd /var/www/leaside-fades && npm run notifications:send-reminders >> /var/log/leaside-fades-reminders.log 2>&1
```

Windows Task Scheduler action example:

```txt
Program/script: npm
Arguments: run notifications:send-reminders
Start in: C:\path\to\Leaside Fades
Trigger: Daily, repeat every 5 minutes indefinitely
```

Operational notes:
- Provider failures are logged per notification row and do not fail the whole job.
- Failed provider rows are retryable on later job runs.
- Sent, skipped, and in-flight pending rows remain idempotent and do not resend.
- Cancelled, completed, no-show, walk-in, imported, and stale-rescheduled bookings are re-checked and skipped before delivery.
- After restarting cron-job.org, verify at least one real `200` response in cron-job.org history for the non-dry-run URL, then check Vercel logs for no new 500/503 reminder route failures.
