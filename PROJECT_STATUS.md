# PROJECT_STATUS.md - Leaside Fades Booking System

## Current Phase

Phase 12 production launch readiness plus Phase 13 guarded Fresha import/cutover tooling are in progress. Phase 11 Fresha read-only public/admin inspection is complete.

July 16, 2026 notification-cost and scheduler hardening is deployed from `master`; the final code-bearing verification deployment is `dpl_bASieJBrezGN6fH6UmGfxeFUHr4h`. Brevo Free is active through the authenticated and branded sending subdomain `mail.leasidefades.com`; sender `Leaside Fades <bookings@mail.leasidefades.com>` is verified, and an owner-only controlled message is confirmed Delivered in Brevo. The project runtime no longer contains or uses `RESEND_API_KEY`, while the shared Resend account and its other client domains remain untouched. Twilio has an independent production `SMS_DELIVERY_MODE=paused` state: SMS attempts become idempotent `provider_paused` skips without loading the Twilio SDK, while email and booking mutations continue. The reminder HTTP endpoint now authenticates before initialization, uses one bounded PostgreSQL connection plus an advisory lock, serializes scheduler-summary queries on that client, enforces connection/query/provider/overall deadlines below the 30-second host budget, and exposes provider failures/deferred work as degraded scheduler health. Database/initialization/job infrastructure failures remain non-2xx. Post-deploy production smoke passed, including authenticated dry-run; a real reminder execution completed in 462 ms with `failed=0`, `deferred=0`, Twilio reported paused, and a fresh healthy durable heartbeat at `2026-07-16T15:49:14.761Z`. The final deployment then returned a safe `recent_success` result in 377 ms with no error-level or 5xx Vercel logs.

A separate July 2026 full UI/UX upgrade track has started (owner-approved phased plan: ops hygiene, design system, shifts rework, all-staff week grid, blocked time rework, calendar polish, backend hardening, app-wide sweep). Upgrade Phase 0 (ops hygiene) is deployed to production and verified; the owner confirmed the repository's public visibility is intentional. Upgrade Phase A (design system foundation) is implemented, verified, and committed locally. The July 5 schedule-period UI addendum was reviewed by the owner and REJECTED as confusing; after a mockup-first redesign cycle (3-agent design debate, Fresha/competitor research, three published clickable mockups), the owner approved the "Team Week" direction — a Fresha-style team-week grid (barbers × real dated days) riding the existing per-date shift-override APIs — which replaces the schedule-period UI and pulls the shifts-rework + all-staff-week-grid phases forward. Team Week is implemented, adversarially reviewed (booking-safety fix C1 verified against public availability), QA'd 30/30 headed, and ships to production together with Phase A in the July 10 push (owner-directed).

The remaining upgrade phases (E blocked-time rework, F calendar polish, G backend hardening, H testing expansion, I final app-wide sweep) were executed in a single owner-directed July 10-11 session and are PUSHED AND LIVE — deployed to production on master (aliased to leasidefades.com / www.leasidefades.com) after the owner's explicit go, and verified against the live environment: read-only production smoke (18 availability-consistency probes + owner schedule-vs-availability cross-check) and a 300-request / concurrency-15 read stress run both passed with 0 failures, and Vercel reported zero runtime errors for the deployment. Each phase ran the full protocol: implement, adversarial multi-agent review, fix, gates (typecheck / 589 tests / lint 0 errors / build), and headed localhost QA.
- Phase E (blocked-time rework): the owner chose "hybrid B" — a plain-language Blocked-time screen (grouped Today/This week/Upcoming rows, scope filter pills, search, From/To range, live-sentence dialog) plus a "Block part of this day" entry from the Team Week grid. A CRITICAL white-screen (clearing the day field crashed with an unguarded date parse) was caught in review and fixed.
- Phase F (calendar polish, no redesign): blocked-overlay times clipped to the visible day, en-CA→en-US time formatting, focus-visible rings + aria-labels on slots/booking cards, mobile topbar/gutter/z-index fixes.
- Phase G (backend hardening): transactional weekly-schedule save via a new POST /api/admin/schedule/weekly-batch (one Postgres transaction, per-row fallback only on 404); not_working made absolute regardless of override row order with a deterministic override ORDER BY; seeder idempotency; "coming up" return-date now resolves the next actually-working day; dead schedule-period helpers removed; react-hooks/purity+immutability restored to error.
- Phase H (testing expansion): engine-parity property tests (200 seeded worlds cross-checking the Team Week grid resolver against the booking engine, with the shift_override_type enum order pinned and DST scenarios), a repeatable local-only Team Week lifecycle QA runner (npm run qa:teamweek-lifecycle, row-count-to-baseline cleanup), and a read-only production-smoke availability-vs-schedule cross-check.
- Phase I (final sweep): a11y/contrast/copy/mobile polish on Team, Blocked-time, and Dashboard (WCAG-AA muted text, ≥40px mobile touch targets, aria-pressed toggles, branded remove-barber dialog replacing window.confirm, plain-language copy). Marketing and the calendar grid were left untouched.

