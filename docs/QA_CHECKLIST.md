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
- [x] Barber profile photos render on the barber selection step for Sam, Laura, Yogesh, and Shayon
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
- [x] Barber users default to their own scoped calendar
- [x] Calendar booking cards visually distinguish confirmed, walk-in, no-show, completed, and cancelled bookings
- [x] Blocked time context appears on the calendar board
- [x] Booking detail opens in a side drawer from the calendar
- [x] Manual and walk-in creation are unified into one Add appointment workflow
- [x] Add appointment loads server availability for the selected barber/location/date/services
- [x] Multi-service selection updates total duration, price summary, and calendar preview length
- [x] Add appointment drawer can create name-only staff appointments without phone/email
- [x] Add appointment drawer can create true walk-ins with `source = "walk_in"`
- [x] Add appointment drawer keeps the create action visible while available times and services scroll
- [x] Calendar appointment preview fills the selected barber/time duration instead of showing only a thin marker
- [x] Walk-ins use the existing transactional booking path
- [x] Walk-ins are stored as `source = "walk_in"`
- [x] Barber walk-ins are limited to the linked barber profile
- [x] Owner/admin walk-ins can target any active eligible barber
- [x] Walk-ins still reject overlap, outside-shift, blocked-time, closure, inactive-barber, and spoofed-barber attempts
- [x] No-show status is supported for current/past confirmed bookings
- [x] Future, cancelled, completed, and already no-show bookings reject no-show transitions
- [x] Barber no-show actions are limited to their own bookings
- [x] Booking drag/drop calls the admin reschedule endpoint
- [x] Rejected drag/drop moves leave the booking in its original slot
- [x] Barber drag/drop cannot move bookings to another barber
- [x] Owner/admin cross-barber drag/drop uses backend availability validation
- [x] Repeatable local/dev Phase 7.5 real-route QA runner exists as `npm run qa:phase7-5-calendar`

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
- [x] Resend abstraction works behind provider interface
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

- [x] 24-hour reminder job works
- [x] 2-hour reminder job works
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
- [x] `/admin/dashboard` shows today's appointments, upcoming appointments, and notification-center activity
- [x] Dashboard appointment lists count confirmed active appointments; cancelled booking history remains in Notification Center
- [x] Dashboard activity is owner/admin-wide and barber-scoped for barber users
- [x] Admin rail uses the Leaside Fades logo instead of the `LF` placeholder
- [x] Admin calendar uses a bounded viewport layout with internal board scrolling
- [x] Admin day board renders the weekday 7:00 PM close boundary without creating a 7:00 PM bookable slot
- [x] Add appointment drawer uses a desktop split-pane layout so staff columns remain reachable
- [x] Public Fresha booking fallback links replaced with `/book` / `https://leasidefades.com/book`
- [x] Public `Book Now` CTAs open `/book` directly without a location dropdown
- [x] Marketing Services section is generated from the booking launch catalog and shows 37 services: Men 15, Women 14, Boys 8
- [x] Vercel routing config added for `/book`, `/booking`, and `/admin`
- [x] Secured reminder endpoint added at `/api/jobs/send-reminders`
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
- [x] Production `/api/booking/catalog` returns 2 locations, 3 categories, 37 services, and 4 barbers
- [x] Marketing service list has regression coverage against booking seed names, prices, durations, and order
- [x] Production availability smoke test returns launch slots while keeping Yogesh out of Eglinton
- [x] Production admin owner login API/session verified for `owner@leasidefades.com`
- [x] Production `/admin/calendar` Playwright frame check passed at 1912x970, 1440x900, 1280x720, and mobile width
- [x] Production admin calendar with Add appointment drawer open keeps Laura/staff reachable and avoids page/body clipping
- [x] Production admin calendar internal board scroll reaches the weekday 7:00 PM boundary
- [ ] Google Places API key and Place ID verified in production
- [ ] Google Maps, Instagram, and Facebook links verified in production
- [x] Resend live email smoke verified with an approved test contact
- [x] Twilio production number verified SMS-capable through controlled live smoke
- [x] Database migration applied
- [x] Seed data verified
- [ ] Booking flow tested end-to-end
- [ ] Admin flow tested end-to-end
- [ ] Barber flow tested end-to-end
- [ ] Customer/staff booking confirmation delivery and owner/admin dashboard visibility tested in production/staging logs
- [x] Controlled live SMS smoke test sent only to owner/test phone
- [x] Controlled live email smoke test sent only to approved test email
- [ ] Reminder job manually tested against a safe controlled fixture or staging database
- [x] Production reminder scheduler enabled through cron-job.org and first successful `200 OK` run observed
- [ ] Untracked artifacts audited before launch commit
- [ ] Owner-approved recurring shifts entered before exposing `/book`
- [x] Observed Fresha launch recurring shifts entered as initial production schedule pending owner verification
- [ ] Production owner/admin login account/email confirmed
- [x] Temporary production owner/admin login generated and verified; owner handoff/password rotation pending
- [ ] Staff notification contact info confirmed or owner accepts missing-contact launch risk
- [ ] Password reset/invite delivery behavior confirmed
- [ ] Production host logging/error visibility confirmed
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
- [x] Admin calendar day-board columns are based on selected date/location shifts and shift overrides
- [x] Admin calendar shows a clean empty state when no staff are scheduled at a location/date
- [x] Admin calendar shades non-working time and renders explicit blocked-time overlays
- [x] Admin calendar prevents empty-slot creation from non-working or blocked greyed-out cells
- [x] Admin calendar flags bookings that sit outside scheduled working hours
- [x] Mobile add appointment flow uses a full-screen form with sticky create action
- [x] Notification Center shows delivery mode, filters, upcoming reminder previews, failed rows, channel badges, and provider/error details
- [x] Playwright MCP browser QA verified `/admin/calendar` and the Notification Center at iPhone width, 1280x720, 1440x900, and 1912x970
