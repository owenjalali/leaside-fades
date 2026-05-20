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

Enable scheduler only after booking and notification smoke tests pass.

Recommended cadence:
- Every 30 minutes on quota-limited/serverless database plans.
- Every 5 minutes only after the production database plan has enough compute quota for continuous reminder wakeups.
- Default lookback: 60 minutes.
- Default lookahead: 15 minutes.
- `REMINDER_HTTP_MIN_INTERVAL_MINUTES` defaults the secured HTTP endpoint to a 30-minute database cadence, so an overly frequent external cron can be skipped before opening a database connection.
- Capture stdout/stderr in host logs.
- Do not configure multiple production reminder schedulers for the same database.

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
- If PostgreSQL reports compute quota exhaustion, upgrade/restore the database plan or quota before expecting booking/admin recovery; redeploying the app alone will not restore DB-backed routes.
- Leave the production database intact unless a restore is explicitly required.
- Preserve DB backup, host logs, and notification rows for debugging.
- If a migration rollback is required, restore from the pre-cutover database checkpoint rather than hand-mutating schema.

Rollback does not mean deleting production data. Treat all customer bookings created during launch tests as records to reconcile with the owner.
