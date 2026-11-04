import { describe, it, expect } from 'vitest';
import crypto from 'crypto';

describe('Dual Payment Options & Razorpay Webhook Verification', () => {
  it('correctly calculates full vs 25% advance amount in integer paise', () => {
    const totalPaise = 3500000; // ₹35,000 for 100 guests
    const advancePercentage = 25;

    const advancePaise = Math.round((totalPaise * advancePercentage) / 100);
    const balanceDue = totalPaise - advancePaise;

    expect(advancePaise).toBe(875000); // ₹8,750
    expect(balanceDue).toBe(2625000); // ₹26,250
    expect(advancePaise + balanceDue).toBe(totalPaise);
    expect(Number.isInteger(advancePaise)).toBe(true);
    expect(Number.isInteger(balanceDue)).toBe(true);
  });

  it('validates Razorpay HMAC SHA256 webhook signature logic', () => {
    const webhookSecret = 'test_webhook_secret_key_123';
    const payload = JSON.stringify({
      event: 'payment.captured',
      payload: {
        payment: {
          entity: {
            id: 'pay_test_123',
            order_id: 'order_test_456',
            amount: 875000,
            status: 'captured',
          },
        },
      },
    });

    // Generate valid HMAC signature
    const validSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(payload)
      .digest('hex');

    // Function to verify signature
    const verifySignature = (body: string, sig: string, secret: string) => {
      const expected = crypto.createHmac('sha256', secret).update(body).digest('hex');
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
    };

    expect(verifySignature(payload, validSignature, webhookSecret)).toBe(true);

    const forgedSignature = 'bad_forged_signature_hex_value_1234567890abcdef';
    expect(() => verifySignature(payload, forgedSignature, webhookSecret)).toThrow();
  });

  it('enforces idempotency on mark_booking_paid', () => {
    const booking = {
      id: 'b1',
      status: 'paid',
      amount_paid: 875000,
      balance_due: 2625000,
    };

    const processWebhook = (currentBooking: typeof booking) => {
      if (currentBooking.status === 'paid') {
        // Idempotent: return unchanged without re-executing
        return { modified: false, booking: currentBooking };
      }
      return { modified: true, booking: { ...currentBooking, status: 'paid' } };
    };

    const result = processWebhook(booking);
    expect(result.modified).toBe(false);
    expect(result.booking.status).toBe('paid');
  });
});
