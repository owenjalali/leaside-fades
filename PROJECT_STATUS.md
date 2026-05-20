# PROJECT_STATUS.md - Leaside Fades Booking System

## Current Phase

Phase 12 production launch readiness plus Phase 13 guarded Fresha import/cutover tooling are in progress. Phase 11 Fresha read-only public/admin inspection is complete.

## Completed Phases

- Phase 0 planning and architecture documentation.
- Phase 1 database schema, initial migration, and seed data.
- Phase 2 isolated server-side availability engine and scheduling edge-case tests.
- Phase 3 typed booking creation service, transactional no-double-booking checks, deterministic Any Available assignment, and booking service snapshot tests.
- Phase 4 public `/book` booking flow, public API routes, and DB-backed adapters around the existing availability and booking services.
- Phase 5A custom session auth, local/dev owner bootstrap, protected admin booking reads, and owner/admin/barber role enforcement.
- Phase 5B password reset with hashed single-use reset tokens and session revocation after successful reset.
- Phase 5C owner/admin-managed barber onboarding with invite/setup tokens, linked barber users, location assignment, and deactivation.
- Phase 6 authenticated admin calendar/list/detail UI, filtered booking reads, manual booking creation, owner/barber cancellation and rescheduling, and repeatable Phase 6 admin real-route QA runner.
- Phase 7 authenticated schedule management APIs and admin UI for recurring shifts, one-off shift overrides, barber blocked time, location closures, business closures, and repeatable Phase 7 real-route QA runner.
- Phase 7.5 calendar-first admin/barber day board, walk-in bookings, no-show workflow, booking-only drag/drop rescheduling, and repeatable Phase 7.5 calendar QA runner.
- Phase 8 customer management tokens for public bookings, public token lookup/cancel/reschedule APIs, customer booking management UI, and repeatable Phase 8 real-route QA runner.
- Phase 9 notification provider abstractions, mock/dev/live delivery modes, booking lifecycle dispatch, idempotent notification logging, and repeatable Phase 9 real-route QA runner.
- Phase 10 portable reminder job CLI, customer 24-hour/2-hour reminder dispatch, duplicate prevention, stale booking re-checks, and repeatable Phase 10 real-route QA runner.
- Phase 11 read-only Fresha public/admin inspection report, including calendar, staff, schedules, locations, services, online booking surfaces, appointment report behavior, privacy notes, and launch-parity recommendations.

## Active Task

Phase 12 is converting the app from "nearly done" to launch-ready. Fresha is the launch data source of truth unless an explicit launch override is documented.

The inspection used read-only browser tooling against the public Fresha venue pages and an owner-assisted authenticated Fresha Partner admin session. No Fresha booking, customer, staff, schedule, service, export, import, payment, notification, or settings data was changed. No screenshots, credentials, cookies, exports, or raw customer data were saved.

Phase 11 inspection confirmed:
- Both public Fresha locations are bookable and use the documented business hours: Mon-Sat 10:00 AM-7:00 PM and Sun 10:00 AM-5:00 PM.
- Fresha admin uses a staff-column day calendar with date/location/team/view controls, visibility filters, calendar settings, waitlist, and Add menu actions for Appointment, Group appointment, Blocked time, Sale, and Quick payment.
- Team Members contains Laura Nguyen, Yogesh Kumar, Shayan Hussain, and Sam To with Fresha permission roles; contact details were present but redacted/not stored.
- Scheduled Shifts is a weekly roster by location and is separate from business standard opening hours.
- Fresha admin Service Menu contains 38 services across 3 categories: Men 16, Women 14, Boys 8.
- A service editor models basic details, locations, team members, resources, add-ons, online booking, images, forms, commissions, and settings. The inspected service was enabled for all locations, all team members, online booking, and all genders.
- Location setup has two location records, matching addresses and business hours, business type Barber, no-tax defaults for services/products, and tipping defaults.
- Appointments report exposes table columns, filters, statuses, result count, sorting, and Export. Export was not clicked and private customer rows were not stored.
- Marketplace profile, Link Builder, Google Reserve, Payments, and social/integration surfaces exist in Fresha but remain outside the custom MVP.

