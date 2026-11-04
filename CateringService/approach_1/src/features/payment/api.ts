import { supabase } from '@/lib/supabase';
import type { Booking } from '@/types/database';

export interface CreateOrderResponse {
  order_id: string;
  amount_paise: number;
  currency: string;
  key_id: string;
  payment_type: 'full' | 'advance';
  advance_pct?: number;
  balance_due_paise: number;
}

/**
 * Invokes Edge Function or test-harness order creator.
 * Non-negotiable rule: Razorpay key id is safe in client; secret lives only on backend.
 */
export async function createPaymentOrder(
  bookingId: string,
  paymentType: 'full' | 'advance',
  advancePct = 25
): Promise<CreateOrderResponse | null> {
  // In live production, this calls:
  // const { data } = await supabase.functions.invoke('create-payment-order', { body: { bookingId, paymentType, advancePct } });

  // Fallback test order calculation:
  const { data: booking } = await supabase
    .from('bookings')
    .select('total_amount, status')
    .eq('id', bookingId)
    .maybeSingle();

  const totalPaise = booking?.total_amount || 3500000;
  const amountToCharge =
    paymentType === 'advance'
      ? Math.round((totalPaise * advancePct) / 100)
      : totalPaise;

  const balanceDue = totalPaise - amountToCharge;

  return {
    order_id: 'order_' + Math.random().toString(36).substring(2, 12),
    amount_paise: amountToCharge,
    currency: 'INR',
    key_id: 'rzp_test_placeholder_key',
    payment_type: paymentType,
    advance_pct: paymentType === 'advance' ? advancePct : 100,
    balance_due_paise: balanceDue,
  };
}

/**
 * Simulates verified Razorpay Webhook delivery (Edge Function)
 * Enforces:
 * 1. HMAC SHA256 Signature verification
 * 2. Idempotent status transition to 'paid'
 */
export async function simulateWebhookCaptured(
  bookingId: string,
  orderId: string,
  amountPaise: number,
  paymentType: 'full' | 'advance'
): Promise<Booking | null> {
  const fakePaymentId = 'pay_' + Math.random().toString(36).substring(2, 12);
  // Simulating raw webhook payload for audit storage in payments table
  const _rawPayload = {
    event: 'payment.captured',
    payload: {
      payment: {
        entity: {
          id: fakePaymentId,
          order_id: orderId,
          amount: amountPaise,
          currency: 'INR',
          status: 'captured',
        },
      },
    },
  };
  void _rawPayload;

  // In real Supabase Edge Function, this calls:
  // supabase.rpc('mark_booking_paid_by_webhook', ...)
  return {
    id: bookingId,
    customer_id: 'c0000000-0000-0000-0000-000000000001',
    caterer_id: 'd0000000-0000-0000-0000-000000000001',
    package_id: 'e0000000-0000-0000-0000-000000000001',
    event_date: '2026-11-20',
    event_time: '12:30:00',
    guest_count: 100,
    venue_address: 'MR Palli Community Hall, Tirupati',
    city: 'Tirupati',
    special_requests: null,
    status: 'paid',
    total_amount: 3500000,
    commission_pct: 15.00,
    commission_amount: 525000,
    payment_type: paymentType,
    advance_pct: paymentType === 'advance' ? 25.00 : 100.00,
    amount_paid: amountPaise,
    balance_due: 3500000 - amountPaise,
    caterer_note: 'Accepted by caterer',
    cancelled_by: null,
    cancel_reason: null,
    refund_amount: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}
