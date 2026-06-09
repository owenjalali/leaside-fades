# Booking Rules - Leaside Fades Booking System

## Locations

- Leaside Fades Millwood
- Leaside Fades Eglinton

## Business Hours

Both locations:

- Monday: 10:00 AM - 7:00 PM
- Tuesday: 10:00 AM - 7:00 PM
- Wednesday: 10:00 AM - 7:00 PM
- Thursday: 10:00 AM - 7:00 PM
- Friday: 10:00 AM - 7:00 PM
- Saturday: 10:00 AM - 7:00 PM
- Sunday: 10:00 AM - 5:00 PM

Customers cannot book outside official business hours.

If a barber shift extends outside official business hours, customer availability must be clipped to official business hours.

## Staff

Eglinton:
- Sam To
- Laura Nguyen
- Josef

Millwood:
- Laura Nguyen
- Yogesh Kumar
- Shayan Hussain

Laura may work at both locations.

Yogesh Kumar is Millwood-only for launch. He must not be bookable at Eglinton unless the owner explicitly changes this launch rule.

Josef is Eglinton-only for launch. He works 11:00 AM-7:00 PM; customer availability must still be clipped to official business hours, including the Sunday 5:00 PM close.

Barbers can work split shifts and can work at different locations on the same day.

By default, the same barber cannot have overlapping shifts at different locations.

## Team Management

Owner/admin users can create barbers from `/admin/team` without a deploy.

Creation requires:
- display name
- email invite
- JPG/PNG/WebP profile photo up to 4 MB
- at least one assigned active location
- at least one 15-minute-aligned weekly shift assigned to a selected location

Created barbers are active immediately after the transaction commits. They are assigned to all active services by default, matching the MVP service rule, and they can be booked publicly before accepting their invite. Invite acceptance controls only the barber's own login access.

Removal is deactivation. If future confirmed bookings exist, removal is rejected until those appointments are cancelled or rescheduled. Successful removal deactivates the barber profile, linked users, and active sessions, and hides the barber from future public/admin booking selection while preserving historical bookings.

## Shift Management

Phase 7 schedule management rules:
- owner/admin users can create, edit, list, and deactivate recurring shifts
- split shifts are represented as multiple same-day non-overlapping shift windows
- adjacent shift windows are allowed
- active shifts for the same barber, same weekday, overlapping local time, and overlapping effective date ranges are rejected
- one-off `add` and `remove` overrides require valid start/end times
- one-off `add` overrides require a location
- one-off `not_working` overrides cover the whole date and must not include start/end times
- barber users can view relevant schedule context but cannot manage recurring shifts or shift overrides
- barber users can replace only their own one-day shift from the selected day/location calendar header
- owner/admin users can replace any barber's one-day shift from the selected day/location calendar header
- one-day shift replacement diffs desired windows against the recurring baseline and writes same-day `add`/`remove` override rows
- all shift and override mutations are validated server-side and use 15-minute local-time boundaries

## Admin Calendar Visibility

The admin day-board columns are derived from active barber-location assignment and role scope.

Rules:
- owner/admin users see all active barbers assigned to the selected location, even if a barber has no working window that day
- barber users see only their linked barber column when assigned to the selected location
- the day board keeps a full staff operating surface from 12:00 AM through the 11:00 PM hour, but the initial viewport defaults to 9:00 AM and scrolls rather than compressing the whole day into one screen
- `add`, `remove`, and `not_working` shift overrides must affect displayed working windows
- non-working time should be shaded visually, explicit blocked time should render separately, and blocked time remains non-clickable
- authenticated staff can click or drag appointments into grey non-working cells when they need to book outside public online availability
- public customers cannot book grey non-working cells; public availability still requires official business hours, shifts, minimum notice, and 30-day max window
- if a booking exists outside a staff member's working window, show it with an outside-hours warning instead of deleting or silently hiding the data
- if no active staff are assigned to the selected location, show a clean empty state

## Booking Window

- Max advance booking: 30 days
- Minimum notice: 30 minutes
- Slot interval: 15 minutes
- Buffer: none for MVP

The 30-minute minimum notice is evaluated against appointment start time.

## Services

Customers can select one or multiple services.

If multiple services are selected, total duration is the sum of selected service durations.

For MVP:
- all services are available at both locations
- every barber can perform every service