Phase 12 launch-prep status:
- `docs/LAUNCH_PREP.md`, `docs/PRODUCTION_RUNBOOK.md`, and `docs/OWNER_SIGNOFF_CHECKLIST.md` now define launch readiness, deployment, smoke testing, rollback, cutover, and owner signoff.
- Production seed data and local/dev sample shifts now keep Yogesh Kumar Millwood-only for launch, and Josef is added as an Eglinton-only launch barber.
- Eglinton phone number is treated as the confirmed current value and matches env templates/static seed data: `+1 (647) 348-2200`.
- Service reconciliation must use name/category/price/duration and owner approval, not the Fresha 38-service count alone. The repo still contains 37 services pending owner launch approval.
- Booking confirmations now notify customer SMS/email and assigned barber SMS/email when contact info exists. Owner/admin awareness is dashboard-first through the in-app Dashboard Notification Center, not outbound owner/admin email.
- `/admin/dashboard` now presents a Fresha-inspired operating dashboard with estimated appointment value from booking service price snapshots, upcoming confirmed/cancelled appointment trends, compact notification health, recent appointment activity, and 30-second polling that preserves the last good snapshot on refresh failure.
- Local dashboard visual QA can now be seeded with `npm run qa:phase12-dashboard-fixture`, which is guarded to local development databases and creates priced confirmed/completed/cancelled/no-show/rescheduled/source-varied bookings for chart tuning.
- The premium dashboard redesign is the intended production dashboard surface. A read-only production dashboard snapshot on May 5, 2026 returned real service-snapshot value data: CA$3,921 estimated appointment value across 124 priced appointments in the last 7-day window, plus 28 confirmed and 3 cancelled upcoming appointments in the next 7-day chart window.
- Staff-created appointments now use one Add appointment workflow with optional customer phone/email and a staff-only scheduling path. Staff can create, reschedule, or edit appointments on any visible 15-minute admin-calendar time, including grey off-shift time, while the server still enforces active location/barber/service records, barber ownership, no same-barber overlap, and blocked-time/closure conflicts.
- Admin session handling now keeps owner/barber sessions active for 30 days by default, renews that 30-day window on protected admin activity, and redirects expired active workspaces back to `/admin/login` instead of surfacing raw `Authentication required.` errors inside Add appointment or other admin forms.
- The live Add appointment drawer includes an Appointment/Walk-in toggle. Walk-ins created from the drawer use `source = "walk_in"`; when customer phone/email exists they now dispatch booking confirmation attempts and are eligible for reminder jobs, while name-only walk-ins still create skipped/missing-contact attempts without failing creation.
- Missing customer/staff contacts create skipped notification attempts and do not fail booking creation.
- Notification metadata remains token-safe: raw customer management tokens and raw cancel/reschedule URLs are not persisted.
- `/admin/calendar` now uses a mobile-first staff day-board with active location-assigned barber columns, horizontal mobile scrolling, sticky time/staff headers, diagonal unavailable zones, blocked-time overlays, outside-hours warning badges, current-time line, tap/click slot creation, and a full staff operating surface from 12:00 AM through the 11:00 PM hour.
- Calendar empty-slot actions are disabled only for blocked-time/closure conflicts. Grey off-shift cells remain visually unavailable to the public but are clickable/drag-drop targets for authenticated staff, with final validation still server-side.
- Calendar staff columns are computed from active barber-location assignment plus selected role scope. Owner/admin users see all active barbers at the selected location even when a barber has no shift that day; barber users remain scoped to their linked barber column.
- `/admin/calendar` month/week/list views now keep the visible selected date separate from the booking fetch range, so month titles and arrows stay anchored to the intended month while still fetching the padded calendar grid.
- Month calendar cells are fully clickable blank-space targets that open the exact date in day view, while booking cards still stop propagation and open booking details.
- The admin day board keeps the full 12:00 AM through 11:00 PM scrollable operating surface, default-scrolls to 9:00 AM on load/context changes, uses a non-compressed 15-minute grid so the whole day is not squeezed into one screen, and keeps the green hover time label visible above grey off-shift overlays.
- The booking drawer now includes an edit flow for confirmed bookings covering customer name, phone, email, customer notes, internal notes, date/time, barber, location, and selected services. The authenticated edit endpoint updates customer/contact rows and booking service snapshots transactionally while preserving booking source/status and customer tokens.
- Each barber header on the day board now exposes a permitted `Edit shift` action. Owner/admin users can edit any barber's selected-day/location shift; barber users can edit only their own. The one-day shift endpoint replaces same-day overrides by diffing desired windows against the recurring baseline, so public client availability updates from the same schedule model.
- Launch-critical admin calendar/customer cancellation fixes were deployed to Vercel production on May 8, 2026 at 10:32 PM America/Toronto. Deployment `dpl_Dtpu3bguZC7ZAVQfo8DdcZJR6i74` is `Ready` and aliased to `https://www.leasidefades.com`.
- Pre-deploy verification for the launch-critical fixes passed: targeted customer/admin tests (136 tests), `npm run qa:phase8-customer-token`, `npm run qa:phase9-notifications`, full `npm run test` (243 tests), `npm run build`, and local Playwright browser QA for public cancellation, admin grey-slot create, appointment phone/email edit, one-day shift edit, and mobile calendar controls.
- Post-deploy non-mutating production smoke passed for `/api/health`, `/api/booking/catalog`, `/book`, `/booking/not-a-real-token/cancel`, fake-token customer cancellation API 404s, protected admin calendar/options 401s, and protected new admin edit/day-shift routes returning 401 instead of 404.
- `/admin/calendar` mobile rescue now keeps the admin rail/topbar compact, moves location/barber/status filters into an overlay panel, preserves visible day-board grid height on 320px-class phones, and keeps the Add appointment drawer framed to the viewport with a sticky create action.
- `/admin/calendar` tablet/mobile polish now resets the day-board scroll to opening time when the visible date/location/staff context changes, expands the Sam-only board into a full-width working surface, and labels single-staff views as `1 staff` instead of `1 columns`.
- `/admin/calendar` Add appointment split-pane polish now protects the calendar working width when the drawer opens, constrains the desktop create drawer to an inspector-width panel, and uses auto-fit drawer grids so summary, contact, time, and slot controls wrap naturally instead of looking crunched.
- `/admin/shifts` now uses a staff-first weekly schedule builder inspired by the approved Prototype A concept: pick one staff member, edit working days/time windows/location inline, review weekly hours/effective dates, save changes explicitly, and use a separate Overview tab for team scanning. The visible one-off override workspace has been removed from Staff Shifts pending a clearer exception-editing design; the existing override APIs and calendar availability behavior remain intact. The builder displays the latest dated recurring pattern when multiple active effective ranges exist for the same staff member, avoiding duplicated day windows in the editor.
- `/admin/dashboard` notification health now summarizes delivery mode, success rate, reminder queue, failed/skipped counts, recent delivery rows, provider/error details, and SMS/email badges.
- Notification Center failed rows are classified as active delivery issues vs historical audit entries. Past Resend/domain verification failures stay in Failed history but no longer dominate the main dashboard once they are no longer actionable.
- Public Fresha booking fallbacks were replaced with the custom booking flow at `https://leasidefades.com/book`, with a staff login link exposed in the public footer.
- Public `Book Now` CTAs now open `/book` directly instead of a location dropdown; location selection remains inside the booking flow, while `Call` CTAs remain location-specific.
- Vercel production routing is configured for `/book`, `/booking`, and `/admin` while `/api/*` remains on the Express serverless route.
- Vercel project `owenjalalis-projects/leaside-fades` is linked and deployed. `leasidefades.com` is live on Vercel production.
- Production PostgreSQL is connected through the Vercel Neon integration `leaside-fades-db`. Migrations and the static owner-approved seed have been applied.
- Production `/api/booking/catalog` returns the launch catalog: 2 locations, 3 service categories, 37 services, and 5 barbers.
- The public marketing Services section now derives from the same 37-service launch catalog source as booking: Men 15, Women 14, Boys 8, with booking prices and durations displayed.
- Production owner login has been created for `owner@leasidefades.com` and verified through the live admin auth/session API. The temporary generated password is stored only in ignored local launch output and must be rotated after owner handoff.
- Observed launch recurring shifts from the Phase 11 Fresha inspection were entered as the initial production schedule after the Phase 13 launch "Go": 24 recurring shifts, with Yogesh remaining Millwood-only. Owner should still verify this roster before full public cutover.
- Production availability smoke check for Men's Cut on 2026-05-02 returned bookable availability: Eglinton has Sam To slots only, and Millwood has Yogesh Kumar, Laura Nguyen, and Shayan Hussain slots.
- Playwright verified the live `/admin/calendar` frame at 1912x970, 1440x900, 1280x720, and mobile width. The page no longer body-scrolls, the left rail is not clipped, Laura remains visible/reachable, the desktop drawer opens as a split pane, and the internal board scroll reaches the weekday 7:00 PM boundary.
- Playwright MCP and headless Chrome CDP stress-tested the local rebuilt `/admin/calendar` at 320x568, 340x600, 340x720, 375x667, 390x844, 414x896, 768x1024, 1280x720, 1440x900, and 1920x900. The board retained visible 44px slots, horizontal staff-column reach, vertical closing-boundary reach, slot-tap creation, topbar Add creation, framed drawers, and stable filter open/close behavior without creating appointments. Follow-up tablet checks at 744x860 verified the Sam-only Eglinton board opens at 10:00 AM after context changes, labels as `1 staff`, and no longer looks collapsed at the 7:00 PM boundary.
- Backend admin/session and public booking tests now freeze their fixture dates so session cookies do not expire against the real system date and May 2026 booking fixtures do not become "past dates" as the wall clock advances.
- A secured `GET /api/jobs/send-reminders` endpoint exists for reminder schedulers and requires `CRON_SECRET` before it will run. Vercel Hobby blocked the desired five-minute Vercel Cron registration, so production reminders now use an external cron-job.org scheduler.
- cron-job.org job `7551064` is enabled as `Leaside Fades reminders`, calls `https://www.leasidefades.com/api/jobs/send-reminders` every five minutes, and sends `Authorization: Bearer <CRON_SECRET>`. `CRON_SECRET` was rotated in Vercel Production on May 1, 2026 and production was redeployed so the endpoint returns `401` without authorization. The 10:20 PM America/Toronto scheduled run succeeded with `200 OK`; the earlier 10:15 PM run failed with `307 Temporary Redirect` before the job URL was corrected from the apex domain to `www`.
- Vercel production contains encrypted Twilio/Resend notification environment variables. A temporary secret-gated production smoke endpoint verified the live notification runtime, then was removed and production was redeployed cleanly. Controlled live SMS and email smoke tests have passed with approved test contacts; the raw test contact details are intentionally not stored in git.
- Phase 13 import tooling now provides guarded dry-run/apply commands for the May 1-June 30, 2026 Fresha import window. Apply mode requires a reviewed report confirmation, and imported bookings use `source = "imported"` without lifecycle notifications or reminder jobs.
- Read-only Fresha calendar extraction for May 1-June 30, 2026 completed through Playwright MCP for both locations and all visible service providers. It found 55 Fresha booking blocks, transformed them into 53 appointment candidates after grouping stacked services, and generated `output/fresha-import/fresha-import-review-2026-05-01-to-2026-06-30.md`.
- Two owner-approved test bookings that blocked import were marked `cancelled` in production: Owen/Yogesh/Millwood and Ethan/Laura/Eglinton on May 1.
- The May 1-June 30, 2026 Fresha appointment import has been applied to production: 53 confirmed bookings were inserted with `source = "imported"`, no immediate lifecycle notifications/reminder jobs were sent, and a post-apply dry-run reported 53 duplicates with 0 new imports and 0 blocked rows.
- Local Playwright QA for the calendar repair used a fresh Express app on port `3005` because the stale port `3000` process returned `Service is currently unavailable.` A local-only owner login for `nmatto866@gmail.com` was bootstrapped through `npm run db:seed:dev-owner`; its generated password was not stored in repo files.
- May 20, 2026 production incident investigation found DB-backed booking/admin endpoints failing while the static `/api/health` route still returned 200. Vercel logs showed PostgreSQL queries failing with Neon compute time quota exhaustion. The code now makes `/api/health` database-aware and throttles the secured HTTP reminder job to a 30-minute default DB cadence before opening a connection. Production still requires restoring/upgrading the Neon/Vercel Postgres quota or plan before catalog, login, and appointment visibility can recover.

## Next Recommended Task

Continue Phase 12/13 by restarting cron-job.org after the database recovery, confirming the selected reminder cadence will not exhaust compute quota, monitoring external reminder scheduler history, verifying Google/social production links, completing owner password handoff/rotation, and obtaining final owner signoff.

Do not seed local/dev sample shifts in production. Production currently uses the observed Fresha launch roster as the initial recurring schedule and should be owner-verified before full public cutover.

## Known Assumptions

- Business is Leaside Fades.
- There are two locations: Millwood and Eglinton.
- Existing repo stack is confirmed: React Vite frontend with Express backend.
- Database target is PostgreSQL.
- ORM/migration target is Drizzle.
- Both locations use the same opening hours:
  - Mon-Sat: 10:00 AM - 7:00 PM
  - Sun: 10:00 AM - 5:00 PM
