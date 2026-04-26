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

### Shift Service

Responsible for recurring shifts, one-off shift overrides, split shifts, and location-specific barber schedules.

Barbers can work at different locations on the same day. By default, overlapping shifts for the same barber are not allowed.

### Blocked Time Service

Responsible for:
- barber-specific blocked time
- location-wide blocked time
- business-wide closures

Availability checks must apply all relevant blocked-time scopes.

### Notification Service

Responsible for:
- abstracting Twilio and Resend providers
- logging each notification attempt
- supporting dev-mode mock sends without live credentials
- scheduling/reminding without duplicates

Use a notification outbox/log table so booking writes and notification attempts remain auditable.

### Permissions Service

Responsible for enforcing owner/admin vs barber permissions.

Barbers may manage only their own appointments and blocked time unless explicitly granted owner/admin privileges.

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
- `sessions`

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

Do not implement auth before Phase 5.

Before Phase 5, compare:
- Custom session auth: best repo fit for simple owner/barber roles, lowest vendor coupling, more security responsibility.
- Supabase Auth: strong if Supabase Postgres is chosen, but adds platform coupling and may be more than needed.
- Better Auth: good TypeScript/Express-friendly option, less hosted vendor dependency, requires integration review.
- Clerk: fastest polished admin login UX, but paid/vendor-managed and heavier than this app's MVP needs.

Phase 0 default recommendation:
- defer the final auth provider decision until Phase 5
- likely choose custom session auth unless hosting/deployment constraints favor a managed provider

## Notification Architecture

Notification events:
- booking confirmation
- 24-hour reminder
- 2-hour reminder
- cancellation confirmation
- reschedule confirmation

Channels:
- SMS through Twilio
- email through Resend

Every attempt should be logged with:
- booking ID
- recipient type
- recipient phone/email
- channel
- event type
- status
- provider message ID
- error message
- scheduled time
- sent time
- idempotency key

Reminder jobs must be idempotent and must not duplicate sends.

## Fresha Soft Migration

Launch strategy:
1. Keep Fresha active for existing booked appointments.
2. Remove Fresha booking links from the public website at launch.
3. Put the new booking platform on the website.
4. New customers book through the new platform.
5. Existing Fresha appointments are completed in Fresha over the next month.
6. Optional import tooling is Phase 13 only.

Do not inspect or mutate Fresha until Phase 11. Phase 11 inspection must be read-only unless explicitly authorized.

## Deployment Assumptions

Use environment variables for all secrets.

Required env vars eventually:
- `DATABASE_URL`
- `APP_URL`
- `AUTH_SECRET`
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`
- `RESEND_API_KEY`
- `EMAIL_FROM`
