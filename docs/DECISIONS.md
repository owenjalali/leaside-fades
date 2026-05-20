# Decisions - Leaside Fades Booking System

## Decision Log

### 2026-04-26 - Build Custom Fresha Lite Instead of Full Clone

Decision:
Build a focused booking and scheduling system for Leaside Fades, not a full Fresha clone.

Reason:
The business needs reliable booking, staff scheduling, no-double-booking, and admin management. Full Fresha parity would create unnecessary scope creep.

### 2026-04-26 - Soft Migration From Fresha

Decision:
Use soft migration for launch.

Reason:
Keeping existing Fresha appointments active while routing new bookings to the new platform reduces migration risk.

### 2026-04-26 - No Online Payments for MVP

Decision:
Customers pay in shop. No checkout, card payment, deposits, or tax calculation for MVP.

Reason:
The shop already handles payment in person. Payments add complexity without being required for launch.

### 2026-04-26 - 15-Minute Slot Interval

Decision:
Use 15-minute slot intervals.

Reason:
Some services are 15 minutes, such as Beard Trim and Line Up.

### 2026-04-26 - No Buffer for MVP

Decision:
Do not add buffer time between appointments for MVP.

Reason:
The business rules currently require only no-overlap scheduling.

### 2026-04-26 - Repository Documentation Is Source of Truth

Decision:
Use root `AGENTS.md`, `PROJECT_STATUS.md`, and `docs` files to preserve context across fresh Codex windows.

Reason:
The developer expects to start fresh Codex contexts between phases.

### 2026-04-26 - Confirm React Vite + Express Stack

Decision:
Use the existing React Vite frontend and Express backend as the application foundation.

Reason:
The repo already contains a working React Vite marketing site and Express server. Keeping this stack avoids unnecessary framework migration and lets booking features be added incrementally.

### 2026-04-26 - Use PostgreSQL + Drizzle

Decision:
Use PostgreSQL for the database and Drizzle for schema/migrations.

Reason:
PostgreSQL supports strong constraints and transaction semantics needed for scheduling correctness. Drizzle fits the TypeScript/Express stack and keeps migrations explicit.

### 2026-04-26 - Keep Scheduling Logic Server-Side and Isolated

Decision:
Implement availability and booking conflict logic in isolated server-side modules, not React UI components.

Reason:
Scheduling correctness is the core product risk. Centralizing the logic prevents client-side drift and makes edge-case testing practical.

### 2026-04-26 - Prefer PostgreSQL Exclusion Constraint for Confirmed Booking Overlap

Decision:
Prefer a PostgreSQL exclusion constraint to prevent overlapping confirmed bookings for the same barber, backed by transactional application-level checks.

Reason:
Database-level protection reduces race-condition risk. Application-level checks are still required for clearer errors and blocked-time/business-rule validation.

### 2026-04-26 - Use UTC Persistence With America/Toronto Business-Time Calculations

Decision:
Persist appointment/block timestamps in UTC and perform business hour/date calculations in `America/Toronto`.

Reason:
The business operates in Toronto. UTC storage avoids persistence ambiguity while local calculations preserve expected shop behavior.

### 2026-04-26 - Use Notification Outbox/Log Table

Decision:
Log notification attempts in a database table and send through Twilio/Resend provider abstractions.

Reason:
Notifications must be auditable, retryable, and mockable in development without live credentials.

### 2026-04-26 - Defer Auth Decision Until Phase 5

Decision:
Do not implement auth before Phase 5. Before implementing auth, compare custom session auth, Supabase Auth, Better Auth, and Clerk against this repo.

Reason:
The current phases prioritize schema, availability, and booking correctness first. Auth choice depends on deployment and operational constraints that do not block Phase 1.

Phase 0 default recommendation:
Likely choose custom session auth unless hosting/deployment constraints favor a managed provider.

### 2026-04-26 - Do Not Seed Production Barber Shifts in Phase 1

Decision:
Seed static business records in Phase 1, but do not seed recurring production barber shifts.

Reason:
Real barber schedules are not confirmed. Fake shifts would create unsafe availability assumptions once the availability engine exists.

### 2026-04-26 - Defer Sessions and Password Fields Until Phase 5

Decision:
Phase 1 defines a provider-neutral `users` table only. Do not add sessions, password hashes, external auth IDs, or login behavior until Phase 5.

Reason:
Auth provider selection is intentionally deferred until Phase 5, after comparing custom session auth, Supabase Auth, Better Auth, and Clerk.

### 2026-04-26 - Keep Booking Creation Behind a Transaction-Capable Repository

Decision:
Implement Phase 3 booking creation as a server-side service that requires an explicit transaction-capable repository interface.

Reason:
The core booking rules can be tested without requiring a live `DATABASE_URL`, while production callers must still provide a real transaction boundary for availability recheck, conflict checks, booking insert, and `booking_services` snapshot writes.

