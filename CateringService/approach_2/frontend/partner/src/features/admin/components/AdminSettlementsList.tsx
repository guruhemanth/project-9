import React, { useState } from 'react';
import {
  CheckCircle2,
  Clock,
  Send,
  ShieldCheck,
  X,
  Landmark,
  Copy,
  Check,
  AlertTriangle,
  AlertCircle,
  PauseCircle,
  PlayCircle,
  Calendar,
} from 'lucide-react';
import { formatPaiseToINR, formatIndianDate } from '@/lib/formatters';
import type { CatererSettlement } from '@caterconnect/shared';

interface Props {
  settlements: (CatererSettlement & {
    catererBusinessName?: string;
    eventDate?: string;
    guestCount?: number;
    bookingStatus?: string;
  })[];
  loading: boolean;
  onDisburse: (settlementId: string, utrReference: string) => Promise<void>;
  onHold?: (settlementId: string, reason: string) => Promise<void>;
  onRelease?: (settlementId: string, notes?: string) => Promise<void>;
}

export const AdminSettlementsList: React.FC<Props> = ({
  settlements,
  loading,
  onDisburse,
  onHold,
  onRelease,
}) => {
  const [filter, setFilter] = useState<'all' | 'pending' | 'held' | 'settled'>('all');
  const [selectedSettlement, setSelectedSettlement] = useState<(CatererSettlement & { catererBusinessName?: string }) | null>(null);
  const [holdingSettlement, setHoldingSettlement] = useState<(CatererSettlement & { catererBusinessName?: string }) | null>(null);
  const [holdReason, setHoldReason] = useState('Customer investigation / dispute pending');
  const [releasingSettlement, setReleasingSettlement] = useState<(CatererSettlement & { catererBusinessName?: string }) | null>(null);
  const [releaseNotes, setReleaseNotes] = useState('');
  const [utrInput, setUtrInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const copyToClipboard = (text: string, fieldId: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(fieldId);
    setTimeout(() => {
      setCopiedField(null);
    }, 2000);
  };

  const filtered = settlements.filter((s) => {
    if (filter === 'all') return true;
    if (filter === 'held') return s.status === 'held';
    if (filter === 'pending') return s.status === 'pending' || s.status === 'processing';
    return s.status === 'settled';
  });

  const handleConfirmDisburse = async () => {
    if (!selectedSettlement || !utrInput.trim()) return;
    if (!selectedSettlement.bankAccountNumber || !selectedSettlement.bankIfsc) {
      setErrorMessage('Cannot disburse: Caterer has not linked a bank account.');
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      await onDisburse(selectedSettlement.id, utrInput.trim());
      setSelectedSettlement(null);
      setUtrInput('');
    } catch (err: any) {
      setErrorMessage(err.message || 'Disbursement failed. Please verify bank details.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmHold = async () => {
    if (!holdingSettlement || !onHold || !holdReason.trim()) return;
    setSubmitting(true);
    try {
      await onHold(holdingSettlement.id, holdReason.trim());
      setHoldingSettlement(null);
      setHoldReason('Customer investigation / dispute pending');
    } catch (err: any) {
      alert(`Failed to hold payout: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmRelease = async () => {
    if (!releasingSettlement || !onRelease) return;
    setSubmitting(true);
    try {
      await onRelease(releasingSettlement.id, releaseNotes.trim());
      setReleasingSettlement(null);
      setReleaseNotes('');
    } catch (err: any) {
      alert(`Failed to release hold: ${err.message}`);
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
          {(['all', 'pending', 'held', 'settled'] as const).map((st) => (
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
          {filtered.map((s) => {
            const isEventFuture = s.eventDate
              ? new Date(`${s.eventDate}T23:59:59+05:30`).getTime() > Date.now()
              : false;
            const isCompleted = s.bookingStatus === 'completed';
            const isEventLocked = isEventFuture && !isCompleted;
            const isHeld = s.status === 'held';
            const isZeroPayout = s.netPayoutPaise <= 0;

            return (
              <div
                key={s.id}
                className={`rounded-xl border bg-white p-4 shadow-xs flex flex-col md:flex-row md:items-center md:justify-between gap-4 transition ${
                  isHeld ? 'border-amber-300 bg-amber-50/20' : 'border-slate-200'
                }`}
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="font-bold text-sm text-slate-900">
                      {s.catererBusinessName || 'Catering Partner'}
                    </h4>
                    {s.status === 'settled' ? (
                      <span className="inline-flex items-center gap-1 bg-teal-100 text-teal-800 px-2 py-0.5 rounded-full text-[10px] font-bold">
                        <CheckCircle2 className="h-3 w-3" /> Disbursed
                      </span>
                    ) : isHeld ? (
                      <span className="inline-flex items-center gap-1 bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full text-[10px] font-bold">
                        <PauseCircle className="h-3 w-3" /> Payout On Hold
                      </span>
                    ) : isEventLocked ? (
                      <span className="inline-flex items-center gap-1 bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded-full text-[10px] font-bold">
                        <Calendar className="h-3 w-3" /> Event Upcoming (Locked)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full text-[10px] font-bold">
                        <CheckCircle2 className="h-3 w-3" /> Eligible for Payout
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-slate-500">
                    Booking #{s.bookingId.slice(0, 8)}
                    {s.eventDate && ` • Event Date: ${formatIndianDate(s.eventDate)}`}
                    {s.guestCount && ` (${s.guestCount} guests)`}
                    {s.bookingStatus && ` • Status: ${s.bookingStatus.toUpperCase()}`}
                  </p>

                  {s.utrReference && (
                    <p className="text-[11px] font-mono text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded inline-block border border-emerald-100">
                      Bank UTR: {s.utrReference}
                      {s.settledAt && ` • Settled: ${formatIndianDate(s.settledAt)}`}
                    </p>
                  )}

                  {/* Bank Account Details or Missing Alert */}
                  {s.bankAccountNumber && s.bankIfsc ? (
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] bg-slate-50 border border-slate-200 rounded-lg p-2">
                      <div className="flex items-center gap-1 font-semibold text-slate-800">
                        <Landmark className="h-3.5 w-3.5 text-slate-600" />
                        <span>{s.bankName || 'Bank'}</span>
                      </div>
                      <span className="text-slate-300">|</span>
                      <div className="flex items-center gap-1 font-mono text-slate-700">
                        <span>A/C: {s.bankAccountNumber}</span>
                        <button
                          type="button"
                          title="Copy Account Number"
                          onClick={() => copyToClipboard(s.bankAccountNumber!, `ac-${s.id}`)}
                          className="text-slate-400 hover:text-slate-700 transition"
                        >
                          {copiedField === `ac-${s.id}` ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                        </button>
                      </div>
                      <span className="text-slate-300">|</span>
                      <div className="flex items-center gap-1 font-mono text-slate-700">
                        <span>IFSC: {s.bankIfsc}</span>
                        <button
                          type="button"
                          title="Copy IFSC Code"
                          onClick={() => copyToClipboard(s.bankIfsc!, `ifsc-${s.id}`)}
                          className="text-slate-400 hover:text-slate-700 transition"
                        >
                          {copiedField === `ifsc-${s.id}` ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                        </button>
                      </div>
                      {s.bankAccountHolderName && (
                        <>
                          <span className="text-slate-300">|</span>
                          <span className="text-slate-600 truncate max-w-[150px]">
                            Holder: {s.bankAccountHolderName}
                          </span>
                        </>
                      )}
                    </div>
                  ) : (
                    <div className="mt-2 inline-flex items-center gap-1 rounded bg-rose-50 text-rose-700 border border-rose-200 px-2 py-1 text-[11px] font-medium">
                      <AlertTriangle className="h-3.5 w-3.5 text-rose-600 shrink-0" />
                      <span>No bank account linked by caterer (Disbursal locked)</span>
                    </div>
                  )}
                </div>

                {/* Financial Breakdown & Disburse/Hold Actions */}
                <div className="flex items-center gap-4">
                  <div className="text-right text-xs space-y-0.5">
                    <div className="text-slate-500">
                      Gross: <span className="font-semibold text-slate-800">{formatPaiseToINR(s.grossAmountPaise)}</span>
                    </div>
                    <div className="text-purple-700">
                      - {s.commissionPct}% Platform: <span className="font-semibold">{formatPaiseToINR(s.commissionAmountPaise)}</span>
                    </div>
                    <div className="text-slate-900 font-bold text-sm">
                      Net Payout: <span className={isZeroPayout ? 'text-slate-400 line-through' : 'text-teal-700'}>{formatPaiseToINR(s.netPayoutPaise)}</span>
                    </div>
                  </div>

                  {s.status !== 'settled' && (
                    <div className="flex items-center gap-2">
                      {isHeld ? (
                        onRelease && (
                          <button
                            type="button"
                            disabled={isZeroPayout}
                            onClick={() => {
                              setReleasingSettlement(s);
                              setReleaseNotes('');
                            }}
                            className="flex items-center gap-1 rounded-lg border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 transition shadow-2xs"
                          >
                            <PlayCircle className="h-3.5 w-3.5" />
                            <span>Release</span>
                          </button>
                        )
                      ) : (
                        onHold && (
                          <button
                            type="button"
                            onClick={() => {
                              setHoldingSettlement(s);
                              setHoldReason('Customer investigation / dispute pending');
                            }}
                            className="flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100 transition shadow-2xs"
                          >
                            <PauseCircle className="h-3.5 w-3.5" />
                            <span>Hold</span>
                          </button>
                        )
                      )}

                      <button
                        type="button"
                        disabled={
                          !s.bankAccountNumber ||
                          !s.bankIfsc ||
                          isHeld ||
                          isEventLocked ||
                          isZeroPayout
                        }
                        title={
                          isHeld
                            ? 'Cannot disburse: Payout is currently on hold'
                            : isEventLocked
                            ? `Cannot disburse: Event is upcoming on ${formatIndianDate(s.eventDate || '')}. Safety gate locks payout until event completion.`
                            : isZeroPayout
                            ? 'Cannot disburse: Net payout balance is ₹0'
                            : !s.bankAccountNumber || !s.bankIfsc
                            ? 'Cannot disburse: Caterer has not linked a bank account'
                            : 'Record NEFT/IMPS disbursal'
                        }
                        onClick={() => {
                          setSelectedSettlement(s);
                          setErrorMessage(null);
                          setUtrInput(`UTR_SBIN_${Date.now().toString().slice(-6)}`);
                        }}
                        className={`flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold shadow-xs transition ${
                          !s.bankAccountNumber ||
                          !s.bankIfsc ||
                          isHeld ||
                          isEventLocked ||
                          isZeroPayout
                            ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                            : 'bg-teal-700 text-white hover:bg-teal-800'
                        }`}
                      >
                        <Send className="h-3.5 w-3.5" />
                        <span>Disburse</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
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

            {/* Beneficiary Bank Account Details */}
            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2 text-xs">
              <div className="flex items-center justify-between font-bold text-slate-800 border-b border-slate-200 pb-1.5">
                <span className="flex items-center gap-1.5">
                  <Landmark className="h-4 w-4 text-slate-600" />
                  Beneficiary Bank Account
                </span>
                {selectedSettlement.bankVerified ? (
                  <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">
                    Verified
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-slate-600 bg-slate-200 px-2 py-0.5 rounded-full">
                    Registered
                  </span>
                )}
              </div>

              {selectedSettlement.bankAccountNumber && selectedSettlement.bankIfsc ? (
                <div className="grid grid-cols-2 gap-2 text-slate-700 text-[11px]">
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">Account Holder</span>
                    <span className="font-semibold text-slate-900">
                      {selectedSettlement.bankAccountHolderName || selectedSettlement.catererBusinessName}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">Bank Name</span>
                    <span className="font-semibold text-slate-900">
                      {selectedSettlement.bankName || 'Not Specified'}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">Account Number</span>
                    <div className="flex items-center gap-1 font-mono font-bold text-slate-900">
                      <span>{selectedSettlement.bankAccountNumber}</span>
                      <button
                        type="button"
                        title="Copy Account Number"
                        onClick={() => copyToClipboard(selectedSettlement.bankAccountNumber!, 'modal-ac')}
                        className="text-slate-400 hover:text-slate-700 transition"
                      >
                        {copiedField === 'modal-ac' ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px] uppercase font-semibold">IFSC Code</span>
                    <div className="flex items-center gap-1 font-mono font-bold text-slate-900">
                      <span>{selectedSettlement.bankIfsc}</span>
                      <button
                        type="button"
                        title="Copy IFSC Code"
                        onClick={() => copyToClipboard(selectedSettlement.bankIfsc!, 'modal-ifsc')}
                        className="text-slate-400 hover:text-slate-700 transition"
                      >
                        {copiedField === 'modal-ifsc' ? <Check className="h-3 w-3 text-emerald-600" /> : <Copy className="h-3 w-3" />}
                      </button>
                    </div>
                  </div>
                  {selectedSettlement.upiId && (
                    <div className="col-span-2">
                      <span className="text-slate-400 block text-[10px] uppercase font-semibold">UPI ID</span>
                      <span className="font-mono text-slate-800">{selectedSettlement.upiId}</span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="rounded-lg bg-rose-50 p-2.5 text-xs text-rose-800 border border-rose-200 flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                  <span>Missing bank details! Caterer must provide account number and IFSC code before disbursement.</span>
                </div>
              )}
            </div>

            {errorMessage && (
              <div className="rounded-lg bg-red-50 p-2.5 text-xs text-red-700 border border-red-200 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-red-600" />
                <span>{errorMessage}</span>
              </div>
            )}

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
                disabled={!utrInput.trim() || submitting || !selectedSettlement.bankAccountNumber || !selectedSettlement.bankIfsc}
                onClick={handleConfirmDisburse}
                className="rounded-lg bg-teal-700 px-4 py-2 text-xs font-semibold text-white hover:bg-teal-800 disabled:opacity-50 transition"
              >
                {submitting ? 'Recording...' : 'Confirm Disbursal'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Hold Settlement Modal */}
      {holdingSettlement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <div className="flex items-center gap-2 text-amber-800">
                <PauseCircle className="h-5 w-5 text-amber-600" />
                <h3 className="font-bold text-base text-slate-900">Place Payout On Hold</h3>
              </div>
              <button
                onClick={() => setHoldingSettlement(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="bg-amber-50 p-3 rounded-lg border border-amber-200 text-xs text-amber-900 space-y-1">
              <div className="font-bold">{holdingSettlement.catererBusinessName}</div>
              <div>Holding Net Payout: <b>{formatPaiseToINR(holdingSettlement.netPayoutPaise)}</b></div>
              <div className="text-[11px] text-amber-700">
                This locks the payout ledger row and disables disbursal until an administrator explicitly releases it.
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Hold Reason / Dispute Note: <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                value={holdReason}
                onChange={(e) => setHoldReason(e.target.value)}
                placeholder="e.g. Customer reported food quality complaint; holding funds pending caterer response."
                className="w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:outline-none focus:border-amber-600"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setHoldingSettlement(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!holdReason.trim() || submitting}
                onClick={handleConfirmHold}
                className="rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50 transition"
              >
                {submitting ? 'Holding...' : 'Confirm Hold'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Release Settlement Modal */}
      {releasingSettlement && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3 border-slate-100">
              <div className="flex items-center gap-2 text-emerald-800">
                <PlayCircle className="h-5 w-5 text-emerald-600" />
                <h3 className="font-bold text-base text-slate-900">Release Payout Hold</h3>
              </div>
              <button
                onClick={() => setReleasingSettlement(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="bg-emerald-50 p-3 rounded-lg border border-emerald-200 text-xs text-emerald-900 space-y-1">
              <div className="font-bold">{releasingSettlement.catererBusinessName}</div>
              <div>Net Payout Amount: <b>{formatPaiseToINR(releasingSettlement.netPayoutPaise)}</b></div>
              <div className="text-[11px] text-emerald-700">
                This moves the payout back to Pending status so it can be disbursed to the caterer.
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Resolution Notes (optional):
              </label>
              <input
                type="text"
                value={releaseNotes}
                onChange={(e) => setReleaseNotes(e.target.value)}
                placeholder="e.g. Caterer resolved complaint amicably; cleared for payout."
                className="w-full rounded-lg border border-slate-300 p-2.5 text-xs focus:outline-none focus:border-emerald-600"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setReleasingSettlement(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={handleConfirmRelease}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-800 disabled:opacity-50 transition"
              >
                {submitting ? 'Releasing...' : 'Confirm Release'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
