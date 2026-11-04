import React, { useState } from 'react';
import { Calendar, MapPin, AlertTriangle, X, Search, Clock } from 'lucide-react';
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
}

export const AdminBookingsList: React.FC<Props> = ({
  bookings,
  loading,
  onCancelDispute,
}) => {
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [selectedBookingForCancel, setSelectedBookingForCancel] = useState<Booking | null>(null);
  const [disputeReason, setDisputeReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

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
                </div>

                <div className="text-xs text-slate-600 flex flex-wrap gap-x-4 gap-y-1">
                  <span>
                    Host: <b>{b.customerName || 'Customer'}</b> ({b.customerPhone || 'No Phone'})
                  </span>
                  <span>
                    Caterer: <b>{b.catererBusinessName || 'Tirupati Caterer'}</b>
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
                </div>

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
          ))}
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