### 2026-04-27 - Use DB-Backed Public Booking Adapters in Phase 4

Decision:
Phase 4 public booking APIs call the existing availability engine and booking service through Drizzle/PostgreSQL-backed adapters.

Reason:
The public customer flow must not talk to fake or in-memory production data. Keeping the adapter layer thin preserves the Phase 2 and Phase 3 business logic while connecting the UI to real database state.

### 2026-04-27 - Defer Production Fresha Cutover Until Launch Prep

Decision:
Phase 4 local/internal booking CTAs route to `/book`, but the final public replacement of Fresha booking links remains deferred until launch prep.

Reason:
The new flow should not be treated as production-live until real shifts, notifications, DB migrations, QA, and owner launch approval are complete.

### 2026-04-27 - Keep Sample Shifts Local/Dev-Only

Decision:
Add a `db:seed:dev-shifts` script for local Phase 4 booking QA, guarded so it only runs against localhost-style database URLs.

Reason:
Phase 4 needs real DB-backed availability for browser QA, but fake shifts must not become production seed data or imply launch-ready barber schedules.

### 2026-04-27 - Use Weekly Public Time Browsing

Decision:
The public booking time step shows the selected week as seven day buttons with availability counts, while keeping a native calendar date selector for manual jumps.

Reason:
Customers should not have to hunt day by day for open times. A weekly view exposes nearby availability without changing the server-side availability engine or trusting client-generated slots.

### 2026-04-27 - Use Custom Session Auth for Phase 5A

Decision:
Use custom Express-gated session auth for owner/admin/barber users. Passwords are stored as Argon2id hashes. Session tokens are opaque random values sent in an HTTP-only `SameSite=Lax` cookie named `lf_admin_session`; only SHA-256 token hashes are stored in PostgreSQL.

Reason:
The app is a single-business booking system with a simple `owner`/`admin`/`barber` role model already represented in the provider-neutral `users` table. Custom sessions keep vendor coupling low and let Express remain the auth gatekeeper.

### 2026-04-27 - Add Local-Only Owner Bootstrap for Auth QA

Decision:
Add `npm run db:seed:dev-owner` for local QA. It requires explicit `DEV_OWNER_EMAIL` and `DEV_OWNER_PASSWORD`, refuses production mode, and refuses non-local database hosts.

Reason:
Phase 5A needs a clean way to test login locally without public signup, hardcoded credentials, or production seed credentials.

### 2026-04-27 - Use Hashed Single-Use Password Reset Tokens

Decision:
Phase 5B uses a `password_reset_tokens` table with opaque random reset tokens, SHA-256 token hashes at rest, single-use `used_at` tracking, and 45-minute expiry. A successful reset stores a new Argon2id password hash and revokes existing sessions for that user.

Reason:
Password reset needs the same no-secret-at-rest posture as sessions while ensuring old sessions cannot remain active after account recovery.

### 2026-04-27 - Use Dev-Mode Password Reset Delivery Until Email Integration

Decision:
Password reset request handling creates real reset tokens but uses dev-mode server logging for delivery. Resend wiring remains deferred until email delivery is explicitly approved.

Reason:
The repo does not yet have a Resend provider abstraction or production email configuration. Logging keeps local QA possible without adding notification/email scope to Phase 5B.

### 2026-04-27 - Override Drizzle Kit Nested Esbuild Audit Finding

Decision:
Keep current stable `drizzle-kit` and add a narrow npm override so `@esbuild-kit/core-utils` uses a non-vulnerable nested `esbuild`.

Reason:
`npm audit fix --force` proposed a breaking `drizzle-kit` change. The override removes the dev-tool audit finding while preserving the current Drizzle migration workflow.

### 2026-04-27 - Use Owner-Managed Barber Onboarding Only

Decision:
Phase 5C allows only owner/admin users to create barber profiles, assign locations, create linked pending `role = "barber"` users, and deactivate barber/user access. Public self-signup remains unavailable, and barber users cannot create other staff accounts.

Reason:
The business needs controlled staff onboarding without opening public account creation or building full staff management before the admin calendar and scheduling phases.

### 2026-04-27 - Use Separate Hashed Invite Tokens for Account Setup

Decision:
Phase 5C adds `user_invite_tokens` for barber account setup links. Invite tokens are opaque random values, stored only as SHA-256 hashes, single-use, and expire after seven days. Accepted invites set an Argon2id password hash and activate the linked barber user.

Reason:
Invite/account setup is related to password reset but has a different lifecycle and actor. A separate table keeps reset tokens and owner-created onboarding tokens cleanly separated.

### 2026-04-27 - Keep Phase 5C API-First

Decision:
Phase 5C implements the onboarding APIs and dev-mode invite logging, but does not build `/admin/team` UI screens.

