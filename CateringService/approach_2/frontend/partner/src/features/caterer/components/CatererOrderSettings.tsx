import React, { useState } from 'react';
import { Users, Clock, Settings2, Save, CheckCircle2, AlertCircle } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

interface CatererOrderSettingsProps {
  catererId: string;
  initialMinGuests?: number;
  initialMaxGuests?: number;
  initialLeadDays?: number;
  initialAllowsCustomCombo?: boolean;
  onUpdate?: () => void;
}

export const CatererOrderSettings: React.FC<CatererOrderSettingsProps> = ({
  catererId,
  initialMinGuests = 25,
  initialMaxGuests = 2000,
  initialLeadDays = 2,
  initialAllowsCustomCombo = true,
  onUpdate,
}) => {
  const [minGuests, setMinGuests] = useState<number>(initialMinGuests);
  const [maxGuests, setMaxGuests] = useState<number>(initialMaxGuests);
  const [leadDays, setLeadDays] = useState<number>(initialLeadDays);
  const [allowsCustomCombo, setAllowsCustomCombo] = useState<boolean>(initialAllowsCustomCombo);
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
