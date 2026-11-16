import React, { useState } from 'react';
import { Users, Clock, Settings2, Save, CheckCircle2, AlertCircle, Zap } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

interface CatererOrderSettingsProps {
  catererId: string;
  initialMinGuests?: number;
  initialMaxGuests?: number;
  initialLeadDays?: number;
  initialAllowsCustomCombo?: boolean;
  initialInstantBookingEnabled?: boolean;
  onUpdate?: () => void;
}

export const CatererOrderSettings: React.FC<CatererOrderSettingsProps> = ({
  catererId,
  initialMinGuests = 25,
  initialMaxGuests = 2000,
  initialLeadDays = 2,
  initialAllowsCustomCombo = true,
  initialInstantBookingEnabled = false,
  onUpdate,
}) => {
  const [minGuests, setMinGuests] = useState<number>(initialMinGuests);
  const [maxGuests, setMaxGuests] = useState<number>(initialMaxGuests);
  const [leadDays, setLeadDays] = useState<number>(initialLeadDays);
  const [allowsCustomCombo, setAllowsCustomCombo] = useState<boolean>(initialAllowsCustomCombo);
  const [instantBookingEnabled, setInstantBookingEnabled] = useState<boolean>(initialInstantBookingEnabled);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (minGuests <= 0 || maxGuests < minGuests) {
      setError('Minimum guests must be at least 1 and less than maximum guests');
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      await apiFetch(`/api/caterers/${catererId}/settings`, {
        method: 'PATCH',
        body: JSON.stringify({
          minGuests,
          maxGuests,
          leadTimeDays: leadDays,
          allowsCustomCombo,
          instantBookingEnabled,
        }),
      });

      setSuccess(true);
      if (onUpdate) onUpdate();
      setTimeout(() => setSuccess(false), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to update order policies');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-6">
      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
        <div>
          <h3 className="font-bold text-base text-slate-900 flex items-center gap-2">
            <Settings2 className="h-5 w-5 text-amber-600" />
            Kitchen Order Policies & Guest Thresholds
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Set capacity constraints and lead time. Bookings that don't satisfy these rules cannot be placed.
          </p>
        </div>
      </div>

      {success && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 p-3 text-xs text-emerald-800 border border-emerald-200">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>Policies successfully updated and live on customer app!</span>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700 border border-red-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Minimum Guests to Accept Order *
            </label>
            <div className="relative">
              <Users className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="number"
                min="1"
                max="10000"
                required
                value={minGuests}
                onChange={(e) => setMinGuests(parseInt(e.target.value, 10) || 0)}
                className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-xs focus:ring-1 focus:ring-amber-500 focus:outline-none"
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Orders below this guest count are blocked</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Maximum Catering Capacity (Guests) *
            </label>
            <div className="relative">
              <Users className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="number"
                min="1"
                max="50000"
                required
                value={maxGuests}
                onChange={(e) => setMaxGuests(parseInt(e.target.value, 10) || 0)}
                className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-xs focus:ring-1 focus:ring-amber-500 focus:outline-none"
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Maximum guests your kitchen team can handle</p>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Advance Lead Time (Days) *
            </label>
            <div className="relative">
              <Clock className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
              <input
                type="number"
                min="1"
                max="30"
                required
                value={leadDays}
                onChange={(e) => setLeadDays(parseInt(e.target.value, 10) || 0)}
                className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-xs focus:ring-1 focus:ring-amber-500 focus:outline-none"
              />
            </div>
            <p className="text-[11px] text-slate-400 mt-1">Minimum days notice required before feast date</p>
          </div>
        </div>

        {/* Dual Booking Mode Selection */}
        <div className="rounded-xl border border-amber-200/60 bg-amber-50/40 p-4 space-y-3">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-amber-100 text-amber-800 shrink-0 mt-0.5">
                <Zap className="h-5 w-5 fill-amber-500 text-amber-600" />
              </div>
              <div>
                <label htmlFor="instantBookingEnabled" className="text-sm font-bold text-slate-900 cursor-pointer flex items-center gap-2">
                  <span>Allow Instant Booking</span>
                  {instantBookingEnabled ? (
                    <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                      Active: Direct Advance Payment
                    </span>
                  ) : (
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                      Standard: On-Request Review
                    </span>
                  )}
                </label>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  {instantBookingEnabled ? (
                    <span>
                      Customers can immediately lock their date by paying the <strong>25% Advance upfront</strong> without waiting for your manual review. If you must cancel later, a <strong>100% automated refund</strong> is issued immediately.
                    </span>
                  ) : (
                    <span>
                      Customers submit an inquiry for <strong>₹0 upfront</strong>. You review and accept first. Once you accept, the customer has a <strong>12-hour payment window</strong> to pay the 25% advance before the tentative slot expires.
                    </span>
                  )}
                </p>
              </div>
            </div>

            <label className="relative inline-flex items-center cursor-pointer shrink-0 mt-1">
              <input
                type="checkbox"
                id="instantBookingEnabled"
                checked={instantBookingEnabled}
                onChange={(e) => setInstantBookingEnabled(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-11 h-6 bg-slate-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-600"></div>
            </label>
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="allowsCustomCombo"
              checked={allowsCustomCombo}
              onChange={(e) => setAllowsCustomCombo(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-amber-600 focus:ring-amber-500"
            />
            <label htmlFor="allowsCustomCombo" className="text-xs font-medium text-slate-700">
              Enable "Build Your Own Combo" for Customers (uses dishes from your master catalog)
            </label>
          </div>

          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-1.5 rounded-lg bg-amber-600 px-4 py-2 text-xs font-semibold text-white hover:bg-amber-700 transition disabled:opacity-50"
          >
            <Save className="h-4 w-4" />
            <span>{saving ? 'Saving...' : 'Save Order Policies'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