## Pricing

Customers pay in shop.

Display listed price exactly as configured.

Do not calculate tax online.

Do not build payment processing.

Always show: `Pay in shop.`

For stacked services:
- show itemized service prices
- if all selected services are fixed price, show estimated total
- if any selected service uses `from`, show estimated total as `from $X` or show itemized pricing only

## Dashboard Revenue

Dashboard revenue is not online payment revenue, POS-verified revenue, payroll revenue, or an editable paid amount.

Rules:
- revenue means tracked service-snapshot value for appointments that have happened
- revenue is summed from immutable `booking_services.price_cents` snapshots
- totals are grouped by the appointment's `America/Toronto` local date
- completed bookings count toward revenue
- confirmed bookings count toward revenue only when their start time is current or past
- future confirmed, cancelled, and no-show bookings do not count toward revenue
- completed or past-confirmed bookings without service snapshots count as unpriced appointments but do not increase the revenue total
- services configured as `from` prices count at their stored snapshot total and should show a caveat in the dashboard
- when the dashboard has no explicit anchor date, the revenue card should anchor to the latest reportable historical appointment date for the actor scope
- the All time dashboard period spans the actor-scoped earliest/latest happened appointments, uses monthly buckets, and still excludes future confirmed, cancelled, and no-show bookings
- completing an appointment does not create a payment record, send a lifecycle notification, or change customer payment handling

## Availability Requirements

Availability must account for:
- selected location
- selected service IDs
- total stacked duration
- optional selected barber
- "Any available barber"
- official business hours
- barber shifts
- one-off shift overrides
- confirmed bookings
- barber-specific blocked time
- location-wide blocked time
- business-wide blocked time
- 30-minute minimum notice
- 30-day booking window
- 15-minute slot interval

Availability output should include valid slots grouped by barber.

## Overlap Rule

Use this overlap rule consistently:

```txt
startA < endB AND endA > startB
```

Adjacent appointments are allowed.

Example:
- Appointment A: 10:00-10:30
- Appointment B: 10:30-11:00
- This is valid.

## Double Booking

The same barber cannot have overlapping confirmed bookings.

Cancelled bookings do not block availability.

Booking creation must be transactional and must re-check overlap on the server.

Do not trust client-side availability.

## Any Available Barber

If customer chooses "Any available barber", the system should return valid slots across eligible barbers.

At booking time, the server must assign a valid barber and perform transactional conflict checks.

Assignment default:
1. valid candidate at requested time
2. lowest barber sort order
3. fewest bookings for that barber on selected date
4. stable barber ID tie-breaker

## Cancellation

Customers can cancel anytime through a secure cancellation link.

Cancellation should:
- update booking status to cancelled
- free the time slot
- notify customer/staff after successful mutation when valid contact exists, except imported bookings
- update admin calendar

Cancelled bookings must not block future availability.

Phase 8 customer cancellation rules:
- public bookings generate secure cancellation tokens by default
- cancellation tokens are stored only as SHA-256 hashes
- cancellation links do not expire in Phase 8
- invalid or wrong-action tokens are rejected generically
- cancelling an already-cancelled booking is safe and idempotent
- completed and no-show bookings cannot be cancelled through customer links
- walk-ins do not receive customer cancellation links in Phase 8

Phase 9 cancellation notification rules:
- dispatch only after the cancellation mutation succeeds
- notification failure must not roll back cancellation
- duplicate/idempotent cancellation attempts must not send duplicate messages
- walk-ins may create cancellation notification attempts when valid customer/staff contact exists; imported bookings remain excluded

## Rescheduling

Customers can reschedule anytime through a secure rescheduling link.

Rescheduling should:
- validate new slot availability
- free old slot
- block new slot
- notify customer/staff after successful mutation when valid contact exists, except imported bookings
- update admin calendar

Rescheduling should use the same transactional conflict checks as booking creation.

Phase 8 customer rescheduling rules:
- public bookings generate secure reschedule tokens by default
- reschedule tokens are stored only as SHA-256 hashes
- reschedule links do not expire in Phase 8
- invalid or wrong-action tokens are rejected generically
- rescheduling changes time, location, and/or barber only
- services, service snapshots, pricing snapshots, and customer details are preserved
- the booking being moved is excluded from its own old-slot conflict check
- all other confirmed booking overlaps, blocked times, closures, shifts, business hours, 15-minute slot boundaries, 30-minute minimum notice, and 30-day max window are enforced server-side
- walk-ins do not receive customer reschedule links in Phase 8

