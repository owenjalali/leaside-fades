# Architecture - Leaside Fades Booking System

## Purpose

Build a production-grade booking and scheduling platform for Leaside Fades with two locations, multiple barbers, shift-based availability, customer bookings, admin/barber management, and Twilio/Resend notifications.

This project is "Fresha Lite": focused, reliable booking for one business, not a generic SaaS or full Fresha clone.

## Confirmed Stack

- Frontend: React + Vite + TypeScript
- Backend: Express with TypeScript-oriented modules
- Styling: existing Tailwind setup
- Database: PostgreSQL
- ORM/migrations: Drizzle
- SMS: Twilio
- Email: Resend
- Tests: Vitest for unit/integration tests, Playwright for later E2E and read-only Fresha inspection

The existing marketing site remains in place. Booking features should be added incrementally without disrupting existing public pages and Google Reviews endpoints.

## Time Model

- Business time zone: `America/Toronto`
- Store appointment, blocked time, and notification timestamps as UTC `timestamptz`.
- Store recurring business hours and recurring shifts as local weekday/time values.
- Convert local date + local time windows to UTC ranges when checking availability or writing bookings.
- Official business hours cap all customer availability, even if a barber shift extends outside business hours.

## Core Modules

### Availability Engine

Responsible for generating valid appointment slots.

Must account for:
- business hours
- barber shifts
- split shifts
- selected services
- stacked service duration
- existing confirmed bookings
- blocked times
- 30-minute minimum notice
- 30-day max booking window
- 15-minute slot interval

This logic must live in isolated server-side code, not React components.

### Booking Service

Responsible for creating, cancelling, and rescheduling bookings.

Booking creation must:
- recalculate availability server-side
- run inside a database transaction
- re-check overlapping confirmed bookings
- re-check applicable blocked times
- write booking service snapshots
- send or enqueue notifications only after commit

When availability and final conflict checks run inside the booking transaction, database reads are awaited sequentially on the transaction-bound client. Non-transactional availability reads may still fan out concurrently.

### Shift Service

Responsible for recurring shifts, one-off shift overrides, split shifts, and location-specific barber schedules.

Barbers can work at different locations on the same day. By default, overlapping shifts for the same barber are not allowed.

Phase 7 implements this as `src/server/admin/schedule-service.ts` with a Drizzle repository in `src/server/admin/schedule-repository.ts`. Owner/admin users can create, edit, list, and deactivate recurring shifts, including split shifts as adjacent same-day windows. The service rejects overlapping active shifts for the same barber, weekday, local time range, and overlapping effective date ranges.

### Blocked Time Service

Responsible for:
- barber-specific blocked time
- location-wide blocked time
- business-wide closures

Availability checks must apply all relevant blocked-time scopes.

Phase 7 implements blocked-time mutations through the same schedule service. Scope validation is server-side: business closures cannot include barber or location IDs, location closures require a location and no barber, and barber blocks require a barber with optional location narrowing. New or updated blocked times are rejected when they overlap existing confirmed bookings in the affected scope.

### Notification Service

Responsible for:
- abstracting Twilio and Resend providers
- logging each notification attempt
- supporting dev-mode mock sends without live credentials
- protecting lifecycle sends with idempotency keys
- scheduling/reminding without duplicates in Phase 10

Use a notification outbox/log table so booking writes and notification attempts remain auditable.

Phase 9 implements this under `src/server/notifications/*`. Booking/admin/public services call a lifecycle dispatcher only after successful mutations; provider calls stay behind SMS/email interfaces. `NOTIFICATION_DELIVERY_MODE=mock` is local-safe, `dev` logs to the server console, and `live` sends through Twilio and Resend. Notification failures are logged and never roll back booking creation, cancellation, or rescheduling.

Phase 10 adds reminder job dispatch under the same module. `npm run notifications:send-reminders` scans due confirmed public/manual bookings, sends customer 24-hour and 2-hour SMS/email reminders, records `scheduled_for`, and uses idempotency/stale-start checks to avoid duplicate or outdated reminders. Failed provider attempts are retryable on later job runs, while sent, skipped, and in-flight pending rows remain idempotent.

