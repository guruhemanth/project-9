---
name: razorpay-integration
description: Use when implementing or changing payments, checkout, webhooks, refunds, or commission handling with Razorpay for the catering app.
---

# Razorpay Integration

## Goal
Collect payment for an accepted booking and mark it paid only from a verified webhook.

## Flow
1. Booking is `accepted` and has `total_amount` and `commission_amount` set.
2. Client calls Edge Function `create-payment-order` with the `booking_id`.
3. The function (service role) checks: caller owns the booking, status is `accepted`, no
   captured payment exists. It creates a Razorpay order for `total_amount` paise (INR) with
   the booking id in `notes`, stores a `payments` row (`created`), and returns `order_id` and
   the public key id.
4. Client opens Razorpay Checkout with that order. The client result is only for UX.
5. Razorpay calls Edge Function `razorpay-webhook`. It:
   - Reads the **raw body** and verifies `X-Razorpay-Signature` with the webhook secret
     (HMAC SHA256). Reject with 400 if invalid.
   - Handles `payment.captured` (set payment `captured`, booking `paid` via the transition
     function, write status history), and `payment.failed`.
   - Is **idempotent**: if the payment is already captured, return 200 and do nothing.
   - Stores the event in `payments.raw_event`.

## Rules
- Amounts are integer paise. Never send floats.
- Key id may be in the frontend. Key secret and webhook secret live only in Edge Function
  secrets (`supabase secrets set`). Never commit them.
- Never mark a booking `paid` from client code or from the checkout success callback.
- Never trust an amount sent by the client; read it from the booking row.
- Use test-mode keys until the pilot. Keep a clear switch between test and live config.

## Refunds
- Compute the refund from the policy in `SPEC.md` using `event_date` and who cancelled.
- MVP: admin triggers refunds in the Razorpay dashboard; record `refund_amount` and set
  payment status `refunded` or `partially_refunded` after. Automated refunds come later.

## Commission
- Commission is stored on the booking at acceptance (`commission_pct`, `commission_amount`).
- MVP payouts are manual. Show admin a per-caterer "amount owed" view
  (total of paid/completed bookings minus commission, minus payouts already made).
- Razorpay Route (split payments) is a later upgrade; do not add it unless asked.

## Testing
- Use Razorpay test mode and the test card/UPI details from their docs.
- Test cases: valid webhook, invalid signature, duplicate webhook, payment for a booking
  that is not `accepted`, amount tampering attempt from the client.

## Checklist before finishing
- [ ] Signature verified on raw body
- [ ] Webhook is idempotent
- [ ] Only the webhook function can set `paid`
- [ ] No secrets in client bundle (search the build output for the secret)
- [ ] Failure and retry paths show a clear message to the customer
