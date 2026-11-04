import React, { useState, useEffect } from 'react';
import { Calendar as CalendarIcon, Plus, Trash2, AlertCircle } from 'lucide-react';
import { fetchCatererAvailability, addBlackoutDate, removeBlackoutDate } from '../api';

interface Props {
  catererId: string;
}

export const BlackoutDateManager: React.FC<Props> = ({ catererId }) => {
  const [unavailableDates, setUnavailableDates] = useState<any[]>([]);
  const [newDate, setNewDate] = useState('');
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadDates = async () => {
    try {
      setLoading(true);
      const res = await fetchCatererAvailability(catererId);
      setUnavailableDates(res.unavailableDates || []);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDates();
  }, [catererId]);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDate) return;
    setError(null);
    setSubmitting(true);

    try {
      await addBlackoutDate(catererId, newDate, reason.trim() || undefined);
      setNewDate('');
      setReason('');
      await loadDates();
    } catch (err: any) {
      setError(err.message || 'Failed to add blackout date');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemove = async (date: string) => {
    try {
      await removeBlackoutDate(catererId, date);
      await loadDates();
    } catch (err: any) {
      setError(err.message || 'Failed to remove date');
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CalendarIcon className="h-5 w-5 text-emerald-600" />
          <h3 className="text-base font-bold text-slate-900">Blackout Dates & Availability</h3>
        </div>
      </div>
      <p className="mb-4 text-xs text-slate-500">
        Mark dates when your catering team is unavailable in Tirupati (festivals, leave, or private events).
      </p>

      {error && (
        <div className="mb-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleAdd} className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700">Date to Block</label>
          <input
            type="date"
            required
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-emerald-600 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold text-slate-700">Reason (Optional)</label>
          <input
            type="text"
            placeholder="e.g. Tirumala Brahmotsavam"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs focus:border-emerald-600 focus:outline-none"
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={submitting || !newDate}
            className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 disabled:opacity-50"
          >
            <Plus className="h-3.5 w-3.5" />
            {submitting ? 'Adding...' : 'Block Date'}
          </button>
        </div>
      </form>

      {loading ? (
        <p className="text-center text-xs text-slate-500 py-4">Loading calendar data...</p>
      ) : unavailableDates.length === 0 ? (
        <p className="rounded-lg bg-slate-50 p-4 text-center text-xs text-slate-500">
          No dates currently blocked. All dates are open for booking.
        </p>
      ) : (
        <div className="divide-y divide-slate-100 rounded-lg border border-slate-100">
          {unavailableDates.map((item) => (
            <div key={item.id} className="flex items-center justify-between p-3 text-xs">
              <div>
                <span className="font-bold text-slate-900">{item.unavailableDate}</span>
                <span className="ml-2 text-slate-500">({item.reason || 'Blocked'})</span>
                {item.autoLocked && (
                  <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-800">
                    Confirmed Booking
                  </span>
                )}
              </div>
              {!item.autoLocked && (
                <button
                  type="button"
                  onClick={() => handleRemove(item.unavailableDate)}
                  className="text-red-500 hover:text-red-700 p-1"
                  title="Reopen Date"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