Production was exercised READ-ONLY only during this session; no writes and no deploys. Remaining before launch sign-off: owner preview → owner-approved `git push` (auto-deploys prod) → post-push production smoke + Vercel runtime-log check → walk `docs/OWNER_SIGNOFF_CHECKLIST.md`.

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
- Phase 10 portable reminder job CLI, customer 2-hour reminder dispatch, duplicate prevention, stale booking re-checks, historical 24-hour reminder-log compatibility, and repeatable Phase 10 real-route QA runner.
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
- Service reconciliation must use name/category/price/duration and owner approval, not count alone. The repo seed catalog now contains 38 services after the owner-approved Men's Color Root Touchup addition.
- Booking confirmations now notify customer SMS/email and assigned barber SMS/email when contact info exists. Owner/admin awareness is dashboard-first through the in-app Dashboard Notification Center, not outbound owner/admin email.
- `/admin/dashboard` now presents a Fresha-inspired operating dashboard with tracked service-snapshot revenue from stored booking service price snapshots, Week/Month/Year/All time period controls, upcoming confirmed/cancelled appointment trends, compact notification health, recent appointment activity, and 30-second polling that preserves the last good snapshot on refresh failure.
- Local dashboard visual QA can now be seeded with `npm run qa:phase12-dashboard-fixture`, which is guarded to local development databases and creates priced confirmed/completed/cancelled/no-show/rescheduled/source-varied bookings for chart tuning.
- Dashboard revenue means tracked appointment service-snapshot value from appointments that have happened: completed bookings plus past confirmed bookings, summed from immutable `booking_services.price_cents` snapshots on the appointment's Toronto local date. It is not payment/POS revenue, does not create payment records, excludes future confirmed bookings, and excludes cancelled/no-show bookings.
- Booking details now support a role-scoped Complete action for current or past confirmed appointments. Owner/admin users can complete any scoped booking; barber users can complete only their own booking. Completion sends no lifecycle notification and leaves availability correctness anchored on the existing confirmed-booking blocker rule.
- The premium dashboard redesign is the intended production dashboard surface. A read-only production dashboard snapshot on May 5, 2026 previously returned service-snapshot value data; the current dashboard reports tracked service-snapshot revenue in the selected Week/Month/Year/All time period and defaults to the latest reportable historical revenue date when no anchor is chosen.
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
- `/admin/shifts` now uses a staff-first visual weekly timeline for recurring schedules: pick one staff member, drag or resize 15-minute-snapped shift blocks, inspect exact start/end/location values, duplicate or copy shifts to other days, review weekly hours/effective dates, save changes explicitly, and use a separate Overview tab for team scanning. Tablet/mobile screens use compact day cards with the same exact time/location/copy/delete controls because precision drag editing is poor on small screens. The visible one-off override workspace remains removed from Staff Shifts; one-day exception editing stays in `/admin/calendar` barber headers. The builder displays the latest dated recurring pattern when multiple active effective ranges exist for the same staff member, avoiding duplicated day windows in the editor.
- `/admin/team` now gives owner/admin users a full staff-management surface. Owners/admins can upload a JPG/PNG/WebP profile photo through Vercel Blob, enter barber name/email/phone, assign locations, define required 15-minute-aligned weekly hours, and create the barber in one transaction with location assignments, all active services, recurring shifts, pending linked barber user, and invite token. Created barbers appear immediately in team list, admin calendar options, shifts context, public booking catalog, and public availability.
- Team removal now guards historical integrity: future confirmed bookings block removal with `409`, while successful removal deactivates the barber, linked users, and active sessions, hiding the barber from future admin/public selection while preserving historical appointments.
- Local repeatable QA for this flow exists as `npm run qa:phase12-team-management`, guarded to local databases and using `TEAM_PROFILE_IMAGE_UPLOAD_MODE=mock` for Blob upload API coverage without external writes.
- `/admin/dashboard` notification health now summarizes delivery mode, success rate, reminder queue, failed/skipped counts, recent delivery rows, provider/error details, and SMS/email badges.
- Notification Center failed rows are classified as active delivery issues vs historical audit entries. Past Resend/domain verification failures stay in Failed history but no longer dominate the main dashboard once they are no longer actionable.
- Public Fresha booking fallbacks were replaced with the custom booking flow at `https://leasidefades.com/book`, with a staff login link exposed in the public footer.
- Public `Book Now` CTAs now open `/book` directly instead of a location dropdown; location selection remains inside the booking flow, while `Call` CTAs remain location-specific.
- Vercel production routing is configured for `/book`, `/booking`, and `/admin` while `/api/*` remains on the Express serverless route.
- Vercel project `owenjalalis-projects/leaside-fades` is linked and deployed. `leasidefades.com` is live on Vercel production.
- Production PostgreSQL is connected through the Vercel Neon integration `leaside-fades-db`. Migrations and the static owner-approved seed have been applied.
- Production `/api/booking/catalog` returns the launch catalog after the Men's Color Root Touchup reseed: 2 locations, 3 service categories, 38 services, and 5 barbers.
- The public marketing Services section derives from the same launch catalog source as booking. Source data now contains 38 services: Men 16, Women 14, Boys 8, with booking prices and durations displayed.
- Production owner login has been created for `owner@leasidefades.com` and verified through the live admin auth/session API. The temporary generated password is stored only in ignored local launch output and must be rotated after owner handoff.
- Observed launch recurring shifts from the Phase 11 Fresha inspection were entered as the initial production schedule after the Phase 13 launch "Go"; after later owner/admin schedule edits the owner-visible production schedule API currently returns 27 active recurring shifts, with Yogesh remaining Millwood-only.
- Production availability smoke check for Men's Cut on 2026-05-02 returned bookable availability: Eglinton has Sam To slots only, and Millwood has Yogesh Kumar, Laura Nguyen, and Shayan Hussain slots.
- Playwright verified the live `/admin/calendar` frame at 1912x970, 1440x900, 1280x720, and mobile width. The page no longer body-scrolls, the left rail is not clipped, Laura remains visible/reachable, the desktop drawer opens as a split pane, and the internal board scroll reaches the weekday 7:00 PM boundary.
- Playwright MCP and headless Chrome CDP stress-tested the local rebuilt `/admin/calendar` at 320x568, 340x600, 340x720, 375x667, 390x844, 414x896, 768x1024, 1280x720, 1440x900, and 1920x900. The board retained visible 44px slots, horizontal staff-column reach, vertical closing-boundary reach, slot-tap creation, topbar Add creation, framed drawers, and stable filter open/close behavior without creating appointments. Follow-up tablet checks at 744x860 verified the Sam-only Eglinton board opens at 10:00 AM after context changes, labels as `1 staff`, and no longer looks collapsed at the 7:00 PM boundary.
- Backend admin/session and public booking tests now freeze their fixture dates so session cookies do not expire against the real system date and May 2026 booking fixtures do not become "past dates" as the wall clock advances.
- A secured `GET /api/jobs/send-reminders` endpoint exists for reminder schedulers and requires `CRON_SECRET` before it will run. Vercel Hobby blocked the desired five-minute Vercel Cron registration, so production reminders use an external scheduler. The current quota-safe target cadence is every 30 minutes.
- cron-job.org job `7551064` is repaired and enabled as the primary external scheduler at a quota-safe 30-minute cadence. `.github/workflows/send-reminders.yml` remains as a free backup/manual scheduler path using repository secret `LEASIDE_REMINDER_CRON_SECRET`; the secured reminder endpoint's heartbeat cadence guard prevents duplicate reminder sends.
- Vercel production now contains encrypted Brevo configuration, uses the verified `mail.leasidefades.com` sender, has no Leaside Fades `RESEND_API_KEY`, and explicitly pauses Twilio at the application layer. A fresh controlled Brevo message was accepted and confirmed Delivered; raw key material and test contact details are intentionally not stored in git.
- Phase 13 import tooling now provides guarded dry-run/apply commands for the May 1-June 30, 2026 Fresha import window. Apply mode requires a reviewed report confirmation, and imported bookings use `source = "imported"` without lifecycle notifications or reminder jobs.
- Read-only Fresha calendar extraction for May 1-June 30, 2026 completed through Playwright MCP for both locations and all visible service providers. It found 55 Fresha booking blocks, transformed them into 53 appointment candidates after grouping stacked services, and generated `output/fresha-import/fresha-import-review-2026-05-01-to-2026-06-30.md`.
- Two owner-approved test bookings that blocked import were marked `cancelled` in production: Owen/Yogesh/Millwood and Ethan/Laura/Eglinton on May 1.
- The May 1-June 30, 2026 Fresha appointment import has been applied to production: 53 confirmed bookings were inserted with `source = "imported"`, no immediate lifecycle notifications/reminder jobs were sent, and a post-apply dry-run reported 53 duplicates with 0 new imports and 0 blocked rows.
- Local Playwright QA for the calendar repair used a fresh Express app on port `3005` because the stale port `3000` process returned `Service is currently unavailable.` A local-only owner login for `nmatto866@gmail.com` was bootstrapped through `npm run db:seed:dev-owner`; its generated password was not stored in repo files.
- May 20, 2026 production incident investigation found DB-backed booking/admin endpoints failing while the static `/api/health` route still returned 200. Vercel logs showed PostgreSQL queries failing with Neon compute time quota exhaustion. The code now makes `/api/health` database-aware and throttles the secured HTTP reminder job to a 30-minute default DB cadence before opening a connection. Production still requires restoring/upgrading the Neon/Vercel Postgres quota or plan before catalog, login, and appointment visibility can recover.