Reason:
The prior auth phases are API-first, and full admin UI work belongs with the admin calendar/staff management phases. This keeps 5C minimal and focused on secure onboarding behavior.

### 2026-04-27 - Split Phase 6 Into Admin Calendar Subphases

Decision:
Implement Phase 6 as admin calendar/list/detail reads first, then manual booking creation, then staff cancellation/rescheduling.

Reason:
Calendar UI, booking mutations, and role-scoped permissions are each risky enough to verify separately. Splitting the phase keeps the no-double-booking guarantee and Phase 5 auth enforcement visible while avoiding drag/drop calendar scope creep.

### 2026-04-27 - Require Explicit Barber For Manual Admin Bookings

Decision:
Manual admin bookings require an explicit barber and do not support Any Available or owner override in Phase 6.

Reason:
Manual bookings are staff-entered appointments/walk-ins. Requiring a specific barber keeps responsibility clear and ensures the existing transactional no-overlap checks protect the same barber-calendar guarantee as public booking creation.

### 2026-04-27 - Admin Rescheduling Moves Time/Location/Barber Only

Decision:
Phase 6 rescheduling keeps the original booking service snapshots and only moves the appointment time, location, and/or barber.

Reason:
Changing services can change duration, pricing, and snapshot semantics. For MVP safety, staff should cancel and recreate when services need to change. Customer token-based rescheduling remains deferred to Phase 8.

### 2026-04-27 - Harden Phase 6 Admin Mutations Before Phase 7

Decision:
Keep Phase 6 scope intact while hardening three safety edges: transaction-bound availability/conflict reads are sequential on the transaction client, service-changing admin reschedule fields are explicitly rejected, and cookie-authenticated admin mutations validate Origin/Referer headers when present.

Reason:
The Phase 6 audit found a real pg overlapping client-query warning during transaction-bound manual booking creation, an ambiguity where reschedule ignored service-change fields, and a CSRF risk surface on cookie-authenticated admin mutations. These fixes preserve existing public booking and availability behavior while reducing pre-Phase-7 scheduling and admin mutation risk.

### 2026-05-07 - Keep Staff Shifts Focused on Weekly Schedules

Decision:
Remove the visible one-off override workspace from `/admin/shifts` and keep Staff Shifts focused on the weekly repeating schedule plus team overview.

Reason:
The approved direction is a guided staff schedule editor, not a dense CRUD workspace. One-off override APIs and calendar availability behavior remain intact, but the exception editing surface needs a clearer calendar-native design before it returns to the UI.

### 2026-04-27 - Use Validated Forms And Grids For Phase 7 Schedule Management

Decision:
Implement Phase 7 with polished schedule grids, filters, click-to-edit chips, and forms. Defer drag/drop editing, but shape the server mutation routes so future drag/drop clients can call the same validated endpoints.

Reason:
Shift and blocked-time correctness is more important than interaction flourish. Forms and grids are operationally useful now, while server-side validation keeps future UI affordances from bypassing scheduling rules.

### 2026-04-27 - Reuse Existing Schedule Tables For Phase 7

Decision:
Reuse `shifts`, `shift_overrides`, and `blocked_times` for Phase 7 without a database migration.

Reason:
The existing Phase 1 schema already has the needed fields and start-before-end constraints. The Phase 7 work is domain/service/API/UI behavior rather than schema expansion.

### 2026-04-27 - Reject Closures That Strand Confirmed Bookings

Decision:
Reject new or updated blocked times when they overlap existing confirmed bookings in the affected barber, location, or business scope.

Reason:
Phase 7 does not send notifications or automatically move existing bookings. Rejecting conflicting closures prevents admins from silently stranding appointments without customer/barber communication.

### 2026-04-27 - Let Barbers Manage Only Their Own Blocked Time

Decision:
Allow barber users to create, update, and delete only their own barber-scoped blocked time. Owner/admin users retain full shift, override, and closure management.

Reason:
This gives barbers practical self-service without weakening owner/admin control over official schedules or broader closures.

### 2026-04-28 - Add Phase 7.5 Calendar-First Operations Before Phase 8

Decision:
Implement a Phase 7.5 staff scheduling console before customer token cancellation/rescheduling. The calendar becomes the primary admin/barber workflow with a dense day board, booking drawer, walk-in drawer, no-show action, and booking-only drag/drop reschedule.

Reason:
The Phase 6 admin UI was functionally correct but still behaved like a form-heavy admin panel. In-shop work needs the calendar to be the operating surface so barbers can see the day, add walk-ins quickly, and move appointments without bypassing server validation.

### 2026-04-28 - Store Walk-Ins As A Separate Booking Source

Decision:
Add `source = "walk_in"` and allow nullable customer phone/email at the database layer. Public and manual booking paths still require contact details, while staff walk-ins require only name, service, barber, location, and time.