- Time calculations should use `America/Toronto`; persisted appointment/block timestamps should be UTC.
- Customers cannot book outside official business hours.
- Customers pay in shop.
- No online payment processing for MVP.
- No tax calculation online for MVP.
- Display listed service prices exactly as configured.
- Slot interval is 15 minutes.
- No buffer time for MVP.
- Customers can book up to 30 days in advance.
- Customers cannot book less than 30 minutes before appointment start.
- Customers can cancel and reschedule anytime through secure links.
- All services are available at both locations for MVP.
- Every barber can perform every service for MVP.
- SMS provider: Twilio.
- Email provider: Resend.
- Soft migration from Fresha is preferred for launch.
- Phase 1 intentionally does not seed real recurring barber shifts because real schedules are unknown.
- Phase 5A chose custom session auth. Existing `users` rows without `password_hash` cannot log in until bootstrapped, reset, or invited.
- Admin sessions use a 30-day sliding inactivity window and HTTP-only `SameSite=Lax` cookies with `Secure` enabled in production.
- Phase 5B password reset links expire after 45 minutes, use opaque random tokens, and persist only SHA-256 token hashes.
- Password reset delivery uses Resend in production and dev-mode logging outside production.
- Phase 5C barber invites expire after seven days, use opaque random tokens, and persist only SHA-256 token hashes.
- Barber invite delivery uses Resend in production and dev-mode logging outside production.
- Phase 5C remains API-first. Minimal admin team UI was not built.
- `npm run qa:phase5-auth` is local/dev-only, refuses non-local database URLs, and captures reset/invite links only from dev delivery logs during QA.
- Phase 6 uses the existing custom session auth gate for `/admin/*` and `/api/admin/*`.
- Phase 6 manual bookings require an explicit barber, use `source = "manual"`, obey no-overlap and blocked-time checks, and do not support owner double-booking override.
- Admin rescheduling still moves time/location/barber only; the full admin edit flow can also change services, duration, customer contact, customer notes, and internal notes.
- Phase 6 admin rescheduling explicitly rejects service-changing request fields instead of silently ignoring them; service changes now belong to the dedicated admin edit endpoint.
- Phase 6 admin state-changing routes validate Origin/Referer headers when present. Allowed origins are the configured `APP_URL`, local Vite dev origins, and the API origin. Public `/api/booking/*` routes are not affected by this admin-only guard.
- Transaction-bound availability and final conflict reads are sequentialized inside booking transactions to avoid pg overlapping client-query warnings. Normal non-transactional availability loading still uses concurrent reads.
- `npm run qa:phase6-admin` is local/dev-only, refuses non-local database URLs, and requires local dev shifts for real availability.
- Phase 7 does not add a database migration because `shifts`, `shift_overrides`, and `blocked_times` already exist.
- Phase 7 does not seed production barber schedules. Local/dev QA rows are created, verified, and cleaned by `npm run qa:phase7-schedule`.
- Phase 7 drag/drop is intentionally deferred; the validated mutation APIs can support future drag/drop clients.
- Owner/admin users manage recurring shifts, one-off overrides, all barber blocks, location closures, and business closures.
- Barber users can view relevant schedule context and create/update/delete only their own barber-scoped blocked time.
- New or updated blocked times are rejected when they overlap existing confirmed bookings in the affected scope.
- `npm run qa:phase7-schedule` is local/dev-only, refuses non-local database URLs, exercises real schedule routes, verifies blocked time affects availability, verifies barber scoping, and cleans up QA rows.
- Phase 7.5 introduces a migration for `booking_source = "walk_in"` and nullable customer phone/email.
- Public booking still requires customer contact. Staff-created appointments from the unified Add appointment workflow use `source = "manual"` and allow customer phone/email to be optional.
- Staff-created appointments bypass public online-availability limits: 30-minute notice, 30-day public window, business-hour clipping, and shift-fit are not required for staff. They still enforce active records, 15-minute boundaries, same-local-day admin board bounds, blocked time/closures, role scope, and no-overlap rules.
- No-show is a status transition only in Phase 7.5. It sends no notifications, charges no fees, and creates no payment records.
- Booking drag/drop is a UI shortcut over the existing reschedule endpoint; shifts, closures, and blocked time are not drag/drop editable.
- `npm run qa:phase7-5-calendar` is local/dev-only, refuses non-local database URLs, exercises real walk-in/no-show/reschedule routes, verifies role scoping and rejection cases, and cleans up QA rows.
- Phase 8 uses the existing nullable `bookings.cancellation_token_hash` and `bookings.reschedule_token_hash` columns without a migration.
- Phase 8 does not expire customer management tokens; secure links remain valid while the booking status/action allows them.
- Public bookings generate customer management token hashes and return raw links only in the immediate booking response.
- Staff walk-ins do not generate customer management token hashes or links in Phase 8.
- Staff-created manual appointment workflow does not expose customer links in Phase 8.
- `npm run qa:phase8-customer-token` is local/dev-only, refuses non-local database URLs, exercises real public create/manage/cancel/reschedule routes, verifies token hashes at rest, verifies wrong-token rejection, verifies old-slot/new-slot availability effects, and cleans up QA rows.
- Phase 9 uses the existing `notifications` table with a small migration for provider and structured metadata fields.
- Booking lifecycle notifications are dispatched only after booking mutations succeed and outside booking database transactions.
- Notification delivery failures are logged and do not roll back public/admin booking creation, customer/admin cancellation, or customer/admin rescheduling.
- Phase 9 sends/logs `booking_confirmation`, `cancellation_confirmation`, and `reschedule_confirmation` only. Reminder jobs remain Phase 10.
- Staff-created walk-ins with customer contact now create booking confirmation attempts through the same dispatcher as manual bookings. Name-only walk-ins log skipped missing-contact attempts instead of failing creation. Imported bookings remain excluded.
- Customer confirmation messages include cancellation/reschedule URLs only when raw URLs are available from the booking response; raw management tokens are never reconstructed from hashes and are not persisted in notification metadata.
- `NOTIFICATION_DELIVERY_MODE=mock` is the local/default-safe mode; `dev` logs to the server console; `live` uses Twilio and Resend credentials.
- `npm run qa:phase9-notifications` is local/dev-only, refuses non-local database URLs, forces mock delivery, uses local-only contact fixtures, verifies create/cancel/reschedule logs, verifies idempotency/skipped-contact behavior, verifies contacted walk-in confirmation attempts, verifies no raw token persistence, and cleans up QA rows.
- Phase 10 reminders are invoked through `npm run notifications:send-reminders`; Phase 13 adds a secured `GET /api/jobs/send-reminders` wrapper for production scheduler invocation.
- Phase 10 reminders are customer-only SMS/email attempts for confirmed `source = "public"`, `source = "manual"`, and `source = "walk_in"` bookings when customer contact exists.
- Phase 10 excludes cancelled, completed, no-show, and imported bookings from reminder sends. Walk-ins without customer contact log skipped attempts when due.
- Reminder due-window defaults are 60 minutes lookback and 15 minutes lookahead, configurable through `REMINDER_JOB_LOOKBACK_MINUTES` and `REMINDER_JOB_LOOKAHEAD_MINUTES`.
- Reminder jobs re-check current booking status, source, and appointment start time before sending so rescheduled bookings receive reminders for the new appointment time only.
- Reminder messages do not include customer management links because raw cancellation/reschedule tokens cannot be reconstructed from hashes.
- Sent, skipped, and pending reminder notification rows remain idempotent on duplicate job runs; failed provider rows are retryable with the same idempotency key.
- `npm run notifications:check-live-config` verifies production reminder job database/live Twilio/Resend configuration before scheduler enablement.
- Production reminder scheduler guidance lives in `docs/PRODUCTION_REMINDER_JOBS.md`; the recommended cadence is every five minutes with the default 60-minute lookback and 15-minute lookahead.
- `npm run qa:phase10-reminders` is local/dev-only, refuses non-local database URLs, forces mock delivery, creates real public booking fixtures through Express routes, verifies 24-hour/2-hour reminders, duplicate prevention, cancelled/rescheduled booking behavior, failed SMS retry, and cleans up QA rows.
- Phase 12 launch correction: Yogesh Kumar is strictly Millwood-only for launch. He must not be bookable at Eglinton, even if older Fresha notes or repo docs imply otherwise.
- Phase 11 public/admin Fresha inspection found Millwood staff listed as Laura, Yogesh, and Shayan, matching current docs/seed data at first-name level.
- Phase 12 launch correction: the current Eglinton phone number is correct and not a launch blocker. Repo/env/static seed data use `+1 (647) 348-2200`.
- Phase 11 authenticated Fresha admin inspection found Service Menu has 38 services: Hair & Styling (Men) 16, Hair & Styling (Women) 14, Hair & styling (Boy 9 & Under) 8. Phase 12 reconciles services by name/category/price/duration, not count alone. The repo seed file contains 37 service rows and should stay at 37 if that matches the owner-approved launch offering.
- Phase 11 authenticated Fresha admin inspection found the inspected service was enabled for all locations, all team members, online booking, and all genders. This supports the current MVP assumption that all services are available at both locations and all barbers can perform every service, pending owner confirmation.
- Phase 11 authenticated Fresha admin inspection found Scheduled Shifts for Apr 26-May 2, 2026:
  - Millwood: Laura works Mon/Tue/Sat 3:30 PM-7 PM; Yogesh works Tue-Fri 10 AM-7 PM and Sat 12 PM-7 PM; Shayan works Sun 10 AM-5 PM, Mon 10 AM-7 PM, and Wed-Sat 10 AM-7 PM.
  - Eglinton: Laura works Sun 10 AM-5 PM, Wed 3:30 PM-7 PM, and Fri 10 AM-7 PM; Yogesh has no shifts; Sam works Sun 10 AM-5 PM and Mon-Sat 10 AM-7 PM.
  - These observed shifts were entered as the initial production recurring schedule after the Phase 13 launch "Go"; owner should verify the roster before full public cutover.
- Phase 11 public structured data found no enabled public Fresha Pay, gift cards, product store, memberships, vouchers, or packages. Authenticated admin add-ons still show payment, Google Reserve, link-builder, gift-card, membership, and product-store surfaces that remain outside the custom MVP.
- Phase 12 booking confirmation notifications include customer SMS/email and assigned barber SMS/email when contact info exists. Owner/admin booking awareness is handled through `/admin/dashboard` and the in-app Notification Center. Reminder jobs remain customer-only.

## Open Questions

Not blocking Phase 11 completion:
- Real phone/email details for each barber.
- Initial featured service selections.
- Owner-facing password reset and barber invite email smoke before final signoff.
- Live production checks for Google Places, social links, and reminder scheduler run history are still Phase 12 launch-prep work. Controlled live SMS/email smoke has passed with approved test contacts.
- Phase 13 is optional Fresha migration/import tooling and is not required for the website booking link.
- Owner verification of the seeded observed recurring barber schedules before full public cutover.
- Owner approval that Yogesh is Millwood-only remains the launch rule.
- Owner approval that the current Eglinton phone number `+1 (647) 348-2200` is the value to publish.
- Owner approval of the 37-service repo catalog, or identification of any real missing Fresha service by name/category/price/duration before adding.
- Owner-approved staff notification phone/email contacts for Sam, Yogesh, Laura, Shayan, and any other launch staff who should receive booking details.
- Owner rotation/handoff of the temporary `owner@leasidefades.com` password.

## Known Bugs

None yet.

## Edge Cases Discovered

Scheduling edge cases to test:
- Booking exactly at opening time
- Booking ending exactly at closing time
- Booking that would end after closing time
- Booking less than 30 minutes from now
- Booking more than 30 days ahead
- Booking with multiple stacked services
- Booking overlapping existing appointment
- Booking adjacent to existing appointment
- Cancelled booking freeing availability
- Rescheduled booking freeing old slot and blocking new slot
- Barber working split shifts
- Barber working at two locations on same day
- Barber with no shift that day
- Location-wide closure
- Business-wide closure
- Barber-specific blocked time
- "Any available barber" assignment
- Race condition where two customers try to book the same slot
- Invalid, expired, or reused cancellation/rescheduling token
- Duplicate reminder prevention
- Barber role isolation from other barbers' bookings
- Admin date/location/barber/status filters leaking cross-scope barber data
- Manual admin booking accidentally bypassing transactional no-overlap checks
- Rescheduling a booking while treating the booking's own old slot as a conflict
- Cancelling completed or no-show bookings
- Duplicate booking lifecycle notification attempts
- Missing customer or barber notification contact information
- Notification provider failure after a successful booking mutation
- Walk-in bookings with customer/staff contact data present
- Raw customer management tokens accidentally persisting in notification logs

