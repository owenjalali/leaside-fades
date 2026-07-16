# QA Checklist - Leaside Fades Booking System

## Phase 0 - Planning

- [x] Product requirements documented
- [x] Architecture documented
- [x] Booking rules documented
- [x] Phase map documented
- [x] Edge cases documented
- [x] Open questions listed
- [x] Confirmed React Vite + Express stack documented
- [x] Auth provider comparison deferred to Phase 5

## Phase 1 - Database Schema + Seed Data

- [x] Drizzle configured
- [x] PostgreSQL connection configured through environment variables
- [x] Locations seeded
- [x] Business hours seeded
- [x] Barbers seeded
- [x] Barber-location assignments seeded
- [x] Service categories seeded
- [x] Services seeded
- [x] Service pricing fields support fixed and from pricing
- [x] Featured services are configurable
- [x] Booking/block/shift start-before-end constraints exist
- [x] Confirmed booking no-overlap strategy exists
- [x] Migration generated cleanly
- [x] Seed data validation test passes
- [x] Migration applied against local PostgreSQL
- [x] Seed script run against local PostgreSQL

## Phase 2 - Availability Engine + Tests

- [x] Single service availability works
- [x] Multiple stacked services work
- [x] Opening time slot works
- [x] Closing boundary works
- [x] Slot ending after closing is rejected
- [x] Less than 30 minutes from now rejected
- [x] More than 30 days ahead rejected
- [x] Existing confirmed booking blocks overlapping slots
- [x] Adjacent bookings are allowed
- [x] Cancelled booking frees slot
- [x] Barber-specific blocked time works
- [x] Location-wide blocked time works
- [x] Business-wide blocked time works
- [x] Split shifts work
- [x] Barber at two locations same day works
- [x] Barber with no shift has no availability
- [x] Any available barber works

## Phase 3 - Booking Creation

- [x] Booking creation recalculates availability server-side
- [x] Transaction prevents race-condition double booking
- [x] Confirmed booking exclusion/application checks work
- [x] Any Available assignment is deterministic
- [x] `booking_services` snapshots are created
- [x] Confirmed booking blocks future availability
- [x] Invalid slot returns clear error
- [x] Failed booking does not send notifications

## Phase 4 - Public Booking Flow

- [x] Customer can select location
- [x] Customer can select one service
- [x] Customer can stack services
- [x] Customer can choose barber
- [x] Customer can choose Any available barber
- [x] Customer sees available dates/times when DB shifts exist
- [x] Customer sees graceful empty/unavailable state when no availability or DB is unavailable
- [x] Customer enters name/phone/email
- [x] Customer sees price and Pay in shop
- [x] Customer confirms booking through DB-backed API adapter
- [x] Confirmation page displays correct details from the booking service response
- [x] Mobile layout works
- [x] Local/dev-only sample shifts are clearly marked and not part of production seed data
- [x] Full DB-backed browser booking manually completed against local PostgreSQL with migrated schema and clearly marked sample shifts
- [x] Confirmed browser booking blocks overlapping future availability for the assigned barber
- [x] Service list order verified from DB-backed catalog, with Men's Perm shown as the sixth men's option
- [x] Barber profile photos render on the barber selection step for Sam, Laura, Josef, Yogesh, and Shayon
- [x] Booking flow uses optimized barber avatar thumbnails instead of full-size original images
- [x] Weekly time picker shows seven visible days, skips past/out-of-window dates, and keeps the calendar selector available
- [x] Phone entry formats local numbers and includes a country/area code selector
- [x] Invalid email entry without `@` is rejected and blocks continuing

## Phase 5 - Auth + Roles