Phase 12 supersedes the UI split by using one Add appointment workflow with an Appointment/Walk-in toggle. Phase 13 keeps true walk-ins stored as `source = "walk_in"` and sends confirmations/reminders when customer contact exists.

Reason:
Walk-ins are operationally different from public/customer bookings and manual back-office bookings. A distinct source supports future reporting/import decisions while the nullable contact fields reflect real in-shop behavior.

### 2026-04-28 - No-Show Is A Status Transition Only In Phase 7.5

Decision:
Allow no-show only for current or past confirmed bookings. Reject future, cancelled, completed, and already no-show bookings. Do not send notifications, charge fees, or implement payments for no-shows.

Reason:
No-show needs to be visible to staff immediately, but payment and notification consequences are later-scope product decisions.

### 2026-04-28 - Drag/Drop Calls Reschedule And Does Not Own Truth

Decision:
Implement booking-only drag/drop as a UI shortcut that calls the existing admin reschedule endpoint. The UI snaps to 15-minute slots and leaves rejected moves in the original slot. Do not add drag/drop for shifts, closures, or blocked time.

Reason:
The no-double-booking guarantee lives on the backend. Drag/drop must improve workflow without creating a second scheduling authority in the browser.

### 2026-04-28 - Use Non-Expiring Hashed Customer Management Tokens For Public Bookings

Decision:
Phase 8 generates cancellation and reschedule tokens for public bookings by default, stores only SHA-256 token hashes, and returns raw links only in the immediate public booking response. Tokens do not expire in Phase 8. Staff walk-ins do not generate customer management tokens or links.

Reason:
The product rule says customers can cancel and reschedule anytime through secure links. The existing booking table already has nullable token hash columns, so non-expiring hashed tokens avoid an unnecessary migration while preserving no-secret-at-rest behavior. Walk-ins are staff-created in-shop records and should not imply a customer self-service link unless a customer actually books through the public flow.

### 2026-04-29 - Keep Notification Delivery Behind Phase 9 Provider Interfaces

Decision:
Phase 9 keeps all notification logic under `src/server/notifications/*`. Booking/admin/public services call a lifecycle dispatcher only after successful booking mutations, while Twilio and Resend calls stay behind SMS/email provider interfaces. Local/default delivery uses `NOTIFICATION_DELIVERY_MODE=mock`; `dev` logs locally, and `live` uses Twilio/Resend credentials.

Reason:
Booking correctness is more important than delivery side effects. A post-mutation dispatcher preserves transaction boundaries, lets booking mutations succeed when delivery fails, and keeps provider dependencies from spreading through services or React.

### 2026-04-29 - Reuse The Existing Notifications Table For Phase 9

Decision:
Phase 9 reuses the existing `notifications` table and adds only provider, structured metadata, attempt count, and last-attempt fields. Duplicate/idempotent attempts update existing rows instead of creating duplicate notification records.

Reason:
The original table already captured the core notification outbox/log concept. A small migration preserves audit continuity and avoids a second table with overlapping responsibility.

### 2026-04-29 - No Walk-In Notifications In Phase 9

Decision:
Walk-in bookings create no customer-facing SMS/email and no barber/staff SMS notification attempts in Phase 9, even when optional customer or barber contact data exists.

Reason:
Walk-ins are in-shop staff-created records. Sending automated lifecycle notifications for them would imply a customer self-service flow and staff alert behavior that has not been product-approved.

### 2026-04-29 - Do Not Persist Raw Customer Management Tokens In Notification Logs

Decision:
Customer confirmation messages may include cancel/reschedule URLs only when raw URLs are available from the immediate booking response. Notification metadata stores safe flags and booking summary details, not raw URLs or tokens, and notification code never reconstructs raw tokens from stored hashes.

Reason:
Phase 8 established that raw management tokens are secrets. Keeping them out of notification logs preserves the no-secret-at-rest model while still allowing customer links to appear in outbound confirmation messages when the raw token is naturally available.

### 2026-04-29 - Use A CLI Cron Runner For Reminder Jobs

Decision:
Phase 10 reminder delivery runs through `npm run notifications:send-reminders`, with `REMINDER_JOB_LOOKBACK_MINUTES` and `REMINDER_JOB_LOOKAHEAD_MINUTES` controlling the due window. No Express timer or HTTP cron endpoint was added.

Reason:
A portable CLI runner works with hosting cron, Windows Task Scheduler, and manual/local QA without making reminder reliability depend on a long-lived Express process or adding a new authenticated HTTP surface.

### 2026-04-29 - Send Customer-Only Reminder Notifications

Decision:
Phase 10 sends 24-hour and 2-hour reminders only to customers by SMS/email for confirmed public/manual/walk-in bookings. Imported bookings, cancelled bookings, completed bookings, no-shows, and staff reminder SMS are excluded.

Reason:
The MVP reminder goal is reducing customer no-shows without adding unapproved staff alert volume. Contacted walk-ins are real customer appointments, while imported bookings remain excluded to avoid accidental cutover messaging.