## Edge Cases Tested

Phase 1 seed-data validation tested:
- stable unique slugs
- expected seed counts
- seven-day business-hours coverage
- valid location/barber/category references
- valid service durations, pricing, and configurable featured defaults

Phase 2 availability engine tests:
- single service availability
- multiple stacked services
- opening time slot
- closing boundary
- slot ending after closing rejected
- less than 30 minutes from now rejected
- more than 30 days ahead rejected
- confirmed booking overlap blocked
- adjacent booking allowed
- cancelled booking frees availability
- barber-specific blocked time
- location-wide blocked time
- business-wide blocked time
- split shifts
- barber working two locations on the same day by selected location
- barber with no shift has no availability
- Any available barber grouped output
- one-off add shift override
- one-off not-working shift override

Phase 3 booking creation tests:
- creates a confirmed booking for a specific available barber
- writes `booking_services` snapshots
- stacks selected services into total appointment duration
- rejects requested times not present in recalculated availability
- rejects inactive or missing services
- rejects unavailable selected barbers
- rejects slots outside business hours
- rejects slots inside the minimum-notice window
- rejects slots beyond the max booking window
- rejects overlapping confirmed bookings
- allows adjacent bookings
- ignores cancelled bookings as blockers
- rejects barber-specific blocked time
- rejects location-wide blocked time
- rejects business-wide blocked time
- assigns Any Available by sort order first
- uses fewest same-day confirmed bookings as the next Any Available tie-breaker
- uses stable barber ID as the final Any Available tie-breaker
- rolls back booking writes if snapshot insertion fails
- converts database race-condition conflicts into unavailable-slot errors

Phase 4 public booking flow tests:
- maps `/book` routes to wizard steps
- summarizes stacked service duration and fixed/from price totals
- summarizes immutable booking confirmation service snapshots
- requires complete customer contact details
- validates email format and rejects missing `@`
- formats local phone numbers with a country/area code selector
- builds Sunday-start visible booking weeks for the time picker
- returns availability generated by repository data through the existing availability engine
- returns a graceful empty availability message when no shifts exist
- creates public bookings through the existing booking service and returns safe confirmation details
- validates missing customer details before booking creation
- groups public catalog rows into location, service category, service, and barber lists
- maps database rows into the existing `AvailabilityData` shape
- formats stacked price summaries with from-pricing preserved

Phase 5A auth and role tests:
- valid owner login creates an opaque hashed session and returns a safe user
- barber login returns the linked `barberId`
- invalid login fails generically
- inactive users and users without password hashes cannot log in
- missing, expired, and revoked sessions are rejected
- logout revokes the current session
- unauthenticated protected admin booking reads return 401
- login sets an HTTP-only `SameSite=Lax` admin session cookie
- production login marks the session cookie `Secure`
- session check returns a safe user without password hash
- owner/admin users see all bookings through the protected read service
- barber users see only own bookings
- barber users cannot see another barber's bookings
- barber users without `barberId` are rejected before booking lookup
- local/dev owner bootstrap allows localhost database URLs only
- local/dev owner bootstrap rejects production mode and non-local database URLs
- local/dev owner bootstrap requires explicit email and password

Phase 5B password reset tests:
- forgot-password returns a generic response for unknown emails
- forgot-password creates a hashed token for active users
- reset tokens expire after 45 minutes
- used and invalid reset tokens are rejected
- short reset passwords are rejected
- successful reset stores a new Argon2id password hash
- successful reset marks the reset token used
- successful reset revokes existing sessions for that user
- API reset allows login with the new password and rejects the old password

Phase 5C owner-managed barber onboarding tests:
- owner creates a barber profile assigned to Eglinton
- admin creates barber profiles assigned to Millwood or both locations
- linked barber users are created with `role = "barber"` and the new `barberId`
- linked barber users remain inactive with no password until invite acceptance
- invite tokens are stored hashed and delivered only through the delivery layer
- barber users cannot create other barber accounts
- unauthenticated team creation is rejected
- invalid locations and missing required fields are rejected
- accepted invite sets an Argon2id password hash and activates the linked user
- invite tokens are single-use
- expired invite tokens are rejected
- accepted invite allows barber login through Phase 5A auth
- invited barber sees only own bookings through protected admin booking reads
- deactivation disables the barber, linked user, and active sessions

Phase 5 real-route QA runner:
- verifies local database/migration/static seed prerequisites
- uses the existing guarded dev-owner bootstrap to create an owner for QA
- exercises owner login, HTTP-only session cookie reuse, safe session check, protected booking read, logout, and unauthenticated rejection through Express routes
- captures dev-mode password reset links without exposing reset tokens through production API responses
- verifies reset-password success, old-session revocation, and login with the new owner password
- creates a barber through the owner/admin team API, captures the dev-mode invite link, accepts the invite, and logs the barber in
- creates local QA booking fixtures and verifies barber booking reads are scoped to the linked barber only
- deactivates the barber and verifies active sessions and further admin access are blocked

Phase 6 admin calendar and booking management tests:
- owner/admin booking reads filter by date, location, barber, and status
- barber booking reads remain scoped to the linked barber and reject conflicting barber filters
- booking details are visible to owner/admin and only the owning barber
- calendar options are barber-scoped for barber users
- admin availability is authenticated and barber-scoped
- manual bookings require an explicit in-scope barber
- manual bookings are created with `source = "manual"` through the transactional booking path
- manual bookings reject overlapping confirmed bookings
- cancellation is idempotent for already-cancelled bookings
- completed/no-show bookings are rejected for cancellation
- admin rescheduling excludes the booking being moved from its own conflict check
- admin rescheduling rejects overlaps with other confirmed bookings
- admin rescheduling explicitly rejects service-changing fields; full service/contact/note edits use the dedicated admin edit workflow
- admin rescheduling still succeeds for valid time, location, and barber changes
- admin mutation Origin/Referer hardening rejects invalid origins and allows configured/local development origins
- public booking catalog and availability remain unauthenticated and outside the admin mutation Origin guard
- transaction-bound Phase 6 admin QA no longer emits the pg overlapping client-query deprecation warning
- Phase 6 API routes reject unauthenticated access
- owner can use filtered booking reads, detail reads, calendar options, manual create, cancel, and reschedule through Express routes
- barber users cannot read or mutate another barber's bookings through Phase 6 routes
- admin UI utilities build week/month calendar ranges, serialize filters, group bookings by Toronto date, and format status labels

Phase 7 schedule management tests:
- owner/admin can create recurring shifts
- adjacent split shifts are allowed
- overlapping same-barber active shifts on the same weekday and effective date range are rejected
- non-overlapping effective date ranges are allowed
- one-off `add`, `remove`, and `not_working` overrides are validated
- barber users can manage only their own barber-scoped blocked time
- barber users cannot mutate shifts, shift overrides, other barbers' blocked time, location closures, or business closures
- business and location closure scope rules are enforced
- blocked-time creation is rejected when it overlaps confirmed bookings in the affected scope
- unauthenticated schedule routes return 401
- schedule mutations use the existing admin Origin/Referer guard
- schedule repository maps Drizzle rows for shifts, overrides, blocked times, barber locations, and scoped lists
- admin UI utilities group shifts, format local windows, serialize schedule query strings, and shape blocked-time form payloads
- Phase 7 real-route QA verifies owner schedule mutations, blocked time affecting availability, confirmed-booking overlap rejection, barber blocked-time scoping, and cleanup

Phase 7.5 calendar operations tests:
- walk-in bookings use `source = "walk_in"` and accept name-only customers with null phone/email
- public/manual booking contact requirements remain intact
- barber walk-ins are scoped to the linked barber profile
- barber `barberId` spoofing is rejected
- walk-ins reject overlapping confirmed bookings
- walk-ins can use authenticated grey off-shift/admin full-day slots
- walk-ins reject barber blocked time, location closures, and business closures
- owner/admin can create walk-ins for any active eligible barber
- inactive users and misconfigured barber users cannot use staff operations
- inactive barber targets are rejected
- no-show succeeds for current/past confirmed own bookings
- future, cancelled, completed, and already no-show bookings reject no-show transitions
- barber no-show attempts on another barber's booking are scoped out
- drag/drop utility payloads reject invalid/non-owned moves
- reschedule API allows grey off-shift/admin full-day moves but rejects overlap and blocked-time moves
- barber cross-barber reschedule is rejected
- owner/admin cross-barber reschedule passes only through backend staff-scheduling validation
- calendar feed reflects created walk-ins and rescheduled bookings
- booking edit service updates customer contact, notes, service snapshots, schedule, duration, and preserves source/status/customer tokens
- one-day shift replacement diffs desired windows against recurring baselines and enforces own-shift permissions for barber users

Phase 8 customer token flow tests:
- booking management tokens are generated as opaque random values and stored only as SHA-256 hashes
- public booking creation stores token hashes and returns cancellation/reschedule links
- walk-in booking creation stores no customer management token hashes
- invalid customer management tokens are rejected generically
- wrong token type is rejected for cancel and reschedule actions
- cancellation token cancels confirmed bookings idempotently
- cancelled booking frees the old slot
- reschedule token availability excludes the booking's own old slot
- reschedule token moves confirmed bookings and preserves service snapshots
- old reschedule slot is freed and new slot is blocked
- reschedule rejects unavailable slots and confirmed booking overlaps
- `/booking` customer management routes are selected before `/book` wizard routes
- customer management API client uses the expected public routes