- [x] Custom session auth compared against Supabase Auth, Better Auth, and Clerk
- [x] Auth provider decision recorded in `docs/DECISIONS.md`
- [x] Owner can log in
- [x] Barber can log in
- [x] Owner sees all bookings through the Phase 5A protected read endpoint
- [x] Barber sees only own bookings through the Phase 5A protected read endpoint
- [x] Barber cannot access other barber booking data through protected admin endpoints
- [x] Misconfigured barber user without `barberId` receives no useful admin booking access
- [x] Session cookies are secure in production, HTTP-only, and `SameSite=Lax`
- [x] Protected admin activity renews both the stored session expiry and browser cookie expiry
- [x] Expired active admin workspaces redirect to login instead of showing raw backend auth errors inside booking forms
- [x] Unauthorized API requests are rejected
- [x] Local/dev-only owner bootstrap exists and refuses production/non-local databases
- [x] Password reset flow works
- [x] Forgot-password response is generic
- [x] Password reset tokens are hashed at rest
- [x] Password reset tokens are single-use
- [x] Expired password reset tokens are rejected
- [x] Successful password reset revokes existing sessions
- [x] Owner-managed barber onboarding works
- [x] Owner/admin can create a linked pending barber user
- [x] Owner/admin can assign barber locations
- [x] Barber users cannot create staff accounts
- [x] Invite tokens are hashed at rest
- [x] Invite tokens are single-use
- [x] Expired invite tokens are rejected
- [x] Accepted invite activates the linked barber user
- [x] Accepted invite allows barber login
- [x] Invited barber remains scoped to own bookings
- [x] Deactivated barber/user cannot access admin endpoints
- [x] Repeatable local/dev Phase 5 real-route QA runner exists as `npm run qa:phase5-auth`
- [x] Phase 5 QA runner validates owner login/session/logout, password reset/session revocation, owner-managed barber onboarding, invite acceptance, barber scoping, and deactivation through Express API routes
- [x] Phase 5 QA runner refuses non-local databases and captures reset/invite links only through local dev delivery logs

## Phase 6 - Admin Calendar

- [x] Month view works
- [x] Month view title stays anchored to the selected month while fetching the padded calendar grid range
- [x] Month next/previous controls navigate by real calendar months
- [x] Whole month date boxes, including blank cell space, open the exact date in day view
- [x] Month booking cards open booking details without also triggering the date-cell open action
- [x] Week view works
- [x] Day view intentionally deferred for Phase 6 MVP
- [x] List view works
- [x] Filter by date works
- [x] Filter by location works
- [x] Filter by barber works
- [x] Filter by status works
- [x] Booking details visible
- [x] Manual booking works
- [x] Cancel booking works
- [x] Reschedule booking works
- [x] Role permissions are enforced in calendar actions
- [x] Manual bookings require explicit barber assignment
- [x] Manual bookings use transactional no-overlap checks
- [x] Reschedule excludes only the booking being moved from its old-slot conflict check
- [x] Reschedule rejects service-changing payload fields with a clear 400 response
- [x] Valid reschedule still supports time, location, and barber changes
- [x] Transaction-bound availability/conflict reads avoid pg overlapping client-query warnings
- [x] Admin mutation Origin/Referer guard rejects invalid origins
- [x] Admin mutation Origin/Referer guard allows configured app and local dev origins
- [x] Public `/api/booking/*` remains unauthenticated
- [x] Public booking catalog and availability are unaffected by the admin mutation Origin guard
- [x] Repeatable local/dev Phase 6 real-route QA runner exists as `npm run qa:phase6-admin`

## Phase 7 - Shifts + Blocked Time

- [x] Owner can create recurring shift
- [x] Owner can create split shift
- [x] Owner can create one-off override
- [x] Staff Shifts weekly builder shows Weekly schedule and Overview only, with one-off override editing hidden from the visible UI
- [x] Weekly builder copy controls exclude the current day and avoid the old Day actions panel language
- [x] Overlapping same-barber shifts are rejected by default
- [x] Barber can manage own blocked time if allowed
- [x] Location closure blocks location
- [x] Business closure blocks both locations
- [x] Barber users cannot mutate shifts, overrides, other barber blocks, location closures, or business closures
- [x] Blocked times overlapping confirmed bookings are rejected
- [x] Schedule mutations use the admin Origin/Referer guard
- [x] Repeatable local/dev Phase 7 real-route QA runner exists as `npm run qa:phase7-schedule`

