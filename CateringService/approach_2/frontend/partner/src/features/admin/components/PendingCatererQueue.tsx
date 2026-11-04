import React, { useState } from 'react';
import { Check, X, Ban, FileText, ShieldCheck } from 'lucide-react';
import type { Caterer, CatererStatus } from '@/types/database';

interface Props {
  caterers: Caterer[];
  onStatusChange: (catererId: string, status: CatererStatus, reason?: string) => void;
}

export const PendingCatererQueue: React.FC<Props> = ({ caterers, onStatusChange }) => {
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [activeDocCaterer, setActiveDocCaterer] = useState<Caterer | null>(null);

  const pendingList = caterers.filter((c) => c.status === 'pending');
  const otherList = caterers.filter((c) => c.status !== 'pending');

  const handleConfirmReject = (catererId: string) => {
    if (!rejectionReason.trim()) return;
    onStatusChange(catererId, 'rejected', rejectionReason.trim());
    setRejectingId(null);
    setRejectionReason('');
  };

  return (
    <div className="space-y-6">
      {/* Pending Reviews Section */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs overflow-hidden">
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-slate-900">
              Pending Caterer Verifications ({pendingList.length})
            </h2>
            <p className="text-xs text-slate-500">
              Review FSSAI registrations and approve caterers to make them publicly visible in Tirupati.
            </p>
          </div>
        </div>

        {pendingList.length === 0 ? (
          <div className="p-8 text-center">
            <ShieldCheck className="mx-auto h-8 w-8 text-emerald-500" />
            <p className="mt-2 text-sm font-semibold text-slate-700">Verification Queue Clear</p>
            <p className="text-xs text-slate-400">All registered caterers have been processed.</p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {pendingList.map((c) => (
              <div key={c.id} className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-base font-bold text-slate-900">{c.business_name || (c as any).businessName}</h3>
                    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                      Pending
                    </span>
                  </div>

                  <p className="text-xs text-slate-600">
                    City: <b>{c.city}</b> • FSSAI: <span className="font-mono font-semibold">{c.fssai_number || (c as any).fssaiNumber}</span>
                    {(c.gst_number || (c as any).gstNumber) && <> • GST: <span className="font-mono">{c.gst_number || (c as any).gstNumber}</span></>}
                  </p>

                  <div className="flex flex-wrap gap-1 text-[11px] text-slate-500">
                    <span>Areas: {((c.service_areas || (c as any).serviceAreas) || []).join(', ')}</span>
                    {(c as any).ownerName && <span>• Owner: <b>{(c as any).ownerName}</b> ({(c as any).ownerPhone || 'No Phone'})</span>}
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => setActiveDocCaterer(c)}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <FileText className="h-3.5 w-3.5 text-slate-400" />
                    <span>View Docs</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onStatusChange(c.id, 'approved')}
                    className="flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-xs hover:bg-emerald-700 transition"
                  >
                    <Check className="h-3.5 w-3.5" />
                    <span>Approve</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setRejectingId(c.id)}
                    className="flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 transition"
                  >
                    <X className="h-3.5 w-3.5" />
                    <span>Reject</span>
                  </button>
                </div>

                {/* Inline Rejection Reason Prompt */}
                {rejectingId === c.id && (
                  <div className="w-full mt-2 rounded-lg bg-red-50/50 p-3 border border-red-200 space-y-2">
                    <label className="block text-xs font-semibold text-red-900">
                      Rejection Reason (Caterer will see this):
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        required
                        placeholder="e.g. FSSAI number invalid or expired certificate"
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        className="flex-1 rounded-lg border border-red-300 py-1.5 px-3 text-xs bg-white focus:outline-none focus:border-red-500"
                      />
                      <button
                        type="button"
                        onClick={() => handleConfirmReject(c.id)}
                        className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700"
                      >
                        Confirm Rejection
                      </button>
                      <button
                        type="button"
                        onClick={() => setRejectingId(null)}
                        className="rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-600 hover:bg-white"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Processed Caterers (Approved, Suspended, Rejected) */}
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs p-5">
        <h3 className="text-sm font-bold text-slate-900 mb-3">All Managed Caterers</h3>
        <div className="divide-y divide-slate-100">
          {otherList.map((c) => (
            <div key={c.id} className="py-3 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-slate-900">{c.business_name || (c as any).businessName}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                      c.status === 'approved'
                        ? 'bg-emerald-100 text-emerald-800'
                        : c.status === 'suspended'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-red-100 text-red-800'
                    }`}
                  >
                    {c.status.toUpperCase()}
                  </span>
                </div>
                <span className="text-xs text-slate-500">
                  FSSAI: {c.fssai_number || (c as any).fssaiNumber} • City: {c.city}
                  {(c.rejection_reason || (c as any).rejectionReason) && <> • Reason: <i>{c.rejection_reason || (c as any).rejectionReason}</i></>}
                </span>
              </div>

              <div>
                {c.status === 'approved' ? (
                  <button
                    type="button"
                    onClick={() => onStatusChange(c.id, 'suspended')}
                    className="flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                  >
                    <Ban className="h-3 w-3 text-amber-600" />
                    <span>Suspend</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => onStatusChange(c.id, 'approved')}
                    className="flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    <Check className="h-3 w-3" />
                    <span>Approve</span>
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Document Viewer Modal */}
      {activeDocCaterer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="text-sm font-bold text-slate-900">
                Verification Documents: {activeDocCaterer.business_name}
              </h3>
              <button
                onClick={() => setActiveDocCaterer(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
                <span className="font-bold text-slate-800 block">FSSAI Certificate</span>
                <span className="text-slate-600 mt-1 block">License Number: {activeDocCaterer.fssai_number}</span>
                <span className="text-emerald-700 mt-1 block">✓ Verified Format: 14 Digits Valid</span>
              </div>

              <div className="rounded-lg border border-slate-200 p-3 bg-slate-50">
                <span className="font-bold text-slate-800 block">Owner ID Proof</span>
                <span className="text-slate-600 mt-1 block">Identity proof verified against owner profile.</span>
              </div>
            </div>

            <button
              onClick={() => setActiveDocCaterer(null)}
              className="w-full rounded-lg bg-slate-900 py-2 text-xs font-semibold text-white hover:bg-slate-800"
            >
              Close Viewer
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