Phase 9 notification infrastructure tests:
- templates render booking, cancellation, and reschedule messages with safe booking summary details
- customer booking confirmations include management links only when raw URLs are provided
- notification metadata stores flags and appointment summaries without raw management URLs or tokens
- mock and dev providers return deterministic provider message IDs without live credentials
- live provider wrappers fail clearly when required Twilio/Resend environment variables are missing
- dispatcher logs sent, failed, skipped, and duplicate/idempotent outcomes
- skipped customer/staff contact rows do not call providers and do not fail booking flows
- idempotency keys prevent duplicate notification rows and increment attempt counts on duplicate attempts
- reschedule idempotency keys include the new appointment start time occurrence marker
- provider send failures are logged as failed notification attempts
- booking mutation services dispatch only after successful create/cancel/reschedule mutations
- failed booking mutations create no notification attempts
- notification dispatcher failures do not fail booking create/cancel/reschedule mutations
- contacted walk-ins create customer/staff booking confirmation attempts through the shared notification dispatcher
- local Phase 9 QA verifies real public create/cancel/reschedule routes, contacted walk-in confirmation attempts, skipped staff contact, idempotency, and no raw token persistence

Phase 10 reminder job tests:
- reminder templates render 24-hour and 2-hour customer messages with appointment details and no management links
- reminder dispatch sends only customer SMS/email, not barber/staff SMS
- missing or invalid reminder contacts log skipped attempts without provider calls
- provider failures are logged as failed reminder attempts without failing the reminder job
- failed reminder attempts retry on later job runs without resending already-sent channels
- reminder idempotency prevents duplicate sends and increments attempt counts
- reminder idempotency uses the current appointment start time occurrence marker
- stale reminder candidates are skipped when the booking has been rescheduled since the scan
- cancelled, completed, no-show, and imported bookings do not create reminder attempts; confirmed walk-ins are reminder-eligible when customer contact exists
- due-window scanning covers both 24-hour and 2-hour reminders
- live reminder configuration preflight reports missing production Twilio/Resend variables before scheduler enablement
- local Phase 10 QA verifies real public booking/cancel/reschedule routes, duplicate reminder prevention, failed SMS retry, and cleanup

Phase 4 manual DB-backed QA:
- local `DATABASE_URL` configured for Docker PostgreSQL at `postgres://postgres:postgres@localhost:5432/leaside_fades`
- `npm run db:migrate` applied migrations against local PostgreSQL
- `npm run db:seed` seeded static locations, barbers, services, business hours, and barber capabilities
- `npm run db:seed:dev-shifts` seeded clearly marked local/dev-only sample shifts, guarded to localhost database URLs
- `/api/booking/catalog` returned DB-backed locations, services, and barbers
- `/book` loaded locations, services, barbers, availability, details, review, and confirmation screens against the DB-backed API
- full browser booking completed through `/book` for Eglinton, Men's Cut, Sam To, and a real returned slot
- confirmation screen displayed booking confirmed, assigned barber, selected service, price summary, and Pay in shop
- confirmed bookings removed overlapping future Sam availability from the public availability API
- DB-backed catalog shows Men's Perm as the sixth men's service option after reseeding static data locally
- headless browser QA verified barber profile photos for Sam, Laura, Yogesh, and Shayon
- booking barber profile photos now use 320x320 optimized thumbnails, keeping the original full-size images available for richer pages
- headless browser QA verified the weekly time picker, calendar selector, past-day skip behavior, and returned availability counts
- headless browser QA verified phone formatting and invalid email blocking on the details step

## Files Changed in Latest Session

Phase 12/13 admin calendar mobile polish and deterministic test-clock files changed in the latest session:
- `src/admin/AdminApp.tsx`
- `src/admin/admin-utils.ts`
- `src/admin/admin-utils.test.ts`
- `src/admin/types.ts`
- `src/server/admin/api.ts`
- `src/server/admin/api.test.ts`
- `src/server/admin/schedule-api.test.ts`
- `src/server/admin/bookings-service.ts`
- `src/server/admin/bookings-service.test.ts`
- `src/server/admin/repository.ts`
- `src/server/public-booking/service.test.ts`
- `src/server/notifications/dispatcher.ts`
- `src/server/notifications/dispatcher.test.ts`
- `src/server/notifications/repository.ts`
- `src/server/qa/phase9-notifications-flow-qa.ts`
- `PROJECT_STATUS.md`
- `docs/ARCHITECTURE.md`
- `docs/BOOKING_RULES.md`
- `docs/DECISIONS.md`
- `docs/LAUNCH_PREP.md`
- `docs/OWNER_SIGNOFF_CHECKLIST.md`
- `docs/QA_CHECKLIST.md`

Phase 10 reminder job files changed in the latest session:
- `.env.example`
- `package.json`
- `docs/PRODUCTION_REMINDER_JOBS.md`
- `src/server/notifications/types.ts`
- `src/server/notifications/config.ts`
- `src/server/notifications/check-live-config.ts`
- `src/server/notifications/templates.ts`
- `src/server/notifications/dispatcher.ts`
- `src/server/notifications/repository.ts`
- `src/server/notifications/index.ts`
- `src/server/notifications/reminders.ts`
- `src/server/notifications/send-reminders.ts`
- `src/server/notifications/config.test.ts`
- `src/server/notifications/templates.test.ts`
- `src/server/notifications/dispatcher.test.ts`
- `src/server/notifications/reminders.test.ts`
- `src/server/qa/phase10-reminders-flow-qa.ts`
- `PROJECT_STATUS.md`
- `docs/ARCHITECTURE.md`
- `docs/BOOKING_RULES.md`
- `docs/QA_CHECKLIST.md`
- `docs/DECISIONS.md`

Phase 9 notification infrastructure files changed in the latest session:
- `package.json`
- `package-lock.json`
- `.env.example`
- `drizzle/0005_phase_9_notifications.sql`
- `drizzle/meta/0005_snapshot.json`
- `drizzle/meta/_journal.json`
- `src/server/db/schema.ts`
- `src/server/notifications/types.ts`
- `src/server/notifications/providers.ts`
- `src/server/notifications/templates.ts`
- `src/server/notifications/dispatcher.ts`
- `src/server/notifications/repository.ts`
- `src/server/notifications/index.ts`
- `src/server/notifications/templates.test.ts`
- `src/server/notifications/providers.test.ts`
- `src/server/notifications/dispatcher.test.ts`
- `src/server/public-booking/service.ts`
- `src/server/public-booking/service.test.ts`
- `src/server/public-booking/customer-management-service.ts`
- `src/server/public-booking/customer-management-service.test.ts`
- `src/server/admin/bookings-service.ts`
- `src/server/admin/bookings-service.test.ts`
- `src/server/qa/phase9-notifications-flow-qa.ts`
- `PROJECT_STATUS.md`
- `docs/ARCHITECTURE.md`
- `docs/BOOKING_RULES.md`
- `docs/QA_CHECKLIST.md`
- `docs/DECISIONS.md`

Phase 8 customer token flow files changed in the latest session:
- `package.json`
- `server.js`
- `src/App.tsx`
- `src/app-routing.ts`
- `src/app-routing.test.ts`
- `src/booking/BookingPage.tsx`
- `src/booking/CustomerBookingPage.tsx`
- `src/booking/customer-management-api.ts`
- `src/booking/customer-management-api.test.ts`
- `src/booking/customer-management-types.ts`
- `src/booking/types.ts`
- `src/server/bookings/booking-service.ts`
- `src/server/bookings/booking-service.test.ts`
- `src/server/bookings/index.ts`
- `src/server/bookings/tokens.ts`
- `src/server/bookings/tokens.test.ts`
- `src/server/bookings/types.ts`
- `src/server/public-booking/api.ts`
- `src/server/public-booking/customer-management-service.ts`
- `src/server/public-booking/customer-management-service.test.ts`
- `src/server/public-booking/index.ts`
- `src/server/public-booking/repository.ts`
- `src/server/public-booking/service.ts`
- `src/server/public-booking/service.test.ts`
- `src/server/qa/phase8-customer-token-flow-qa.ts`
- `PROJECT_STATUS.md`
- `docs/ARCHITECTURE.md`
- `docs/BOOKING_RULES.md`
- `docs/QA_CHECKLIST.md`
- `docs/DECISIONS.md`

Phase 7.5 calendar-first operations files changed in the latest session:
- `drizzle/0004_phase_7_5_calendar_operations.sql`
- `drizzle/meta/0004_snapshot.json`
- `drizzle/meta/_journal.json`
- `server.js`
- `package.json`
- `src/index.css`
- `src/admin/AdminApp.tsx`
- `src/admin/admin-utils.ts`
- `src/admin/admin-utils.test.ts`
- `src/admin/api.ts`
- `src/admin/types.ts`
- `src/server/admin/api.ts`
- `src/server/admin/api.test.ts`
- `src/server/admin/bookings-service.ts`
- `src/server/admin/bookings-service.test.ts`
- `src/server/admin/repository.ts`
- `src/server/bookings/booking-service.ts`
- `src/server/bookings/types.ts`
- `src/server/db/schema.ts`
- `src/server/qa/phase7-5-calendar-flow-qa.ts`
- `PROJECT_STATUS.md`
- `docs/ARCHITECTURE.md`
- `docs/BOOKING_RULES.md`
- `docs/QA_CHECKLIST.md`
- `docs/DECISIONS.md`
- `artifacts/phase7-5-calendar/*.png`

Phase 6 hardening files changed in the latest session:
- `src/server/public-booking/repository.ts`
- `src/server/bookings/booking-service.ts`
- `src/server/admin/bookings-service.ts`
- `src/server/admin/bookings-service.test.ts`
- `src/server/admin/api.ts`
- `src/server/admin/api.test.ts`
- `src/server/admin/repository.ts`
- `src/server/qa/phase6-admin-flow-qa.ts`
- `PROJECT_STATUS.md`
- `docs/ARCHITECTURE.md`
- `docs/QA_CHECKLIST.md`
- `docs/DECISIONS.md`

Phase 6 files changed in the latest session:
- `package.json`
- `server.js`
- `src/App.tsx`
- `src/index.css`
- `src/admin/AdminApp.tsx`
- `src/admin/api.ts`
- `src/admin/admin-utils.ts`
- `src/admin/admin-utils.test.ts`
- `src/admin/types.ts`
- `src/server/admin/api.ts`
- `src/server/admin/api.test.ts`
- `src/server/admin/bookings-service.ts`
- `src/server/admin/bookings-service.test.ts`
- `src/server/admin/repository.ts`
- `src/server/bookings/booking-service.ts`
- `src/server/bookings/index.ts`
- `src/server/bookings/types.ts`
- `src/server/public-booking/repository.ts`
- `src/server/qa/phase6-admin-flow-qa.ts`
- `PROJECT_STATUS.md`
- `docs/ARCHITECTURE.md`
- `docs/BOOKING_RULES.md`
- `docs/QA_CHECKLIST.md`
- `docs/DECISIONS.md`