Phase 9 reschedule notification rules:
- dispatch only after the reschedule transaction commits
- notification failure must not roll back rescheduling
- idempotency keys include the new appointment start time or equivalent occurrence marker
- walk-ins may create reschedule notification attempts when valid customer/staff contact exists; imported bookings remain excluded

## Manual Bookings

Barbers and owners create staff-entered appointments from one Add appointment workflow in the admin calendar/dashboard.

Manual bookings must obey no-overlap rules unless an owner explicitly overrides in a later phase. MVP should avoid override unless necessary.

Current staff-created appointment rules:
- staff-created appointments require an explicit barber
- customer name, service, barber, time, and location are required
- customer phone/email are optional for staff-created appointments
- barber users can create appointments only for their linked barber profile
- owner/admin users can create appointments for any active eligible barber
- staff-created appointments use a dedicated transactional staff-scheduling path
- staff-created appointments are stored with `source = "manual"` or `source = "walk_in"` from the unified Add appointment workflow
- staff-created appointments can use grey off-shift/non-public times shown on the admin calendar
- staff-created appointments bypass public-only business-hour, shift-fit, 30-minute notice, and 30-day max-window limits
- staff-created appointments still enforce active location/barber/service, barber ownership permissions, 15-minute boundaries, same-local-day admin board bounds, blocked time/closures, and no-overlap validation
- no owner override exists
- Phase 8 does not expose customer management links in the staff-created appointment UI
- Phase 9 sends/logs staff-created lifecycle notifications after successful create/cancel/reschedule when valid customer/staff contact exists; missing contact creates skipped attempts and does not fail the booking

Legacy walk-in API rules:
- `POST /api/admin/bookings/walk-in` remains available for compatibility with existing QA and older clients
- walk-ins are stored with `source = "walk_in"`
- customer name is required
- phone and email are optional
- if phone/email exists, walk-ins create booking confirmation attempts and are eligible for reminders
- if neither phone nor email exists, the booking still succeeds and missing customer contact is logged as skipped notification attempts

Phase 13 imported booking rules:
- imported Fresha appointments are stored with `source = "imported"`
- import dry-run must report conflicts before apply
- apply mode requires a human-reviewed report confirmation
- imported bookings do not generate customer cancellation/rescheduling tokens
- imported bookings do not send lifecycle confirmation/cancellation/reschedule notifications at import time
- imported bookings are excluded from reminder jobs
- confirmed imported bookings still block availability through the same confirmed-booking overlap rules

## Admin Cancellation And Rescheduling

Phase 6 admin-side cancellation and rescheduling are authenticated staff actions, not customer token flows.

Admin cancellation:
- owner/admin can cancel any scoped booking
- barber users can cancel only their own bookings
- cancelling an already-cancelled booking is safe and idempotent
- completed and no-show bookings are view-only for Phase 6
- Phase 9 cancellation notifications dispatch after successful cancellation and never roll back the booking mutation

Admin rescheduling:
- owner/admin can reschedule any scoped confirmed booking
- barber users can reschedule only their own bookings
- rescheduling changes time, location, and/or barber only
- rescheduling can use grey off-shift/non-public times shown on the admin calendar
- service changes are handled by the full admin edit flow, not the reschedule shortcut
- rescheduling revalidates active records, role scope, 15-minute/admin-day bounds, blocked time, and overlap server-side
- the booking being moved is excluded from its own old-slot conflict check, but no other confirmed booking is excluded
- customer rescheduling token flows were implemented in Phase 8
- Phase 9 reschedule notifications dispatch after the reschedule transaction commits and use occurrence-aware idempotency

Admin editing:
- owner/admin can edit any scoped confirmed booking
- barber users can edit only their own confirmed bookings
- editing can update customer name, phone, email, customer notes, internal notes, date/time, barber, location, and selected services
- empty phone/email values clear the linked customer contact fields
- editing recalculates service snapshots, total duration, and end time transactionally
- editing preserves booking source, status, and existing customer management token hashes
- editing can use grey off-shift/non-public times shown on the admin calendar
- editing rejects same-barber overlaps, blocked time/closures, invalid services/barbers/locations, out-of-admin-day times, and unauthorized barber changes