## Phase 7.5 - Calendar-First Operations

- [x] `/admin/calendar` uses a calendar-first day board
- [x] Owner/admin can view multi-barber calendar columns
- [x] Owner/admin day board shows all active barbers assigned to the selected location even when a barber has no shift
- [x] Barber users default to their own scoped calendar
- [x] Admin day board shows a full 12:00 AM through 11:00 PM operating surface
- [x] Admin day board default-scrolls to 9:00 AM while retaining scroll access to earlier hours
- [x] Admin day board uses denser 15-minute rows so desktop shows a Fresha-like 9:00 AM through 11:00 PM span
- [x] Green hover time labels remain visible over grey off-shift zones
- [x] Calendar booking cards visually distinguish confirmed, walk-in, no-show, completed, and cancelled bookings
- [x] Blocked time context appears on the calendar board
- [x] Booking detail opens in a side drawer from the calendar
- [x] Booking detail drawer can edit customer name, phone, email, customer notes, internal notes, date/time, barber/location, and selected services
- [x] Manual and walk-in creation are unified into one Add appointment workflow
- [x] Add appointment loads online availability suggestions for the selected barber/location/date/services
- [x] Add appointment can create staff bookings in grey off-shift/non-public times
- [x] Multi-service selection updates total duration, price summary, and calendar preview length
- [x] Add appointment drawer can create name-only staff appointments without phone/email
- [x] Add/edit appointment can add or clear customer phone and email
- [x] Add appointment drawer can create true walk-ins with `source = "walk_in"`
- [x] Add appointment drawer keeps the create action visible while available times and services scroll
- [x] Calendar appointment preview fills the selected barber/time duration instead of showing only a thin marker
- [x] Walk-ins use the existing transactional booking path
- [x] Walk-ins are stored as `source = "walk_in"`
- [x] Barber walk-ins are limited to the linked barber profile
- [x] Owner/admin walk-ins can target any active eligible barber
- [x] Walk-ins can be created in grey off-shift time by staff
- [x] Walk-ins still reject overlap, blocked-time, closure, inactive-barber, and spoofed-barber attempts
- [x] No-show status is supported for current/past confirmed bookings
- [x] Future, cancelled, completed, and already no-show bookings reject no-show transitions
- [x] Barber no-show actions are limited to their own bookings
- [x] Completed status is supported for current/past confirmed bookings
- [x] Future, cancelled, completed, and no-show bookings reject completion transitions
- [x] Barber complete actions are limited to their own bookings
- [x] Booking drag/drop calls the admin reschedule endpoint
- [x] Rejected drag/drop moves leave the booking in its original slot
- [x] Drag/drop can target grey off-shift time while blocked-time cells remain unavailable
- [x] Barber drag/drop cannot move bookings to another barber
- [x] Owner/admin cross-barber drag/drop uses backend staff-scheduling validation
- [x] Barber header `Edit shift` is available only for permitted users
- [x] One-day shift edits update the same schedule/availability model used by public booking
- [x] Repeatable local/dev Phase 7.5 real-route QA runner exists as `npm run qa:phase7-5-calendar`
- [x] Local Playwright admin login can use a fresh Express port when stale port `3000` is unavailable
- [x] Local/dev owner bootstrap supports QA login without storing temporary passwords in repo files

## Phase 8 - Customer Cancellation/Rescheduling