Prior Phase 5 files from the previous latest session:
- `package.json`
- `package-lock.json`
- `server.js`
- `.env.example`
- `drizzle/0001_phase_5a_custom_session_auth.sql`
- `drizzle/0002_phase_5b_password_reset.sql`
- `drizzle/0003_phase_5c_owner_barber_onboarding.sql`
- `drizzle/meta/0001_snapshot.json`
- `drizzle/meta/0002_snapshot.json`
- `drizzle/meta/0003_snapshot.json`
- `drizzle/meta/_journal.json`
- `src/server/admin/api.ts`
- `src/server/admin/api.test.ts`
- `src/server/admin/bookings-service.ts`
- `src/server/admin/bookings-service.test.ts`
- `src/server/admin/index.ts`
- `src/server/admin/repository.ts`
- `src/server/admin/team-invite-delivery.ts`
- `src/server/admin/team-repository.ts`
- `src/server/admin/team-service.ts`
- `src/server/admin/team-service.test.ts`
- `src/server/auth/http.ts`
- `src/server/auth/index.ts`
- `src/server/auth/invite-tokens.ts`
- `src/server/auth/password.ts`
- `src/server/auth/password-reset-delivery.ts`
- `src/server/auth/password-reset-repository.ts`
- `src/server/auth/password-reset-service.ts`
- `src/server/auth/password-reset-service.test.ts`
- `src/server/auth/repository.ts`
- `src/server/auth/reset-tokens.ts`
- `src/server/auth/service.ts`
- `src/server/auth/service.test.ts`
- `src/server/auth/session-tokens.ts`
- `src/server/db/schema.ts`
- `src/server/db/seed-dev-owner.ts`
- `src/server/db/seed-dev-owner.test.ts`
- `src/server/qa/phase5-auth-flow-qa.ts`
- `PROJECT_STATUS.md`
- `docs/ARCHITECTURE.md`
- `docs/QA_CHECKLIST.md`
- `docs/DECISIONS.md`

Prior Phase 4 files from the previous session remain changed in this working tree:
- `src/App.tsx`
- `src/booking/BookingPage.tsx`
- `src/booking/api.ts`
- `src/booking/booking-utils.ts`
- `src/booking/booking-utils.test.ts`
- `src/booking/types.ts`
- `src/components/LocationActionMenu.tsx`
- `src/sections/FAQ.tsx`
- `src/sections/Services.tsx`
- `src/server/public-booking/api.ts`
- `src/server/public-booking/index.ts`
- `src/server/public-booking/repository.ts`
- `src/server/public-booking/repository.test.ts`
- `src/server/public-booking/service.ts`
- `src/server/public-booking/service.test.ts`
- `src/server/availability/availability-engine.ts`
- `src/server/availability/index.ts`
- `src/server/bookings/booking-service.ts`
- `src/server/bookings/index.ts`
- `src/server/bookings/types.ts`
- `src/server/db/client.ts`
- `src/server/db/seed.ts`
- `src/server/db/seed-data.ts`
- `src/server/db/seed-dev-shifts.ts`
- `src/server/db/seed-dev-shifts.test.ts`

## Commands / Tests Run

Phase 13 launch cutover/UI/import tooling verification:
- `npm run test -- src/server/admin/api.test.ts src/server/admin/schedule-api.test.ts src/server/public-booking/service.test.ts` (red before deterministic test clocks: 20 stale date/session fixture failures; passing after fix: 3 files, 39 tests passed)
- `npm run build` (`tsc && vite build` passed after the de-crunched Add appointment split-pane/drawer UI changes)
- Headless Chrome CDP stress-tested local `/admin/calendar` at 320x568, 340x600, 340x720, 375x667, 390x844, 414x896, 768x1024, 1280x720, 1440x900, and 1920x900 with no horizontal overflow, visible board height, visible slots, closing-boundary reach, framed Add drawer, visible sticky create action, and no appointment submissions.
- Headless Chrome CDP verified the Sam-only Eglinton board at 744x860: `1 staff` label, 712px board width, visible slots, no horizontal overflow, and framed full-width Add drawer.
- `npm run test` (28 files, 215 tests passed)
- `npm run test -- src/admin/admin-utils.test.ts src/server/admin/bookings-service.test.ts src/server/notifications/dispatcher.test.ts` (3 files, 63 tests passed)
- `npm run test` (28 files, 209 tests passed)
- `npm run build` (`tsc && vite build` passed)
- `npm run qa:phase7-5-calendar` (passed)
- `npm run qa:phase9-notifications` (passed)
- `npm run qa:phase10-reminders` (passed)
- Playwright MCP browser QA against `http://127.0.0.1:3002/admin/calendar` verified the mobile day board at iPhone width, full-screen mobile Add appointment/Walk-in form, desktop calendar/drawer at 1280x720, calendar at 1440x900 and 1912x970, and the redesigned Notification Center at desktop and mobile widths.
- `npm run test -- src/admin/admin-utils.test.ts` (17 tests passed after adding non-working slot clickability regression coverage)
- `npm run build` (`tsc && vite build` passed)
- `npm run test -- src/admin/admin-utils.test.ts src/server/notifications/dispatcher.test.ts` (2 files, 25 tests passed)
- `npm run build` (`tsc && vite build` passed; Vite printed a non-fatal warning because the local environment had `NODE_ENV=production`)
- Playwright MCP parity spot-check captured live admin calendar screenshots for May 1 Eglinton, May 1 Millwood, May 3 Eglinton, and May 30 Eglinton under `output/playwright/`.
- Production calendar import counts matched the Fresha extraction by date/location/barber. The May 30 02:30 and 03:00 imported rows remain in the report/DB but are outside the official-hours day-board view; the matching 14:30 and 15:00 Sam rows are visible on the board.
- `vercel env ls production` shows encrypted Twilio/Resend/Cron production variables. `https://leasidefades.com/api/jobs/send-reminders` returns `401` without authorization, confirming `CRON_SECRET` exists at runtime.
- Attempted `vercel deploy --prod -y` with a five-minute Vercel Cron entry; Vercel rejected it because the account is on Hobby and only supports daily cron jobs. The rejected cron entry was removed so production deploys remain unblocked.
- `npm run build` passed again after reverting the rejected cron entry, and `https://leasidefades.com/api/health` returned 200.
- Added and production-deployed the live Add appointment drawer Appointment/Walk-in toggle. Playwright verified the toggle and the `Create walk-in` submit state on `https://www.leasidefades.com/admin/calendar`.

Phase 12 launch-readiness verification:
- `npm run test -- src/server/notifications/dispatcher.test.ts src/server/notifications/templates.test.ts src/server/notifications/reminders.test.ts src/server/db/seed-data.test.ts src/server/db/seed-dev-shifts.test.ts` (5 files, 31 tests passed)
- `npm run build` (`tsc && vite build` passed; Vite printed a non-fatal warning because the local environment had `NODE_ENV=production`)
- `npm run test` (26 files, 195 tests passed)
- `npm run notifications:check-live-config` with complete fake live env values (passed; no live sends)
- `git diff --check` (passed; Git reported only LF-to-CRLF working-copy warnings)
- Untracked local QA screenshot/log artifacts under `artifacts/` and the older `leaside_fresha_lite_codex_package/` scratch package were inventoried and added to `.gitignore` so they are not accidentally included in a launch commit.
- Local DB launch drill: `npm run db:migrate`, `npm run db:seed`, `npm run db:seed:dev-owner`, and `npm run db:seed:dev-shifts` passed against the local database.
- Real-route E2E QA passed for `qa:phase5-auth`, `qa:phase6-admin`, `qa:phase7-schedule`, `qa:phase7-5-calendar`, `qa:phase8-customer-token`, `qa:phase9-notifications`, and `qa:phase10-reminders`.
- Local HTTP smoke against `node server.js` on `http://localhost:3001` passed: health, catalog, public booking creation, admin booking visibility, customer cancellation freeing slot, customer rescheduling freeing old slot/blocking new slot, notification row checks for customer/staff/admin attempts, token-safe metadata, and smoke-row cleanup.
- Playwright CLI screenshots captured `/book` and `/admin/login` under `output/playwright/`.
- Runtime smoke found and fixed Node strip-only TypeScript incompatibility in server-imported modules by replacing constructor parameter properties in notification providers/repositories and schedule repository.

Phase 11 Fresha inspection verification:
- Read source-of-truth docs: `AGENTS.md`, `PROJECT_STATUS.md`, `docs/ARCHITECTURE.md`, `docs/BOOKING_RULES.md`, `docs/DECISIONS.md`, and `docs/QA_CHECKLIST.md`.
- Used Playwright read-only browser inspection for public Fresha Eglinton and Millwood venue pages.
- Used owner-assisted authenticated Fresha Partner admin session read-only for calendar, team members, scheduled shifts, location setup, service menu/service editor, online booking surfaces, marketplace/link builder/integrations, and appointment report schema/status filters.
- Attempted the in-app Browser runtime first; it was unavailable in this session, so the available Playwright browser tool was used.
- Confirmed no screenshots were saved and no Fresha booking, customer, staff, schedule, service, export, import, payment, notification, or settings data was changed.
- `git diff --check -- docs/FRESHA_INSPECTION.md docs/QA_CHECKLIST.md PROJECT_STATUS.md` (passed; Git reported only LF-to-CRLF working-copy warnings)

