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
- Yogesh Kumar
- Laura Nguyen

Millwood:
- Laura Nguyen
- Yogesh Kumar
- Shayan Hussain

Laura and Yogesh may work at both locations.

Barbers can work split shifts and can work at different locations on the same day.

By default, the same barber cannot have overlapping shifts at different locations.

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
- notify barber
- notify customer
- update admin calendar

Cancelled bookings must not block future availability.

## Rescheduling

Customers can reschedule anytime through a secure rescheduling link.

Rescheduling should:
- validate new slot availability
- free old slot
- block new slot
- notify barber
- notify customer
- update admin calendar

Rescheduling should use the same transactional conflict checks as booking creation.

## Manual Bookings

Barbers and owners can create manual bookings/walk-ins from the admin side.

Manual bookings must obey no-overlap rules unless an owner explicitly overrides in a later phase. MVP should avoid override unless necessary.

## Blocked Time

Blocked time scopes:
1. Barber-specific
2. Location-wide
3. Business-wide

Availability must account for all applicable blocked time.

Blocked times must have start time before end time.

## Notifications

Notification events:
- booking confirmation
- 24-hour reminder
- 2-hour reminder
- cancellation confirmation
- reschedule confirmation

Twilio is used for SMS.
Resend is used for email.

Each notification attempt must be logged.

Reminder sends must be idempotent so customers do not receive duplicate reminders.