- [x] Cancellation token works
- [x] Invalid token rejected
- [x] Expired token behavior is correct if token expiry is implemented (not implemented by Phase 8 decision)
- [x] Reused token behavior is safe
- [x] Cancelled booking frees slot
- [x] Reschedule token works
- [x] Reschedule validates availability
- [x] Old slot is freed
- [x] New slot is blocked
- [x] Wrong token type is rejected for cancel and reschedule actions
- [x] Public booking tokens are stored only as hashes
- [x] Walk-ins do not generate customer management token hashes
- [x] Customer management UI routes load before `/book` wizard routes
- [x] Repeatable local/dev Phase 8 real-route QA runner exists as `npm run qa:phase8-customer-token`

## Phase 9 - Notifications

- [x] Twilio abstraction works behind provider interface
- [x] Brevo abstraction works behind provider interface (Resend retired from this project)
- [x] Twilio can be paused independently without initializing its SDK or creating repeated failed reminder attempts
- [x] Mock/dev modes work without live credentials
- [x] Live mode fails clearly when required credentials are missing
- [x] Booking confirmation logged
- [x] Cancellation logged
- [x] Reschedule logged
- [x] Customer SMS/email recipient rules enforced
- [x] Barber SMS recipient rules enforced
- [x] Barber booking-confirmation email recipient rule enforced when contact exists
- [x] Owner/admin outbound booking-confirmation email is disabled for launch
- [x] Owner/admin booking visibility is available through the in-app Dashboard Notification Center
- [x] Missing/invalid contact logs skipped attempts
- [x] Missing customer/staff booking-confirmation contacts log skipped attempts and do not fail booking creation
- [x] Failed notification attempts are logged
- [x] Notification idempotency keys prevent duplicate sends
- [x] Reschedule idempotency keys include an occurrence marker
- [x] Booking mutations dispatch notifications only after successful mutation
- [x] Failed booking mutations create no notification attempts
- [x] Notification delivery failure does not fail booking mutation
- [x] Staff-created walk-ins with customer phone/email create booking confirmation attempts
- [x] Staff-created walk-ins without customer contact still succeed and log skipped/missing-contact attempts
- [x] Raw customer management tokens are not persisted in notification metadata
- [x] Repeatable local/dev Phase 9 real-route QA runner exists as `npm run qa:phase9-notifications`

## Phase 10 - Reminder Jobs

- [x] 2-hour reminder job sends one SMS and one email
- [x] 24-hour reminder rows remain historical/read compatibility only and are not generated by reminder jobs
- [x] Reminders are not duplicated
- [x] Failed reminders are logged
- [x] Failed reminder sends retry on later job runs without resending successful channels
- [x] Missing/invalid customer reminder contacts log skipped attempts
- [x] Cancelled bookings do not receive reminders
- [x] Rescheduled bookings receive reminders for the new time only
- [x] Reminder jobs send customer SMS/email only
- [x] Reminder jobs include confirmed walk-ins when customer contact exists
- [x] Reminder jobs skip imported bookings
- [x] Live reminder configuration preflight exists as `npm run notifications:check-live-config`
- [x] Repeatable local/dev Phase 10 real-route QA runner exists as `npm run qa:phase10-reminders`

## Phase 11 - Fresha Inspection

- [x] Playwright MCP used read-only
- [x] Fresha calendar inspected read-only with authenticated owner-assisted admin session
- [x] Staff schedules inspected read-only for both locations
- [x] Location setup inspected read-only for both locations
- [x] Services inspected
- [x] Existing booking display inspected at report/table/status level without storing private customer details
- [x] Online booking, marketplace, link builder, and integration surfaces inspected read-only
- [x] No Fresha data mutated
- [x] Report created

## Phase 12 - Launch Prep

