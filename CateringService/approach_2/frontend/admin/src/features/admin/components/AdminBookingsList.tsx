import React, { useState } from 'react';
import { Calendar, MapPin, AlertTriangle, X, Search, Clock, IndianRupee, CheckCircle2 } from 'lucide-react';
import { formatPaiseToINR, formatIndianDate } from '@/lib/formatters';
import type { Booking, BookingStatus } from '@caterconnect/shared';

interface Props {
  bookings: (Booking & {
    customerName?: string;
    customerPhone?: string;
    customerEmail?: string;
    catererBusinessName?: string;
    packageName?: string;
  })[];
  loading: boolean;
  onCancelDispute: (bookingId: string, reason: string) => Promise<void>;
  onIssueRefund?: (bookingId: string, refundAmountPaise: number, reason: string, notes?: string) => Promise<void>;
}

export const AdminBookingsList: React.FC<Props> = ({
  bookings,
  loading,
  onCancelDispute,
  onIssueRefund,
}) => {
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedBookingForCancel, setSelectedBookingForCancel] = useState<Booking | null>(null);
  const [disputeReason, setDisputeReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Custom Refund Modal State
  const [selectedBookingForRefund, setSelectedBookingForRefund] = useState<any | null>(null);
  const [refundAmountINR, setRefundAmountINR] = useState<string>('');
  const [refundReasonType, setRefundReasonType] = useState<string>('Food Quality / Spoilage Complaint');
  const [refundNotes, setRefundNotes] = useState<string>('');
  const [refunding, setRefunding] = useState<boolean>(false);

  const filtered = bookings.filter((b) => {
    const matchesStatus = filterStatus === 'all' || b.status === filterStatus;
    const matchesSearch =
      (b.catererBusinessName || '').toLowerCase().includes(search.toLowerCase()) ||
      (b.customerName || '').toLowerCase().includes(search.toLowerCase()) ||
      b.id.toLowerCase().includes(search.toLowerCase()) ||
      (b.venueAddress || '').toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const handleConfirmCancel = async () => {
    if (!selectedBookingForCancel || !disputeReason.trim()) return;
    setSubmitting(true);
    try {
      await onCancelDispute(selectedBookingForCancel.id, disputeReason.trim());
      setSelectedBookingForCancel(null);
      setDisputeReason('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmRefund = async () => {
    if (!selectedBookingForRefund || !onIssueRefund) return;
    const amountVal = parseFloat(refundAmountINR);
    if (isNaN(amountVal) || amountVal <= 0) return;

    const refundAmountPaise = Math.round(amountVal * 100);
    setRefunding(true);
    try {
      await onIssueRefund(
        selectedBookingForRefund.id,
        refundAmountPaise,
        refundReasonType,
        refundNotes.trim() || undefined
      );
      setSelectedBookingForRefund(null);
      setRefundAmountINR('');
      setRefundNotes('');
    } finally {
      setRefunding(false);
    }
  };

  const getStatusBadge = (status: BookingStatus) => {
    switch (status) {
      case 'requested':
        return <span className="bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full text-[10px] font-bold">Requested</span>;
      case 'accepted':
        return <span className="bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full text-[10px] font-bold">Accepted</span>;
      case 'paid':
        return <span className="bg-blue-100 text-blue-800 px-2 py-0.5 rounded-full text-[10px] font-bold">Paid & Confirmed</span>;
      case 'completed':
        return <span className="bg-purple-100 text-purple-800 px-2 py-0.5 rounded-full text-[10px] font-bold">Completed</span>;
      case 'cancelled':
        return <span className="bg-rose-100 text-rose-800 px-2 py-0.5 rounded-full text-[10px] font-bold">Cancelled</span>;
      default:
        return <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded-full text-[10px] font-bold">{status}</span>;
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 rounded-xl bg-slate-200 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Search caterer, customer, venue, booking ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-1.5 text-xs focus:outline-none focus:border-purple-600"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {['all', 'requested', 'accepted', 'paid', 'completed', 'cancelled'].map((st) => (
            <button
              key={st}
              onClick={() => setFilterStatus(st)}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold capitalize shrink-0 transition ${
                filterStatus === st
                  ? 'bg-purple-700 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Bookings List */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center bg-white">
          <Clock className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm font-semibold text-slate-700">No bookings found</p>
          <p className="text-xs text-slate-500">Try adjusting your search query or status filter.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((b) => (
            <div
              key={b.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4"
            >
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-bold text-sm text-slate-900">
                    Booking #{b.id.slice(0, 8)}
                  </span>
                  {getStatusBadge(b.status)}
                  {b.paymentType && (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                      {b.paymentType === 'advance' ? '25% Advance' : '100% Full'}
                    </span>
                  )}
                  {(b.refundAmountPaise || 0) > 0 && (
                    <span className="rounded bg-rose-100 px-2 py-0.5 text-[10px] font-bold text-rose-800">
                      Refunded: {formatPaiseToINR(b.refundAmountPaise)}
                    </span>
                  )}
                </div>

                <div className="text-xs text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
                  <span>
                    Host: <b>{b.customerName || 'Customer'}</b> ({b.customerPhone || 'No Phone'})
                  </span>
                  <span>
                    Caterer: <b>{b.catererBusinessName || 'Catering Partner'}</b>
                  </span>
                  <span>
                    Package: <b>{b.packageName || 'Feast'}</b> ({b.guestCount} guests)
                  </span>
                </div>

                <div className="text-xs text-slate-500 flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    {formatIndianDate(b.eventDate)} at {b.eventTime}
                  </span>
                  <span className="flex items-center gap-1">
                    <MapPin className="h-3.5 w-3.5 text-slate-400" />
                    {b.venueAddress}
                  </span>
                </div>

                {b.cancelReason && (
                  <p className="text-[11px] text-rose-700 bg-rose-50 p-2 rounded border border-rose-100">
                    <b>Cancelled by {b.cancelledBy}:</b> {b.cancelReason}
                    {b.refundAmountPaise > 0 && ` • Refund: ${formatPaiseToINR(b.refundAmountPaise)}`}
                  </p>
                )}
              </div>

              {/* Financial Snapshot & Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 lg:self-center shrink-0">
                <div className="text-right text-xs bg-slate-50 p-2.5 rounded-lg border border-slate-100 min-w-[160px]">
                  <div className="flex justify-between gap-2">
                    <span className="text-slate-500">Gross:</span>
                    <span className="font-bold text-slate-900">{formatPaiseToINR(b.totalAmountPaise || 0)}</span>
                  </div>
                  <div className="flex justify-between gap-2 text-purple-700 font-semibold">
                    <span>15% Commission:</span>
                    <span>{formatPaiseToINR(b.commissionAmountPaise || 0)}</span>
                  </div>
                  <div className="flex justify-between gap-2 text-slate-500">
                    <span>Paid:</span>
                    <span className="font-medium text-slate-700">{formatPaiseToINR(b.amountPaidPaise || 0)}</span>
                  </div>
                  {(b.refundAmountPaise || 0) > 0 && (
                    <div className="flex justify-between gap-2 text-rose-600 font-bold border-t border-slate-200 mt-1 pt-1">
                      <span>Total Refund:</span>
                      <span>-{formatPaiseToINR(b.refundAmountPaise)}</span>
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row items-center gap-2">
                  {/* Custom Refund button for any booking with refundable money */}
                  {onIssueRefund && (b.amountPaidPaise || 0) > (b.refundAmountPaise || 0) && (
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedBookingForRefund(b);
                        const maxINR = ((b.amountPaidPaise || 0) - (b.refundAmountPaise || 0)) / 100;
                        setRefundAmountINR(maxINR.toString());
                        setRefundReasonType('Food Quality / Spoilage Complaint');
                        setRefundNotes('');
                      }}
                      className="flex items-center gap-1 rounded-lg border border-purple-200 bg-purple-50 px-3 py-2 text-xs font-semibold text-purple-700 hover:bg-purple-100 transition shadow-2xs self-start sm:self-auto"
                    >
                      <IndianRupee className="h-3.5 w-3.5" />
                      <span>Custom Refund</span>
                    </button>
                  )}

                  {b.status !== 'completed' && b.status !== 'cancelled' && (
                    <button
                      type="button"
                      onClick={() => setSelectedBookingForCancel(b)}
                      className="flex items-center gap-1 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-semibold text-rose-700 hover:bg-rose-100 transition shadow-2xs self-start sm:self-auto"
                    >
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span>Cancel Dispute</span>
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Admin Custom Refund Modal */}
      {selectedBookingForRefund && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <div className="flex items-center gap-2 text-purple-700">
                <IndianRupee className="h-5 w-5" />
                <h3 className="font-bold text-base text-slate-900">Issue Custom / Partial Refund</h3>
              </div>
              <button
                onClick={() => setSelectedBookingForRefund(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-600">Booking ID:</span>
                <span className="font-mono font-bold text-slate-900">#{selectedBookingForRefund.id.slice(0, 8)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Host / Caterer:</span>
                <span className="font-semibold text-slate-900">
                  {selectedBookingForRefund.customerName || 'Customer'} • {selectedBookingForRefund.catererBusinessName || 'Caterer'}
                </span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-1 mt-1 font-semibold">
                <span className="text-slate-600">Customer Amount Paid:</span>
                <span className="text-slate-900">{formatPaiseToINR(selectedBookingForRefund.amountPaidPaise || 0)}</span>
              </div>
              {(selectedBookingForRefund.refundAmountPaise || 0) > 0 && (
                <div className="flex justify-between text-rose-600">
                  <span>Previously Refunded:</span>
                  <span>-{formatPaiseToINR(selectedBookingForRefund.refundAmountPaise)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-purple-800 border-t border-slate-200 pt-1 mt-1">
                <span>Maximum Refundable Remaining:</span>
                <span>
                  {formatPaiseToINR(
                    Math.max(0, (selectedBookingForRefund.amountPaidPaise || 0) - (selectedBookingForRefund.refundAmountPaise || 0))
                  )}
                </span>
              </div>
            </div>

            {/* Quick Presets */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Quick Percentage Presets:</label>
              <div className="flex items-center gap-2">
                {[
                  { label: '25% (Advance Portion)', pct: 0.25 },
                  { label: '50% (Half Order)', pct: 0.5 },
                  { label: '100% (Full Paid)', pct: 1.0 },
                ].map((preset) => {
                  const maxPaise = Math.max(
                    0,
                    (selectedBookingForRefund.amountPaidPaise || 0) - (selectedBookingForRefund.refundAmountPaise || 0)
                  );
                  const presetPaise = Math.min(
                    maxPaise,
                    Math.round(((selectedBookingForRefund.amountPaidPaise || 0) * preset.pct))
                  );
                  const presetINR = (presetPaise / 100).toFixed(0);
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setRefundAmountINR(presetINR)}
                      className="rounded-lg border border-purple-200 bg-purple-50/60 hover:bg-purple-100 px-2.5 py-1 text-xs font-semibold text-purple-800 transition"
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Amount Input */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Custom Refund Amount in ₹:</label>
              <div className="relative">
                <span className="absolute left-3 top-2.5 text-xs font-bold text-slate-500">₹</span>
                <input
                  type="number"
                  min="1"
                  step="1"
                  max={(
                    Math.max(
                      0,
                      (selectedBookingForRefund.amountPaidPaise || 0) - (selectedBookingForRefund.refundAmountPaise || 0)
                    ) / 100
                  ).toString()}
                  value={refundAmountINR}
                  onChange={(e) => setRefundAmountINR(e.target.value)}
                  placeholder="Enter exact custom refund amount in ₹"
                  className="w-full rounded-lg border border-slate-300 pl-7 pr-3 py-2 text-xs font-bold text-slate-900 focus:outline-none focus:border-purple-600"
                />
              </div>
            </div>

            {/* Dispute Reason Dropdown */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Dispute & Refund Reason:</label>
              <select
                value={refundReasonType}
                onChange={(e) => setRefundReasonType(e.target.value)}
                className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:outline-none focus:border-purple-600"
              >
                <option value="Food Quality / Spoilage Complaint">Food Quality / Spoilage Complaint</option>
                <option value="Missing Package Dishes / Dessert Counter">Missing Package Dishes / Dessert Counter</option>
                <option value="Late Delivery / Delayed Service">Late Delivery / Delayed Service</option>
                <option value="Guest Count / Food Quantity Shortage">Guest Count / Food Quantity Shortage</option>
                <option value="Mutual Agreement / Goodwill Settlement">Mutual Agreement / Goodwill Settlement</option>
                <option value="Other Administrative Dispute">Other Administrative Dispute</option>
              </select>
            </div>

            {/* Additional Administrative Notes */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">Administrative Notes / Investigation Details:</label>
              <textarea
                value={refundNotes}
                onChange={(e) => setRefundNotes(e.target.value)}
                placeholder="e.g. Verified photos of spoiled paneer dish. Caterer agreed to ₹5,000 deduction from pending settlement."
                rows={2}
                className="w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:outline-none focus:border-purple-600"
              />
            </div>

            {/* Impact Notice */}
            <div className="rounded-lg bg-purple-50/70 border border-purple-200 p-2.5 text-[11px] text-purple-900 space-y-0.5">
              <div className="flex items-center gap-1 font-bold">
                <CheckCircle2 className="h-3.5 w-3.5 text-purple-700" />
                <span>Automated Payout Ledger Deduction</span>
              </div>
              <p className="text-purple-700">
                This custom refund will be processed immediately via Razorpay to the customer's source account and
                automatically deducted from the caterer's net settlement ledger.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedBookingForRefund(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  !refundAmountINR ||
                  parseFloat(refundAmountINR) <= 0 ||
                  parseFloat(refundAmountINR) >
                    Math.max(
                      0,
                      (selectedBookingForRefund.amountPaidPaise || 0) - (selectedBookingForRefund.refundAmountPaise || 0)
                    ) / 100 ||
                  refunding
                }
                onClick={handleConfirmRefund}
                className="rounded-lg bg-purple-700 px-4 py-2 text-xs font-bold text-white hover:bg-purple-800 disabled:opacity-50 transition"
              >
                {refunding ? 'Processing Gateway Refund...' : `Confirm Refund ₹${refundAmountINR || '0'}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Admin Dispute Modal */}
      {selectedBookingForCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <div className="flex items-center gap-2 text-rose-700">
                <AlertTriangle className="h-5 w-5" />
                <h3 className="font-bold text-base text-slate-900">Admin Dispute Resolution</h3>
              </div>
              <button
                onClick={() => setSelectedBookingForCancel(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600">
              You are about to cancel booking <b>#{selectedBookingForCancel.id.slice(0, 8)}</b>.
              Platform refund rules will automatically apply, and any auto-locked blackout dates will be released.
            </p>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Official Dispute Reason (mandatory):
              </label>
              <textarea
                value={disputeReason}
                onChange={(e) => setDisputeReason(e.target.value)}
                placeholder="e.g. Venue hall flood, host requested admin cancellation due to emergency..."
                rows={3}
                className="w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:outline-none focus:border-rose-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedBookingForCancel(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Back
              </button>
              <button
                type="button"
                disabled={!disputeReason.trim() || submitting}
                onClick={handleConfirmCancel}
                className="rounded-lg bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50 transition"
              >
                {submitting ? 'Resolving...' : 'Confirm Cancellation'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
