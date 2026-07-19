# Phase 12 Launch Prep

Phase 12 is the full production launch-readiness phase.

The goal is to get Leaside Fades into a state where, after owner signoff, the public Fresha booking link can be replaced with `/book` and the app can launch. By the end of Phase 12, the repo should be production-configured, production-data-ready, QA-verified, notification-ready, reminder-job-ready, security/privacy-audited, deployment/runbook-ready, rollback-ready, and owner-signoff-ready.

Phase 12 is complete only when the remaining launch blockers are external decisions, production secrets, hosting access, or final owner approval.

## Launch Data Source Of Truth

Fresha is authoritative for launch data unless an explicit launch override below says otherwise.

Fresha-authoritative data:
- service catalog, service names, categories, prices, durations, and featured/public services
- barber/staff roster
- location details and public operational details
- business hours
- staff availability/schedules
- booking rules

Explicit launch overrides:
- Yogesh Kumar is strictly Millwood for launch. Do not make Yogesh bookable at Eglinton, even if Fresha notes or older repo docs imply otherwise.
- The current Eglinton phone number is correct and is not a launch blocker. Repo env templates and static seed data currently use `+1 (647) 348-2200` / `+16473482200`.
- Reconcile services by name, category, price, and duration, not count alone. Do not add a 38th service only because Fresha admin showed 38. If Fresha shows a real missing service with clear launch details, flag it for owner approval before adding it.

## Current Repo Readiness

Resolved in repo:
- Production template exists at `.env.production.example`.
- Local `.env.example` points `SITE_BOOKING_URL` to local `/book`; production template points to `https://leasidefades.com/book`.
- Drizzle migrations are present in order:
  - `0000_magical_sersi`
  - `0001_phase_5a_custom_session_auth`
  - `0002_phase_5b_password_reset`
  - `0003_phase_5c_owner_barber_onboarding`
  - `0004_phase_7_5_calendar_operations`
  - `0005_phase_9_notifications`
- `npm run db:seed:dev-owner`, `npm run db:seed:dev-shifts`, and phase QA runners are guarded to local/dev database hosts.
- Production seed data no longer assigns Yogesh to Eglinton.
- Local/dev sample shifts no longer create Yogesh Eglinton availability.
- Booking confirmation notifications now include customer SMS/email and assigned barber SMS/email when contact exists. Owner/admin booking awareness is handled through the in-app Dashboard Notification Center, not outbound owner/admin email.
- Notification metadata records link presence only; it does not persist raw management tokens or raw cancel/reschedule URLs.
- Production password reset and barber invite links now send through Brevo, require `APP_URL` in production, and land on usable unauthenticated admin reset/setup screens.

Still external before public cutover:
- Owner should verify the observed Fresha recurring schedule that has been entered as the initial production roster.
- Production owner/admin login has been generated and verified, but the temporary password must be handed off and rotated.
- Staff notification phone/email contacts must be confirmed and entered if the owner wants live staff notifications.
- Historical Twilio/Resend delivery passed controlled smoke sends. Twilio is intentionally paused until funding returns, and Brevo requires a fresh controlled email smoke; raw test contact details are not stored in git.
- Production cron, logging, backup, and rollback access must be confirmed; the current Vercel Hobby account cannot run the required five-minute cron cadence.
- Live smoke tests must use only approved test contacts.
- Untracked artifacts must be audited before a launch commit.

Current production deployment state as of May 1, 2026:
- `leasidefades.com` is deployed on Vercel production.
- Production PostgreSQL is connected through the Vercel Neon integration `leaside-fades-db`.
- Migrations and static launch seed data have been applied.
- `/api/booking/catalog` returns 2 locations, 3 service categories, 37 services, and 4 barbers.
- The observed Fresha launch schedule has been entered as 24 recurring production shifts, with Yogesh Millwood-only.
- `owner@leasidefades.com` can log in to the live admin. Temporary credentials are stored only in ignored local launch output pending owner handoff/rotation.
- Vercel production must contain encrypted Brevo notification variables, `SMS_DELIVERY_MODE=paused`, and the secured reminder endpoint secret. The endpoint returns `401` without `CRON_SECRET`, confirming the auth guard runs before database initialization. The local Vercel CLI cannot inspect sensitive values for `npm run notifications:check-live-config`.
- The Fresha May 1-June 30 appointment import has been applied after owner approval. It inserted 53 `source = "imported"` bookings and did not trigger immediate SMS/email/reminder lifecycle delivery.

## Production Environment Checklist

Required production variables:
- `NODE_ENV=production`
- `PORT`
- `APP_URL=https://leasidefades.com`
- `DATABASE_URL`
- `NOTIFICATION_DELIVERY_MODE=live`
- `SMS_DELIVERY_MODE=paused`
- `NOTIFICATION_PROVIDER_TIMEOUT_MS=5000`
- `REMINDER_JOB_LOOKBACK_MINUTES=60`
- `REMINDER_JOB_LOOKAHEAD_MINUTES=15`
- `REMINDER_HTTP_MIN_INTERVAL_MINUTES=30`
- `REMINDER_HTTP_BOUNDARY_GRACE_MINUTES=2`
- `REMINDER_DB_CONNECT_TIMEOUT_MS=5000` (allows two connect attempts within the 12-second initialization budget: 5s + 0.5s retry delay + 5s = 10.5s)
- `REMINDER_DB_QUERY_TIMEOUT_MS=5000`
- `REMINDER_HTTP_DEADLINE_MS=24000`
- `CRON_SECRET`
- `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_FROM_NUMBER` only when SMS is live
- `BREVO_API_KEY`
- `EMAIL_FROM`
- `EMAIL_REPLY_TO` (optional)
- `GOOGLE_PLACES_API_KEY`
- `GOOGLE_PLACE_ID`
- `SITE_BUSINESS_NAME`
- `SITE_PHONE_E164`
- `SITE_PHONE_DISPLAY`
- `SITE_GOOGLE_MAPS_URL`
- `SITE_INSTAGRAM_URL`
- `SITE_FACEBOOK_URL`
- `SITE_BOOKING_URL=https://leasidefades.com/book`
- `SITE_BOOKING_NOTICE`

