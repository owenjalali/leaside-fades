# Owner Signoff Checklist

Use this checklist before replacing public Fresha booking links with `/book`.

Current launch-prep note:
- `leasidefades.com`, `/book`, and the production database are live.
- The initial production schedule has been entered from the Phase 11 observed Fresha roster and still needs owner verification below.
- Controlled Twilio SMS smoke has passed. Live email delivery is not approved until the Resend sending domain is verified and a controlled email smoke test passes.
- Fresha future-booking import remains pending until the extraction report is reviewed and explicitly approved.

## Business Data

- [ ] Leaside Fades Eglinton location details are correct.
- [ ] Leaside Fades Millwood location details are correct.
- [ ] Eglinton phone number is approved as `+1 (647) 348-2200`.
- [ ] Millwood phone number is approved.
- [ ] Business hours are correct for both locations.
- [ ] Staff roster is correct.
- [ ] Yogesh Kumar is approved as Millwood-only for launch.
- [ ] Laura Nguyen location assignment is correct.
- [ ] Sam To location assignment is correct.
- [ ] Shayan Hussain location assignment is correct.
- [ ] Real recurring schedules are approved by barber and location.
- [ ] Launch closures or blocked time are approved.

## Services

- [ ] Service categories are correct.
- [ ] Service names match the launch offering.
- [ ] Prices are correct.
- [ ] Durations are correct.
- [ ] `from` pricing labels are correct.
- [ ] Featured/public-facing services are approved.
- [ ] The 37-service repo catalog is approved, or any real missing Fresha service is identified by name/category/price/duration before being added.

## Booking Rules

- [ ] Customers can book up to 30 days ahead.
- [ ] Customers cannot book less than 30 minutes before appointment start.
- [ ] Customers can cancel anytime through secure links.
- [ ] Customers can reschedule anytime through secure links.
- [ ] Customers pay in shop.
- [ ] No deposits or online payments are needed for launch.
- [ ] Staff can create appointments through one Add appointment flow, including walk-in-style appointments.
- [ ] No-show behavior is approved.
- [ ] Drag/drop reschedule behavior is approved.

## Accounts And Staff Access

- [ ] Production owner/admin login account/email is confirmed.
- [ ] Temporary `owner@leasidefades.com` password is handed off and rotated.
- [ ] Staff invite/onboarding plan is confirmed.
- [ ] Barber login behavior is approved.
- [ ] Staff who need appointment notifications have approved phone/email contacts entered.
- [ ] Missing staff contact info is accepted as a launch readiness issue only if the owner explicitly approves.

## Notifications

- [ ] Customer booking confirmation wording is approved.
- [ ] Staff booking notification wording is approved.
- [ ] Owner/admin Dashboard Notification Center wording and visibility are approved.
- [ ] Customer cancel/reschedule notification wording is approved.
- [ ] Reminder wording is approved.
- [ ] Reminder timing is approved.
- [ ] Twilio sending number is approved.
- [ ] Resend sender/domain is approved.
- [ ] Controlled live notification smoke test contacts are approved.

## Launch And Cutover

- [ ] Production host is approved.
- [ ] Production database is approved and backed up.
- [ ] Production runbook has been reviewed.
- [ ] Rollback plan has been reviewed.
- [ ] Fresha soft-transition plan is approved.
- [ ] Launch date/time is approved.
- [ ] Owner approves replacing the public Fresha booking link with `/book`.
