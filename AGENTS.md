# AGENTS.md - Leaside Fades Booking System

## Project Purpose

Build a custom two-location booking and scheduling platform for Leaside Fades.

This is a focused "Fresha Lite" system, not a full Fresha clone.

The product must prioritize:
1. Scheduling correctness
2. No double-booking
3. Reliable availability generation
4. Clean customer booking UX
5. Simple owner/barber admin management
6. SMS/email notifications

Do not overbuild non-MVP systems such as online payments, inventory, payroll, gift cards, reviews, subscriptions, marketing campaigns, or advanced analytics.

## Confirmed Stack

- Frontend: React + Vite + TypeScript
- Backend: Express + TypeScript-oriented server modules
- Database: PostgreSQL
- ORM/migrations: Drizzle
- Styling: existing Tailwind setup
- Tests: Vitest for unit/integration tests, Playwright for later E2E and read-only Fresha inspection
- Notifications: Twilio for SMS, Resend for email

Keep the existing marketing site and Express server in place. Add booking functionality incrementally in later phases.

## Required Startup Routine

At the beginning of every implementation session:

1. Read this file: `/AGENTS.md`
2. Read `/PROJECT_STATUS.md`
3. Read `/docs/ARCHITECTURE.md`
4. Read `/docs/BOOKING_RULES.md`
5. Read `/docs/DECISIONS.md`
6. Identify the current phase
7. Continue from the current phase unless explicitly told otherwise
8. Do not restart the project from scratch
9. Do not overwrite working systems unless the change is intentional and explained

If `AGENTS.md` and `PROJECT_STATUS.md` conflict:
- `PROJECT_STATUS.md` wins for current phase/progress
- `AGENTS.md` wins for general engineering rules

## Authoritative Phase Map

Phase 0 - Planning and architecture
Phase 1 - Database schema + seed data
Phase 2 - Availability engine + tests
Phase 3 - Booking creation + transactional no-double-booking
Phase 4 - Public customer booking flow
Phase 5 - Admin/barber authentication + roles
Phase 6 - Admin calendar + booking management
Phase 7 - Shift management + blocked time management
Phase 8 - Customer cancellation/rescheduling
Phase 9 - Twilio + Resend notifications
Phase 10 - Reminder jobs
Phase 11 - Fresha inspection with Playwright MCP
Phase 12 - QA hardening + launch prep
Phase 13 - Optional migration/import tooling

Do not jump ahead to later phases unless explicitly instructed.

## Repo Documentation Files

Maintain these files:
- `/AGENTS.md`
- `/PROJECT_STATUS.md`
- `/docs/ARCHITECTURE.md`
- `/docs/BOOKING_RULES.md`
- `/docs/QA_CHECKLIST.md`
- `/docs/DECISIONS.md`

Update relevant docs at the end of every major task.

## Coding Conventions

Use clean, typed, modular architecture.

Keep scheduling/business logic isolated from UI components.

Prefer clear service/module boundaries:
- availability engine
- booking creation
- shifts
- blocked time
- notifications
- permissions
- customer booking flow
- admin calendar

Do not hardcode scheduling rules randomly inside frontend components.

Do not trust client-side availability.

Server-side validation is mandatory.

Booking creation must be transactional.

## Scheduling Engine Rules

The availability engine is the core product.

Availability must account for:
- selected location
- selected services
- total stacked service duration
- optional specific barber
- "Any available barber"
- barber shifts
- business hours
- confirmed bookings
- barber-specific blocked time
- location-wide blocked time
- business-wide blocked time
- 30-minute minimum notice
- 30-day max window
- 15-minute slot interval

Overlap rule:

```txt
startA < endB AND endA > startB
```

Use this consistently.

Business hours are a closed-day gate for public availability. On an open business day, saved barber shifts and one-off add overrides define the public bookable window and may intentionally start before posted opening or end after posted close.

Cancelled bookings do not block availability.

## Database Rules

Use PostgreSQL with Drizzle migrations.

Use migrations. Do not manually mutate production schema without migration history.

Important constraints:
- bookings.start_time < bookings.end_time
- shifts.start_time < shifts.end_time
- blocked_times.start_time < blocked_times.end_time
- same barber cannot have overlapping confirmed bookings
- cancelled bookings do not block availability

Prefer PostgreSQL exclusion constraints for overlapping confirmed bookings when practical. Also enforce overlap prevention with transaction-safe application logic and indexes.

Use transactional booking creation.

## Auth Phase Rules

Do not implement authentication before Phase 5.

Before Phase 5 implementation, compare these options against the repo and deployment constraints:
- custom session auth
- Supabase Auth
- Better Auth
- Clerk

Phase 0 default recommendation:
- likely choose custom session auth unless hosting/deployment constraints favor a managed provider
- defer final auth decision until Phase 5

## Security Rules

Do not commit secrets.

Use environment variables for:
- database URL
- Twilio credentials
- Resend API key
- auth secrets
- app URL

Cancellation and rescheduling links must use secure unguessable tokens.

Barbers must not be able to manage other barbers' appointments unless they have owner/admin privileges.

## Definition of Done

A phase is not complete until:
1. Requested implementation for that phase is complete
2. Relevant automated tests are added
3. Existing tests pass
4. New tests pass
5. Typecheck passes, if configured
6. Lint passes, if configured
7. Edge cases for that phase are reviewed
8. Manual QA checklist is updated where relevant
9. `/PROJECT_STATUS.md` is updated
10. `/docs/DECISIONS.md` is updated if a major product or technical decision was made
11. Final response states:
   - what changed
   - files changed
   - tests run
   - remaining risks
   - next recommended task

## Do-Not-Break Rules

Do not break:
- no-double-booking guarantee
- 15-minute slot interval
- 30-minute minimum notice
- 30-day max booking window
- closed business days remain unavailable while saved shifts can extend open-day public availability
- customer cancellation/rescheduling tokens
- owner/admin permissions
- barber ownership permissions
- notification logging
- project documentation continuity

## Fresha / Playwright MCP Rules

Use Playwright MCP only for research and workflow inspection unless explicitly authorized.

Do not mutate Fresha production data.
Do not cancel Fresha bookings.
Do not create Fresha bookings.
Do not reschedule Fresha bookings.
Do not import future bookings until a human-reviewed extraction report is approved.
