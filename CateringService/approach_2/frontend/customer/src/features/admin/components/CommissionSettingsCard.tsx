import React, { useState } from 'react';
import { Percent, Check, AlertCircle } from 'lucide-react';
import { updateCommissionPct } from '../api';

interface Props {
  initialCommission: number;
  onUpdated: (newVal: number) => void;
}

export const CommissionSettingsCard: React.FC<Props> = ({ initialCommission, onUpdated }) => {
  const [commission, setCommission] = useState<number>(initialCommission);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSaved(false);

    if (commission < 0 || commission > 100) {
      setError('Commission must be between 0% and 100%.');
      return;
    }

    const success = await updateCommissionPct(commission);
    if (success) {
      setSaved(true);
      onUpdated(commission);
      setTimeout(() => setSaved(false), 2500);
    } else {
      setError('Failed to update commission rate in database.');
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-xs">
      <div className="flex items-center gap-2">
        <Percent className="h-4 w-4 text-purple-600" />
        <h3 className="text-sm font-bold text-slate-900">Platform Commission Settings</h3>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Commission percentage applied to bookings at the moment caterers accept them.
      </p>

      {error && (
        <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 p-2.5 text-xs text-red-700">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSave} className="mt-4 flex items-center gap-3">
        <div className="relative w-36">
          <input
            type="number"
            step="0.5"
            min="0"
            max="100"
            required
            value={commission}
            onChange={(e) => setCommission(Number(e.target.value))}
            className="w-full rounded-lg border border-slate-300 py-1.5 pl-3 pr-8 text-sm font-bold text-slate-900 focus:border-purple-500 focus:outline-none"
          />
          <span className="absolute right-3 top-2 text-xs font-semibold text-slate-400">%</span>
        </div>

        <button
          type="submit"
          className="rounded-lg bg-purple-600 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-700 transition"
        >
          Update Rate
        </button>

        {saved && (
          <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
            <Check className="h-3.5 w-3.5" /> Updated
          </span>
        )}
      </form>
    </div>
  );
};