Phase 12 closes the launch-critical booking visibility gap. New booking confirmations now plan customer SMS/email and assigned barber SMS/email when `barbers.phone_e164` or `barbers.email` exists. Owner/admin users are informed through the in-app Dashboard Notification Center instead of outbound owner/admin email. Missing customer/staff contacts create skipped attempts and do not fail booking creation.

### Permissions Service

Responsible for enforcing owner/admin vs barber permissions.

Barbers may manage only their own appointments and blocked time unless explicitly granted owner/admin privileges.

Phase 6 keeps permission enforcement server-side for all admin booking reads and mutations. Owner/admin actors can view and manage all bookings; barber actors are scoped to their linked `barberId` before filters are applied. Frontend filters are treated as UI convenience only.

### Auth and Session Service

Phase 5A uses custom Express-gated session auth.

Responsibilities:
- verify owner/admin/barber email and password logins
- store password hashes with Argon2id
- issue opaque random session tokens to the browser
- store only SHA-256 session token hashes in PostgreSQL
- set `lf_admin_session` as an HTTP-only `SameSite=Lax` cookie, with `Secure` enabled in production
- reject missing, expired, revoked, or inactive-user sessions
- enforce owner/admin vs barber booking visibility on server-side admin APIs
- create password reset tokens for active users while returning generic forgot-password responses
- store only SHA-256 password reset token hashes, with single-use tracking and 45-minute expiry
- revoke all existing user sessions after a successful password reset
- allow owner/admin users to create linked pending barber users without public signup
- store only SHA-256 barber invite/setup token hashes, with single-use tracking and seven-day expiry
- activate invited barber users only after password setup through invite acceptance

Public booking routes under `/book` and `/api/booking/*` remain unauthenticated.

Phase 5B password reset delivery is dev-mode server logging until an approved Resend/email integration is added.

Phase 5C barber invite delivery is also dev-mode server logging until an approved Resend/email integration is added.

## Data Model Summary

Core tables planned for Phase 1:
- `locations`
- `business_hours`
- `barbers`
- `barber_locations`
- `service_categories`
- `services`
- `barber_services`
- `shifts`
- `shift_overrides`
- `customers`
- `bookings`
- `booking_services`
- `blocked_times`
- `notifications`
- `users`
- `user_sessions`
- `password_reset_tokens`
- `user_invite_tokens`

Phase 5A adds nullable `users.password_hash` and a `user_sessions` table for custom session auth. Existing users without a password hash cannot log in until bootstrapped, reset, or invited in a later phase.

Phase 5B adds `password_reset_tokens` for hashed, single-use password recovery tokens. Raw reset tokens are delivered only through the delivery layer and are never stored in PostgreSQL.

Phase 5C adds `user_invite_tokens` for owner/admin-created barber account setup links. Raw invite tokens are delivered only through the invite delivery layer and are never stored in PostgreSQL.

Phase 8 uses the existing nullable `bookings.cancellation_token_hash` and `bookings.reschedule_token_hash` columns for customer management links. Public bookings generate raw opaque tokens and store only SHA-256 token hashes. Walk-ins do not generate customer management tokens in Phase 8.

Phase 9 reuses the existing `notifications` table and extends it with provider, structured metadata, attempt count, and last-attempt fields. It does not add duplicate notification tables.

Important constraints:
- bookings must have start time before end time
- blocked times must have start time before end time
- shifts must have start time before end time
- confirmed bookings must not overlap for the same barber
- cancelled bookings must not block availability

Prefer PostgreSQL exclusion constraints for overlapping confirmed bookings when practical, backed by transaction-safe application checks.

## Availability Algorithm

Function concept:

```ts
getAvailableSlots({
  locationId,
  serviceIds,
  barberId,
  date
})
```

Input:
- selected location
- selected service IDs
- optional barber ID
- target local date

Output:
- available slots grouped by barber
- each slot includes barber, location, start time, end time, and total duration

Algorithm:
1. Validate target date is not more than 30 days in the future.
2. Load selected active services.
3. Sum total duration from selected services.
4. Determine eligible barbers:
   - selected barber, or
   - all active barbers assigned to the selected location for "Any available barber"
5. Load location business hours for the local date.
6. Load recurring shifts and one-off overrides for eligible barbers.
7. Clip barber shift windows to official business hours.
8. Load confirmed bookings for eligible barbers on that date.
9. Load barber-specific, location-wide, and business-wide blocked times.
10. Generate candidate slots in 15-minute increments.
11. Keep candidates that:
   - start at least 30 minutes from now
   - end inside business hours
   - fit inside a barber shift
   - do not overlap confirmed bookings
   - do not overlap applicable blocked time
