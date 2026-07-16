# Owner Signoff Checklist

Use this checklist before replacing public Fresha booking links with `/book`.

Current launch-prep note:
- `leasidefades.com`, `/book`, and the production database are live.
- The initial production schedule has been entered from the Phase 11 observed Fresha roster and still needs owner verification below.
- Historical Twilio SMS and Resend email smoke passed with approved test contacts. Twilio is now intentionally paused and Brevo requires a fresh controlled email smoke. Raw test contact details are intentionally not stored in git.
- Fresha future-booking import remains pending until the extraction report is reviewed and explicitly approved.

## Automated Technical Verification — 2026-07-11

Machine-checked against the repo and live production (`https://leasidefades.com`) by Claude. This does **not** replace owner sign-off. Only self-describing, objectively verifiable system-behavior items are pre-ticked below (marked `✓ verified`). Every "is correct / is approved / is confirmed" item is a business or approval attestation and is left unchecked for the owner.

**Live production:** `/api/health` → `{"ok":true, database ok}`; `/book` → 200 (apex → www 307 redirect is expected). The current deploy also passed a read-only smoke (18 availability-consistency probes + owner schedule-vs-availability cross-check) and a 300-request / concurrency-15 stress run with 0 failures.

**Verified true — system behavior (the pre-ticked boxes):**
- Max advance 30 days — `availability-engine.ts` `DEFAULT_MAX_ADVANCE_DAYS = 30`, enforced.
- Min lead time 30 min — `availability-engine.ts` `DEFAULT_MINIMUM_NOTICE_MINUTES = 30`, enforced.
- Cancel / reschedule via signed links — `server.js` `/api/booking/manage/:token(/cancel|/reschedule)`, SHA-256 tokens (`bookings/tokens.ts`).
- Pay in shop, no deposits / online payment — literal `"Pay in shop."` label enforced server-side; no payment SDK in `package.json`.
- Add appointment incl. walk-in — `admin/bookings-service.ts` `createAdminManualBooking` + `createAdminWalkInBooking`; routes `POST /api/admin/bookings` and `.../walk-in`.
- Reset / invite links use production origin — built from `APP_URL` (prod `https://leasidefades.com`); delivery tests assert the origin.

**⚠ Owner attention — three repo/checklist mismatches to reconcile:**
1. **Service count is 38, not 37** — `db/seed-data.ts` (Men 16 / Women 14 / Boys 8). Reconcile the intended figure before ticking the catalog item.
2. **Laura Nguyen is assigned to BOTH locations** (Eglinton + Millwood) in `db/seed-data.ts` `barberLocationSeeds`, not a single location.
3. **Eglinton phone format differs across layers** — `"+1 (647) 348-2200"` in `server.js` / env / marketing HTML vs `"(647) 348-2200"` (no `+1`) in the structured seed and `src/data/locations.ts`; same number `+16473482200`.

**Reference values found in the repo (to speed owner confirmation of the unticked items):**
- Eglinton: Leaside Fades Eglinton, 866 Eglinton Ave E, `+16473482200`. Millwood: Leaside Fades Millwood, 909 Millwood Rd, `+14374237898`.
- Business hours (both locations): Sun 10:00–17:00, Mon–Sat 10:00–19:00.
- Roster (5): Sam To (Eglinton), Yogesh Kumar (Millwood-only ✓), Laura Nguyen (Eglinton + Millwood), Josef (Eglinton), Shayan Hussain (Millwood-only ✓).
- Categories (3): Men / Women / Boys (9 & under). Featured services: none currently flagged (all `isFeatured = false`).
- Notification senders are env-driven — `SMS_DELIVERY_MODE`, `TWILIO_FROM_NUMBER`, `EMAIL_FROM` (`Leaside Fades <bookings@leasidefades.com>`), and `BREVO_API_KEY`; values live in prod env, not git. Confirm the email sender/domain in Brevo. Twilio is paused until balance and a fresh smoke test are approved.

Remaining unticked boxes are intentional: they are business-data accuracy and launch-approval attestations that need the owner's confirmation.

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

- [x] Customers can book up to 30 days ahead.  `✓ verified` (engine max-advance = 30d)
- [x] Customers cannot book less than 30 minutes before appointment start.  `✓ verified` (engine min-notice = 30m)
- [x] Customers can cancel anytime through secure links.  `✓ verified` (signed-token cancel route)
- [x] Customers can reschedule anytime through secure links.  `✓ verified` (signed-token reschedule route)
- [x] Customers pay in shop.  `✓ verified` ("Pay in shop." label, server-enforced)
- [x] No deposits or online payments are needed for launch.  `✓ verified` (no payment/deposit mechanism in code)
- [x] Staff can create appointments through one Add appointment flow, including walk-in-style appointments.  `✓ verified` (manual + walk-in handlers)
- [ ] No-show behavior is approved.
- [ ] Drag/drop reschedule behavior is approved.

## Accounts And Staff Access

- [ ] Production owner/admin login account/email is confirmed.
- [ ] Temporary `owner@leasidefades.com` password is handed off and rotated.
- [ ] Password reset email arrives through Brevo and opens `/admin/reset-password`.
- [ ] Staff invite/onboarding plan is confirmed.
- [ ] Barber invite email arrives through Brevo and opens `/admin/accept-invite`.
- [x] Reset and invite links use the production `https://leasidefades.com` origin.  `✓ verified` (APP_URL origin, asserted by delivery tests)
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
- [x] Twilio application delivery is paused while funding is unavailable.
- [ ] Twilio sending number and balance are approved before SMS is reactivated.
- [ ] Brevo sender/domain is approved.
- [ ] Controlled live notification smoke test contacts are approved.

## Launch And Cutover

- [ ] Production host is approved.
- [ ] Production database is approved and backed up.
- [ ] Production runbook has been reviewed.
- [ ] Rollback plan has been reviewed.
- [ ] Fresha soft-transition plan is approved.
- [ ] Launch date/time is approved.
- [ ] Owner approves replacing the public Fresha booking link with `/book`.