Phase 10 reminder job verification:
- `npm run test -- src/server/notifications/config.test.ts src/server/notifications/templates.test.ts src/server/notifications/providers.test.ts src/server/notifications/dispatcher.test.ts src/server/notifications/reminders.test.ts` (5 files, 28 tests passed)
- `npm run notifications:check-live-config` with complete fake live env values (passed)
- `npm run build` (`tsc && vite build` passed)
- `npm run test` (26 files, 192 tests passed)
- `npm run qa:phase10-reminders` (passed)
- `npm run qa:phase9-notifications` (passed)
- `git diff --check` (passed; Git reported only LF-to-CRLF working-copy warnings)

Phase 9 notification infrastructure verification:
- `npm install twilio@^6 resend@^6`
- `npm run db:generate -- --name phase_9_notifications`
- `npm run test -- src/server/notifications/templates.test.ts src/server/notifications/providers.test.ts src/server/notifications/dispatcher.test.ts src/server/public-booking/service.test.ts src/server/public-booking/customer-management-service.test.ts src/server/admin/bookings-service.test.ts`
- `npm run build`
- `npm run db:migrate`
- `npm run qa:phase9-notifications`
- `npm run test`
- `npm run build`
- `npm run qa:phase5-auth`
- `npm run qa:phase6-admin`
- `npm run qa:phase7-schedule`
- `npm run qa:phase7-5-calendar`
- `npm run qa:phase8-customer-token`
- `npm run qa:phase9-notifications`
- `git diff --check`

Phase 8 customer token flow verification:
- `npm run test -- src/server/bookings/tokens.test.ts src/server/bookings/booking-service.test.ts src/server/public-booking/service.test.ts src/server/public-booking/customer-management-service.test.ts`
- `npm run test -- src/app-routing.test.ts src/booking/customer-management-api.test.ts`
- `npm run build`
- `npm run test -- src/server/bookings/tokens.test.ts src/server/bookings/booking-service.test.ts src/server/public-booking/service.test.ts src/server/public-booking/customer-management-service.test.ts src/app-routing.test.ts src/booking/customer-management-api.test.ts`
- `npm run qa:phase8-customer-token`

Phase 7.5 calendar-first operations verification:
- `npm run db:generate`
- `npm run test -- src/server/admin/bookings-service.test.ts`
- `npm run test -- src/server/admin/api.test.ts`
- `npm run test -- src/admin/admin-utils.test.ts`
- `npm run test -- src/server/admin/bookings-service.test.ts src/server/admin/api.test.ts src/admin/admin-utils.test.ts`
- `npm run db:migrate`
- `npm run qa:phase7-5-calendar` (initial red fixture failures, then passing after QA runner fixture fixes)
- `npm run test`
- `npm run build`
- `npm run qa:phase5-auth`
- `npm run qa:phase6-admin`
- `npm run qa:phase7-schedule`
- `npm run qa:phase7-5-calendar`
- Browser QA on `http://127.0.0.1:3002/admin/calendar`, `/admin/bookings`, `/admin/shifts`, and `/admin/blocked-time` with screenshots saved under `artifacts/phase7-5-calendar/`

Phase 7 schedule management verification:
- `npm run test -- src/server/admin/schedule-service.test.ts`
- `npm run test -- src/server/admin/schedule-repository.test.ts src/server/admin/schedule-service.test.ts`
- `npm run test -- src/server/admin/schedule-api.test.ts`
- `npm run test -- src/admin/admin-utils.test.ts`
- `npm run test -- src/server/admin/schedule-service.test.ts src/server/admin/schedule-repository.test.ts src/server/admin/schedule-api.test.ts`
- `npm run test -- src/server/admin/schedule-service.test.ts src/server/admin/schedule-repository.test.ts src/server/admin/schedule-api.test.ts src/admin/admin-utils.test.ts`
- `npm run test`
- `npm run build`
- `npm run qa:phase5-auth`
- `npm run qa:phase6-admin`
- `npm run qa:phase7-schedule`
- `git diff --check`

Phase 6 hardening verification:
- `npm run test -- src/server/admin/bookings-service.test.ts src/server/admin/api.test.ts` (red before implementation; service-change and Origin/Referer tests failed as expected)
- `npm run test -- src/server/admin/bookings-service.test.ts src/server/admin/api.test.ts`
- `npm run test -- src/server/admin/bookings-service.test.ts src/server/admin/api.test.ts src/server/public-booking/repository.test.ts src/server/public-booking/service.test.ts`
- `NODE_OPTIONS='--trace-deprecation --stack-trace-limit=100' npm run qa:phase6-admin` (used to confirm the pg warning source, then rerun clean after the admin repository transaction wrapper fix)
- `npm run test`
- `npm run build`
- `npm run qa:phase5-auth`
- `npm run qa:phase6-admin`
- `npm audit --json`
- `git diff --check`

- `npm run test -- src/server/admin/bookings-service.test.ts src/server/admin/api.test.ts src/admin/admin-utils.test.ts` (red before implementation)
- `npm run test -- src/server/admin/bookings-service.test.ts src/server/admin/api.test.ts src/admin/admin-utils.test.ts`
- `npm run build`
- `npm run test`
- `git diff --check`
- `npm run test`
- `npm run build`
- `npm run qa:phase6-admin`
- `npm run qa:phase5-auth`
- `npm run test -- src/server/public-booking/service.test.ts src/server/public-booking/repository.test.ts`
- `npm run test -- src/booking/booking-utils.test.ts`
- `npm run test -- src/booking/booking-utils.test.ts src/server/public-booking/service.test.ts src/server/public-booking/repository.test.ts`
- `npm run test`
- `npm run build`
- `npm run qa:phase5-auth`
- `npm run test`
- `npm run build`
- `npm audit --json`
- `npm install argon2`
- `npm install -D supertest @types/supertest @types/express`
- `npm run test -- src/server/auth/service.test.ts src/server/admin/bookings-service.test.ts src/server/admin/api.test.ts src/server/db/seed-dev-owner.test.ts`
- `npm audit fix`
- `npm install`
- `npm ci`
- `npm install express@^5.2.1`
- `npm install -D vite@^7.3.2 postcss@^8.5.12`
- `npm audit --json`
- `npm run test -- src/server/auth/password-reset-service.test.ts src/server/admin/api.test.ts`
- `npm run test -- src/server/auth/service.test.ts src/server/auth/password-reset-service.test.ts src/server/admin/bookings-service.test.ts src/server/admin/api.test.ts src/server/db/seed-dev-owner.test.ts`
- `npm run test`
- `npm run build`
- `npm audit --json`
- `npm ls vite rollup postcss path-to-regexp picomatch esbuild @esbuild-kit/core-utils drizzle-kit`
- `npm run db:migrate`
- `node -e "import('./src/server/admin/api.ts').then(() => console.log('admin api import ok')).catch((error) => { console.error(error); process.exit(1); })"`
- `node -e "import('./server.js').then(() => import('./src/server/admin/api.ts')).then(() => console.log('server and admin api import ok')).catch((error) => { console.error(error); process.exit(1); })"`
- `git diff --check`
- `npm run db:generate`
- `npm run test -- src/server/admin/team-service.test.ts src/server/admin/api.test.ts`
- `npm run db:generate`
- `npm run test -- src/server/admin/team-service.test.ts src/server/admin/api.test.ts src/server/admin/bookings-service.test.ts src/server/auth/service.test.ts src/server/auth/password-reset-service.test.ts`
- `npm run test -- src/server/admin/team-service.test.ts src/server/admin/api.test.ts src/server/admin/bookings-service.test.ts src/server/auth/service.test.ts src/server/auth/password-reset-service.test.ts src/server/db/seed-dev-owner.test.ts`
- `npm run test`
- `npm run build`
- `npm audit --json`
- `npm run db:migrate`
- `node -e "import('./src/server/admin/api.ts').then(() => console.log('admin api import ok')).catch((error) => { console.error(error); process.exit(1); })"`
- `node -e "import('./server.js').then(() => import('./src/server/admin/api.ts')).then(() => console.log('server and admin api import ok')).catch((error) => { console.error(error); process.exit(1); })"`
- `git diff --check`
- `npm run test`
- `npm run build`
- `npm run db:migrate`
- `node -e "import('./src/server/admin/api.ts').then(() => console.log('admin api import ok')).catch((error) => { console.error(error); process.exit(1); })"`
- `node -e "import('./server.js').then(() => import('./src/server/admin/api.ts')).then(() => console.log('server and admin api import ok')).catch((error) => { console.error(error); process.exit(1); })"`
- `npm run test`
- `npm run build`
- `npm run db:migrate`
- `npm run db:seed`
- `npm run test -- src/server/db/seed-dev-shifts.test.ts`
- `npm run db:seed:dev-shifts`
- `Invoke-WebRequest http://127.0.0.1:3000/api/booking/catalog`
- Browser/CDP QA against `http://127.0.0.1:5174/book`, completing a confirmed DB-backed booking and verifying the confirmation page.
- Availability recheck for Sam To on `2026-04-27` confirmed the booked `2026-04-27T19:00:00.000Z` slot was no longer returned.
- `node -e "import('./src/server/public-booking/api.ts').then(() => console.log('public booking api import ok')).catch((error) => { console.error(error); process.exit(1); })"`
- `node -e "import('./server.js').then(() => import('./src/server/public-booking/api.ts')).then(() => console.log('server and booking api import ok')).catch((error) => { console.error(error); process.exit(1); })"`
- `npm run db:seed`
- Headless Chrome/CDP browser QA against `http://127.0.0.1:5174/book` for service ordering, barber photos, weekly availability browsing, phone formatting, and invalid email blocking
- generated 320x320 booking-only barber thumbnails from the original profile images
- `npm run test`
- `npm run build`

## Decisions Made

