import React, { useState } from 'react';
import { CheckCircle2, Clock, Send, ShieldCheck, X } from 'lucide-react';
import { formatPaiseToINR, formatIndianDate } from '@/lib/formatters';
import type { CatererSettlement } from '@caterconnect/shared';

interface Props {
  settlements: (CatererSettlement & {
    catererBusinessName?: string;
    eventDate?: string;
    guestCount?: number;
  })[];
  loading: boolean;
  onDisburse: (settlementId: string, utrReference: string) => Promise<void>;
}

export const AdminSettlementsList: React.FC<Props> = ({
  settlements,
  loading,
  onDisburse,
}) => {
  const [filter, setFilter] = useState<'all' | 'pending' | 'settled'>('all');
  const [selectedSettlement, setSelectedSettlement] = useState<(CatererSettlement & { catererBusinessName?: string }) | null>(null);
  const [utrInput, setUtrInput] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const filtered = settlements.filter((s) => {
    if (filter === 'all') return true;
    if (filter === 'pending') return s.status === 'pending' || s.status === 'processing';
    return s.status === 'settled';
  });

  const handleConfirmDisburse = async () => {
    if (!selectedSettlement || !utrInput.trim()) return;
    setSubmitting(true);
    try {
      await onDisburse(selectedSettlement.id, utrInput.trim());
      setSelectedSettlement(null);
      setUtrInput('');
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 rounded-xl bg-slate-200 animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex items-center justify-between bg-white p-3 rounded-xl border border-slate-200">
        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
          Caterer Payout Ledger ({settlements.length})
        </h3>
        <div className="flex items-center gap-1.5">
          {(['all', 'pending', 'settled'] as const).map((st) => (
            <button
              key={st}
              onClick={() => setFilter(st)}
              className={`rounded-lg px-3 py-1 text-xs font-semibold capitalize transition ${
                filter === st
                  ? 'bg-purple-700 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Settlements Table / Cards */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 p-8 text-center bg-white">
          <Clock className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm font-semibold text-slate-700">No payouts in this status</p>
          <p className="text-xs text-slate-500">Completed bookings generate automatic settlements here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => (
            <div
              key={s.id}
              className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h4 className="font-bold text-sm text-slate-900">
                    {s.catererBusinessName || 'Tirupati Caterer'}
                  </h4>
                  {s.status === 'settled' ? (
                    <span className="inline-flex items-center gap-1 bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full text-[10px] font-bold">
                      <CheckCircle2 className="h-3 w-3" /> Disbursed
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full text-[10px] font-bold">
                      <Clock className="h-3 w-3" /> Awaiting Payout
                    </span>
                  )}
                </div>

                <p className="text-xs text-slate-500">
                  Booking #{s.bookingId.slice(0, 8)}
                  {s.eventDate && ` • Event Date: ${formatIndianDate(s.eventDate)}`}
                  {s.guestCount && ` (${s.guestCount} guests)`}
                </p>

                {s.utrReference && (
                  <p className="text-[11px] font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded inline-block border border-emerald-100">
                    Bank UTR: {s.utrReference}
                    {s.settledAt && ` • Settled: ${formatIndianDate(s.settledAt)}`}
                  </p>
                )}
              </div>

              {/* Financial Breakdown & Disburse Action */}
              <div className="flex items-center gap-6">
                <div className="text-right text-xs space-y-0.5">
                  <div className="text-slate-500">
                    Gross: <span className="font-semibold text-slate-800">{formatPaiseToINR(s.grossAmountPaise)}</span>
                  </div>
                  <div className="text-purple-700">
                    - 15% Platform: <span className="font-semibold">{formatPaiseToINR(s.commissionAmountPaise)}</span>
                  </div>
                  <div className="text-slate-900 font-bold text-sm">
                    Net Payout: <span className="text-teal-700">{formatPaiseToINR(s.netPayoutPaise)}</span>
                  </div>
                </div>

                {s.status !== 'settled' && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedSettlement(s);
                      setUtrInput(`UTR_SBIN_${Date.now().toString().slice(-6)}`);
                    }}
                    className="flex items-center gap-1.5 rounded-lg bg-teal-700 px-3.5 py-2 text-xs font-semibold text-white shadow-xs hover:bg-teal-800 transition"
                  >
                    <Send className="h-3.5 w-3.5" />
                    <span>Disburse</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Disburse UTR Modal */}
      {selectedSettlement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <div className="flex items-center gap-2 text-teal-800">
                <ShieldCheck className="h-5 w-5" />
                <h3 className="font-bold text-base text-slate-900">Record Payout Disbursement</h3>
              </div>
              <button
                onClick={() => setSelectedSettlement(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="bg-teal-50 p-3 rounded-lg border border-teal-100 text-xs text-teal-900 space-y-1">
              <div className="font-bold">{selectedSettlement.catererBusinessName}</div>
              <div>Net Payout Amount: <b>{formatPaiseToINR(selectedSettlement.netPayoutPaise)}</b></div>
              <div className="text-[11px] text-teal-700">Transfer funds to caterer bank account via NEFT / RTGS / IMPS.</div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Bank UTR / Transaction Reference Number:
              </label>
              <input
                type="text"
                value={utrInput}
                onChange={(e) => setUtrInput(e.target.value)}
                placeholder="e.g. UTR_HDFC_20261104_123456"
                className="w-full rounded-lg border border-slate-300 p-2.5 text-xs font-mono focus:outline-none focus:border-teal-600"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setSelectedSettlement(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!utrInput.trim() || submitting}
                onClick={handleConfirmDisburse}
                className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50 transition"
              >
                {submitting ? 'Recording...' : 'Confirm Disbursal'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