### 2026-04-29 - Use Appointment Occurrence For Reminder Idempotency

Decision:
Reminder idempotency keys include the current appointment start time. The reminder dispatcher re-checks booking status, source, and start time immediately before sending.

Reason:
Repeated cron runs must not duplicate sends, and rescheduled bookings must receive reminders for the new appointment time only while old stale reminder candidates are ignored.

### 2026-04-29 - Retry Failed Provider Attempts Without Resending Successful Notifications

Decision:
Failed notification rows can be claimed for retry on later dispatch/job runs with the same idempotency key. Sent, skipped, and in-flight pending rows remain idempotent and do not resend; duplicate attempts still increment attempt bookkeeping.

Reason:
Provider failures should be recoverable after transient Twilio/Resend issues or configuration fixes, while successful customer messages must not duplicate during repeated cron runs.

### 2026-04-29 - Add A Live Reminder Configuration Preflight

Decision:
Production reminder setup includes `npm run notifications:check-live-config`, which verifies the job database URL, live delivery mode, and required Twilio/Resend environment variables before enabling the scheduler.

Reason:
The reminder CLI should fail fast for missing live configuration instead of relying on a provider error only after a due candidate happens to be processed.

### 2026-04-30 - Defer Live Production Smoke Testing To Phase 12

Decision:
Live production checks for `leasidefades.com`, `/book`, Google Places, Google Maps, Instagram, Facebook, Resend, Twilio, controlled live notifications, and reminder scheduler enablement belong to Phase 12 launch prep. Phase 10 may prepare env templates and run non-sending config preflights, Phase 11 remains read-only Fresha inspection, and Phase 13 remains optional Fresha import tooling.

Reason:
Production smoke tests need real hosts, real credentials, and owner-approved test contacts. Keeping them in Phase 12 prevents accidental customer notifications or premature launch behavior while preserving a clear launch-readiness checklist.

### 2026-04-30 - Use Fresha As Launch Data Source Of Truth With Explicit Overrides

Decision:
Treat Fresha as authoritative for launch services, staff roster, locations, business hours, schedules, booking rules, and public operational details unless an explicit launch override is documented.

Reason:
Fresha is the current operating system for the business. Launch readiness should reconcile against the live operational source rather than inventing data in the repo.

### 2026-04-30 - Make Yogesh Millwood-Only For Launch

Decision:
Yogesh Kumar is Millwood-only for launch and must not be bookable at Eglinton. Production seed data and local/dev sample shifts must not create Yogesh Eglinton availability.

Reason:
The owner-provided launch correction overrides older repo notes and the read-only Fresha inspection ambiguity.

### 2026-04-30 - Reconcile Services By Details, Not Count Alone

Decision:
Do not add a 38th service only because Fresha admin showed 38 services in a prior inspection. Reconcile by service name, category, price, and duration. Keep the repo's 37 services if they match the owner-approved launch offering.

Reason:
Launch data accuracy matters more than matching a count. Adding an unidentified service would risk exposing an unapproved service.

### 2026-04-30 - Staff And Owner/Admin Booking Confirmation Notifications Are Launch-Critical

Decision:
Booking confirmations must notify the customer by SMS/email and the assigned barber/staff member by SMS/email when contact info exists. Missing customer/staff contacts create skipped attempts and must not fail booking creation.

Reason:
The assigned staff need reliable appointment visibility at launch, but owner/admin outbound email was later replaced by dashboard-first notification visibility.

### 2026-04-30 - Use Dashboard-First Owner/Admin Notifications

Decision:
Do not send owner/admin booking notification emails for launch. Owner/admin users see bookings, cancellations, reschedules, reminders, no-shows, and delivery status through `/admin/dashboard` and its Notification Center.

Reason:
Owner email fan-out is too noisy for launch operations. A shop-facing activity center gives owners the appointment visibility they want without spamming their inbox.

### 2026-04-30 - Unify Manual And Walk-In Creation In The Admin UI

Decision:
Replace separate Manual and Walk-in buttons with one Add appointment workflow. Staff-created appointments require customer name, barber, location, services, and an availability-confirmed start time; customer phone/email are optional. Service selection determines total duration, price summary, and calendar preview length.

Reason:
Manual appointments and walk-ins were confusing as separate UI concepts. A single staff workflow better matches how the shop books at the counter while preserving server-side availability and no-double-booking guarantees.

### 2026-04-30 - Phase 12 Ends At Launch-Ready, Not Merely Launch-Planned

Decision:
Phase 12 is complete only when the repo answers deployment, booking, admin/staff operations, real data, notifications, reminders, security/privacy, runbook, rollback, and owner signoff questions clearly. Remaining blockers should be external secrets, access, owner data, or final approval only.

Reason:
The launch phase must convert the system from nearly done to ready to cut over once the owner approves.

