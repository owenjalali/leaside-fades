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

- [ ] Drizzle configured
- [ ] PostgreSQL connection configured through environment variables
- [ ] Locations seeded
- [ ] Business hours seeded
- [ ] Barbers seeded
- [ ] Barber-location assignments seeded
- [ ] Service categories seeded
- [ ] Services seeded
- [ ] Service pricing fields support fixed and from pricing
- [ ] Featured services are configurable
- [ ] Booking/block/shift start-before-end constraints exist
- [ ] Confirmed booking no-overlap strategy exists
- [ ] Migrations run cleanly

## Phase 2 - Availability Engine + Tests

- [ ] Single service availability works
- [ ] Multiple stacked services work
- [ ] Opening time slot works
- [ ] Closing boundary works
- [ ] Slot ending after closing is rejected
- [ ] Less than 30 minutes from now rejected
- [ ] More than 30 days ahead rejected
- [ ] Existing confirmed booking blocks overlapping slots
- [ ] Adjacent bookings are allowed
- [ ] Cancelled booking frees slot
- [ ] Barber-specific blocked time works
- [ ] Location-wide blocked time works
- [ ] Business-wide blocked time works
- [ ] Split shifts work
- [ ] Barber at two locations same day works
- [ ] Barber with no shift has no availability
- [ ] Any available barber works

## Phase 3 - Booking Creation

- [ ] Booking creation recalculates availability server-side
- [ ] Transaction prevents race-condition double booking
- [ ] Confirmed booking exclusion/application checks work
- [ ] Any Available assignment is deterministic
- [ ] `booking_services` snapshots are created
- [ ] Confirmed booking blocks future availability
- [ ] Invalid slot returns clear error
- [ ] Failed booking does not send notifications

## Phase 4 - Public Booking Flow

- [ ] Customer can select location
- [ ] Customer can select one service
- [ ] Customer can stack services
- [ ] Customer can choose barber
- [ ] Customer can choose Any available barber
- [ ] Customer sees available dates/times
- [ ] Customer enters name/phone/email
- [ ] Customer sees price and Pay in shop
- [ ] Customer confirms booking
- [ ] Confirmation page displays correct details
- [ ] Mobile layout works

## Phase 5 - Auth + Roles

- [ ] Custom session auth compared against Supabase Auth, Better Auth, and Clerk
- [ ] Auth provider decision recorded in `docs/DECISIONS.md`
- [ ] Owner can log in
- [ ] Barber can log in
- [ ] Owner sees all bookings
- [ ] Barber sees only own bookings
- [ ] Barber cannot edit other barber bookings
- [ ] Session cookies are secure and HTTP-only
- [ ] Unauthorized API requests are rejected

## Phase 6 - Admin Calendar

- [ ] Month view works
- [ ] Week view works
- [ ] Day view works if implemented
- [ ] Filter by location works
- [ ] Filter by barber works
- [ ] Booking details visible
- [ ] Manual booking works
- [ ] Cancel booking works
- [ ] Reschedule booking works
- [ ] Role permissions are enforced in calendar actions

## Phase 7 - Shifts + Blocked Time

- [ ] Owner can create recurring shift
- [ ] Owner can create split shift
- [ ] Owner can create one-off override
- [ ] Overlapping same-barber shifts are rejected by default
- [ ] Barber can manage own blocked time if allowed
- [ ] Location closure blocks location
- [ ] Business closure blocks both locations

## Phase 8 - Customer Cancellation/Rescheduling

- [ ] Cancellation token works
- [ ] Invalid token rejected
- [ ] Expired token behavior is correct if token expiry is implemented
- [ ] Reused token behavior is safe
- [ ] Cancelled booking frees slot
- [ ] Reschedule token works
- [ ] Reschedule validates availability
- [ ] Old slot is freed
- [ ] New slot is blocked

## Phase 9 - Notifications

- [ ] Twilio abstraction works
- [ ] Resend abstraction works
- [ ] Dev mode can mock notifications
- [ ] Booking confirmation logged
- [ ] Cancellation logged
- [ ] Reschedule logged
- [ ] Barber SMS logged
- [ ] Failed notification attempts are logged
- [ ] Notification idempotency keys prevent duplicate sends

## Phase 10 - Reminder Jobs

- [ ] 24-hour reminder job works
- [ ] 2-hour reminder job works
- [ ] Reminders are not duplicated
- [ ] Failed reminders are logged
- [ ] Cancelled bookings do not receive reminders
- [ ] Rescheduled bookings receive reminders for the new time only

## Phase 11 - Fresha Inspection

- [ ] Playwright MCP used read-only
- [ ] Fresha calendar inspected
- [ ] Staff schedules inspected
- [ ] Services inspected
- [ ] Existing booking display inspected
- [ ] No Fresha data mutated
- [ ] Report created

## Phase 12 - Launch Prep

- [ ] Production env vars configured
- [ ] Database migration applied
- [ ] Seed data verified
- [ ] Booking flow tested end-to-end
- [ ] Admin flow tested end-to-end
- [ ] Barber flow tested end-to-end
- [ ] Notifications tested
- [ ] Owner signs off

## Phase 13 - Optional Migration/Import Tooling

- [ ] Future Fresha bookings extracted into report
- [ ] Human review completed
- [ ] Import explicitly approved
- [ ] Imported bookings marked with source
- [ ] Calendar parity manually verified
