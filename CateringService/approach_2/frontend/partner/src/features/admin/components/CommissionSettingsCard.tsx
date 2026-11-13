import React, { useState } from 'react';
import { Percent, Check, AlertCircle, Building2, MapPin, ShieldCheck } from 'lucide-react';
import { updateCommissionPct, updateCatererCommission } from '../api';
import type { AdminCaterer } from '@caterconnect/shared';

interface Props {
  initialCommission: number;
  caterers?: AdminCaterer[];
  onUpdated: (newVal: number) => void;
}

export const CommissionSettingsCard: React.FC<Props> = ({
  initialCommission,
  caterers = [],
  onUpdated,
}) => {
  const [globalCommission, setGlobalCommission] = useState<number>(initialCommission);
  const [globalSaved, setGlobalSaved] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  // Per-caterer overrides state: map catererId -> rate
  const [catererRates, setCatererRates] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {};
    caterers.forEach((c) => {
      initial[c.id] = (c as any).commissionPct || (c as any).commission_pct || 15.0;
    });
    return initial;
  });

  const [savingId, setSavingId] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [catererError, setCatererError] = useState<string | null>(null);

  const handleGlobalSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setGlobalError(null);
    setGlobalSaved(false);

    if (globalCommission < 0 || globalCommission > 100) {
      setGlobalError('Commission must be between 0% and 100%.');
      return;
    }

    const success = await updateCommissionPct(globalCommission);
    if (success) {
      setGlobalSaved(true);
      onUpdated(globalCommission);
      setTimeout(() => setGlobalSaved(false), 2500);
    } else {
      setGlobalError('Failed to update commission rate in database.');
    }
  };

  const handleCatererRateChange = (catererId: string, val: number) => {
    setCatererRates((prev) => ({
      ...prev,
      [catererId]: val,
    }));
  };

  const handleSaveCatererRate = async (catererId: string) => {
    setCatererError(null);
    setSavingId(catererId);

    const rate = catererRates[catererId];
    if (rate === undefined || rate < 0 || rate > 100) {
      setCatererError('Commission must be between 0% and 100%.');
      setSavingId(null);
      return;
    }

    try {
      await updateCatererCommission(catererId, rate);
      setSavedId(catererId);
      setTimeout(() => setSavedId(null), 2500);
    } catch (err: any) {
      setCatererError(err.message || 'Failed to update commission for this caterer.');
    } finally {
      setSavingId(null);
    }
  };

  const approvedCaterers = caterers.filter((c) => c.status === 'approved');

  return (
    <div className="space-y-6">
      {/* Global Platform Commission Card */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs">
        <div className="flex items-center gap-2">
          <Percent className="h-5 w-5 text-purple-700" />
          <h3 className="text-base font-bold text-slate-900">Default Platform Commission Policy</h3>
        </div>
        <p className="mt-1 text-xs text-slate-500">
          Base commission percentage applied to new caterers and standard orders when no caterer-specific override is configured.
        </p>

        {globalError && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 p-2.5 text-xs text-red-700">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{globalError}</span>
          </div>
        )}

        <form onSubmit={handleGlobalSave} className="mt-4 flex items-center gap-3">
          <div className="relative w-36">
            <input
              type="number"
              step="0.5"
              min="0"
              max="100"
              required
              value={globalCommission}
              onChange={(e) => setGlobalCommission(Number(e.target.value))}
              className="w-full rounded-xl border border-slate-300 py-2 pl-3 pr-8 text-sm font-bold text-slate-900 focus:border-purple-600 focus:outline-none"
            />
            <span className="absolute right-3 top-2.5 text-xs font-semibold text-slate-400">%</span>
          </div>

          <button
            type="submit"
            className="rounded-xl bg-purple-700 px-4 py-2 text-xs font-semibold text-white hover:bg-purple-800 transition shadow-2xs"
          >
            Update Global Default
          </button>

          {globalSaved && (
            <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600">
              <Check className="h-4 w-4" /> Policy Saved
            </span>
          )}
        </form>
      </div>

      {/* Caterer-Specific Overrides Table */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-xs space-y-4">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-purple-700" />
            <span>Caterer-Level Commission Tiers & Overrides</span>
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Set custom commission percentages for premier caterers, high-volume banquet partners, or promotional introductory rates.
          </p>
        </div>

        {catererError && (
          <div className="flex items-center gap-2 rounded-lg bg-red-50 p-2.5 text-xs text-red-700">
            <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            <span>{catererError}</span>
          </div>
        )}

        {approvedCaterers.length === 0 ? (
          <p className="text-xs text-slate-400 py-4 text-center">No approved caterers found to configure.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 text-slate-500 font-semibold">
                <tr>
                  <th className="pb-2.5">Caterer Business</th>
                  <th className="pb-2.5">Hub / City</th>
                  <th className="pb-2.5">FSSAI License</th>
                  <th className="pb-2.5">Custom Commission Rate</th>
                  <th className="pb-2.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {approvedCaterers.map((caterer) => {
                  const currentVal = catererRates[caterer.id] ?? 15.0;
                  const isSaving = savingId === caterer.id;
                  const isSaved = savedId === caterer.id;

                  return (
                    <tr key={caterer.id} className="hover:bg-slate-50/60 transition">
                      <td className="py-3 font-bold text-slate-900 flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-purple-600 shrink-0" />
                        <span>{caterer.businessName}</span>
                      </td>
                      <td className="py-3 text-slate-600">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-slate-400" />
                          {caterer.city}
                        </span>
                      </td>
                      <td className="py-3 font-mono text-[11px] text-slate-500">
                        {caterer.fssaiNumber || 'Pending'}
                      </td>
                      <td className="py-3">
                        <div className="relative w-28">
                          <input
                            type="number"
                            step="0.5"
                            min="0"
                            max="100"
                            value={currentVal}
                            onChange={(e) =>
                              handleCatererRateChange(caterer.id, Number(e.target.value))
                            }
                            className="w-full rounded-lg border border-slate-200 bg-white py-1 pl-2.5 pr-6 text-xs font-bold text-slate-900 focus:outline-none focus:border-purple-600"
                          />
                          <span className="absolute right-2 top-1 text-[11px] font-semibold text-slate-400">
                            %
                          </span>
                        </div>
                      </td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          disabled={isSaving}
                          onClick={() => handleSaveCatererRate(caterer.id)}
                          className="inline-flex items-center gap-1 rounded-lg bg-purple-50 hover:bg-purple-100 text-purple-800 border border-purple-200 px-3 py-1 text-xs font-semibold transition disabled:opacity-50"
                        >
                          {isSaved ? (
                            <>
                              <Check className="h-3.5 w-3.5 text-emerald-600" />
                              <span className="text-emerald-700 font-bold">Saved</span>
                            </>
                          ) : isSaving ? (
                            'Saving...'
                          ) : (
                            'Save Rate'
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