12. Return valid slots grouped by barber and usable by the public booking flow.

Overlap rule:

```txt
startA < endB AND endA > startB
```

Adjacent appointments are valid.

## Transactional Booking Creation

When creating a booking:
1. Recalculate availability server-side.
2. Start a database transaction.
3. For specific barber, verify the requested barber is valid for the slot.
4. For "Any available barber", assign a valid barber using deterministic ordering.
5. Check confirmed booking overlaps for the selected barber.
6. Check applicable blocked times.
7. Insert booking.
8. Insert immutable booking service snapshots.
9. Commit.
10. Insert/send confirmation notifications after commit.

Do not trust client-side availability.

## Any Available Barber Assignment

When a customer chooses "Any available barber", assign a barber at booking time using this deterministic order:
1. Candidate slot is still valid.
2. Lowest configured barber sort order.
3. Fewest confirmed bookings for that barber on the selected date.
4. Stable barber ID as final tie-breaker.

The assignment must happen inside the same transactional conflict-check path as a specific-barber booking.

## Public Booking API

Phase 4 exposes public catalog, availability, and booking creation routes under `/api/booking/*`.

These routes use DB-backed adapters to map Drizzle/PostgreSQL rows into the existing `AvailabilityData` and `BookingRepository` interfaces. The adapters are intentionally thin: the Phase 2 availability engine and Phase 3 booking service remain the source of truth for slot generation, Any Available assignment, server-side validation, transactional booking creation, and no-double-booking checks.

The public API does not create payments, implement auth, or seed shifts. If no real shifts exist, the public booking UI must show a graceful no-availability state.

Phase 8 extends public booking creation so customer-created public bookings return secure cancellation and rescheduling links in the immediate confirmation response. The raw tokens are not stored.

Phase 9 dispatches booking confirmation notifications after successful public booking creation. Customer confirmation messages include cancel/reschedule URLs only from the raw URLs already present in the booking response; notification code never reconstructs raw tokens from stored hashes.

## Customer Token Management API

Phase 8 exposes unauthenticated bearer-token customer management routes under `/api/booking/manage/:token`.

Implemented:
- `GET /api/booking/manage/:token`
- `POST /api/booking/manage/:token/cancel`
- `GET /api/booking/manage/:token/availability`
- `POST /api/booking/manage/:token/reschedule`

Rules:
- tokens are opaque 32-byte base64url random values; PostgreSQL stores only SHA-256 hashes
- public bookings generate cancellation and reschedule token hashes by default
- walk-ins do not generate customer token hashes or links in Phase 8
- invalid, missing, wrong-action, or non-matching tokens return the same generic invalid-link response
- cancellation requires the cancellation token, is idempotent for already-cancelled bookings, and rejects completed/no-show bookings
- rescheduling requires the reschedule token, preserves service snapshots/customer details, and changes only time/location/barber
- rescheduling reuses server-side availability and final no-overlap checks, excluding only the booking being moved from its own old slot
- customer cancellation and rescheduling dispatch confirmation notifications after successful mutation; failed mutations create no notification attempts

## Admin Calendar and Booking Management API

Phase 6 exposes authenticated admin/barber booking routes under `/api/admin/*`.

Implemented:
- `GET /api/admin/calendar/options`
- `GET /api/admin/dashboard`
- `GET /api/admin/availability`
- `GET /api/admin/bookings`
- `GET /api/admin/bookings/:bookingId`
- `POST /api/admin/bookings`
- `POST /api/admin/bookings/walk-in`
- `POST /api/admin/bookings/:bookingId/cancel`
- `POST /api/admin/bookings/:bookingId/no-show`
- `POST /api/admin/bookings/:bookingId/reschedule`