## Next Recommended Task

Continue Phase 12/13 by monitoring external reminder scheduler history after the 2-hour-only reminder correction, verifying Google/social production links, completing owner password handoff/rotation, and obtaining final owner signoff.

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
- Customers can book only on open business days and only within saved barber shifts or one-off add overrides.
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
- SMS provider: Twilio, independently pausable with `SMS_DELIVERY_MODE=paused`.
- Email provider: Brevo transactional email.
- Soft migration from Fresha is preferred for launch.
- Phase 1 intentionally does not seed real recurring barber shifts because real schedules are unknown.
- Phase 5A chose custom session auth. Existing `users` rows without `password_hash` cannot log in until bootstrapped, reset, or invited.
- Admin sessions use a 30-day sliding inactivity window and HTTP-only `SameSite=Lax` cookies with `Secure` enabled in production.
- Phase 5B password reset links expire after 45 minutes, use opaque random tokens, and persist only SHA-256 token hashes.
- Password reset delivery uses Brevo in production and dev-mode logging outside production.
- Phase 5C barber invites expire after seven days, use opaque random tokens, and persist only SHA-256 token hashes.
- Barber invite delivery uses Brevo in production and dev-mode logging outside production.
- Phase 12 expands Phase 5C into an owner/admin-only `/admin/team` UI. Barber users cannot see the Team rail item and backend team routes remain owner/admin-only.
- Production barber profile uploads require a configured Vercel Blob store and `BLOB_READ_WRITE_TOKEN`. Local QA can set `TEAM_PROFILE_IMAGE_UPLOAD_MODE=mock`.
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
- `/admin/shifts` recurring weekly schedule editing now supports draft-only drag, drop, and resize interactions that snap to 15-minute local-time boundaries before saving through the existing validated mutation APIs.
- Owner/admin users manage recurring shifts, one-off overrides, all barber blocks, location closures, and business closures.
- Barber users can view relevant schedule context and create/update/delete only their own barber-scoped blocked time.
- New or updated blocked times are rejected when they overlap existing confirmed bookings in the affected scope.
- `npm run qa:phase7-schedule` is local/dev-only, refuses non-local database URLs, exercises real schedule routes, verifies blocked time affects availability, verifies barber scoping, and cleans up QA rows.
- Phase 7.5 introduces a migration for `booking_source = "walk_in"` and nullable customer phone/email.
- Public booking still requires customer contact. Staff-created appointments from the unified Add appointment workflow use `source = "manual"` and allow customer phone/email to be optional.
- Staff-created appointments bypass public online-availability limits: 30-minute notice, 30-day public window, open-day availability, and shift-fit are not required for staff. They still enforce active records, 15-minute boundaries, same-local-day admin board bounds, blocked time/closures, role scope, and no-overlap rules.
- No-show is a status transition only in Phase 7.5. It sends no notifications, charges no fees, and creates no payment records.
- Calendar booking drag/drop is a UI shortcut over the existing reschedule endpoint. One-day shift editing stays in the calendar header editor, while recurring shift drag/resize belongs to `/admin/shifts`; closures and blocked time are not drag/drop editable.
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
- `NOTIFICATION_DELIVERY_MODE=mock` is the local/default-safe mode; `dev` logs to the server console; `live` uses Brevo email and the independently configured Twilio SMS state.
- `npm run qa:phase9-notifications` is local/dev-only, refuses non-local database URLs, forces mock delivery, uses local-only contact fixtures, verifies create/cancel/reschedule logs, verifies idempotency/skipped-contact behavior, verifies contacted walk-in confirmation attempts, verifies no raw token persistence, and cleans up QA rows.
- Phase 10 reminders are invoked through `npm run notifications:send-reminders`; Phase 13 adds a secured `GET /api/jobs/send-reminders` wrapper for production scheduler invocation.
- Phase 10 reminders are customer-only SMS/email attempts for confirmed `source = "public"`, `source = "manual"`, and `source = "walk_in"` bookings when customer contact exists.
- Phase 10 excludes cancelled, completed, no-show, and imported bookings from reminder sends. Walk-ins without customer contact log skipped attempts when due.
- Reminder due-window defaults are 60 minutes lookback and 15 minutes lookahead, configurable through `REMINDER_JOB_LOOKBACK_MINUTES` and `REMINDER_JOB_LOOKAHEAD_MINUTES`.
- Reminder jobs re-check current booking status, source, and appointment start time before sending so rescheduled bookings receive reminders for the new appointment time only.
- Reminder messages do not include customer management links because raw cancellation/reschedule tokens cannot be reconstructed from hashes.
- Sent, skipped, and pending reminder notification rows remain idempotent on duplicate job runs; failed provider rows are retryable with the same idempotency key.
- `npm run notifications:check-live-config` verifies production database/Brevo configuration and requires Twilio credentials only when SMS is live.
- Production reminder scheduler guidance lives in `docs/PRODUCTION_REMINDER_JOBS.md`; the recommended cadence is every 30 minutes during the Toronto business-hours window with the default 60-minute lookback and 15-minute lookahead.
- `npm run qa:phase10-reminders` is local/dev-only, refuses non-local database URLs, forces mock delivery, creates real public booking fixtures through Express routes, verifies 2-hour reminders, no generated 24-hour reminder rows, duplicate prevention, cancelled/rescheduled booking behavior, failed SMS retry, and cleans up QA rows.
- Phase 12 launch correction: Yogesh Kumar is strictly Millwood-only for launch. He must not be bookable at Eglinton, even if older Fresha notes or repo docs imply otherwise.
- Phase 11 public/admin Fresha inspection found Millwood staff listed as Laura, Yogesh, and Shayan, matching current docs/seed data at first-name level.
- Phase 12 launch correction: the current Eglinton phone number is correct and not a launch blocker. Repo/env/static seed data use `+1 (647) 348-2200`.
- Phase 11 authenticated Fresha admin inspection found Service Menu has 38 services: Hair & Styling (Men) 16, Hair & Styling (Women) 14, Hair & styling (Boy 9 & Under) 8. Phase 12 reconciles services by name/category/price/duration, not count alone. The repo seed file now contains the owner-approved 38th service, Men's Color Root Touchup.
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
- Owner approval of the 38-service repo catalog after adding Men's Color Root Touchup by name/category/price/duration.
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
- rejects requested times not present in recalculated shift-driven availability
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
- live provider wrappers fail clearly when required Brevo or live-Twilio environment variables are missing; paused Twilio requires no live credential validation
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
- reminder templates retain 24-hour historical compatibility and render 2-hour customer messages with appointment details and no management links
- reminder dispatch sends only customer SMS/email, not barber/staff SMS
- missing or invalid reminder contacts log skipped attempts without provider calls
- provider failures are logged as failed reminder attempts without failing the reminder job
- failed reminder attempts retry on later job runs without resending already-sent channels
- reminder idempotency prevents duplicate sends and increments attempt counts
- reminder idempotency uses the current appointment start time occurrence marker
- stale reminder candidates are skipped when the booking has been rescheduled since the scan
- cancelled, completed, no-show, and imported bookings do not create reminder attempts; confirmed walk-ins are reminder-eligible when customer contact exists
- due-window scanning generates only 2-hour reminders
- live reminder configuration preflight reports missing Brevo variables and, only when SMS is live, missing Twilio variables before scheduler enablement
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