### 2026-05-01 - Use A Reviewed Report Gate For Fresha Imports

Decision:
Phase 13 Fresha imports must run as dry-run first, write a human-readable review report, and require an explicit reviewed-report confirmation before apply mode writes production data. Imported appointments use `source = "imported"` and do not trigger lifecycle notifications or reminder jobs.

Reason:
The May 1-June 30 cutover window contains real customer appointment data. A report gate preserves the no-accidental-import rule while allowing the custom platform to replace Fresha safely.

### 2026-05-01 - Make The Admin Calendar A Viewport App Surface

Decision:
The admin calendar shell uses a bounded viewport layout with internal scroll areas, a split-pane desktop drawer, sticky time/staff headers, and a visual closing boundary row.

Reason:
The launch calendar must be usable all day in-shop. The previous layout could clip the left rail, right staff columns, and bottom of the day board when the drawer was open, hiding later hours and staff columns.

### 2026-05-01 - Deploy The Cutover Surface Through Vercel

Decision:
Use Vercel production as the launch target, serve the Vite app for `/book`, `/booking`, and `/admin`, and keep `/api/*` on the Express serverless route. Public booking fallbacks point at `https://leasidefades.com/book`.

Reason:
The owner requested the platform on LeasideFades.com with accessible links. Vercel routing keeps the customer/admin app reachable while preserving the existing Express API.

### 2026-05-01 - Use Booking Catalog For Public Services And Direct Book Now CTAs

Decision:
Public `Book Now` CTAs open `/book` directly without a location dropdown. The marketing Services section derives its service names, category grouping, prices, durations, and order from the same launch service seed data used by the booking catalog.

Reason:
Location selection already belongs inside the booking flow, and keeping a separate marketing services list creates launch drift. The booking catalog remains the customer-facing source of truth.

### 2026-05-01 - Use A Secured Scheduler Endpoint For Reminders

Decision:
Expose `GET /api/jobs/send-reminders` for production scheduler invocation and require `CRON_SECRET` on the Authorization header before the endpoint runs the reminder job. The desired five-minute cadence can be registered with Vercel Cron only on a plan that supports more-than-daily cron jobs, or with an external scheduler.

Reason:
The launch target is Vercel, but the current Hobby plan blocks five-minute cron registration. A secret-gated endpoint preserves the production reminder path without exposing a public SMS/email trigger.

### 2026-05-01 - Use Vercel Neon For Production Postgres

Decision:
Use the Vercel Neon integration resource `leaside-fades-db` as the production PostgreSQL database for `leasidefades.com`.

Reason:
The previous Vercel production `DATABASE_URL` placeholder blocked the live booking catalog and import path. A Vercel-managed Neon database keeps the production data plane attached to the deployment project, supports Drizzle migrations, and gives the launch a real database without changing the app stack.

### 2026-05-01 - Seed Observed Fresha Launch Shifts As Initial Production Schedule

Decision:
Enter the Phase 11 observed Fresha weekly shifts as the initial production recurring schedule after the Phase 13 launch "Go", while preserving the explicit Yogesh Millwood-only rule.

Reason:
Public availability cannot launch without real shifts. The observed Fresha roster is the closest launch source of truth available now, but it remains a schedule handoff item for owner verification before full public cutover.

### 2026-05-01 - Apply The Reviewed Fresha Appointment Import

Decision:
After owner approval, cancel the two known production test bookings that blocked import and apply the May 1-June 30, 2026 Fresha appointment import into production as `source = "imported"` bookings.

Reason:
The conflicts were confirmed test data, and the reviewed dry-run reported zero blocked rows after cancellation. Imported bookings need to appear on the new platform without triggering immediate lifecycle notifications or reminder jobs during cutover.

### 2026-05-01 - Use cron-job.org For Five-Minute Production Reminders

Decision:
Use cron-job.org job `7551064` as the production five-minute scheduler for `GET https://www.leasidefades.com/api/jobs/send-reminders`, secured with `Authorization: Bearer <CRON_SECRET>`. Rotate `CRON_SECRET` in Vercel Production and in cron-job.org together.

Reason:
The current Vercel Hobby plan blocks five-minute Vercel Cron schedules. An external scheduler keeps 24-hour and 2-hour reminders operational without upgrading immediately, while the secret-gated endpoint prevents public reminder triggers.

### 2026-05-02 - Make Admin Calendar Columns Shift-Based And Contacted Walk-Ins Notifying

Decision:
The admin day-board shows staff columns from selected location/date working windows, including active shifts and same-day shift overrides, rather than static barber-location assignment. Staff-created walk-ins keep `source = "walk_in"` but now reuse booking lifecycle notifications and reminder eligibility when customer phone/email exists; imported bookings remain non-notifying and non-reminded.