- [x] Phase 12 launch-prep source of truth documented in `docs/LAUNCH_PREP.md`
- [x] Production runbook documented in `docs/PRODUCTION_RUNBOOK.md`
- [x] Owner signoff checklist documented in `docs/OWNER_SIGNOFF_CHECKLIST.md`
- [x] Fresha source-of-truth rule documented with explicit launch overrides
- [x] Yogesh launch override applied to static seed data
- [x] Local/dev sample shifts do not create Yogesh Eglinton availability
- [x] Josef launch override applied to static seed data and launch staff sync
- [x] Public booking shows Josef at Eglinton and does not show Josef at Millwood
- [x] Josef availability follows saved shifts on open business days
- [x] Eglinton phone number treated as confirmed current value in env templates and seed data
- [x] Service reconciliation documented as name/category/price/duration based, not count-only
- [x] Customer/staff booking-confirmation notification tests and owner/admin dashboard visibility tests added
- [x] Notification metadata and dashboard activity token/URL safety tests cover staff delivery and owner/admin visibility
- [x] `.env.example` points local booking URL at `/book`
- [x] `.env.production.example` points production booking URL at `https://leasidefades.com/book`
- [x] Production migration command documented as `npm run db:migrate`
- [x] Static seed command documented as owner-approved/empty-DB only
- [x] Reminder runner and live preflight documented
- [x] Rollback plan documented
- [x] Security/privacy launch checklist documented
- [x] Owner-approved staff notification contact checklist documented
- [x] Staff notification missing-contact behavior documented
- [x] `/admin/dashboard` shows tracked service-snapshot revenue and upcoming appointment chart cards
- [x] Dashboard tracked revenue uses booking service price snapshots for completed and past confirmed bookings while excluding future confirmed/cancelled/no-show bookings from revenue
- [x] Dashboard tracked revenue defaults to the latest reportable historical appointment date when no anchor date is supplied
- [x] Dashboard tracked revenue supports Week, Month, Year, and All time period controls, with previous/next navigation for bounded periods
- [x] Dashboard tracked revenue aggregates by Toronto appointment date, uses 12 monthly buckets for annual view, and uses monthly buckets across the historical all-time range
- [x] Dashboard yearly tracked revenue fetches the full selected revenue period and does not truncate annual totals at the small dashboard-list cap
- [x] Dashboard from-price services count at stored snapshot totals and show a caveat count
- [x] Dashboard charts include empty states and compact labels for large values
- [x] Dashboard refreshes every 30 seconds, immediately refreshes after booking actions, and keeps the last good snapshot on network refresh failure
- [x] Dashboard compact notification health shows delivery success, scheduled/skipped/failed counts, reminder queue, and recent delivery rows
- [x] Local `npm run qa:phase12-dashboard-fixture` seeds guarded priced dashboard data for chart/browser QA without touching production databases
- [x] Local dashboard fixture browser QA verified non-zero value charts at 1440x900, 768x1024, 390x844, and 320x568 with no horizontal overflow
- [x] Premium dashboard redesign is the intended production dashboard surface and has passing local build/test coverage
- [x] Production `/api/admin/dashboard` read-only snapshot verified real service-snapshot value data and upcoming confirmed/cancelled chart data
- [x] Production `/admin/dashboard` headless browser QA verified non-zero value charts at 1440x900 and 390x844 with no horizontal overflow
- [x] Dashboard activity is owner/admin-wide and barber-scoped for barber users
- [x] Admin rail uses the Leaside Fades logo instead of the `LF` placeholder
- [x] Admin calendar uses a bounded viewport layout with internal board scrolling
- [x] `/admin/shifts` uses a staff-first weekly schedule builder instead of the previous all-staff CRUD grid
- [x] Staff shift edits use a visual weekly draft timeline/day-card editor and explicit Save changes through the existing schedule mutation endpoints
- [x] Staff shift utility tests cover weekly draft creation, split-window hour totals, 15-minute snapping, drag move, resize, duplicate, copy, clear-day, and save-plan diff operations
- [x] Staff shift browser QA stress-tested weekly builder, overview, staff search, edit/discard state, visual timeline, mobile day-card fallback, and 1440/768/390/320-width layouts with no document overflow
- [x] Staff shift weekly builder shows the latest dated recurring pattern instead of duplicating separate active effective date ranges in one week
- [x] Admin calendar appointment colors use higher-contrast Men blue, Women pink, Boys yellow, Mixed violet, no-show red, completed green, and cancelled grey styling
- [x] Admin day board renders the weekday 7:00 PM close boundary without creating a 7:00 PM bookable slot
- [x] Add appointment drawer uses a desktop split-pane layout so staff columns remain reachable
- [x] Public Fresha booking fallback links replaced with `/book` / `https://leasidefades.com/book`
- [x] Public `Book Now` CTAs open `/book` directly without a location dropdown
- [x] Marketing Services section is generated from the booking launch catalog and source data shows 38 services: Men 16, Women 14, Boys 8
- [x] Public availability uses saved barber shifts before posted opening on open business days and still blocks closed business days
- [x] Vercel routing config added for `/book`, `/booking`, and `/admin`
- [x] Secured reminder endpoint added at `/api/jobs/send-reminders`
- [x] `/api/health` checks PostgreSQL readiness so DB quota/connection failures are not hidden behind a false-green process health response
- [x] `/api/jobs/send-reminders` uses durable reminder heartbeat state to preserve the configured cadence even when external schedulers start late
- [x] Repeatable non-mutating production smoke runner exists as `npm run qa:production-smoke`
- [x] Repeatable bounded production read stress runner exists as `npm run qa:production-read-stress`
- [x] Vercel production deployment created for `leasidefades.com`
- [x] Local/dev-only seed and QA runner production guards documented
- [x] Local HTTP smoke test against `node server.js` validates public booking, admin visibility, customer cancel, customer reschedule, and notification rows
- [x] Runtime-imported server modules avoid TypeScript parameter properties that Node's strip-only TypeScript loader cannot execute
- [ ] Production env vars configured
- [x] Production notification env vars verified in Vercel runtime through a temporary secret-gated smoke endpoint
- [ ] Local `npm run notifications:check-live-config` against production-equivalent secrets (blocked while Vercel write-only values pull empty locally)
- [x] `https://leasidefades.com` loads the production site shell
- [x] `https://leasidefades.com/book` loads the booking app shell
- [x] Vercel Neon production database integration `leaside-fades-db` is attached
- [x] `https://leasidefades.com/api/booking/catalog` returns catalog data
- [x] Production `/api/booking/catalog` previously returned 2 locations, 3 categories, 37 services, and 5 barbers before the Men's Color Root Touchup source update
- [x] Production `/api/booking/catalog` re-smoked after deploy/reseed for the 38-service catalog, including Men's Color Root Touchup
- [x] Owner-authenticated production admin APIs show 38 services, root-touchup service visibility, active recurring shifts, and zero Yogesh Eglinton active shifts
- [x] Production 2-hour reminder scheduler heartbeat verified after deployment with `npm run qa:production-reminder-heartbeat`
- [x] Marketing service list has regression coverage against booking seed names, prices, durations, and order
- [x] Production availability smoke test returns launch slots while keeping Yogesh out of Eglinton
- [x] Production admin owner login API/session verified for `owner@leasidefades.com`
- [x] Production `/admin/calendar` Playwright frame check passed at 1912x970, 1440x900, 1280x720, and mobile width
- [x] Production admin calendar with Add appointment drawer open keeps Laura/staff reachable and avoids page/body clipping
- [x] Production admin calendar internal board scroll reaches the weekday 7:00 PM boundary
- [x] Admin calendar mobile rail/topbar are compact enough for the day-board grid to remain visible at 320x568
- [x] Admin calendar mobile filters open as an overlay and close without permanently hiding or resizing away the day board
- [x] Admin calendar mobile slot taps and topbar Add both open a fully framed Add appointment drawer with the create action visible
- [x] `/admin/team` exists for owner/admin users and is hidden from barber rail navigation
- [x] Team barber create requires uploaded profile photo, invite email, selected location, and 15-minute-aligned weekly hours
- [x] Created team barbers are assigned to all active services and appear in admin calendar options, schedule context, public catalog, and public availability
- [x] Team barber removal is blocked while future confirmed bookings exist, then deactivates the barber/user/session after bookings are cancelled or rescheduled
- [x] Repeatable local Team management QA runner exists as `npm run qa:phase12-team-management`
- [x] Local Playwright MCP stress test covered `/admin/calendar` at 320x568, 340x600, 340x720, 375x667, 390x844, 414x896, 768x1024, 1280x720, and 1440x900 without creating appointments
- [x] Local launch-critical browser QA verified customer cancellation from a token link, admin full-day board labels from 12:00 AM through the 11:00 PM hour, grey-slot staff booking, appointment phone/email/notes edit, one-day shift edit, and mobile calendar filters/add controls
- [x] Production launch-critical redeploy `dpl_Dtpu3bguZC7ZAVQfo8DdcZJR6i74` is `Ready` and aliased to `https://www.leasidefades.com`
- [x] Production non-mutating smoke verified `/api/health`, `/api/booking/catalog`, `/book`, `/booking/not-a-real-token/cancel`, fake-token cancellation 404s, and protected admin edit/day-shift route 401s
- [x] Tablet-width Sam-only calendar resets to the 10:00 AM opening rows after date/location/staff context changes and does not remain stuck at the 7:00 PM boundary
- [x] Headless Chrome CDP stress test covered `/admin/calendar` at 320x568, 340x600, 340x720, 375x667, 390x844, 414x896, 768x1024, 1280x720, 1440x900, and 1920x900 with no body horizontal overflow, visible board height, closing-boundary reach, framed Add drawer, and visible sticky create action
- [x] Desktop Add appointment split pane at 1280x720, 1440x900, and 1920x900 keeps the calendar board in frame instead of crunching the board/form controls
- [x] Admin API/session and public booking fixture tests freeze their date clocks so session cookies and May 2026 availability fixtures remain deterministic as real time advances
- [ ] Google Places API key and Place ID verified in production
- [ ] Google Maps, Instagram, and Facebook links verified in production
- [x] Historical Resend live email smoke verified with an approved test contact before provider retirement
- [x] Historical Twilio production number verified SMS-capable through controlled live smoke
- [x] Brevo `mail.leasidefades.com` sender/domain and controlled live email smoke verified after migration
- [x] Production Twilio delivery is intentionally paused until balance and owner approval are restored
- [x] Database migration applied
- [x] Seed data verified
- [ ] Booking flow tested end-to-end
- [ ] Admin flow tested end-to-end
- [ ] Barber flow tested end-to-end
- [ ] Customer/staff booking confirmation delivery and owner/admin dashboard visibility tested in production/staging logs
- [x] Controlled live SMS smoke test sent only to owner/test phone
- [x] Controlled live email smoke test sent only to approved test email
- [x] Production reminder job manually executed after hardening; completed in 462 ms with no failures/deferred work and Twilio recorded as intentionally paused
- [x] Production reminder scheduler enabled through cron-job.org and first successful `200 OK` run observed
- [x] Production database plan/quota restored to Neon Launch after compute quota exhaustion incident
- [x] Current incident production smoke passes after Neon quota/plan restoration
- [x] Current incident production read stress passes after Neon quota/plan restoration
- [x] Production `CRON_SECRET` rotated and verified through authenticated reminder dry-run after redeploy
- [x] Secured reminder endpoint has an authenticated dry-run path for verifying cron secret/cadence without sending live reminders
- [x] Repeatable production reminder scheduler log gate exists for confirming a real post-restart `200`
- [x] Production reminder scheduler gate requires durable heartbeat evidence so dry-runs/skips cannot falsely pass recovery
- [x] Repeatable production reminder heartbeat gate exists as `npm run qa:production-reminder-heartbeat`
- [x] Repeatable cron-job.org configuration check/repair runner exists as `npm run qa:cron-job-org-reminder` and `npm run ops:cron-job-org-reminder-repair`
- [x] cron-job.org repair runner verifies the supplied `CRON_SECRET` against production dry-run before patching the external scheduler
- [x] Reminder job runs record durable success/failure heartbeat rows for dashboard monitoring
- [x] `/admin/dashboard` Notification health surfaces reminder scheduler healthy/degraded/stale/failing/unknown state and Brevo/Twilio delivery state
- [x] Reminder HTTP cron authenticates before initialization, uses one bounded database connection, and prevents concurrent runners with an advisory lock
- [x] Provider failures/deferred work return scheduler health as degraded while initialization/database/job infrastructure failures remain non-2xx
- [x] Production migration `0006_phase_12_scheduler_job_runs` applied before relying on dashboard heartbeat history
- [x] GitHub Actions production reminder scheduler workflow exists for the free 30-minute scheduler path
- [x] GitHub Actions repository secret `LEASIDE_REMINDER_CRON_SECRET` configured with the current production `CRON_SECRET`
- [x] GitHub Actions reminder scheduler produces an authorized real run and durable success heartbeat
- [x] GitHub Actions delayed scheduled runs are handled by heartbeat-based cadence instead of failing on off-boundary skips
- [x] Current cron-job.org restart produces an authorized `200` reminder request after scheduler secret alignment
- [x] Current scheduler recovery produces a real durable `scheduler_job_runs` success heartbeat after scheduler secret alignment
- [ ] Untracked artifacts audited before launch commit
- [ ] Owner-approved recurring shifts entered before exposing `/book`
- [x] Observed Fresha launch recurring shifts entered as initial production schedule pending owner verification
- [ ] Production owner/admin login account/email confirmed
- [x] Temporary production owner/admin login generated and verified; owner handoff/password rotation pending
- [ ] Staff notification contact info confirmed or owner accepts missing-contact launch risk
- [ ] Password reset/invite delivery behavior confirmed
- [x] Production host logging/error visibility confirmed for the hardened deployment; Vercel `200` logs and a fresh durable healthy heartbeat were observed
- [ ] Owner signs off

