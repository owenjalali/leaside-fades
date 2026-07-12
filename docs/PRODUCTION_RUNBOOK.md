# Production Runbook

This runbook is for the Leaside Fades launch where the public booking link changes from Fresha to `/book`.

Do not run live SMS/email tests against real customers unless the owner explicitly approves.

Current production target:
- Vercel project: `owenjalalis-projects/leaside-fades`
- Production domain: `https://leasidefades.com`
- Production database: Vercel Neon integration resource `leaside-fades-db`

## Pre-Deployment

- Confirm the production host and database provider.
- Confirm the production branch/commit to deploy.
- Confirm a production database backup/checkpoint exists before migration.
- Confirm `.env.production.example` has been copied into the host environment with real values.
- Confirm `APP_URL=https://leasidefades.com`.
- Confirm `SITE_BOOKING_URL=https://leasidefades.com/book`.
- Confirm `NOTIFICATION_DELIVERY_MODE=live` only after Twilio and Resend are verified.
- Confirm password reset and barber invite emails are allowed from the configured Resend sender/domain.
- Confirm no `DEV_OWNER_*` values are configured on production.
- Audit untracked artifacts, Fresha scratch files, cookies, screenshots, exports, and private customer data before the launch commit.

## Required Production Environment

- `NODE_ENV=production`
- `PORT`
- `APP_URL`
- `DATABASE_URL`
- `NOTIFICATION_DELIVERY_MODE`
- `REMINDER_JOB_LOOKBACK_MINUTES`
- `REMINDER_JOB_LOOKAHEAD_MINUTES`
- `REMINDER_HTTP_MIN_INTERVAL_MINUTES`
- `REMINDER_HTTP_BOUNDARY_GRACE_MINUTES`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `GOOGLE_PLACES_API_KEY`
- `GOOGLE_PLACE_ID`
- `SITE_BUSINESS_NAME`
- `SITE_PHONE_E164`
- `SITE_PHONE_DISPLAY`
- `SITE_GOOGLE_MAPS_URL`
- `SITE_INSTAGRAM_URL`
- `SITE_FACEBOOK_URL`
- `SITE_BOOKING_URL`
- `SITE_BOOKING_NOTICE`

## Deploy Commands

Install dependencies:

```sh
npm ci
```

Build:

```sh
npm run build
```

`NODE_ENV=production` is required for production runtime behavior such as secure cookies. Prefer setting it through the host/process environment. If it is also present in a local `.env` during `npm run build`, Vite may print a warning, but the production build can still pass.

Apply migrations:

```sh
npm run db:migrate
```

Seed static public business data only if the production DB is empty and owner-approved:

```sh
npm run db:seed
```

Start server:

```sh
npm run server
```

## Health And Domain Checks

- `https://leasidefades.com/api/health`
- `https://leasidefades.com`
- `https://leasidefades.com/book`
- `https://leasidefades.com/admin/login`
- `https://leasidefades.com/admin/forgot-password`

Verify:
- HTTPS is active.
- Static assets load.
- `/api/health` returns 200 only when the critical PostgreSQL dependency answers a database readiness query. A 503 means the booking/admin system is not online even if the static site still loads.
- Public booking catalog loads.
- Admin login page loads.
- Password reset and invite setup pages load without requiring an active admin session.
- Google Places reviews do not expose server errors.
- Google Maps, Instagram, and Facebook links point to the approved destinations.

Repeatable non-mutating smoke:

```sh
npm run qa:production-smoke
```

The production smoke runner checks that `/book` loads, `/api/health` proves PostgreSQL readiness, `/api/booking/catalog` returns the launch catalog, invalid admin login returns `401` instead of `500`, protected admin routes stay protected, and the reminder endpoint rejects unauthenticated calls before database work.

Repeatable bounded read stress:

```sh
npm run qa:production-read-stress
```

The production read stress runner is non-mutating. By default it makes 32 requests at concurrency 4 against `/book`, `/api/health`, `/api/booking/catalog`, `/api/booking/availability`, and an invalid admin login attempt. It fails on dependency errors, unexpected statuses, invalid response shapes, request timeouts, or p95 latency above the configured guard. Optional authenticated admin read checks can be enabled with `PRODUCTION_STRESS_ADMIN_EMAIL` and `PRODUCTION_STRESS_ADMIN_PASSWORD`; do not store those values in git or shell history.

## Data Setup