July 10, 2026 Team Week shifts grid files changed:
- `src/admin/SchedulePage.tsx` (team-week grid, cell menu, day dialogs, weekly-editor dialog; period chips + TemporaryScheduleDialog removed)
- `src/admin/admin-utils.ts` (resolveBarberDay, buildCoverPlan, buildTimeOffWritePlan, buildComingUp, describeWeeklyScheduleDraft, badge/sentence formatters)
- `src/admin/admin-utils.test.ts` (Team Week grid utilities suite; 553-test total)
- `src/index.css` (scoped `.shifts-saas` Fresha-style skin tokens/styles)
- `src/admin/AdminApp.tsx` (page title "Staff shifts" → "Scheduled shifts")
- `PROJECT_STATUS.md`

July 5, 2026 schedule-period addendum files changed:
- `src/admin/admin-utils.ts`
- `src/admin/admin-utils.test.ts`
- `src/admin/SchedulePage.tsx`
- `src/components/ui/Dialog.tsx`
- `PROJECT_STATUS.md`

July 2026 upgrade Phase A design system foundation files changed in the latest session:
- `src/index.css`
- `package.json`
- `package-lock.json`
- `src/components/ui/` (new directory: 26 primitives with colocated tests — `Button`, `Field`, `Input`, `Select`, `Textarea`, `Checkbox`, `DateInput`, `TimeInput`, `Dialog`, `Drawer`, `ConfirmDialog`, `toast`, `Popover`, `Tooltip`, `DropdownMenu`, `Switch`, `SegmentedControl`, `Badge`, `Avatar`, `Card`, `Notice`, `EmptyState`, `Skeleton`, `Spinner`, `status-tones`, `usePointerDrag`)
- `src/admin/AdminApp.tsx`
- `src/admin/SchedulePage.tsx`
- `PROJECT_STATUS.md`

July 2026 upgrade Phase 0 ops hygiene files changed in the latest session:
- `src/server/db/client.ts`
- `src/server/db/client.test.ts`
- `eslint.config.js`
- `package.json`
- `package-lock.json`
- `README.md`
- `docs/PRODUCTION_RUNBOOK.md`
- `docs/DECISIONS.md`
- `PROJECT_STATUS.md`

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

July 5, 2026 schedule-period addendum verification:
- `npm run typecheck` (passed), `npm run lint` (0 errors, 269 warnings — unchanged baseline, zero new), `npm test` (70 files, 529 tests passed), `npm run build` (passed)
- Two adversarial review agents (correctness/data-safety and UX/design-consistency) on the uncommitted diff; all MAJOR findings fixed and re-verified
- Headed Playwright QA against the local stack (vite :5174 → express :3000 → Docker Postgres): 18/18 checks passed, 0 real console errors; screenshots under `output/playwright/temp-schedule-qa/`
- Local dev data repair: Laura's shifts reset to one clean ongoing pattern after QA exposed overlapping sample-shift generations from repeated `db:seed:dev-shifts` runs (seeder inserts bypass API overlap validation — cleanup follow-up noted)

