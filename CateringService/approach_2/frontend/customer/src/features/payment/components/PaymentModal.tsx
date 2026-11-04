import React, { useState } from 'react';
import { X, ShieldCheck, CreditCard, Lock, AlertCircle, Sparkles } from 'lucide-react';
import { formatPaiseToINR } from '@/lib/formatters';
import { createPaymentOrder, simulateWebhookCaptured } from '../api';
import type { Booking } from '@/types/database';

interface Props {
  booking: Booking & { caterer_name?: string; package_name?: string };
  onClose: () => void;
  onPaymentSuccess: (updatedBooking: Booking) => void;
}

export const PaymentModal: React.FC<Props> = ({ booking, onClose, onPaymentSuccess }) => {
  const totalPaise = booking.total_amount || 3500000;
  const advancePercentage = 25; // 25% to lock the deal
  const advancePaise = Math.round((totalPaise * advancePercentage) / 100);
  const remainingPaise = totalPaise - advancePaise;

  const [paymentOption, setPaymentOption] = useState<'full' | 'advance'>('advance');
  const [processing, setProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const amountToCharge = paymentOption === 'full' ? totalPaise : advancePaise;

  const handlePay = async () => {
    setError(null);
    setProcessing(true);
    setStatusMessage('Creating Razorpay order on server...');

    try {
      const order = await createPaymentOrder(booking.id, paymentOption, advancePercentage);
      if (!order) {
        throw new Error('Failed to create Razorpay payment order');
      }

      setStatusMessage('Awaiting Razorpay payment completion...');

      // Simulated checkout modal flow
      setTimeout(async () => {
        setStatusMessage('Verifying Razorpay webhook signature...');
        // Simulates verified webhook callback marking booking paid in database
        const updated = await simulateWebhookCaptured(
          order.order_id,
          `pay_${Date.now()}`,
          amountToCharge
        );

        if (updated) {
          setStatusMessage('Payment verified! Deal confirmed.');
          setTimeout(() => {
            onPaymentSuccess({ ...booking, status: 'paid' } as any);
          }, 800);
        } else {
          setError('Webhook signature verification failed');
          setProcessing(false);
        }
      }, 1200);
    } catch (err: any) {
      setError(err?.message || 'Payment initiation failed');
      setProcessing(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl">
        <button
          onClick={onClose}
          disabled={processing}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 disabled:opacity-40"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-2 text-emerald-700">
          <ShieldCheck className="h-5 w-5" />
          <span className="text-xs font-bold uppercase tracking-wider">Secure Razorpay Checkout</span>
        </div>

        <h2 className="mt-1 text-lg font-bold text-slate-900">Choose Payment Method</h2>
        <p className="text-xs text-slate-500">
          Booking for <b>{booking.caterer_name || 'Caterer'}</b> • Total Fee:{' '}
          <span className="font-bold text-slate-900">{formatPaiseToINR(totalPaise)}</span>
        </p>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Dual Payment Options */}
        <div className="mt-5 space-y-3">
          {/* Option 1: Advance to Lock Deal */}
          <div
            onClick={() => !processing && setPaymentOption('advance')}
            className={`cursor-pointer rounded-xl border p-4 transition ${
              paymentOption === 'advance'
                ? 'border-emerald-600 bg-emerald-50/50 ring-1 ring-emerald-600 shadow-xs'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  name="paymentOption"
                  checked={paymentOption === 'advance'}
                  onChange={() => setPaymentOption('advance')}
                  className="mt-1 h-4 w-4 text-emerald-600 focus:ring-emerald-500"
                />
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">
                      Option 1: Pay {advancePercentage}% Advance to Lock Deal
                    </span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                      <Sparkles className="h-3 w-3" /> Recommended
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-600">
                    Pay <b className="text-emerald-800">{formatPaiseToINR(advancePaise)}</b> today to lock your date with the caterer.
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Remaining balance of <b>{formatPaiseToINR(remainingPaise)}</b> payable before or on event date.
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-sm font-extrabold text-emerald-800">
                  {formatPaiseToINR(advancePaise)}
                </span>
                <span className="block text-[10px] text-slate-400">Due today</span>
              </div>
            </div>
          </div>

          {/* Option 2: Full Amount */}
          <div
            onClick={() => !processing && setPaymentOption('full')}
            className={`cursor-pointer rounded-xl border p-4 transition ${
              paymentOption === 'full'
                ? 'border-emerald-600 bg-emerald-50/50 ring-1 ring-emerald-600 shadow-xs'
                : 'border-slate-200 bg-white hover:border-slate-300'
            }`}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-start gap-3">
                <input
                  type="radio"
                  name="paymentOption"
                  checked={paymentOption === 'full'}
                  onChange={() => setPaymentOption('full')}
                  className="mt-1 h-4 w-4 text-emerald-600 focus:ring-emerald-500"
                />
                <div>
                  <span className="text-sm font-bold text-slate-900">Option 2: Pay Full Amount (100%)</span>
                  <p className="mt-1 text-xs text-slate-600">
                    Pay complete feast amount upfront. Zero balance due on event day.
                  </p>
                </div>
              </div>
              <div className="text-right">
                <span className="text-sm font-extrabold text-slate-900">
                  {formatPaiseToINR(totalPaise)}
                </span>
                <span className="block text-[10px] text-slate-400">100% full</span>
              </div>
            </div>
          </div>
        </div>

        {/* Payment Summary */}
        <div className="mt-5 rounded-xl bg-slate-50 p-3.5 border border-slate-200 space-y-1.5 text-xs">
          <div className="flex justify-between text-slate-600">
            <span>Payment Method</span>
            <span className="font-semibold text-slate-900">UPI, Google Pay, PhonePe, Cards, NetBanking</span>
          </div>
          <div className="flex justify-between text-slate-600">
            <span>Amount Payable Now</span>
            <span className="text-sm font-bold text-emerald-700">{formatPaiseToINR(amountToCharge)}</span>
          </div>
          {paymentOption === 'advance' && (
            <div className="flex justify-between text-slate-500 text-[11px] pt-1 border-t border-slate-200">
              <span>Balance Due Later</span>
              <span className="font-semibold text-slate-700">{formatPaiseToINR(remainingPaise)}</span>
            </div>
          )}
        </div>

        {/* Processing Indicator */}
        {processing && (
          <div className="mt-4 flex items-center justify-center gap-2 rounded-lg bg-emerald-50 p-2.5 text-xs font-semibold text-emerald-800">
            <Lock className="h-4 w-4 animate-spin text-emerald-600" />
            <span>{statusMessage}</span>
          </div>
        )}

        {/* Actions */}
        <div className="mt-5 flex justify-end gap-2 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={onClose}
            disabled={processing}
            className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handlePay}
            disabled={processing}
            className="flex items-center gap-2 rounded-lg bg-emerald-600 px-5 py-2.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50 transition"
          >
            <CreditCard className="h-4 w-4" />
            <span>
              {processing
                ? 'Processing...'
                : `Pay ${formatPaiseToINR(amountToCharge)} ${
                    paymentOption === 'advance' ? '(Lock Deal)' : '(Full)'
                  }`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