Rules:
- all routes require the Phase 5 custom session cookie
- state-changing admin routes validate Origin/Referer headers when present, allowing the configured `APP_URL`, local Vite dev origins, and the API origin
- owner/admin users can view and manage all bookings
- barber users are scoped to their linked barber profile on the server
- manual booking creation requires an explicit barber and uses the existing transactional booking service with `source = "manual"`
- walk-in creation is staff-only, requires name/service/barber/time/location, allows missing phone/email, uses the same transactional booking service with `source = "walk_in"`, and bypasses only the public 30-minute minimum notice
- admin rescheduling moves time/location/barber only and reuses availability/no-overlap checks while excluding only the booking being moved from its own old slot
- service-changing admin reschedule payload fields are rejected with a 400 response; staff must cancel/recreate to change services
- cancellation is idempotent for already-cancelled bookings but rejects completed/no-show bookings
- no-show is allowed only for current or past confirmed bookings, is role-scoped server-side, and does not send notifications or charge fees in Phase 7.5
- manual booking creation, cancellation, and rescheduling dispatch Phase 9 lifecycle notifications after successful mutation
- walk-ins and no-shows create no notification attempts in Phase 9
- customer token UI, shift management, blocked-time management, payments, and Fresha automation are outside Phase 6

## Admin Schedule Management API

Phase 7 exposes authenticated schedule routes under `/api/admin/schedule/*`.

Implemented:
- `GET /api/admin/schedule`
- `POST /api/admin/schedule/shifts`
- `POST /api/admin/schedule/shifts/:shiftId`
- `POST /api/admin/schedule/shifts/:shiftId/deactivate`
- `POST /api/admin/schedule/shift-overrides`
- `POST /api/admin/schedule/shift-overrides/:overrideId`
- `POST /api/admin/schedule/shift-overrides/:overrideId/delete`
- `POST /api/admin/schedule/blocked-times`
- `POST /api/admin/schedule/blocked-times/:blockedTimeId`
- `POST /api/admin/schedule/blocked-times/:blockedTimeId/delete`

Rules:
- all routes require the Phase 5 custom session cookie
- state-changing schedule routes reuse the Phase 6 admin mutation Origin/Referer guard
- owner/admin users manage recurring shifts, one-off overrides, and all blocked-time scopes
- barber users can view relevant schedule context and manage only their own barber-scoped blocked time
- schedule inputs use `America/Toronto` local date and time fields and 15-minute boundaries
- recurring shifts are soft-deactivated rather than hard-deleted
- blocked times use UTC `timestamptz` persistence after server-side local-to-UTC conversion
- blocked times that overlap confirmed bookings in the affected scope are rejected

Frontend:
- `/admin/shifts` provides filters, weekly recurring shift grids grouped by barber/weekday, shift chips, split-window creation, duplication, one-off override controls, and click-to-edit forms
- `/admin/blocked-time` provides scope-aware blocked-time forms, all-day closure entry, and visible chips for barber blocks, location closures, and business closures
- drag/drop editing is intentionally deferred; future drag/drop can call the same validated mutation endpoints

## UI Route Map

Public:
- `/` existing marketing site
- `/book`
- `/book/location`
- `/book/services`
- `/book/barber`
- `/book/time`
- `/book/details`
- `/book/confirm`
- `/booking/:token`
- `/booking/:token/cancel`
- `/booking/:token/reschedule`

Admin/barber:
- `/admin/login`
- `/admin/dashboard`
- `/admin/calendar`
- `/admin/bookings`
- `/admin/services`
- `/admin/team`
- `/admin/shifts`
- `/admin/blocked-time`
- `/admin/settings`

API route groups:
- public location/service reads
- public availability reads
- public booking creation
- token-based customer cancellation/rescheduling
- authenticated admin/barber calendar reads
- authenticated admin/barber dashboard and notification-center reads
- authenticated manual booking management
- authenticated service/team/shift/blocked-time management

## Role Model

Owner/Admin:
- full access to all locations
- view/manage all calendars and bookings
- create manual bookings
- cancel/reschedule any booking
- manage services, barbers, shifts, blocked time, closures, and settings

Barber:
- login required
- view own appointments
- manage own appointments
- create own walk-in/manual appointments
- add blocked time for themselves
- cannot manage other barbers unless promoted to owner/admin

## Phase 5 Auth Comparison Requirement

Phase 5A comparison selected custom session auth over Supabase Auth, Better Auth, and Clerk for MVP fit.

Phase 5A implemented:
- `POST /api/admin/auth/login`
- `POST /api/admin/auth/logout`
- `GET /api/admin/auth/session`
- `GET /api/admin/bookings`
- local/dev-only owner bootstrap through `npm run db:seed:dev-owner`

