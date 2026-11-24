import { apiFetch } from '@/lib/api-client';

export async function createPaymentOrder(bookingId: string, paymentOption: 'full' | 'advance', advancePct = 25) {
  const res = await apiFetch<{
    orderId: string;
    amountPaise: number;
    currency: string;
    paymentOption: string;
    advancePct: number;
    keyId: string;
  }>('/api/payments/create-order', {
    method: 'POST',
    body: JSON.stringify({ bookingId, paymentOption, advancePct }),
  });

  return {
    ...res,
    order_id: res.orderId,
    amount_paise: res.amountPaise,
  };
}

export async function verifyPaymentSignature(payload: {
  bookingId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string;
  razorpaySignature: string;
}) {
  return apiFetch<{
    success: boolean;
    message: string;
    booking: any;
  }>('/api/payments/verify-signature', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function simulateWebhookCaptured(_orderId: string, _paymentId = `pay_${Date.now()}`, _amountPaise = 25000) {
  // Direct test trigger or gateway pass-through
  return { success: true };
}

export async function fetchCatererSettlements(catererId: string) {
  return apiFetch<{
    summary: {
      totalGrossPaise: number;
      totalCommissionPaise: number;
      totalNetPayoutPaise: number;
      totalDisbursedPaise: number;
      pendingDisbursementPaise: number;
      completedBookingsCount: number;
    };
    settlements: any[];
  }>(`/api/payments/settlements/caterer/${catererId}`);
}