Production behavior to verify:
- `NODE_ENV=production` sets `lf_admin_session` cookies with `Secure`, `HttpOnly`, and `SameSite=Lax`.
- `APP_URL` is the production origin used for password reset URLs, invite URLs, customer links, and admin mutation Origin/Referer checks.
- `NOTIFICATION_DELIVERY_MODE=live` is used only after Brevo is verified; Twilio remains separately gated by `SMS_DELIVERY_MODE`.
- Reminder windows stay at 60-minute lookback and 15-minute lookahead unless the owner approves a different operating cadence.
- No `DEV_OWNER_*` values are set on production.
- No local/dev seed or QA runner is run against a production database.

## Production Database And Data Checklist

Deployment commands:
- Migrate schema: `npm run db:migrate`
- Static bootstrap seed, only if the production DB is empty and owner-approved: `npm run db:seed`

Static seed data strategy:
- Seed only public, non-secret business configuration: locations, business hours, barbers, barber-location assignments, service categories, services, and barber-service capabilities.
- Do not seed fake or sample production shifts.
- Do not commit private staff phone/email if the owner treats those contacts as private.
- Enter staff notification contacts through an owner-approved production data step.
- Enter real recurring shifts from owner-approved schedule data only.
- Use blocked time/closures for known launch closures only after owner approval.

Owner-approved data required before launch:
- Leaside Fades locations and public contact details
- business hours
- active barbers
- barber phone/email if needed for appointment notifications
- real recurring shifts
- service categories
- service names
- prices
- durations
- featured services
- blocked time or closures
- production owner/admin login account/email
- staff invite/onboarding needs
- Twilio sending number and funding before SMS reactivation
- Brevo sender/domain

The initial production recurring schedule has been entered from the Phase 11 Fresha observation to make availability usable during launch prep. Treat the schedule as pending owner verification, not as a replacement for owner signoff.

## Launch QA Plan

Run before owner signoff:
- `npm run build`
- `npm run test`
- `npm run notifications:check-live-config` with production-style env values
- Public `/book` desktop booking flow
- Public `/book` mobile booking flow
- Customer cancel link
- Customer reschedule link
- Admin login
- Password reset email request and `/admin/reset-password` completion with an approved test admin
- Barber invite email and `/admin/accept-invite` completion with an approved test barber
- Barber login
- Calendar day board
- Unified Add appointment flow for staff-created manual and walk-in-style appointments
- No-show
- Drag/drop reschedule
- Shifts affecting availability
- Blocked time and closures affecting availability
- Booking confirmation notification logs for customer and assigned staff, plus owner/admin Dashboard Notification Center activity
- Reminder CLI safe run with a controlled fixture or staging DB
- Production-like `APP_URL`, live email mode, paused/live SMS mode, Brevo, and bounded reminder windows

## Launch-Day Smoke Test

Rules:
- Use test bookings only.
- Send live SMS/email only to owner-approved test contacts.
- Do not message real customers during QA unless the owner explicitly approves.
- Clean up or clearly mark test bookings after the smoke test.

Smoke steps:
- Confirm `/api/health` returns healthy.
- Confirm `https://leasidefades.com`, `/book`, and `/admin/login` load.
- Create one public test booking through `/book`.
- Confirm the admin calendar shows the correct location, service, time, customer, and assigned barber.
- Confirm customer booking confirmation was attempted/logged.
- Confirm owner/admin Dashboard Notification Center activity appears for the booking.
- Confirm assigned staff SMS/email was attempted/logged when contact info exists.
- Confirm metadata contains no raw tokens and no raw cancel/reschedule URLs.
- Cancel the booking through the customer link and verify the slot is freed.
- Create a second test booking, reschedule it through the customer link, and verify the new slot is blocked and the old slot is freed.
- Run the reminder CLI against a safe controlled fixture or staging DB before enabling production cadence.

## Security And Privacy Checklist

- No credentials committed.
- No filled `.env` committed.
- No raw customer management tokens stored in DB metadata or notification metadata.
- No raw cancel/reschedule URLs stored in notification metadata.
- No Fresha cookies, storage state, exports, screenshots, or private customer data committed.
- `artifacts/` and other untracked files are audited before launch commit.
- Session cookies are `Secure` in production.
- Admin mutation Origin/Referer guard uses production `APP_URL`.
- Password reset and barber invite links fail loudly if production `APP_URL` is missing.
- Public endpoints expose only safe catalog/availability/booking-management data.
- Password reset and invite delivery use Brevo in production and dev console logging outside production.
- Notification logs are sanitized.

## Final Success Questions

Before cutover, the repo and deployment should answer yes to:
- Can this app be deployed to production safely?
- Can customers book through `/book`?
- Can admins/staff manage appointments?
- Are real schedules, services, locations, and staff data launch-ready?
- Are customer/staff delivery and owner/admin dashboard visibility ready?
- Are reminder jobs ready?
- Are secrets, privacy, and token risks controlled?
- Is there a runbook for deploy, smoke test, rollback, and cutover?
- Is there a clear owner signoff checklist?
- Are the remaining blockers only external decisions, secrets, access, or final approval?
