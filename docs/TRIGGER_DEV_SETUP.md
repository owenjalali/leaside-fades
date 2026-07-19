# Trigger.dev reminder scheduling — owner setup

The scheduled task in `src/trigger/send-reminders.ts` replaces cron-job.org job `7551064`
and the GitHub Actions canary (`.github/workflows/send-reminders.yml`). It calls the same
production endpoint every 30 minutes (06:00–21:30 Toronto) with 3 retry attempts per run,
so a Neon cold start can no longer surface as a failed run. The endpoint is idempotent
(advisory lock + 30-minute `recent_success` guard + outbox idempotency keys), so retries
and the transition period with two schedulers running are both safe.

## One-time setup (owner steps)

1. `npx trigger.dev@latest login`
2. Create a project in the [Trigger.dev dashboard](https://cloud.trigger.dev) (e.g. `leaside-fades`),
   copy its **project ref** (`proj_…`) into `trigger.config.ts`.
3. In the dashboard → project → **Environment Variables** (Prod), add `CRON_SECRET`
   with the same value as the Vercel production `CRON_SECRET`.
4. Deploy the task: `npm run trigger:deploy`
5. Dashboard → **Alerts**: add an email alert on run failure. This replaces the
   cron-job.org failure emails with alerts that only fire after all retries are exhausted.

## Cutover

1. Parallel-run for a few days. Healthy = green runs on the :00/:30 Toronto cadence,
   with `skipped: recent_success` results counting as healthy (another scheduler beat it).
2. Then disable or delete cron-job.org job `7551064` (cron-job.org dashboard) and delete
   `.github/workflows/send-reminders.yml`.
3. `docs/PRODUCTION_REMINDER_JOBS.md` sections about cron-job.org become historical at
   that point; the endpoint, auth, and cadence guard are unchanged.

## Local development

`npm run trigger:dev` runs the task locally against the Trigger.dev dev environment
(schedules only fire while the CLI is running). Set `CRON_SECRET` in your shell first
if you want a real authenticated call; without it the run fails fast by design.