Phase 5B implemented:
- `POST /api/admin/auth/forgot-password`
- `POST /api/admin/auth/reset-password`
- hashed single-use reset tokens with 45-minute expiry
- session revocation after successful reset

Phase 5C implemented:
- `POST /api/admin/team/barbers`
- `POST /api/admin/team/barbers/:barberId/deactivate`
- `POST /api/admin/auth/accept-invite`
- owner/admin-only barber profile creation
- one-or-both location assignment through `barber_locations`
- linked pending `role = "barber"` users with `users.barberId`
- hashed single-use invite/setup tokens with seven-day expiry
- accepted invites set an Argon2id password and activate the linked barber user
- deactivation disables barber/user access and revokes active sessions

Deferred:
- full admin team UI/staff management

## Phase 6 Admin Calendar Implementation

Phase 6 implemented:
- `/admin/login`
- `/admin/calendar`
- `/admin/bookings`
- `/admin/bookings/:bookingId`
- authenticated admin shell with week, month, and list views
- filters by date, location, barber, and status
- booking detail page with service snapshots, customer contact, notes, source, status, and appointment timing
- manual booking form that loads authenticated availability before submitting
- cancellation and rescheduling controls for confirmed bookings
- `npm run qa:phase6-admin` for local/dev real-route owner/barber QA

Deferred:
- drag/drop calendar editing
- day view
- service-change rescheduling
- owner override for double-booking
- notification sends were deferred from Phase 6 and implemented for booking lifecycle events in Phase 9

## Phase 7 Schedule Management Implementation

Phase 7 implemented:
- `/admin/shifts`
- `/admin/blocked-time`
- authenticated schedule shell integration in the existing admin workspace
- recurring shift list/create/edit/deactivate flows
- one-off `add`, `remove`, and `not_working` shift override flows
- barber, location, and business blocked-time flows
- barber read context for broader closures and self-service mutation for own blocked time
- `npm run qa:phase7-schedule` for local/dev real-route owner/barber schedule QA

Deferred:
- drag/drop shift/block editing
- production schedule seed data
- notification sends for schedule changes remain out of scope

## Phase 7.5 Calendar-First Operations Implementation

Phase 7.5 implements the admin/barber scheduling console as the primary operational surface.

Implemented:
- `/admin/dashboard` owner/staff landing surface with today's appointments, upcoming appointments, and a Notification Center/Activity Center
- dashboard appointment lists show active confirmed appointments; cancellations and delivery history live in the Notification Center feed
- `/admin/calendar` day-board with compact dark rail, topbar filters, owner/admin multi-barber columns, barber single-calendar scoping, 15-minute grid rows, current-time marker, blocked-time overlays, status/source-styled booking cards, purple appointment preview, and right-side drawers
- unified staff Add appointment drawer using the authenticated transactional booking path, optional customer contact, service-derived duration/price summary, and availability-backed time selection
- booking detail drawer with cancel, reschedule, and no-show actions
- booking-only drag/drop rescheduling through `POST /api/admin/bookings/:bookingId/reschedule`
- `/admin/bookings` retained as search/history rather than the primary workflow
- `/admin/shifts` and `/admin/blocked-time` remain setup pages inside the same admin shell
- `npm run qa:phase7-5-calendar` for local/dev real-route owner/barber QA

Rules:
- barber users can create staff-entered appointments and use no-show/reschedule/cancel only for their linked barber calendar
- owner/admin users can operate across calendars
- unified Add appointment entries require customer name, service, barber, time, and location; phone/email are optional for staff-created appointments
- the legacy walk-in API remains available for compatibility and continues to store `source = "walk_in"`
- drag/drop is snapped by the UI to 15-minute slots and never updates local state as truth; rejected backend moves leave the card in its original slot
- drag/drop applies only to bookings, not shifts or blocked time
- no-show is view/state only in Phase 7.5: no notifications, payments, or fees

Deferred:
- reminder jobs were implemented in Phase 10
- drag/drop for shifts, closures, and blocked time remains deferred

## Notification Architecture

Phase 9 implements booking lifecycle notifications for:
- `booking_confirmation`
- `cancellation_confirmation`
- `reschedule_confirmation`

Phase 10 implements reminder notifications for:
- `reminder_24h`
- `reminder_2h`