Before exposing `/book` publicly:
- Enter owner-approved recurring shifts by barber and location.
- Confirm Yogesh Kumar is assigned only to Millwood for launch.
- Confirm active barbers and staff onboarding state.
- Confirm service catalog, prices, durations, categories, and featured services.
- Confirm business hours and location details.
- Enter approved closures or blocked time.
- Confirm owner/admin login account/email and login path.
- Confirm owner/admin password reset email delivery through Resend.
- Confirm barber invite email delivery through Resend before onboarding staff.
- Enter staff phone/email contacts only from owner-approved data.

Do not seed local/dev sample shifts in production.

## Controlled Live Notification Smoke Test

Preflight:

```sh
npm run notifications:check-live-config
```

Rules:
- Use only approved internal test phone numbers and email addresses.
- Do not notify real customers during QA.
- Keep `NOTIFICATION_DELIVERY_MODE=mock` or a staging database until live smoke test approval is explicit.

Smoke steps:
- If a temporary production smoke endpoint is used because Vercel secrets are write-only locally, protect it with a one-use secret, call it only with approved internal contacts, remove it immediately afterward, remove the temporary env var, and redeploy clean production.
- Record provider-level smoke results before booking-flow smoke. Controlled live Twilio SMS and Resend email smoke has passed with approved internal test contacts; raw test contact details are intentionally not stored in git.
- Create a public test booking.
- Verify customer SMS/email attempts are sent or logged.
- Verify assigned staff SMS/email attempts are sent or logged when contact info exists.
- Verify owner/admin Dashboard Notification Center activity appears for the booking.
- Verify missing staff contacts produce skipped attempts and do not fail booking creation.
- Verify notification metadata has no raw management tokens and no raw cancel/reschedule URLs.
- Cancel a test booking through the customer link and verify the slot is freed.
- Reschedule a test booking through the customer link and verify the new slot is blocked and old slot is freed.

## Reminder Runner

Preflight:

```sh
npm run notifications:check-live-config
```

Manual run:

```sh
npm run notifications:send-reminders
```

Production HTTP auth dry-run:

```sh
curl -H "Authorization: Bearer <CRON_SECRET>" "https://www.leasidefades.com/api/jobs/send-reminders?dryRun=1"
```

Use the dry-run call to verify the Vercel `CRON_SECRET` and reminder cadence after secret rotation or scheduler edits. It does not run the live reminder job.

Production scheduler log gate:

```sh
npm run qa:production-reminder-scheduler
```

This checks Vercel production logs for at least one `200` response from `/api/jobs/send-reminders`. Set `PRODUCTION_REMINDER_LOG_SINCE=<ISO timestamp>` when validating a specific scheduler restart window.

After migration `0006_phase_12_scheduler_job_runs` is applied, real reminder job runs also write heartbeat rows. Check `/admin/dashboard` Notification health after a successful scheduler restart; the reminder scheduler should move from unknown/stale/failing to running after the next real authorized run.

GitHub Actions scheduler:
- `.github/workflows/send-reminders.yml` runs on `master` at UTC minute `13` and `43`.
- Store the current production `CRON_SECRET` as repository secret `LEASIDE_REMINDER_CRON_SECRET`.
- The workflow can be manually dispatched with `gh workflow run send-reminders.yml --ref master`.
- The workflow fails if the endpoint returns non-2xx. A `recent_success` skip is clean because the durable heartbeat already satisfies the cadence.
- cron-job.org is the primary scheduler. GitHub Actions may remain enabled as a backup/manual path because the reminder endpoint uses the durable heartbeat to avoid duplicate reminder sends.

If the scheduler log gate shows repeated `401` responses, cron-job.org is reaching production but is not sending the current `Authorization: Bearer <CRON_SECRET>` header. Edit the cron-job.org job, update the custom Authorization header from the current Vercel Production `CRON_SECRET`, save/re-enable the job, run a manual test, and rerun `npm run qa:production-reminder-scheduler`.

The same cron-job.org configuration can be verified and repaired through the API from a local shell that has the cron-job.org API key and current Vercel Production `CRON_SECRET`:

```powershell
$env:CRON_JOB_ORG_API_KEY = "<cron-job.org API key>"
$env:CRON_SECRET = "<current Vercel Production CRON_SECRET>"
npm run qa:cron-job-org-reminder
npm run ops:cron-job-org-reminder-repair
npm run qa:cron-job-org-reminder
```

If this machine has just rotated the Vercel secret, load the current ignored local ops copy without printing it:

```powershell
$env:CRON_SECRET = (Select-String -Path .env.production.local -Pattern '^CRON_SECRET=' | Select-Object -First 1).Line -replace '^CRON_SECRET=', ''
```

