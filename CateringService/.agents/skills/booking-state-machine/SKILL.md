---
name: booking-state-machine
description: Use when implementing, changing, or testing booking status transitions (request, accept, reject, pay, complete, cancel, expire) or refund calculation in the catering app.
---

# Booking State Machine

## Goal
Keep booking status changes valid, authorized, and auditable. The database is the authority;
the UI only reflects it.

## Source of truth
The transition table and cancellation policy are in `SPEC.md`. Read them before changing
anything. If behavior must change, update `SPEC.md` first and tell the user.

## Implementation
- Status changes happen only through `security definer` Postgres functions:
  - `accept_booking(booking_id, note)` - caterer who owns it; status `requested`; sets
    `total_amount`, `commission_pct`, `commission_amount` from package, guests, add-ons, and
    `platform_settings`.
  - `reject_booking(booking_id, note)` - caterer who owns it; status `requested`.
  - `cancel_booking(booking_id, reason)` - customer or caterer of that booking; status
    `requested`, `accepted`, or `paid`; computes `refund_amount` per policy when paid.
  - `complete_booking(booking_id)` - caterer; status `paid`; only on or after `event_date`.
  - `expire_stale_bookings()` - scheduled; `requested` older than 48h and `accepted`
    unpaid older than 24h become `expired`.
  - The `paid` transition is performed only by the webhook Edge Function (service role).
- Each function: check `auth.uid()` and role, lock the row (`for update`), check the current
  status is allowed, update, insert into `booking_status_history`, return the updated row.
- Clients cannot `update bookings.status` directly (RLS denies it).

## Tests (required)
For each transition in the table, test:
- Allowed actor + allowed from-status succeeds and writes history
- Wrong actor (other customer, other caterer, anon) fails
- Wrong from-status fails (e.g. completing an `accepted` booking)
- Double-calls are safe (second call fails cleanly, no duplicate history)
Also test refund amounts at the 7+, 3-7, and under-3 day boundaries, and caterer-initiated
cancellation (100% refund).

## UI mapping
- `requested`: customer sees "Waiting for caterer"; caterer sees Accept/Reject.
- `accepted`: customer sees Pay button; caterer sees "Awaiting payment".
- `paid`: both see confirmed details; caterer sees "Mark completed" on/after event date.
- `completed`: customer sees review form.
- `rejected`, `cancelled`, `expired`: read-only with reason.

## Checklist before finishing
- [ ] No code path updates status outside the functions above
- [ ] History row written for every transition
- [ ] Tests cover allowed, wrong actor, wrong status, repeat call
- [ ] SPEC.md and UI mapping still match the implementation