- Build custom Leaside Fades scheduling system, not a full Fresha clone.
- Use strict phase-based implementation.
- Use repository documentation for fresh-context continuity.
- Keep the existing React Vite + Express stack.
- Use PostgreSQL + Drizzle for database schema and migrations.
- Keep scheduling logic isolated in server-side modules.
- Use UTC persistence with `America/Toronto` business-time calculations.
- Prefer PostgreSQL exclusion constraints plus transactional application checks for no double booking.
- Use a notification outbox/log table with Twilio and Resend provider abstractions.
- Soft migration from Fresha for launch.
- Do not build online payment processing for MVP.
- Defer final auth provider selection until Phase 5 after comparing custom session auth, Supabase Auth, Better Auth, and Clerk.
- Seed static business data only in Phase 1; do not seed real production barber shifts until actual schedules are known.
- Define a neutral `users` table in Phase 1 but defer sessions/passwords/login behavior until Phase 5.
- Implement Phase 2 availability as a pure server-side module with in-memory test fixtures so scheduling logic can be verified without requiring `DATABASE_URL`.
- Implement Phase 3 booking creation behind a transaction-capable repository interface so the core service is testable without `DATABASE_URL` while production callers must provide a real transaction boundary.
- Implement Phase 4 public APIs through DB-backed adapters around the existing availability engine and booking service instead of adding fake/in-memory production data paths.
- Wire local/internal booking CTAs to `/book`, but keep the final production switch from Fresha to the new booking flow deferred to launch prep.
- Use a localhost-guarded `db:seed:dev-shifts` script only for local/demo booking QA. Do not include fake shifts in production seed data.
- Use custom session auth for Phase 5A instead of Supabase Auth, Better Auth, or Clerk.
- Store admin/barber passwords as Argon2id hashes.
- Use opaque random admin session tokens in HTTP-only cookies and store only SHA-256 token hashes in PostgreSQL.
- Add a guarded local/dev-only owner bootstrap script for QA instead of public signup or hardcoded production credentials.
- Use hashed, single-use password reset tokens with 45-minute expiry and session revocation after successful reset.
- Use Resend for production password reset and barber invite emails, while retaining dev-mode link logging outside production.
- Use owner/admin-managed barber onboarding with a separate `user_invite_tokens` table for account setup tokens.
- Keep Phase 5C API-first and do not build a full staff management UI.
- Add a narrow npm override for `@esbuild-kit/core-utils` nested `esbuild` so the current stable `drizzle-kit` can remain in place without audit findings.
- Implement Phase 7 with server-validated forms and schedule grids, leaving drag/drop for a future pass.
- Reuse existing `shifts`, `shift_overrides`, and `blocked_times` tables for Phase 7 without a migration.
- Allow barber users to manage only their own barber-scoped blocked time by default.
- Reject blocked times that overlap confirmed bookings instead of silently stranding appointments.
- Add Phase 7.5 before Phase 8 to make the admin calendar the primary operational surface.
- Store walk-ins as a separate `source = "walk_in"` booking source.
- Allow nullable customer phone/email only so staff walk-ins can be name-only.
- Keep no-show as a status-only transition in Phase 7.5 with no notifications, fees, or payments.
- Implement booking drag/drop only as a reschedule API client; the backend remains the scheduling source of truth.
- Generate customer management tokens for public bookings by default in Phase 8, store only token hashes, do not expire tokens in Phase 8, and do not generate customer links for staff walk-ins.
- Implement Phase 9 notifications behind `src/server/notifications/*` provider and repository interfaces, with booking services calling the dispatcher only after successful mutations.
- Use `NOTIFICATION_DELIVERY_MODE` for `mock`, `dev`, and `live` notification behavior; local/default mode is mock and live mode uses Twilio/Resend credentials.
- Extend the existing `notifications` table rather than creating a duplicate table, adding only provider, structured metadata, attempt count, and last-attempt support.
- Send booking confirmation attempts for staff-created walk-ins when customer contact exists; missing contact logs skipped attempts and imported bookings remain excluded.
- Keep raw customer management tokens out of notification logs and metadata; include customer management links in messages only when raw URLs are already available from the booking response.
- Implement Phase 10 reminders as a portable CLI cron runner at `npm run notifications:send-reminders`, not an Express timer or HTTP cron endpoint.
- Send Phase 10 reminders only to customers by SMS/email for confirmed public/manual/walk-in bookings; staff reminder SMS and imported bookings remain out of scope.
- Use occurrence-aware reminder idempotency keys based on the current appointment start time so rescheduled bookings receive reminders for the new time only.
- Do not include customer management links in reminder messages because raw cancellation/reschedule tokens cannot be reconstructed from hashed storage.
- Retry failed provider notification attempts on later dispatch/job runs while keeping sent, skipped, and pending rows idempotent.
- Require `npm run notifications:check-live-config` as the production reminder preflight before enabling a live scheduler.
- Keep mobile admin calendar filters out of the day-board height budget so the booking grid remains usable on 320px-class phones.

## Do-Not-Break Rules

- Do not allow double booking for the same barber.
- Do not allow customer booking outside official business hours.
- Do not trust client-side availability.
- Do not bury scheduling logic in UI components.
- Do not implement authentication before Phase 5.
- Do not mutate Fresha data without explicit authorization.
- Do not proceed to later phases without updating project status and docs.

## Latest Session Summary

Phase 12/13 launch cutover implementation is in progress. The admin calendar separates public availability from staff scheduling authority while preserving no-overlap and blocked-time checks. Josef has been added as an Eglinton-only launch barber, and production staff/catalog data has been synced to 5 barbers and 37 services. Account recovery and staff onboarding now have production Resend delivery, production-only `APP_URL` enforcement, and usable `/admin/forgot-password`, `/admin/reset-password`, and `/admin/accept-invite` screens. Public booking and customer reschedule requests now reject date-only appointment start times before scheduling validation. Verification for the account-recovery hardening passed: targeted account/booking tests (38 tests), full `npm run test` (35 files, 259 tests), `npm run build`, `npm run notifications:check-live-config` with complete production-style fake env values, `npm run qa:phase5-auth`, `npm run qa:phase9-notifications`, and `git diff --check`. Vercel production has encrypted `APP_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, and `NOTIFICATION_DELIVERY_MODE` entries; the CLI can confirm the keys exist but cannot expose sensitive values for a local full preflight. Remaining launch items are owner-facing operations: owner password handoff/rotation, owner verification of shifts/services/staff contacts, live owner-approved reset/invite smoke, and final owner signoff.

May 20, 2026 outage response: production `/api/booking/catalog` and valid admin login attempts returned 500 because Vercel logs showed the Neon/Postgres project exceeded compute time quota. Added DB-aware health checks, a quota-safe HTTP reminder scheduler guard, tests for these behaviors, and runbook updates. The Vercel Neon integration is now on Launch, and non-mutating production smoke passes for the booking shell, database-aware health, launch catalog, invalid admin login handling, protected admin routes, and unauthenticated reminder job protection.

Follow-up hardening added a non-mutating `npm run qa:production-smoke` runner to prove the exact production recovery criteria after the database quota/plan is restored: `/book` shell loads, `/api/health` returns database-ready 200, `/api/booking/catalog` returns the 2-location/3-category/37-service/5-barber launch catalog, invalid admin login returns 401 instead of 500, protected admin routes remain protected, and the reminder job endpoint rejects unauthenticated calls before database work. The secured reminder endpoint now also supports authenticated `?dryRun=1` checks so cron secret/cadence verification can happen without sending live reminders, and `npm run qa:production-reminder-scheduler` checks Vercel logs for a real post-restart `200` reminder scheduler run. The first production run passed on May 20, 2026 after the Neon Launch upgrade.

Reminder scheduler monitoring now has a durable heartbeat path. Real reminder job runs record success/failure rows in `scheduler_job_runs` through migration `0006_phase_12_scheduler_job_runs`, and `/admin/dashboard` includes reminder scheduler state under Notification health so owners can see healthy, stale, failing, or unknown scheduler status without relying only on Vercel log checks. The dashboard tolerates the new table missing until the migration is applied, so deployment and migration can be sequenced safely.

Production migration `0006_phase_12_scheduler_job_runs` was applied on May 20, 2026 after deployment `dpl_E2BCGQWsQqdyiSiLk9LVXwUe8xXZ` reached Ready. Post-migration non-mutating production smoke passed.

Incident recurrence hardening now includes a bounded read-only production stress gate as `npm run qa:production-read-stress`. On May 20, 2026 it passed against `https://www.leasidefades.com` with 32 total non-mutating requests at concurrency 4: `/book`, database-aware `/api/health`, `/api/booking/catalog`, `/api/booking/availability`, and invalid admin login all returned expected statuses with zero failures.

Before the Vercel-side secret rotation, `npm run qa:production-reminder-scheduler` found 11 recent cron hits to `/api/jobs/send-reminders`, all returning `401`, with the latest at `2026-05-20T17:34:56.786Z` on deployment `dpl_BULeBJBCg1K7VKQhXCYRuyjAVFZu`. That confirmed cron-job.org was reaching production but its Authorization header was missing, stale, or not matching the then-current Vercel Production `CRON_SECRET`.

To remove manual ambiguity from the cron-job.org restart, operations now include `npm run qa:cron-job-org-reminder` and `npm run ops:cron-job-org-reminder-repair`. With a local `CRON_JOB_ORG_API_KEY` and current Vercel Production `CRON_SECRET`, the verifier checks job `7551064` for enabled state, URL, GET method, Authorization bearer header, and 30-minute cadence; the repair command verifies the supplied secret against the production dry-run endpoint before patching those fields without storing or printing the secret.

Vercel production `CRON_SECRET` was rotated on May 20, 2026, production was redeployed to `https://leaside-fades-gcyyvwtuy-owenjalalis-projects.vercel.app` and aliased to `https://www.leasidefades.com`, and authenticated reminder dry-run passed with the fresh secret. The ignored local `.env.production.local` file now has the current ops copy of `CRON_SECRET`, but cron-job.org still needs its Authorization header updated to match.

The external reminder scheduler is still not recovered after the Vercel-side secret rotation. On May 20, 2026, `npm run qa:production-reminder-scheduler` found 13 recent cron hits to `/api/jobs/send-reminders`, all returning `401`, with the latest at `2026-05-20T17:40:04.532Z` on deployment `dpl_BULeBJBCg1K7VKQhXCYRuyjAVFZu`. That confirms the remaining break is the external cron-job.org job/header, not the production reminder endpoint's current secret.
