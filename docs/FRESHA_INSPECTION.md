# Phase 11 Fresha Inspection Report

Inspection date: 2026-04-30

## Executive Summary

Phase 11 used read-only browser inspection against both public Fresha venue pages and the owner-assisted authenticated Fresha Partner admin workspace for Leaside Fades. No Fresha booking, customer, staff, schedule, service, export, import, payment, notification, or settings data was changed.

What Fresha does that matters for launch:
- Publishes both Leaside Fades locations as bookable venues.
- Uses a staff-column calendar day board with location, scheduled-team, date, view, visibility-filter, settings, waitlist, and add-action controls.
- Stores real staff records, permission roles, contact details, location records, location opening hours, weekly staff roster availability, service catalog, online booking settings, appointment reports, marketplace profile, link builder, and integration/add-on settings.
- Supports public booking through Services, Professional, Time, and Confirm steps.
- Supports operational actions beyond the Fresha Lite MVP, including group appointments, sales, quick payments, Google Reserve, marketplace metrics, client import prompts, payments add-on, gift-card/membership/product link surfaces, and ecommerce/inventory areas.

What our system already covers:
- Two locations, location business hours, staff/barber records, service categories and prices, public `/book`, barber or Any Available choice, stacked services, staff day-board calendar, walk-ins, blocked time, location/business closures, customer cancel/reschedule links, lifecycle notifications, and reminder jobs.
- The core launch-critical scheduling guarantees Fresha Lite needs: server-side availability, no double-booking, shift-aware availability, status-aware booking management, and tokenized customer self-management.

Launch-critical gaps:
- Production recurring shifts still need owner approval and entry before exposing `/book`. The Fresha roster observed for Apr 26-May 2, 2026 is useful launch input but should not be treated as approved recurring production data without owner confirmation.
- The custom seed catalog has 37 service rows, while Fresha admin showed 38 services across 3 categories. Phase 12 reconciles services by name/category/price/duration, not count alone; do not add a 38th service unless a real missing launch service is identified and owner-approved.
- Phase 12 must still do production env, domain, booking-flow, admin-flow, notification, reminder, and owner sign-off checks.

Phase 12 launch corrections:
- Fresha remains the launch data source of truth unless an explicit override is documented.
- Yogesh Kumar is Millwood-only for launch and must not be bookable at Eglinton.
- The current Eglinton phone number is correct and the prior public-phone mismatch note is not a launch blocker.
- Keep the repo's 37-service catalog if it matches the owner-approved launch offering.

Intentionally out of scope:
- Fresha data mutation, customer data scraping, raw exports, credential/cookie storage, live booking import, Phase 12 launch prep, Phase 13 import tooling, online payments/deposits, gift cards, memberships, product store, inventory, payroll, campaigns, reviews, subscriptions, advanced analytics, and Google Reserve/Facebook/Instagram automation.

## Access And Safety Notes

Public Fresha pages inspected:
- `https://www.fresha.com/a/leaside-fades-eglinton-toronto-866-eglinton-avenue-east-x30omp5d`
- `https://www.fresha.com/a/leaside-fades-millwood-toronto-909-millwood-road-jhixipcv`

Authenticated Fresha admin areas inspected read-only:
- Calendar day board.
- Calendar visibility filters, calendar settings, waitlist, and add-action menus.
- Team members.
- Scheduled shifts for Millwood and Eglinton for Apr 26-May 2, 2026.
- Location setup details for both locations.
- Service menu and one service editor, without saving.
- Marketplace profile, link builder, and add-ons/integrations overview.
- Appointments report layout, filters, status options, and table schema.

Safety notes:
- Credentials were entered by the human owner in the browser session. No credentials, cookies, screenshots, exports, or raw customer records were saved.
- The public booking shell generated transient Fresha `cartId` URLs, but no service, professional, time, or customer details were selected or submitted.
- Appointment reporting contains live client names. The report intentionally records only table schema, filter behavior, status labels/counts, and privacy-safe operational observations.
- No screenshots were saved.

## Calendar Comparison

### Fresha Observed

The authenticated Fresha calendar is a staff-column day board. The inspected URL used:

`/calendar?date=2026-04-30&view=day&location_id=2893288&calendar_selected_resources=e-working`