## Phase 13 - Optional Migration/Import Tooling

- [x] Guarded dry-run/apply import CLI exists
- [x] Import guide documents the extraction JSON and review gate
- [x] Future Fresha bookings extracted into report
- [x] Human review completed
- [x] Import explicitly approved
- [x] Production import dry-run smoke test completed against Neon with an empty extraction fixture
- [x] Production import dry-run completed against the May 1-June 30 Fresha extraction
- [x] Blocked import conflicts resolved
- [x] Production Fresha appointment import applied
- [x] Post-apply duplicate dry-run verifies idempotency
- [x] Imported bookings marked with source
- [x] Imported bookings excluded from lifecycle notifications and reminders
- [x] Calendar parity manually verified
- [x] Admin calendar day-board columns are based on active location staff, selected date/location shifts, and shift overrides
- [x] Admin calendar shows a clean empty state when no staff are scheduled at a location/date
- [x] Admin calendar shades non-working time and renders explicit blocked-time overlays
- [x] Admin calendar prevents empty-slot creation from non-working or blocked greyed-out cells
- [x] Admin calendar flags bookings that sit outside scheduled working hours
- [x] Mobile add appointment flow uses a full-screen form with sticky create action
- [x] Notification Center shows delivery mode, filters, upcoming reminder previews, failed rows, channel badges, and provider/error details
- [x] Notification Center separates active delivery issues from historical failed notification audit rows
- [x] Playwright MCP browser QA verified `/admin/calendar` and the Notification Center at iPhone width, 1280x720, 1440x900, and 1912x970
- [x] Playwright CLI smoke verified `/admin/shifts` desktop visual timeline, `/admin/shifts` mobile day cards, `/admin/calendar` color legend, `/book`, `/api/booking/catalog`, `/api/health`, and unauthenticated reminder protection
