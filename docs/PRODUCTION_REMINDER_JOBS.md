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
- `CRON_SECRET`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
- `RESEND_API_KEY`
- `EMAIL_FROM`

Recommended schedule:
- Run every 5 minutes.
- Keep the default 60-minute lookback and 15-minute lookahead so a short scheduler outage does not miss due reminders.
- Capture stdout/stderr in host logs.
- Do not run multiple scheduler definitions for the same environment.

Vercel setup:
- The secured endpoint is `GET /api/jobs/send-reminders`.
- Set `CRON_SECRET` in Vercel production. Vercel sends it as `Authorization: Bearer <CRON_SECRET>` when invoking cron.
- The endpoint returns `503` if `CRON_SECRET` is missing and `401` if the header does not match, so reminders cannot be triggered publicly.
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

cron-job.org setup:
- Production currently uses cron-job.org job `7551064`, titled `Leaside Fades reminders`.
- The job is enabled and calls `https://www.leasidefades.com/api/jobs/send-reminders` to avoid the apex-domain redirect.
- The schedule is every five minutes (`*/5 * * * *`) in `America/Toronto`.
- The job sends a custom header named `Authorization` with value `Bearer <CRON_SECRET>`.
- The 10:20 PM America/Toronto run on May 1, 2026 succeeded with `200 OK` after switching from the apex domain to `www`. A prior 10:15 PM run failed with `307 Temporary Redirect` and can be ignored as setup history.
- If `CRON_SECRET` is rotated in Vercel, update the cron-job.org header value at the same time and redeploy production so the serverless function receives the new value.
- Do not create a second scheduler for the same production environment unless this job is disabled first.

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