Reason:
Staff need the calendar to match who is actually scheduled at a shop that day, especially on mobile. Contacted walk-ins are real customer appointments and should receive the same confirmation/reminder behavior as contacted manual appointments without generating customer management tokens or changing the database schema.

### 2026-05-05 - Keep Mobile Calendar Filters Out Of The Board Height Budget

Decision:
On mobile, `/admin/calendar` uses a compact rail/topbar, keeps date navigation/view/Add controls visible, and moves location/barber/status filters into an overlay panel. The day-board owns the remaining viewport height with internal horizontal and vertical scrolling, resets to the opening time when date/location/staff context changes, and Add appointment stays a full-height framed drawer with a sticky create action.

Reason:
The phone layout failure came from admin chrome and filters consuming the viewport until the calendar grid had no usable height. The follow-up tablet issue came from the board retaining a closing-boundary scroll position after context changes, making one-staff calendars look collapsed. The fix keeps the scheduling backend unchanged while making appointment slots visible and tappable on 320px-class phones and less cramped on tablet-width views.

### 2026-05-05 - Keep The Add Appointment Drawer From Crunching The Calendar

Decision:
When the Add appointment drawer is open, `/admin/calendar` protects a usable calendar column width, constrains the desktop drawer to an inspector-width panel, and uses auto-fit drawer grids so summary metrics, selectors, contact fields, and slot buttons wrap by available space instead of viewport breakpoint alone. Browser QA selectors were added to the admin shell, board, and drawer to make viewport regression checks repeatable.

Reason:
The desktop split-pane state could visually squeeze the calendar and drawer controls because the form internals responded to the full browser width rather than the narrower drawer column. The fix preserves the existing booking APIs and scheduling rules while making the operational surface fit the frame on phones, tablets, and desktop drawer layouts.

### 2026-05-05 - Show Estimated Appointment Value On The Admin Dashboard

Decision:
`/admin/dashboard` shows estimated appointment value from booking service price snapshots, not actual paid revenue. Confirmed and completed bookings count toward value, cancelled and no-show bookings do not, and public/manual/walk-in/imported sources are included when service snapshots exist. The dashboard uses 30-second polling instead of WebSockets.

Reason:
The owner wants a Fresha-inspired operating dashboard with value and appointment trends, but online payments remain outside the MVP. Service price snapshots provide useful estimated value without introducing a payment, payroll, or advanced analytics subsystem.

### 2026-05-07 - Make Staff Shifts A Weekly Schedule Builder

Decision:
Replace the `/admin/shifts` all-staff CRUD grid with a staff-first weekly schedule builder. Owners/admins select one staff member, edit working days, split windows, locations, and effective dates inline, then commit with one explicit Save changes action that calls the existing shift create/update/deactivate endpoints. One-off overrides and team overview stay available as secondary tabs.

If the schedule API returns multiple active recurring patterns for the same barber with different effective date ranges, the builder shows and diffs the latest effective pattern as the current weekly draft instead of combining separate patterns into duplicate day windows.

Reason:
Staff scheduling should answer "when does this barber work?" before exposing database objects. A guided weekly editor reduces cognitive load while preserving server-side schedule validation, existing APIs, and the no-double-booking/availability guarantees.

### 2026-05-08 - Treat Expired Admin Sessions As A Login Recovery Flow

Decision:
Admin sessions now use a 30-day sliding inactivity window. Protected admin API activity renews both the stored session expiry and the HTTP-only browser cookie, and the admin frontend redirects active workspaces to `/admin/login` when protected admin API calls return 401. The raw backend `Authentication required.` message must not appear inside Add appointment or other operational forms.

Reason:
The shop runs the admin surface as an operating tool, not a short-lived back-office form. A seven-day fixed session caused a stale workspace to reach protected booking endpoints and show an alarming backend auth message in the Add appointment drawer. Sliding expiry keeps active shop devices signed in while still expiring abandoned sessions, and the redirect keeps expired sessions explicit and recoverable.

### 2026-05-09 - Separate Staff Scheduling Authority From Public Availability

Decision:
Public customers continue to use the strict availability engine with business hours, shifts, 30-minute minimum notice, 30-day max window, blocked time, and no-overlap rules. Authenticated staff use a separate transactional scheduling path for create, reschedule, drag/drop, and full edit: they can book any visible 15-minute admin calendar time, including grey off-shift time, while still enforcing active records, role scope, blocked-time/closure conflicts, and same-barber no-overlap.

Reason:
Fresha lets staff place appointments into non-public working-time gaps while keeping those times unavailable online. The shop needs that operational flexibility without weakening customer-facing availability or the no-double-booking guarantee.

### 2026-05-09 - Make One-Day Shift Editing Calendar-Native

Decision:
Expose `Edit shift` from each barber header on the day board and back it with `POST /api/admin/schedule/day-shifts`. The endpoint replaces the selected barber/location/date shift by diffing desired windows against the recurring baseline into same-day `add` and `remove` override rows. Owner/admin users can edit any barber; barber users can edit only their own selected-day shift.

