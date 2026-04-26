# PROJECT_STATUS.md - Leaside Fades Booking System

## Current Phase

Phase 0 - Documentation commit complete.

## Completed Phases

- Phase 0 planning and architecture documentation.

## Active Task

Persist the Phase 0 architecture plan into repository documentation only.

No product features have been implemented.

## Next Recommended Task

Start Phase 1 - database schema + seed data.

Before implementation, produce the Phase 1 phase brief:
1. Phase goal
2. Scope
3. Non-scope
4. Files likely to change
5. Data model impact
6. Edge cases to test
7. Acceptance criteria

Then implement Drizzle/PostgreSQL schema and seed data only.

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
- Auth is deferred until Phase 5.

## Open Questions

Not blocking Phase 1:
- Production database host/provider.
- Owner/admin initial login email.
- Real phone/email details for each barber.
- Initial featured service selections.
- Final auth provider decision before Phase 5.
- Production Twilio and Resend credentials before Phase 9.

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

## Edge Cases Tested

None yet. Phase 0 produced documentation only.

## Files Changed in Latest Session

- `AGENTS.md`
- `PROJECT_STATUS.md`
- `docs/ARCHITECTURE.md`
- `docs/BOOKING_RULES.md`
- `docs/QA_CHECKLIST.md`
- `docs/DECISIONS.md`

## Commands / Tests Run

- Documentation inspection commands only.
- No automated tests run because this was a documentation-only Phase 0 commit.

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

## Do-Not-Break Rules

- Do not allow double booking for the same barber.
- Do not allow customer booking outside official business hours.
- Do not trust client-side availability.
- Do not bury scheduling logic in UI components.
- Do not implement authentication before Phase 5.
- Do not mutate Fresha data without explicit authorization.
- Do not proceed to later phases without updating project status and docs.

## Latest Session Summary

Phase 0 documentation was persisted at the repository root. No migrations, schema implementation, UI, auth, product feature code, or Fresha inspection were performed.