Phase 7.5 no-show:
- owner/admin can mark any current or past confirmed booking as no-show
- barber users can mark only their own current or past confirmed bookings as no-show
- future bookings cannot be marked no-show
- cancelled, completed, and already no-show bookings cannot be marked no-show
- no-show does not send notifications, charge fees, or create payment records in Phase 7.5
- no-show bookings should be visually distinct in the calendar, using red styling

Admin completion:
- owner/admin can mark any scoped current or past confirmed booking as completed
- barber users can mark only their own current or past confirmed bookings as completed
- future bookings cannot be marked completed
- cancelled, already-completed, and no-show bookings cannot be marked completed
- completion sends no lifecycle notification, charges no fees, and creates no payment records
- completed bookings are not cancellable or reschedulable through the existing customer/admin mutation rules
- completion does not weaken availability correctness; only confirmed bookings block future slots

Phase 7.5 drag/drop:
- drag/drop applies only to confirmed bookings
- drag/drop must call the authenticated admin reschedule endpoint
- the backend remains the source of truth for all moves
- rejected moves must leave or return the booking card to its original slot
- barber users can drag only their own bookings and only within their own calendar column
- owner/admin cross-barber moves are allowed only through the same reschedule validation path
- drag/drop is snapped to 15-minute slot boundaries
- shifts, closures, and blocked time are not drag/drop editable in Phase 7.5

## Blocked Time

Blocked time scopes:
1. Barber-specific
2. Location-wide
3. Business-wide

Availability must account for all applicable blocked time.

Blocked times must have start time before end time.

Phase 7 blocked-time management rules:
- owner/admin users can create, edit, list, and delete all blocked-time scopes
- barber users can create, edit, list, and delete only their own barber-scoped blocked time
- business closures cannot include a barber or location
- location closures require a location and cannot include a barber
- barber blocked time requires a barber and can optionally be narrowed to one assigned location
- blocked-time start/end inputs are local `America/Toronto` date/time fields converted to UTC on the server
- new or updated blocked times are rejected when they overlap existing confirmed bookings in the affected scope
- blocked-time mutations do not cancel, reschedule, or notify existing bookings in Phase 7

## Notifications

Notification events:
- booking confirmation
- cancellation confirmation
- reschedule confirmation
- 24-hour reminder
- 2-hour reminder

Twilio is used for SMS.
Resend is used for email.

Notification dispatch rules:
- dispatch only after successful booking create/cancel/reschedule mutations
- do not send provider messages inside booking database transactions
- notification failures must be logged and must not fail booking mutations
- missing or invalid customer phone/email logs a skipped customer attempt
- booking confirmation sends/logs customer SMS/email and assigned barber SMS/email when contact exists
- missing or invalid barber phone/email logs skipped staff attempts
- owner/admin users see booking and delivery activity through the in-app Dashboard Notification Center instead of outbound owner/admin email
- staff-created walk-ins with customer contact create notification attempts through the shared booking dispatcher; name-only walk-ins log skipped missing-contact attempts without failing creation
- no-shows, schedule changes, password resets, and barber invites remain out of notification scope
- customer confirmation messages include cancel/reschedule URLs only when raw URLs are available from the booking response
- raw customer management tokens must never be reconstructed from hashes or persisted in notification logs
- reminder jobs are run by `npm run notifications:send-reminders`
- production reminder delivery should pass `npm run notifications:check-live-config` before scheduler enablement
- reminder jobs send customer SMS/email only for confirmed public/manual/walk-in bookings
- cancelled, completed, no-show, and imported bookings do not receive reminders
- reminder jobs re-check current booking status, source, and start time immediately before sending
- reminder messages do not include cancel/reschedule links because raw management tokens are not stored

Each notification attempt must be logged with event type, channel, provider, recipient, status, idempotency key, booking reference, payload/error metadata, and timestamps where practical.

Idempotency rules:
- confirmation and cancellation keys are stable per booking/event/channel/recipient
- reschedule keys include the new start time or equivalent mutation occurrence marker
- reminder keys include the current appointment start time or equivalent occurrence marker
- duplicate sent/skipped/pending attempts must not send again and should update attempt bookkeeping
- failed provider attempts may be retried with the same idempotency key and updated attempt bookkeeping