The repair command verifies the supplied `CRON_SECRET` against the production dry-run endpoint before changing cron-job.org. If Vercel env pull returns `CRON_SECRET=""` or another value that production rejects with `401`, do not use it; rotate or retrieve the actual production secret first.

After the scheduler check is clean, wait for or trigger one real run and rerun `npm run qa:production-reminder-scheduler`. This gate requires both Vercel log evidence and a durable reminder success heartbeat, so an authenticated dry-run or off-cadence skip cannot accidentally mark scheduler recovery complete.

If the deploy came from the Vercel CLI and project-level production logs omit the latest request, target the concrete deployment domain:

```powershell
$env:PRODUCTION_REMINDER_LOG_SINCE = "<restart ISO timestamp>"
$env:PRODUCTION_REMINDER_LOG_TARGET = "<deployment-domain>"
npm run qa:production-reminder-scheduler
Remove-Item Env:PRODUCTION_REMINDER_LOG_SINCE
Remove-Item Env:PRODUCTION_REMINDER_LOG_TARGET
```

Then verify the durable in-app heartbeat. Use a `since` value from just before the cron-job.org restart so old history cannot pass the gate:

```powershell
$env:PRODUCTION_REMINDER_HEARTBEAT_SINCE = "<restart ISO timestamp>"
npm run qa:production-reminder-heartbeat
Remove-Item Env:PRODUCTION_REMINDER_HEARTBEAT_SINCE
```

Enable scheduler only after booking and notification smoke tests pass.

Recommended cadence:
- Every 30 minutes within the America/Toronto active window (06:00-21:30). Reminder due-times only occur around shop hours; overnight runs only wake the Neon database and burn compute quota.
- Never restore a 24/7 or five-minute schedule on quota-limited database plans — that cadence exhausted the Neon compute quota mid-month and took production down in the past.
- Default lookback: 60 minutes.
- Default lookahead: 15 minutes.
- `REMINDER_HTTP_MIN_INTERVAL_MINUTES` defaults the secured HTTP endpoint to a 30-minute database cadence using the durable success heartbeat.
- A delayed authorized scheduler run executes when the last successful heartbeat is stale; a duplicate authorized scheduler run skips with `recent_success`.
- Capture stdout/stderr in host logs.
- Do not configure multiple authorized production reminder schedulers for the same database.

## Logging And Error Visibility

Before cutover, confirm where these are visible:
- server process logs
- migration output
- reminder job stdout/stderr
- Twilio delivery errors
- Resend delivery errors
- database connection errors
- database quota/compute exhaustion errors
- uncaught Express errors

Notification provider failures should be visible in the `notifications` table and host logs.

## Weekly Health Check

Run this short routine once a week against production:

1. Run the non-mutating smoke:

```sh
npm run qa:production-smoke
```

2. Verify the durable reminder success heartbeat:

```sh
npm run qa:production-reminder-heartbeat
```

3. Scan Vercel production logs for `[error]` entries. After the July 2026 sslmode normalization fix, the error stream should be quiet on healthy traffic, so anything appearing there deserves investigation.

4. Glance at Neon compute/storage usage (Vercel dashboard -> Storage -> `leaside-fades-db`). On the Free plan, month-to-date compute hours should track well under the monthly allowance; a surge usually means a scheduler was misconfigured back to a 24/7 cadence.

If the smoke fails, follow Health And Domain Checks. If the heartbeat is stale or failing, follow Reminder Runner. For error triage sources, see Logging And Error Visibility.

## Cutover

Only after owner signoff:
- Replace public Fresha booking links with `https://leasidefades.com/book`.
- Keep Fresha active for existing bookings during the soft-transition period.
- Monitor booking creation, notification logs, and reminder job logs after cutover.
- Keep rollback steps ready for the launch window.

## Rollback

If launch smoke tests fail or production behavior is unsafe:
- Restore public website booking links to the previous Fresha booking URL.
- Stop the production reminder scheduler.
- If PostgreSQL reports compute quota exhaustion, upgrade the Neon plan (Vercel dashboard -> Storage -> `leaside-fades-db`, or the Neon console Billing page). The plan change is instant, needs no migration or data restore, and DB-backed routes recover as soon as compute resumes. Redeploying the app alone will not restore DB-backed routes. Afterwards, check which scheduler burned the quota (`npm run qa:cron-job-org-reminder` should report the business-hours schedule) before downgrading again.
- Leave the production database intact unless a restore is explicitly required.
- Preserve DB backup, host logs, and notification rows for debugging.
- If a migration rollback is required, restore from the pre-cutover database checkpoint rather than hand-mutating schema.

Rollback does not mean deleting production data. Treat all customer bookings created during launch tests as records to reconcile with the owner.
