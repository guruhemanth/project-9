# CaterConnect - Product Spec (MVP)

Working name. A marketplace where caterers register, get verified, and list menus; customers
discover caterers and book them for events. Similar to how ride platforms verify drivers
before they can accept trips.

## Roles and what they can do

### Customer
- Sign up / log in
- Browse and search approved caterers by city, cuisine, budget (per plate), guest count
- View caterer profile, packages, ratings
- Send a booking request (package, date, time, guest count, venue, special requests)
- Pay after the caterer accepts
- See booking status; cancel per policy
- Rate and review after completion

### Caterer
- Register: business name, owner name, phone, city, service areas, FSSAI number,
  optional GST number, upload documents (FSSAI certificate, ID proof, photos)
- Wait in `pending` status until an admin approves
- Manage packages (per-plate price, minimum guests, items, add-ons)
- See incoming requests; accept or reject with an optional note
- Mark an accepted and paid booking as completed after the event
- View earnings and booking history

### Admin
- Review pending caterers; approve, reject (with reason), or suspend
- View all bookings and payments
- Set the platform commission percentage
- Resolve disputes manually (record outcome; refunds triggered from the Razorpay dashboard in MVP)

## Caterer verification states
`pending` -> `approved` | `rejected`; `approved` -> `suspended`; `rejected` -> `pending`
(on resubmission). Only `approved` caterers are visible to customers and can receive bookings.

## Booking state machine

```
requested --accept--> accepted --payment webhook--> paid --caterer marks done--> completed
    |                    |                              |
    |--reject--> rejected|--customer cancels--> cancelled|--cancel (policy applies)--> cancelled
    |--customer cancels--> cancelled
    |--expires (no reply in 48h)--> expired
```

Allowed transitions:

| From | To | Who/what triggers |
|---|---|---|
| requested | accepted | caterer |
| requested | rejected | caterer |
| requested | cancelled | customer |
| requested | expired | scheduled job (48h without reply) |
| accepted | paid | Razorpay webhook only |
| accepted | cancelled | customer or caterer |
| accepted | expired | scheduled job (unpaid after 24h) |
| paid | completed | caterer, only on or after event date |
| paid | cancelled | customer or caterer (refund policy applies) |

All other transitions are rejected by the database. Every transition writes a row to
`booking_status_history`.

## Payments
- Payment is requested **only after acceptance**.
- Open decision (confirm before Milestone 6): collect full amount, or an advance of 20-30%
  with the balance settled directly/later. Default for MVP: **full amount at acceptance**.
- Razorpay order created by an Edge Function; webhook verifies signature and sets `paid`.
- Commission is a percentage set by admin, stored on each booking at the time of acceptance
  so later changes do not affect existing bookings.
- Payout to caterers: manual in MVP (admin sees amounts owed). Razorpay Route can be added later.

## Cancellation and refunds (default policy, adjust before launch)
| Cancelled by | When | Refund |
|---|---|---|
| Customer | 7+ days before event | 100% |
| Customer | 3-7 days before | 50% |
| Customer | under 3 days | 0% |
| Caterer | any time after payment | 100% + flagged on caterer record |

## Reviews
- One review per completed booking, written by the customer: rating 1-5 and optional text.
- Average rating and count shown on caterer profile.

## Notifications (MVP)
- Email on: new request (caterer), accepted/rejected (customer), payment received (both),
  approval/rejection (caterer).
- WhatsApp: a "chat on WhatsApp" deep link only. No Business API yet.

## Milestones

| # | Milestone | Done when |
|---|---|---|
| 1 | Data: schema, enums, RLS, seed data | RLS tests pass for all roles |
| 2 | Auth and roles | Each role lands on its own area and cannot open others |
| 3 | Caterer onboarding and menus | Caterer registers, uploads docs, creates packages, shows as pending |
| 4 | Admin panel | Admin approves; caterer becomes publicly visible |
| 5 | Customer discovery and booking request | Request reaches caterer; accept/reject works |
| 6 | Payments | Test-mode payment moves booking to `paid` via webhook |
| 7 | Reviews, notifications, PWA polish | End-to-end demo works on a phone |
| 8 | Pilot | 5-10 real caterers onboarded, 10 real bookings |

## Out of scope for MVP
Real-time availability calendar, in-app chat, recurring corporate orders, multi-location
caterers, native mobile apps, automated payouts, map-radius search, coupons.

## Success criteria for the pilot
- A caterer can go from signup to approved listing in under one day.
- A customer can go from search to booking request in under three minutes.
- No booking is ever marked paid without a verified webhook.