Key controls:
- Today button.
- Previous/next date arrows.
- Date picker, observed as `Thu 30 Apr`.
- Location selector with `Leaside Fades (Millwood)` and `Leaside Fades (Eglinton)`.
- Team selector with `Scheduled team`, `All team`, search, and individual staff choices.
- Visibility Filters drawer.
- Calendar Settings drawer.
- Waitlist drawer.
- Reset calendar to default view.
- View selector with Day, 3 day, Week, and Month.
- Add menu.

Calendar layout:
- Vertical time ruler from 12:00 AM through 11:00 PM.
- Current-time marker.
- Scheduled-team staff columns.
- For Millwood on Apr 30, visible scheduled staff columns were Yogesh Kumar and Shayan Hussain.
- The calendar uses repeated/virtualized staff-column headers in the DOM as the board is horizontally scrollable.

Add menu:
- Appointment.
- Group appointment.
- Blocked time.
- Sale.
- Quick payment.

Appointment and blocked-time creation both begin in a read-only-safe "pick from calendar" mode:
- Appointment: "Select a time to book", with `View available times` and `Close`.
- Blocked time: "Select a time to block", with `Close`.
- No time slot was selected and no record was created.

Visibility Filters drawer:
- Appointment status.
- Type.
- Channel.
- Payment status.
- Services.
- Appointment creation date.
- Requested team member.
- Options, Clear filters, and Apply controls.

Calendar Settings drawer:
- Calendar zoom controls.
- "Show quick actions on calendar" setting.
- Apply changes button.
- No settings were changed.

Waitlist drawer:
- Location filter.
- Upcoming/status filter.
- Sort by created date.
- Waiting, Expired, and Booked tabs.
- Inspected state had 0 waiting, 0 expired, and 0 booked waitlist entries.

### Our System

Our `/admin/calendar` already provides:
- Calendar-first day board.
- Owner/admin multi-barber columns.
- Barber-scoped single-calendar view.
- 15-minute grid rows.
- Current-time marker.
- Blocked-time overlays.
- Status/source-styled booking cards.
- Booking detail drawer.
- Walk-in drawer.
- No-show action.
- Booking-only drag/drop rescheduling through the server-side reschedule endpoint.

### Launch Implication

Fresha's operational calendar confirms the right overall direction for the custom admin calendar: day-board first, staff columns, quick appointment/block flows, filters, settings, waitlist visibility, and compact controls. Our custom system covers the MVP operational surface, but Phase 12 owner/barber QA should compare live daily workflows side by side with Fresha before cutover.

## Staff And Schedule Comparison

### Fresha Staff Records

Authenticated Team Members page:

| Staff member | Fresha title | Permission role |
| --- | --- | --- |
| Laura Nguyen | Barber & Stylist | High |
| Yogesh Kumar | Barber | Medium |
| Shayan Hussain | Barber | Medium |
| Sam To | Not shown in table | Workspace owner |

The table also has:
- Contact column with email/phone values, redacted and not stored.
- Row Actions menu.
- Filters.
- Custom order.
- Add.
- Bulk/actions control.

### Fresha Scheduled Shifts

The Scheduled Shifts page is a weekly roster by location. It explicitly states that team roster availability for bookings is not linked to the business standard opening hours.

Inspected week: Apr 26-May 2, 2026.

Millwood:

| Team member | Weekly total | Sun Apr 26 | Mon Apr 27 | Tue Apr 28 | Wed Apr 29 | Thu Apr 30 | Fri May 1 | Sat May 2 |
| --- | ---: | --- | --- | --- | --- | --- | --- | --- |
| Laura Nguyen | 10 hr 30 min | Not working | 3:30 PM-7 PM | 3:30 PM-7 PM | Not working | Not working | Not working | 3:30 PM-7 PM |
| Yogesh Kumar | 43 hr | Not working | Not working | 10 AM-7 PM | 10 AM-7 PM | 10 AM-7 PM | 10 AM-7 PM | 12 PM-7 PM |
| Shayan Hussain | 52 hr | 10 AM-5 PM | 10 AM-7 PM | Not working | 10 AM-7 PM | 10 AM-7 PM | 10 AM-7 PM | 10 AM-7 PM |

Eglinton:

| Team member | Weekly total | Sun Apr 26 | Mon Apr 27 | Tue Apr 28 | Wed Apr 29 | Thu Apr 30 | Fri May 1 | Sat May 2 |
| --- | ---: | --- | --- | --- | --- | --- | --- | --- |
| Laura Nguyen | 19 hr 30 min | 10 AM-5 PM | Not working | Not working | 3:30 PM-7 PM | Not working | 10 AM-7 PM | Not working |
| Yogesh Kumar | No shifts | Not working | Not working | Not working | Not working | Not working | Not working | Not working |
| Sam To | 61 hr | 10 AM-5 PM | 10 AM-7 PM | 10 AM-7 PM | 10 AM-7 PM | 10 AM-7 PM | 10 AM-7 PM | 10 AM-7 PM |

### Our System

Our system supports:
- Barber-location assignments.
- Recurring shifts.
- Split shifts as separate non-overlapping windows.
- One-off add/remove/not-working overrides.
- Barber-scoped blocked time.
- Location closures.
- Business closures.
- Server-side validation and overlap rejection when closures would strand confirmed bookings.

### Launch Implication

The inspected Fresha shifts are the most useful launch-parity data found in Phase 11. They should be manually reviewed by the owner and then entered into the custom system as production shifts if approved. Do not infer permanent recurring schedules from one inspected Fresha week without explicit approval.

## Location Comparison

### Fresha Location Setup

Fresha admin has two location records:

| Field | Millwood | Eglinton |
| --- | --- | --- |
| Fresha status | Listed location record | Listed location record |
| Public profile | View on Fresha link exists | View on Fresha link exists |
| Reviews | No reviews yet in admin list | No reviews yet in admin list |
| Address | 909 Millwood Road, Toronto (East York), M4G 1X2, Ontario | 866 Eglinton Avenue East, Toronto (East York), M4G 2L1, Ontario |
| Business type | Main: Barber | Main: Barber |
| Contact details | Email/phone present, redacted | Email/phone present, redacted |
| Opening hours | Sun 10 AM-5 PM, Mon-Sat 10 AM-7 PM | Sun 10 AM-5 PM, Mon-Sat 10 AM-7 PM |
| Tax defaults | Services: No tax; Products: No tax | Services: No tax; Products: No tax |
| Tipping | All options enabled, defaults 10%, 18%, 25% | All options enabled, defaults 10%, 18%, 25% |

Fresha describes opening hours as default working hours visible to clients, while staff roster availability is managed separately.

### Our System

Our system already seeds:
- Both locations.
- Matching official business hours.
- Location addresses.
- In-shop payment assumption.
- No online tax/payment calculation for MVP.

### Launch Implication

The location model is aligned for MVP. Phase 12 should confirm final public phone numbers and website-visible contact details, but the Phase 11 admin inspection did not store private contact values.

## Service Catalog Comparison

### Fresha Admin Setup

Fresha admin Service Menu shows:
- All categories: 38 services.
- Hair & Styling (Men): 16 services.
- Hair & Styling (Women): 14 services.
- Hair & styling (Boy 9 & Under): 8 services.
- All locations filter.
- Filters.
- Manage order.
- Add service/category controls.

Observed service list:

Men:
- Men's Wash & Fade - 30 min - CA$40.
- Men's Scalp Massage 20min - 30 min - from CA$50.
- Men's Color Root Touchup - 45 min - from CA$55.
- Men's Perm - 1 hr - from CA$75.
- Men's Cut - 30 min - CA$30.
- Men's Long Haircut - 30 min - CA$35.
- Men's Fade - 30 min - CA$35.
- Bald Fade - 45 min - CA$45.
- Senior Citizen's Cut - 30 min - CA$28.
- Line Up - 15 min - CA$15.
- Beard Trim - 15 min - CA$15.
- Beard Trim (Machine) - 15 min - CA$25.
- Hot Lather Shave - 45 min - CA$55.
- Hot Lather Head Shave - 45 min - CA$55.
- Men's Wash & Style - 15 min - CA$15.
- Men's Wash & Cut - 30 min - from CA$35.

Women:
- Women's Medium Haircut & Blowdry - 30 min - from CA$65.
- Women's Medium Haircut & Wash - 45 min - from CA$65.
- Women's Medium Haircut & Wash & Blowdry - 45 min - from CA$75.
- Women's Medium haircut - 30 min - from CA$55.
- Women's Short Haircut & Wash - 30 min - from CA$55.
- Women's Short Haircut - 30 min - from CA$45.
- Women's Wash & Blow dry - 30 min - from CA$35.
- Women's Color - 1 hr - from CA$80.
- Women's Root Touchup - 1 hr - from CA$65.
- Women's Hair Wash - 15 min - from CA$15.
- Half Head highlights - 1 hr 30 min - from CA$95.
- Full Head Highlights - 1 hr 30 min - from CA$150.
- Single Pack Highlights - 15 min - CA$15.
- Eight Pack Highlights - 45 min - from CA$55.