Reason:
Laura's Fresha workflow edits the specific day directly from the calendar, and that change must flow through the same schedule model that drives public client availability. A calendar-native one-day override keeps the recurring weekly builder intact while making exceptions fast and safe.

### 2026-05-09 - Add Full Admin Appointment Editing Instead Of Cancel/Recreate

Decision:
Confirmed bookings can be edited through `POST /api/admin/bookings/:bookingId/edit` and the booking drawer. Editing can update customer name, phone, email, customer notes, internal notes, date/time, barber, location, and selected services. The mutation updates the linked customer row, recalculates service snapshots/duration/end time, replaces `booking_services`, and preserves booking source/status/customer token hashes.

Reason:
Imported/public/manual appointments often need contact or service corrections after creation. Requiring cancel/recreate would risk lost booking history, broken customer tokens, and operator mistakes during launch.

### 2026-05-09 - Default Admin Day Board To A Fresha-Like 9 AM View

Decision:
The admin day board keeps the full 12:00 AM through 11:00 PM operating surface for staff scheduling, but it default-scrolls to 9:00 AM and uses a scrollable, non-compressed 15-minute grid instead of squeezing the whole day into one screen. Grey off-shift overlays remain visual only for staff operations, with hover time labels rendered above them.

Reason:
Staff need access to early/late administrative slots without forcing the normal workday view to start at midnight or making the calendar unreadably dense. Defaulting to 9:00 AM makes the day board match the Fresha operating posture while preserving the staff-only scheduling flexibility and blocked-time safeguards already enforced server-side.

### 2026-05-09 - Add Josef As An Eglinton-Only Launch Barber

Decision:
Add Josef to the launch barber roster as an Eglinton-only barber, replace the old Fawad-facing profile asset with Josef's profile asset in the React marketing/booking surfaces, and sync Josef with recurring 11:00 AM-7:00 PM shifts. The launch staff sync also enforces the existing Yogesh Millwood-only override so stale barber-location rows cannot leak into public booking.

Reason:
The owner explicitly added Josef for Eglinton and wants clients to book with him immediately. Because public availability is location and shift driven, the data sync must update the catalog, service capabilities, location assignment, and recurring shifts while preserving official business-hour clipping and the existing Yogesh launch override.

### 2026-05-11 - Use Resend For Production Account Recovery And Barber Invites

Decision:
Password reset and barber invite/setup links send through Resend in production, while non-production environments keep console-logged dev delivery. Production link builders require `APP_URL`; missing production `APP_URL` fails loudly instead of falling back to localhost. The public booking and customer reschedule APIs now require fully qualified ISO timestamps with a timezone for appointment `startTime`.

Reason:
The owner and staff need real account recovery and onboarding before launch. Silent success without an email would strand users, and localhost fallback links are unsafe in production. Strict timestamp input avoids date-only timezone drift in future non-browser callers.

### 2026-05-20 - Treat Database Readiness And Compute Quota As Launch-Critical

Decision:
`/api/health` now performs a PostgreSQL readiness query and returns 503 when the database is unavailable. The secured HTTP reminder endpoint also defaults to a 30-minute database cadence through `REMINDER_HTTP_MIN_INTERVAL_MINUTES`, skipping off-boundary cron requests before opening a database connection. Five-minute reminder cadence is allowed only when the production database plan can sustain the compute wakeups.

Reason:
Production showed static health as green while DB-backed catalog/login/admin paths failed because the Vercel Neon database reported compute time quota exhaustion. A shallow health check hid the real outage, and a five-minute external reminder cron can keep a serverless database awake often enough to burn quota on constrained plans.

### 2026-05-20 - Add Authenticated Reminder Dry-Run Verification

Decision:
`GET /api/jobs/send-reminders?dryRun=1` uses the same `Authorization: Bearer <CRON_SECRET>` gate and cadence logic as the live reminder endpoint, but returns the schedule decision without importing or running the reminder job.

Reason:
After a cron secret rotation or cron-job.org restart, the operator needs to verify that production accepts the scheduler header without accidentally sending live reminders or waking the database reminder workload outside the intended cadence.

### 2026-05-20 - Track Reminder Scheduler Heartbeat In The App

Decision:
Create `scheduler_job_runs` for reminder scheduler success/failure heartbeat rows and surface the latest reminder scheduler state inside `/admin/dashboard` Notification health. Authenticated dry-runs and off-cadence HTTP skips do not write heartbeat rows; only real reminder job runs do.

Reason:
cron-job.org can be disabled or misconfigured independently of the booking application. Vercel logs can prove that externally, but owners need an in-app signal when the reminder scheduler is stale or failing. Recording only real job runs prevents a successful dry-run from hiding a reminder delivery outage.
