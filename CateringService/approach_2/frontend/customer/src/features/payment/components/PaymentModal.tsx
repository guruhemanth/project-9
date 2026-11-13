import React, { useState } from 'react';
import {
  X,
  ShieldCheck,
  CreditCard,
  Lock,
  AlertCircle,
  Sparkles,
  Utensils,
  Calendar,
  Users,
  Receipt,
} from 'lucide-react';
import { formatPaiseToINR, formatIndianDate } from '@/lib/formatters';
import { createPaymentOrder, verifyPaymentSignature } from '../api';
import { loadRazorpayScript } from '@/lib/razorpay';
import { useAuth } from '@/lib/auth/AuthContext';
import type { Booking } from '@/types/database';

interface Props {
  booking: Booking & {
    caterer_name?: string;
    package_name?: string;
    custom_combo_name?: string;
    customized_items?: any;
    guest_count?: number;
    event_date?: string;
  };
  onClose: () => void;
  onPaymentSuccess: (updatedBooking: Booking) => void;
}

export const PaymentModal: React.FC<Props> = ({ booking, onClose, onPaymentSuccess }) => {
  const { user } = useAuth();
  const totalPaise = (booking as any).total_amount_paise || booking.total_amount || 3500000;
  const advancePercentage = 25; // 25% to lock the deal
  const advancePaise = Math.round((totalPaise * advancePercentage) / 100);
  const remainingPaise = totalPaise - advancePaise;
  const platformFeePaise = Math.round((totalPaise * 15) / 100);
  const catererUpfrontPayoutPaise = Math.max(0, advancePaise - platformFeePaise);

  const [paymentOption, setPaymentOption] = useState<'full' | 'advance'>('advance');
  const [processing, setProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const amountToCharge = paymentOption === 'full' ? totalPaise : advancePaise;

  // Parse customized dishes if present
  let parsedCustomItems: any[] = [];
  if (Array.isArray(booking.customized_items)) {
    parsedCustomItems = booking.customized_items;
  } else if (typeof booking.customized_items === 'string') {
    try {
      parsedCustomItems = JSON.parse(booking.customized_items);
    } catch (_) {}
  }

  const feastTitle =
    booking.custom_combo_name || booking.package_name || 'Catering Feast Package';

  const handlePay = async () => {
    setError(null);
    setProcessing(true);
    setStatusMessage('Loading secure payment gateway...');

    try {
      const isLoaded = await loadRazorpayScript();
      if (!isLoaded || !(window as any).Razorpay) {
        throw new Error('Failed to load Razorpay payment SDK. Please check your internet connection.');
      }

      setStatusMessage('Creating Razorpay order on server...');
      const order = await createPaymentOrder(booking.id, paymentOption, advancePercentage);
      if (!order || !order.orderId) {
        throw new Error('Failed to create Razorpay payment order');
      }

      setStatusMessage('Opening Razorpay Checkout...');

      const options = {
        key: order.keyId,
        amount: order.amountPaise,
        currency: order.currency || 'INR',
        name: 'CaterConnect Marketplace',
        description: `${feastTitle} (${paymentOption === 'advance' ? '25% Advance Deal Lock' : 'Full Payment'})`,
        order_id: order.orderId,
        prefill: {
          name: user?.fullName || undefined,
          contact: user?.phone || undefined,
        },
        theme: {
          color: '#059669',
        },
        modal: {
          ondismiss: () => {
            setProcessing(false);
            setStatusMessage(null);
          },
        },
        handler: async (response: any) => {
          try {
            setStatusMessage('Verifying Razorpay payment signature...');
            const verifyRes = await verifyPaymentSignature({
              bookingId: booking.id,
              razorpayOrderId: response.razorpay_order_id || order.orderId,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });

            if (verifyRes.success) {
              setStatusMessage('Payment verified! Deal confirmed.');
              setTimeout(() => {
                onPaymentSuccess(verifyRes.booking || ({ ...booking, status: 'paid', payment_type: paymentOption } as any));
              }, 800);
            } else {
              throw new Error(verifyRes.message || 'Signature verification failed');
            }
          } catch (verifyErr: any) {
            setError(verifyErr?.message || 'Payment signature verification failed');
            setProcessing(false);
            setStatusMessage(null);
          }
        },
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', (failRes: any) => {
        setError(failRes?.error?.description || 'Payment was declined or failed.');
        setProcessing(false);
        setStatusMessage(null);
      });

      rzp.open();
    } catch (err: any) {
      setError(err?.message || 'Payment initiation failed');
      setProcessing(false);
      setStatusMessage(null);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl max-h-[92vh] overflow-y-auto">
        <button
          onClick={onClose}
          disabled={processing}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 disabled:opacity-40 transition"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-2 text-emerald-700">
          <ShieldCheck className="h-5 w-5" />
          <span className="text-xs font-bold uppercase tracking-wider">
            Secure Razorpay Escrow Checkout
          </span>
        </div>

        <h2 className="mt-1 text-lg font-bold text-slate-900">{feastTitle}</h2>
        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-600">
          <span>By <b>{booking.caterer_name || 'Verified Caterer'}</b></span>
          {booking.guest_count && (
            <span className="inline-flex items-center gap-1 font-semibold text-slate-700">
              • <Users className="h-3 w-3 text-slate-400" /> {booking.guest_count} guests
            </span>
          )}
          {booking.event_date && (
            <span className="inline-flex items-center gap-1 text-slate-500">
              • <Calendar className="h-3 w-3 text-slate-400" /> {formatIndianDate(booking.event_date)}
            </span>
          )}
        </div>

        {/* Customized Items Snippet */}
        {parsedCustomItems.length > 0 && (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/50 p-2.5 text-xs text-amber-900">
            <div className="flex items-center gap-1.5 font-bold mb-1">
              <Utensils className="h-3.5 w-3.5 text-amber-700" />
              <span>Includes {parsedCustomItems.length} Customized Dishes:</span>
            </div>
            <div className="flex flex-wrap gap-1 max-h-16 overflow-y-auto">
              {parsedCustomItems.map((item: any, idx: number) => (
                <span
                  key={item.id || idx}
                  className="rounded bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 border border-amber-200"
                >
                  {item.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Dual Payment Options */}
        <div className="mt-4 space-y-3">
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
                    Pay <b className="text-emerald-800">{formatPaiseToINR(advancePaise)}</b> today to confirm your date with {booking.caterer_name}.
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Remaining balance of <b>{formatPaiseToINR(remainingPaise)}</b> is payable on event date.
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

        {/* Transparent Cost Sheet & Escrow Ledger */}
        <div className="mt-4 rounded-xl bg-slate-50 p-3.5 border border-slate-200 space-y-2 text-xs">
          <div className="flex items-center justify-between text-slate-500 font-bold uppercase tracking-wider text-[10px]">
            <span className="flex items-center gap-1">
              <Receipt className="h-3 w-3" />
              <span>Transparent Expense Breakdown</span>
            </span>
            <span>All Taxes Included</span>
          </div>

          <div className="flex justify-between text-slate-600 pt-1">
            <span>Food, Catering & Kitchen Service</span>
            <span className="font-semibold text-slate-800">{formatPaiseToINR(totalPaise)}</span>
          </div>

          <div className="flex justify-between text-slate-500 text-[11px]">
            <span>Platform Escrow Protection & GST (18%)</span>
            <span className="font-semibold text-emerald-700">Included</span>
          </div>

          <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-sm text-slate-900">
            <span>Amount Payable Now</span>
            <span className="text-emerald-700">{formatPaiseToINR(amountToCharge)}</span>
          </div>

          {paymentOption === 'advance' && (
            <div className="rounded-lg bg-emerald-50/70 p-2.5 space-y-1.5 text-[11px] text-emerald-900 border border-emerald-100">
              <div className="flex justify-between">
                <span>• Platform Service Commission (15% of total order):</span>
                <span className="font-semibold">{formatPaiseToINR(platformFeePaise)}</span>
              </div>
              <div className="flex justify-between">
                <span>• Upfront Advance to Caterer (10% of total):</span>
                <span className="font-semibold">{formatPaiseToINR(catererUpfrontPayoutPaise)}</span>
              </div>
              <div className="flex justify-between font-bold text-slate-800 pt-1 border-t border-emerald-200/60">
                <span>• Remaining Balance Due at Venue (75%):</span>
                <span>{formatPaiseToINR(remainingPaise)}</span>
              </div>
            </div>
          )}

          <div className="pt-2 border-t border-dashed border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
            <span>Supported Methods</span>
            <span className="font-semibold text-slate-700">UPI, GPay, PhonePe, Cards, NetBanking</span>
          </div>
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
            className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 transition"
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
                    paymentOption === 'advance' ? '(Lock Date)' : '(Full)'
                  }`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