Boys:
- Boy's Cut & Wash (Under 9) - 30 min - CA$30.
- Boy's Cut & Wash (10 & Over) - 30 min - CA$35.
- Boy's Fade & Wash (10 & Over) - 30 min - CA$40.
- Boy's Fade & Wash (Under 9) - 30 min - CA$35.
- Boy Fade (10 & Over) - 30 min - CA$35.
- Boy Haircut (10 & Over) - 30 min - CA$30.
- Boy's Fade (Under 9) - 30 min - CA$30.
- Boy's Cut (Under 9) - 30 min - CA$25.

Observed service editor sections:
- Basic details.
- Locations.
- Team members.
- Resources.
- Service add-ons.
- Online booking.
- Portfolio images.
- Forms.
- Commissions.
- Settings.

For the inspected service:
- Locations count: 2.
- All locations selected.
- Team members count: 4.
- All team members selected.
- Online booking enabled.
- Available for all genders.
- Optional settings exist for upselling, service availability date limits, and day/time limits.
- No changes were made and Save was not clicked.

### Our System

Our seed catalog currently has:
- Same broad category structure.
- 37 service rows.
- Fixed and `from` pricing.
- Same core duration range.
- All services available at both locations for MVP.
- Every barber can perform every service for MVP.

### Launch Implication

Before launch, reconcile the custom seed catalog to the actual owner-approved launch offering by service name, category, price, and duration. The admin inspection confirms likely missing or newly visible services versus earlier public-only inspection, especially Single Pack Highlights and Eight Pack Highlights, and confirms Men's hot-lather services and Men's Wash & Style/Cut are part of the admin service menu. Do not add a service based on the 38-service count alone.

## Booking Behavior Comparison

### Fresha Public Booking

Visible public booking behavior:
- Public pages are bookable for both locations.
- Public booking shell uses Services, Professional, Time, and Confirm.
- Services can be selected before choosing a professional.
- Staff preference is enabled.
- Group appointment option is visible.
- Continue is disabled until a service is selected.
- Public pages show instant confirmation language.
- Public structured data did not show enabled public Fresha Pay, packages, gift cards, product store, memberships, or vouchers.

### Fresha Admin Booking And Reporting

Appointment report:
- Page: `/sales/appointments-list`.
- Description: "View, filter and export appointments booked by your clients."
- Table columns:
  - Client.
  - Service.
  - Created by.
  - Created Date.
  - Scheduled Date.
  - Duration.
  - Location.
  - Team member.
  - Price.
  - Status.
  - Ref #.
- Default range observed: Month to date.
- Sort observed: Scheduled Date (newest first).
- Report showed "Showing 100 of 569 results" with Load 100 more.
- Visible status values included Booked and Canceled.
- Status filter options:
  - Booked.
  - Confirmed.
  - Arrived.
  - Started.
  - Completed.
  - Canceled.
  - No-show.
- Other filters:
  - Location.
  - Team member.
  - Channel.
  - Status.
- Channel filter options included online, marketplace, Book now link, Facebook, Instagram, Google Reserve, marketing, AI Concierge, and Offline.
- Export control exists. It was not clicked.

Calendar add flows:
- Add Appointment starts by selecting a calendar time.
- Add Blocked time starts by selecting a calendar time.
- Group appointment is present but was not opened.
- Sale and Quick payment are present but were not opened.

Cancellation/rescheduling behavior:
- Existing booking cancellation/reschedule controls were not exercised.
- No existing booking drawer was opened from a live booking card, because screens containing live client details were intentionally minimized and no mutation was allowed.
- Status behavior was inspected through appointment report status filters and visible status values only.

### Our System

Our public/admin behavior:
- `/book` supports location, one or more services, barber or Any Available, weekly availability, details, review, and confirmation.
- Public bookings require phone/email.
- Pay in shop is displayed.
- Secure customer cancel/reschedule links are generated for public bookings.
- Lifecycle notifications and reminders are implemented.
- `/admin/calendar` supports walk-ins, cancel, reschedule, no-show, and booking drag/drop through server validation.

### Launch Implication