Channels:
- customer SMS through Twilio-compatible SMS provider
- customer email through Resend-compatible email provider
- barber/staff SMS through Twilio-compatible SMS provider
- barber/staff email through Resend-compatible email provider for booking confirmations
- owner/admin in-app visibility through `/admin/dashboard` Notification Center, not outbound email

Reminder jobs send only customer SMS/email in Phase 10. Staff reminder SMS is deferred.

Delivery modes:
- `mock`: default local-safe mode, no live credentials required
- `dev`: console logging with deterministic provider IDs
- `live`: Twilio and Resend wrappers using `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM_NUMBER`, `RESEND_API_KEY`, and `EMAIL_FROM`

Rules:
- booking mutations complete before notification dispatch starts
- Twilio/Resend calls never run inside booking database transactions
- notification failure logs a failed attempt and does not roll back the booking mutation
- missing/invalid recipient contact logs a skipped attempt and does not throw
- booking confirmations include customer SMS/email and assigned barber SMS/email when contact exists; owner/admin users see booking activity in the Dashboard Notification Center
- cancellation and reschedule lifecycle notifications keep the existing customer SMS/email and staff SMS recipient plan
- walk-ins create no customer or staff notification attempts in Phase 9
- no-shows, schedule changes, password resets, barber invites, and reminders are not Phase 9 lifecycle events
- customer confirmation messages include management links only when raw URLs are already available from the public booking response
- raw customer management tokens are never reconstructed from stored hashes and are never persisted in notification metadata
- reminder jobs run through `npm run notifications:send-reminders`, not an Express timer or HTTP cron endpoint
- production reminder cron should first pass `npm run notifications:check-live-config`
- reminder candidates are confirmed public/manual bookings whose `start_time - offset` falls within the configured due window
- reminder jobs re-check current booking status, source, and start time immediately before sending
- cancelled, completed, no-show, walk-in, and imported bookings do not receive reminders
- reminder messages do not include customer management links because raw tokens are not persisted

Every attempt is logged with practical support for:
- booking ID
- recipient type
- recipient phone/email
- channel
- event type
- status
- provider
- provider message ID
- error message
- structured metadata
- scheduled time
- sent time
- last attempt time
- attempt count
- idempotency key

Idempotency:
- confirmation and cancellation keys are stable per booking/event/channel/recipient
- reschedule keys include the new appointment start time occurrence marker
- reminder keys include the current appointment start time occurrence marker
- duplicate sent/skipped/pending attempts do not send again; the existing row is updated with an incremented attempt count
- failed provider attempts can be claimed as a retry and resent with the same idempotency key

## Fresha Soft Migration

Launch strategy:
1. Remove Fresha booking links from the public website at cutover.
2. Put the new booking platform at `/book` on `leasidefades.com`.
3. Import owner-approved Fresha appointments and schedules only after a reviewed extraction report.
4. New customers book through the new platform.

Phase 13 import tooling:
- `npm run fresha:import:dry-run` reads the gitignored extraction file under `output/fresha-import/` and writes a review report.
- `npm run fresha:import:apply` requires an approved report path and `--confirm-reviewed-report=true`.
- imported bookings use `source = "imported"`, preserve customer/service snapshots, and do not receive lifecycle notifications or reminder jobs.
- import applies no Fresha mutations; extraction remains read-only Playwright work.

Do not mutate Fresha production data. Do not import future bookings until the extraction report is human-reviewed.

## Deployment Assumptions

Use environment variables for all secrets.

Required env vars eventually:
- `DATABASE_URL`
- `APP_URL`
- `NOTIFICATION_DELIVERY_MODE`
- `REMINDER_JOB_LOOKBACK_MINUTES`
- `REMINDER_JOB_LOOKAHEAD_MINUTES`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
- `RESEND_API_KEY`
- `EMAIL_FROM`
- `GOOGLE_PLACES_API_KEY`
- `GOOGLE_PLACE_ID`
- public site variables such as `SITE_BOOKING_URL`

Reminder job operations are documented in `docs/PRODUCTION_REMINDER_JOBS.md`.
Full launch deployment, smoke-test, rollback, and cutover steps are documented in `docs/PRODUCTION_RUNBOOK.md`.
Phase 13 import operation is documented in `docs/FRESHA_IMPORT_GUIDE.md`.