July 2026 upgrade Phase A design system foundation verification:
- `npm run typecheck` (`tsc --noEmit` passed with zero errors)
- `npm run lint` (exit 0; 0 errors, 269 warnings — one over the Phase 0 baseline of 268, from an intentional `react-hooks/exhaustive-deps` suppression in the toast timer reconciler)
- `npm test` (70 files, 519 tests passed; 163 new tests over Phase 0's 356, covering every new UI primitive plus 48 `usePointerDrag` state-machine tests)
- `npm run build` (`tsc && vite build` passed; pinned Radix UI packages verified compatible with React 19)
- Browser QA via Claude-in-Chrome against the local Vite dev server (`localhost:5174` proxying Express `:3000`): screenshots of `/admin/login`, `/admin/forgot-password`, `/admin/reset-password`, and `/admin/accept-invite` confirmed the rebuilt auth design; the marketing homepage screenshot is unchanged, proving the token additions are non-destructive to unmigrated screens.
- `/book` browser QA ran degraded: no local Postgres was available (no Windows service; Docker Desktop's engine did not come up), so `/api/health` returned 503 and the wizard showed its graceful "Booking service is currently unavailable." notice with the page shell fully rendered and un-broken. The Phase A diff touches no booking-flow files; a DB-backed `/book` pass is deferred to the next phase with a working local database.

July 2026 upgrade Phase 0 ops hygiene verification:
- `npx vitest run src/server/db/client.test.ts` (18 tests passed)
- `npm run typecheck` (`tsc --noEmit` passed with zero errors)
- `npm run lint` (exit 0; 0 errors, 268 warnings recorded as the temporary warnings-first baseline)
- `npm test` (44 files, 356 tests passed)
- `npm run build` (`tsc && vite build` passed)

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

- The admin Shifts surface is the owner-approved "Team Week" grid: whole-team rows × real dated days, Fresha-style commercial skin scoped to that screen only, with "Edit this day" vs "Set weekly schedule" as separate actions (never a recurrence prompt). Day-level changes write per-date shift overrides (`replaceAdminDayShift`, `not_working`); only the preserved weekly drag editor writes recurring shift rows.
- Time off must delete a date's stale add/remove overrides before creating `not_working` (booking-safety: unordered override application in the availability engine would otherwise let an old cover keep the barber publicly bookable on an "Off" day).
- Cover-a-location plans order home-location clears before the cover add per date, so an interrupted save reduces availability instead of double-booking the barber across locations.
- The July 5 schedule-period/temporary-schedule UI is superseded and removed from the interface; its pure helpers remain in `admin-utils.ts` (tested, currently unused by UI) pending a cleanup pass.
- Per-save Undo toasts from the approved mockup were deliberately dropped (risky inverse operations against live data); reversal is "Put this day back to normal" / "Remove" with confirm dialogs.
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
- Use additive-only Tailwind v4 `@theme` design tokens in `src/index.css` (green-tinted neutrals, ink text scale, status/tone palettes, control/card radii, shadow and motion tiers); no existing token or utility is redefined, so unmigrated screens render unchanged.
- Build admin UI primitives in `src/components/ui/` on exact-pinned Radix UI packages (dialog, popover, tooltip, dropdown menu, switch) with app-level `ToastProvider`/`ConfirmDialogProvider`, replacing inline notice state and `window.confirm` incrementally as screens are migrated.
- Implement drag interactions through one shared `usePointerDrag` state-machine hook (mouse/pen 4px activation, touch 250ms hold with 8px drift cancel, full listener teardown on every exit path) instead of per-feature pointer handlers.
- Keep the Bebas display font marketing-only; admin surfaces use the system font stack with weight/size hierarchy instead of uppercase/tracked headers.

## Do-Not-Break Rules

- Do not allow double booking for the same barber.
- Do not allow customer booking on closed business days or outside saved open-day shift/add-override windows.
- Do not trust client-side availability.
- Do not bury scheduling logic in UI components.
- Do not implement authentication before Phase 5.
- Do not mutate Fresha data without explicit authorization.
- Do not proceed to later phases without updating project status and docs.

## Latest Session Summary

July 8–10, 2026 Team Week shifts rework (owner-directed, mockups-first): the owner rejected the July 5 schedule-period UX ("looks terrible… confusing"), so the redesign ran as a design cycle before any code: a 3-agent design debate produced three directions; research agents reconstructed Fresha's Scheduled Shifts anatomy (cell menu with separate "Edit this day" vs "Set repeating shifts" — no recurrence modal) and competitor exception patterns (standing weekly template + dated exceptions beats series-editing for stable rotas); three clickable mockups were published as artifacts (team-week grid in Leaside skin, the same grid in a Fresha-clone skin, and a per-barber normal-week + changes-list). The owner picked the Fresha-clone Team Week grid with three riders: real profile photos, spacing discipline, and plain human language. Implementation replaced the shifts workspace in `SchedulePage.tsx` with the team grid (barbers × real dated days, week paging with widened fetch windows, location filter pills, search, per-row weekly-hours, photo avatars with neutral-skin variant, exception badges Covering/Changed/Off·reason with tooltips, "Coming up" plain-sentence strip, screen header + location legend), a cell menu (Edit this day / Add time off / Cover a location / Set weekly schedule / Put this day back to normal / Delete this shift), day dialogs with live 12-hour plain-English result sentences, and the preserved forest/mint weekly drag editor inside a bannered "every week from now on" dialog with a one-line schedule summary — all styled by a `.shifts-saas` scope in `src/index.css` (violet #6950f3 accent, hairline greys) that does not leak into the rest of the admin. Day writes ride the previously unused Phase 7 override APIs (`replaceAdminDayShift`, `createAdminShiftOverride` not_working, `deleteAdminShiftOverride`); the client day resolver mirrors `availability-engine.ts` semantics (including business/location all-day closures and partial-block notes after review fix M2). Adversarial review found and fixes closed: C1 CRITICAL (time off now deletes stale add/remove overrides first — otherwise unordered engine application could leave an "Off" barber publicly bookable), M1 (cover plans clear home before adding cover per date), M2, plus parity/stale-flash minors; a UX review pass then enforced the riders (12-hour times everywhere, neutral grid avatars, restored Delete-this-shift item, per-row pencil, weekly summary sentence, header/legend, badge and menu polish). Gates: typecheck clean, lint 0 errors (266 warnings, 3 under the 269 baseline), 553 tests across 70 files, build green. Headed Playwright QA passed 30/30 against the local stack with public-availability assertions per flow (edit-day slots confined to new window; cover = slots at cover location and zero at home; time off over a cover = exactly one not_working and zero slots at both locations; put-back restores baseline; snapshot-verified data restore; zero real console errors). Known cosmetic follow-ups: the Coming-up "back at {date}" sentence ignores a later time-off on the return day, and the unused schedule-period helpers await a cleanup pass. Pushed to production with the Phase A commits per the owner's explicit direction in this session.

July 5, 2026 Phase A addendum — schedule periods and temporary schedules (owner-requested): the `/admin/shifts` editor's confusing "Schedule range + Ongoing checkbox" was replaced with a schedule-period model. The header now shows one chip per schedule period (grouped by effective date range, chronological, temporary periods dashed and prefixed "Temp"); clicking a chip loads that period into the existing drag editor, guarded by the styled discard-confirm when the draft is dirty. The range panel became "Schedule period" with Starts + Ends (Never / On date) and a plain-language sentence preview. A new "Temporary schedule" dialog (dates, location with disabled not-assigned options, weekday toggles defaulting to the barber's existing working days, times, live plan preview) creates a date-bounded takeover: overlapping regular shifts are paused (head capped to the day before), each immediately followed by its resume row after the period, then the temporary shifts are created — all through the existing validated Phase 7 shift APIs, no backend or schema changes. "Delete period" (only for fully-bounded periods) computes the inverse: it removes the temporary shifts and re-merges paused head/resume pairs back into the original rows, with plan-driven confirm copy stating exactly what is and isn't restored. Pure helpers (`listWeeklyShiftPatterns`, `buildTemporarySchedulePlan`, `buildDeleteSchedulePeriodPlan`, `weekdaysInLocalDateRange`, labels) live in `admin-utils.ts` with 12 new tests. Two adversarial review agents ran against the diff; all findings were fixed (delete-period re-merge, onDiscard pattern-key omission, interleaved pause/resume ordering to bound partial-failure blast radius, dialog cancel-between-operations with a disabled X while saving, weekday defaults, copy/a11y minors). Gates: typecheck clean, lint 0 errors (269-warning baseline, zero new), 529 tests across 70 files, build green. Headed Playwright QA against the local stack passed 18/18 with zero console errors, covering login, temp-week creation for Laura (7 paused / 7 resumed / 5 temp rows verified via API), chip switching, discard confirm, delete-period re-merge back to 7 ongoing rows, mobile dialog, a churn stress loop, and snapshot restore. The QA also surfaced that repeated `db:seed:dev-shifts` runs stack overlapping sample-shift generations in the local dev database (direct inserts bypass API overlap validation); Laura's rows were reset to one clean ongoing pattern, and a seeder-idempotency cleanup is noted as a follow-up. Committed locally; not pushed pending owner approval.

July 4, 2026 upgrade Phase A design system foundation: `src/index.css` gained an additive-only Tailwind v4 `@theme` block defining the "Fresha calm, Leaside green" design language — green-tinted canvas/surface/border neutrals, a three-step ink text scale, success/danger/warning/info status pairs (warning adjusted to `#946618` for 4.57:1 contrast on its soft background), booking/service tone palettes (men/women/boys/mixed/no-show/completed/cancelled), `--radius-control` 10px / `--radius-card` 14px, card/pop/overlay shadow tiers, and fade-in/pop-in motion keyframes with `motion-reduce` opt-outs. A new `src/components/ui/` library holds 26 admin primitives with colocated static-markup tests: form controls (Button/IconButton, Field with render-prop aria wiring, Input, Select, Textarea, Checkbox, DateInput, snap-on-blur TimeInput), overlays on exact-pinned React-19-compatible Radix packages (Dialog, docked Drawer, Popover, Tooltip, DropdownMenu, Switch), app-level `ToastProvider`/`useToast` and `ConfirmDialogProvider`/`useConfirm` (Promise-based, queued, danger-tone capable), and display pieces (SegmentedControl, Badge, Avatar, Card/Metric, Notice with role-per-tone, EmptyState, Skeleton, Spinner, status-tone maps). A shared `usePointerDrag` hook implements the drag state machine for later phases (mouse/pen 4px activation, touch 250ms hold with 8px drift cancel, idempotent listener teardown proven by a settle-effect invariant across 48 tests). As the prove-out, the four admin auth screens (`/admin/login`, `/admin/forgot-password`, `/admin/reset-password`, `/admin/accept-invite`) were rebuilt on the new primitives with a shared centered-card shell, and SchedulePage swapped its inline notice state for toasts and its blocked-time `window.confirm` for the styled danger confirm dialog. An adversarial multi-agent review round fixed a touch drift-exit listener leak in `usePointerDrag` and a toast info-icon color that collided with success green before gates ran. Verification passed: `npm run typecheck`, `npm run lint` (0 errors, 269 warnings), `npm test` (70 files, 519 tests), `npm run build`, and browser QA screenshots (new auth design confirmed; marketing homepage unchanged; `/book` shell rendered gracefully degraded because no local Postgres was available). Owner sign-off items: the login inactive-account notice now uses tone `warning`, and the blocked-time delete confirm copy reads "This frees the time for online booking again." Committed locally; not pushed pending owner approval.

July 3, 2026 upgrade Phase 0 ops hygiene: `normalizeDatabaseUrl()` in `src/server/db/client.ts` now rewrites `sslmode=require` to `sslmode=verify-full` on `DATABASE_URL` before pool creation, silencing the once-per-cold-start node-postgres SECURITY WARNING that marked healthy requests `[error]` in Vercel logs (863 occurrences since May 1); a `DATABASE_SSL_MODE` env var overrides the normalization and unrecognized override values are ignored rather than spliced into the URL. The warning trigger was verified at its source (`pg-connection-string` warns for `prefer`/`require`/`verify-ca` but not `verify-full`) and covered by 18 unit tests in `src/server/db/client.test.ts`. ESLint now exists as flat config (`eslint.config.js`, eslint@10.6.0 + typescript-eslint@8.62.1 + eslint-plugin-react-hooks@7.1.1) scoped to `src/**/*.ts(x)` with non-type-checked presets, plus new `npm run typecheck` and `npm run lint` scripts; lint exits 0 with a documented warnings-first baseline of 268 warnings (five preset rules downgraded to warn, none off; `react-hooks/purity` × 2 and `react-hooks/immutability` × 1 are the first to restore to error in a later phase). README.md was rewritten to describe the real booking platform (surfaces, stack, getting started, scripts, env vars, docs index, deployment, public-repo secrets policy), docs/PRODUCTION_RUNBOOK.md gained a Weekly Health Check section (production smoke, reminder heartbeat, Vercel log scan), docs/DECISIONS.md gained the sslmode normalization ADR, and stray root screenshot PNGs were removed. Verification passed: focused client tests (18), `npm run typecheck`, `npm run lint` (exit 0), full `npm test` (44 files, 356 tests), and `npm run build`. Deployed with owner approval as commits `c9e16c7`/`db069c6`/`c814a7e` → production deployment `dpl_A2pTzjJx6ggiSFUgm7ejnDuB6PNp` (READY, aliased to `www.leasidefades.com`). Post-deploy `npm run qa:production-smoke` passed, and Vercel runtime logs on the new deployment show the `/api/health` cold start at info level with zero `SECURITY WARNING` entries and an empty error/warning stream — the sslmode fix is confirmed in production. The owner confirmed the repo's public visibility is intentional.

June 25, 2026 shift editor redesign: `/admin/shifts` now presents a Fresha-style visual weekly timeline for recurring schedules on desktop with Mon-Sun columns, 15-minute snapping, draggable shift blocks, pointer resize handles, exact edit inspector, duplicate/copy/delete/clear-day actions, and a compact day-card fallback for tablet/mobile. Draft edits remain local until `Save changes`; the existing schedule validation and save-plan diff remain the source of truth. Admin calendar appointment colors are higher contrast: Men blue, Women pink, Boys yellow, Mixed violet, no-show solid red, completed green, and cancelled grey. Verification passed before push: targeted admin schedule/availability/booking/reminder tests (7 files, 98 tests), full `npm run test` (43 files, 338 tests), `npm run build`, and Playwright CLI local browser smoke for `/admin/shifts` desktop/mobile, `/admin/calendar` colors, `/book`, `/api/booking/catalog`, `/api/health`, and unauthenticated reminder protection.

June 24, 2026 booking correction pass: public availability now treats business hours as a closed-day gate and uses saved barber shifts/one-off add overrides as the bookable window on open days, including shifts before posted opening. Booking creation has a regression test proving those generated pre-opening slots can be booked transactionally. The public booking UI now refreshes availability when entering the time step, on date/location/service/barber changes, window focus, and while the time step stays open; stale selected slots are cleared. `/admin/shifts` now has Starts/Ends/Ongoing range controls, split-shift chips, inline validation for bad ranges/overlaps, and save blocking while the weekly draft is invalid. Reminder generation and dashboard previews now create only 2-hour customer reminder work, while 24-hour reminder rows remain historical-log compatible. Calendar cards now use Men/Women/Boys/Mixed service-category tones unless cancelled/completed/no-show status overrides them. The seed catalog now includes `Men's Color Root Touchup` at 45 minutes and `from $65`; Sam's public role copy is `Head Barber`; the payment FAQ says cash, debit, Apple Pay / Google Pay, and `No credit.` Verification passed: targeted availability/booking/reminder/admin/public UI utility/seed tests (7 files, 143 tests), full `npm run test` (43 files, 334 tests), `npm run build`, affected booking/marketing tests after the TypeScript fixture correction, and `git diff --check`.

June 24, 2026 production rollout: correction commits `bcd7368` and `a7af9ce` were pushed to `origin/master`, Vercel production deployment `https://leaside-fades-73dy26jah-owenjalalis-projects.vercel.app` was aliased to `https://www.leasidefades.com`, and the production static reseed completed with 2 locations, 5 barbers, 38 services, and 190 barber-service capabilities. Production smoke passed for `/book`, database-aware `/api/health`, `/api/booking/catalog`, protected admin routes, unauthenticated reminder rejection, and authenticated reminder dry-run. Direct catalog smoke confirmed 2 locations, 3 categories, 38 services, 5 barbers, and `Men's Color Root Touchup` at 45 minutes/from $65. Owner-authenticated admin API verification confirmed owner login, 38 owner-visible services, root-touchup service visibility, 27 active recurring shifts, and zero active Yogesh Eglinton shifts. The live reminder endpoint reported `recent_success` from a real run at `2026-06-24T17:00:31.780Z`, and `npm run qa:production-reminder-heartbeat` passed with that post-deploy heartbeat.

Phase 12/13 launch cutover implementation is in progress. The admin calendar separates public availability from staff scheduling authority while preserving no-overlap and blocked-time checks. Josef has been added as an Eglinton-only launch barber, and production staff/catalog data is synced to 5 barbers and 38 services after the Men's Color Root Touchup source update. Account recovery and staff onboarding now have production Resend delivery, production-only `APP_URL` enforcement, and usable `/admin/forgot-password`, `/admin/reset-password`, and `/admin/accept-invite` screens. Public booking and customer reschedule requests now reject date-only appointment start times before scheduling validation. Verification for the account-recovery hardening passed: targeted account/booking tests (38 tests), full `npm run test` (35 files, 259 tests), `npm run build`, `npm run notifications:check-live-config` with complete production-style fake env values, `npm run qa:phase5-auth`, `npm run qa:phase9-notifications`, and `git diff --check`. Vercel production has encrypted `APP_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, and `NOTIFICATION_DELIVERY_MODE` entries; the CLI can confirm the keys exist but cannot expose sensitive values for a local full preflight. Remaining launch items are owner-facing operations: owner password handoff/rotation, owner verification of shifts/services/staff contacts, live owner-approved reset/invite smoke, and final owner signoff.

May 20, 2026 outage response: production `/api/booking/catalog` and valid admin login attempts returned 500 because Vercel logs showed the Neon/Postgres project exceeded compute time quota. Added DB-aware health checks, a quota-safe HTTP reminder scheduler guard, tests for these behaviors, and runbook updates. The Vercel Neon integration is now on Launch, and non-mutating production smoke passes for the booking shell, database-aware health, launch catalog, invalid admin login handling, protected admin routes, and unauthenticated reminder job protection.

Follow-up hardening added a non-mutating `npm run qa:production-smoke` runner to prove the exact production recovery criteria after the database quota/plan is restored: `/book` shell loads, `/api/health` returns database-ready 200, `/api/booking/catalog` returns the launch catalog, invalid admin login returns 401 instead of 500, protected admin routes remain protected, and the reminder job endpoint rejects unauthenticated calls before database work. The secured reminder endpoint now also supports authenticated `?dryRun=1` checks so cron secret/cadence verification can happen without sending live reminders, and `npm run qa:production-reminder-scheduler` checks Vercel logs for a real post-restart `200` reminder scheduler run. The first production run passed on May 20, 2026 after the Neon Launch upgrade. As of the June 24 correction deployment, the smoke expects the 2-location/3-category/38-service/5-barber launch catalog and verifies Men's Color Root Touchup.

Reminder scheduler monitoring now has a durable heartbeat path. Real reminder job runs record success/failure rows in `scheduler_job_runs` through migration `0006_phase_12_scheduler_job_runs`, and `/admin/dashboard` includes reminder scheduler state under Notification health so owners can see healthy, stale, failing, or unknown scheduler status without relying only on Vercel log checks. The dashboard tolerates the new table missing until the migration is applied, so deployment and migration can be sequenced safely.

Production migration `0006_phase_12_scheduler_job_runs` was applied on May 20, 2026 after deployment `dpl_E2BCGQWsQqdyiSiLk9LVXwUe8xXZ` reached Ready. Post-migration non-mutating production smoke passed.

Incident recurrence hardening now includes a bounded read-only production stress gate as `npm run qa:production-read-stress`. On May 20, 2026 it passed against `https://www.leasidefades.com` with 32 total non-mutating requests at concurrency 4: `/book`, database-aware `/api/health`, `/api/booking/catalog`, `/api/booking/availability`, and invalid admin login all returned expected statuses with zero failures.

Before the Vercel-side secret rotation, `npm run qa:production-reminder-scheduler` found 11 recent cron hits to `/api/jobs/send-reminders`, all returning `401`, with the latest at `2026-05-20T17:34:56.786Z` on deployment `dpl_BULeBJBCg1K7VKQhXCYRuyjAVFZu`. That confirmed cron-job.org was reaching production but its Authorization header was missing, stale, or not matching the then-current Vercel Production `CRON_SECRET`.

To remove manual ambiguity from the cron-job.org restart, operations now include `npm run qa:cron-job-org-reminder` and `npm run ops:cron-job-org-reminder-repair`. With a local `CRON_JOB_ORG_API_KEY` and current Vercel Production `CRON_SECRET`, the verifier checks job `7551064` for enabled state, URL, GET method, Authorization bearer header, and 30-minute cadence; the repair command verifies the supplied secret against the production dry-run endpoint before patching those fields without storing or printing the secret.

Vercel production `CRON_SECRET` was rotated on May 20, 2026, production was redeployed to `https://leaside-fades-gcyyvwtuy-owenjalalis-projects.vercel.app` and aliased to `https://www.leasidefades.com`, and authenticated reminder dry-run passed with the fresh secret. The ignored local `.env.production.local` file now has the current ops copy of `CRON_SECRET`, but cron-job.org still needs its Authorization header updated to match.

At that point, the external reminder scheduler was still not recovered after the Vercel-side secret rotation. On May 20, 2026, `npm run qa:production-reminder-scheduler` found 13 recent cron hits to `/api/jobs/send-reminders`, all returning `401`, with the latest at `2026-05-20T17:40:04.532Z` on deployment `dpl_BULeBJBCg1K7VKQhXCYRuyjAVFZu`. That confirmed the remaining break was the external cron-job.org job/header, not the production reminder endpoint's then-current secret.

Reminder recovery verification now has a second gate: `npm run qa:production-reminder-heartbeat` checks the durable `scheduler_job_runs` table for a real reminder job success heartbeat, optionally bounded by `PRODUCTION_REMINDER_HEARTBEAT_SINCE=<restart ISO timestamp>`. With `PRODUCTION_REMINDER_HEARTBEAT_SINCE=2026-05-20T17:43:00.000Z`, the gate failed because no reminder scheduler heartbeat has been recorded. That confirms dry-runs and unauthorized cron-job.org `401`s are not masking a successful real reminder run.

`npm run qa:production-reminder-scheduler` now also requires the durable success heartbeat by default. On May 20, 2026 it found Vercel logs with `{"200":1,"401":14}`, but still failed because the heartbeat state was `unknown`. This prevents an authenticated dry-run or off-cadence skip from falsely marking the external reminder scheduler recovered.

May 20, 2026 scheduler recovery follow-up added a free GitHub Actions production reminder scheduler workflow at `.github/workflows/send-reminders.yml` because the cron-job.org API key is not available locally. The workflow calls the same secured production reminder endpoint at UTC minute `13` and `43`, uses repository secret `LEASIDE_REMINDER_CRON_SECRET`, and fails on non-2xx responses. The GitHub repository secret was set from the current ignored local ops copy of the production `CRON_SECRET`. The HTTP reminder guard now uses the durable success heartbeat for live cadence decisions so delayed authorized scheduler calls run when stale and duplicate calls skip with `recent_success`. GitHub Actions run `26182066002` succeeded at `2026-05-20T18:30:23Z`: production scanned 3 reminder candidates, attempted 6 notifications, sent 1, failed 0, skipped 5, and recorded a durable success heartbeat at `2026-05-20T18:30:24.875Z`. The production reminder scheduler gate passed with `PRODUCTION_REMINDER_LOG_TARGET=leaside-fades-3efvguugx-owenjalalis-projects.vercel.app` and the heartbeat gate passed with `PRODUCTION_REMINDER_HEARTBEAT_SINCE=2026-05-20T18:25:00.000Z`. Later scheduled GitHub runs at `2026-05-20T20:34:30Z` and `2026-05-20T22:24:45Z` proved GitHub scheduled workflows can start too late for wall-clock boundary enforcement, so the live scheduler decision was changed from minute-boundary based to heartbeat-cadence based.

The delayed-scheduler fix was deployed to production deployment `dpl_G97UkyhUeEvva82d3HHwU8JwCkz7` at `https://leaside-fades-fjnls5q0t-owenjalalis-projects.vercel.app` and aliased to `https://www.leasidefades.com`. Manual GitHub Actions run `26196813789` on commit `b0f61c0` succeeded at `2026-05-20T23:53:22Z`; production scanned 0 reminder candidates, failed 0, and recorded a fresh durable success heartbeat at `2026-05-20T23:53:23.363Z`. Post-deploy production smoke passed, the production reminder heartbeat gate passed with `PRODUCTION_REMINDER_HEARTBEAT_SINCE=2026-05-20T23:50:00.000Z`, and the combined production scheduler gate passed against `PRODUCTION_REMINDER_LOG_TARGET=leaside-fades-fjnls5q0t-owenjalalis-projects.vercel.app`.

May 21, 2026 cron-job.org recovery completed after owner login to the cron-job.org console. Job `7551064` was enabled, kept on `GET https://www.leasidefades.com/api/jobs/send-reminders`, changed to every 30 minutes, and verified with saved responses. Because direct UI paste into the custom Authorization value was unreliable, production `CRON_SECRET`, the ignored local ops copy, and GitHub repository secret `LEASIDE_REMINDER_CRON_SECRET` were aligned to the bearer value already saved on cron-job.org, then production was redeployed to `dpl_Hj34nqVxNwjHUdZSvSyuDokJ6GPU` at `https://leaside-fades-9p9750fmx-owenjalalis-projects.vercel.app` and aliased to `https://www.leasidefades.com`. Authenticated production dry-run returned 200, GitHub Actions run `26249252689` succeeded at `2026-05-21T19:48:02Z` with `failed=0` and a durable success heartbeat at `2026-05-21T19:48:02.748Z`, production smoke passed, and the cron-job.org scheduled `4:00 PM America/Toronto` run reached production with HTTP 200 at `2026-05-21T20:00:09.567Z`. The 4:00 PM cron-job.org call did not create a new heartbeat because the 19:48 successful run already satisfied the 30-minute cadence guard; that is expected duplicate-scheduler behavior.

June 9, 2026 dashboard revenue update: `/admin/dashboard` now accepts `period=week|month|year|all-time` and `anchorDate=YYYY-MM-DD`, and the React dashboard shows one adaptive tracked-revenue card with Week/Month/Year/All time controls plus previous/next period navigation for bounded periods. Revenue is tracked from appointments that have happened: completed bookings plus past confirmed bookings, grouped by Toronto appointment date and summed from stored `booking_services.price_cents` snapshots; future confirmed bookings, cancelled bookings, and no-shows are excluded. Week uses seven daily buckets, Month uses all days in the anchor month, Year uses 12 monthly buckets, and All time spans the actor-scoped historical happened-appointment range with monthly buckets. When no anchor date is supplied for bounded periods, the server defaults the revenue period to the latest reportable historical appointment date so the dashboard pulls existing database history instead of showing an empty current week. From-price services count at the stored snapshot total with a dashboard caveat, and unpriced appointments are counted separately. `POST /api/admin/bookings/:bookingId/complete` lets owner/admin users complete scoped current/past confirmed bookings and barber users complete only their own; future, cancelled, completed, and no-show bookings reject completion. Verification passed: targeted admin/dashboard tests, full `npm run test`, and `npm run build`.

June 12, 2026 dashboard revenue correction: tracked-revenue queries now fetch the full selected revenue period instead of reusing the smaller dashboard-list cap. This fixes annual totals undercounting when a selected year contains more than 500 raw booking rows before revenue filtering. A regression test now covers 501 happened appointments in the same selected year so Year cannot silently diverge from All time for same-year data.