Our MVP covers the core operational booking behavior. Fresha's group appointments, sale/quick-payment flows, advanced channels, and export/reporting depth are intentionally outside MVP unless separately approved.

## Online Booking, Marketplace, And Integrations

Fresha admin surfaces:
- Marketplace profile with 2 profiles.
- Marketplace metrics, including total new clients, total sales, and Marketplace ROI.
- Client import banner. This was not clicked and no import/export was performed.
- Link Builder options:
  - Link to everything.
  - Link to services.
  - Link to memberships.
  - Link to gift cards.
- Add-ons/integrations overview:
  - Payments shown as active.
  - Google Reserve shown as active.
  - Facebook and Instagram bookings integration available.
  - Meta Pixel Ads and Google Analytics integration surfaces.
  - Product store navigation exists.

Launch implication:
- These are not blockers for the custom MVP. At launch, the website should replace public Fresha booking links with `/book`; Google Reserve/social booking links should not be changed until Phase 12 owner-approved cutover steps.

## Data Migration And Import Notes

Manual setup needed before launch:
- Owner-approved recurring shifts by barber and location.
- Owner-approved service catalog, including durations and prices.
- Featured services for the public booking flow.
- Final staff/location assignments.
- Final public contact details and website/social links.
- Decision on whether all services remain available at both locations and every barber can perform every service.

Potential Phase 13 import candidates, only after owner approval:
- Future Fresha appointments.
- Customer contact records tied to future appointments.
- Appointment service snapshots.
- Staff assignments and appointment status labels.

Do not import automatically without owner approval:
- Private customer notes.
- Historical appointments not needed for launch operations.
- Marketing/review/customer profile data.
- Payment, deposit, membership, voucher, or product data.
- Raw appointment or client exports.
- Any data from the "Import clients" flow.

Privacy risks:
- Fresha reports and client drawers contain customer names and potentially phone, email, notes, appointment history, and payment context.
- Later extraction must use a human-reviewed, redacted report before any import tooling is approved.

## Launch Readiness Implications

Must fix before launch:
- Enter owner-approved production shifts.
- Reconcile services by name/category/price/duration and get owner approval for either the current 37-service catalog or a clearly identified missing service.
- Confirm public contact details during Phase 12. The current Eglinton phone number is accepted as correct by the Phase 12 correction.
- Run Phase 12 production smoke tests and controlled live notification checks.
- Confirm final cutover plan for public website booking links, Google Reserve, and social booking links.

Can wait until after launch:
- Staff-side workflow polish after owner/barber feedback.
- Group appointments.
- Staff reminder SMS.
- Advanced service/staff eligibility rules.
- Marketplace metrics/reporting parity.
- Optional import tooling.

Should remain out of scope:
- Online payments/deposits in the custom app.
- Gift cards, memberships, packages, vouchers, product store, inventory.
- Payroll, marketing campaigns, reviews, subscriptions, advanced analytics.
- Automatic live Fresha import.
- Google Reserve or social booking automation.

## Screenshots And Artifacts

No Phase 11 screenshots were saved.

Reason:
- Written observations were enough.
- Authenticated admin screens include staff contact and client/report data.
- Avoiding screenshots eliminated the risk of storing sensitive customer information.

## Recommendations

Critical launch blockers:
- Get owner approval for real recurring barber schedules and enter them before exposing `/book`.
- Get owner approval for the final service catalog by details, not count alone.
- Complete Phase 12 production QA and owner sign-off before public cutover.

Nice-to-have improvements:
- Add a launch checklist item to compare a real Fresha day board and the custom `/admin/calendar` during owner QA.
- Consider adding a read-only "appointment report" view later if the owner depends on Fresha's report table.
- Preserve the current MVP boundary around Pay in shop while noting that Fresha has payment-related admin surfaces.

Do not build this yet:
- Fresha import tooling.
- Online payments or deposits.
- Group appointments.
- Gift cards, memberships, packages, vouchers, product store, or inventory.
- Google Reserve/social booking automation.
- Advanced analytics or marketing features.

## Phase 11 Completion Statement

Phase 11 is complete from an inspection/reporting perspective:
- Public Fresha pages were inspected read-only.
- Authenticated Fresha admin was inspected read-only.
- Calendar, staff, schedules, locations, service catalog, online booking, and appointment-report behavior were documented.
- No Fresha data was mutated.
- No raw private customer data, screenshots, credentials, cookies, or exports were stored in the repo.
