import React, { useState } from 'react';
import { ChefHat, AlertCircle } from 'lucide-react';
import type { Caterer } from '@/types/database';

interface Props {
  ownerId: string;
  onSuccess: (caterer: Caterer) => void;
}

const AVAILABLE_AREAS = [
  'Alipiri',
  'MR Palli',
  'Bhavani Nagar',
  'Chandragiri',
  'Renigunta',
  'AIR Bypass Road',
  'Korlagunta',
  'Tiruchanur',
];

export const CatererOnboardingForm: React.FC<Props> = ({ ownerId, onSuccess }) => {
  const [businessName, setBusinessName] = useState('');
  const [description, setDescription] = useState('');
  const [city] = useState('Tirupati');
  const [fssaiNumber, setFssaiNumber] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [selectedAreas, setSelectedAreas] = useState<string[]>(['Alipiri', 'MR Palli']);
  const [cuisines, setCuisines] = useState<string[]>(['andhra', 'south_indian']);
  const [newCuisine, setNewCuisine] = useState('');
  const [fssaiDocName, setFssaiDocName] = useState('');
  const [idDocName, setIdDocName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggleArea = (area: string) => {
    setSelectedAreas((prev) =>
      prev.includes(area) ? prev.filter((a) => a !== area) : [...prev, area]
    );
  };

  const addCuisine = () => {
    if (newCuisine.trim() && !cuisines.includes(newCuisine.trim().toLowerCase())) {
      setCuisines([...cuisines, newCuisine.trim().toLowerCase()]);
      setNewCuisine('');
    }
  };

  const removeCuisine = (c: string) => {
    setCuisines(cuisines.filter((x) => x !== c));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate FSSAI 14 digits
    if (!/^\d{14}$/.test(fssaiNumber.trim())) {
      setError('FSSAI license must be exactly 14 numeric digits.');
      return;
    }

    if (selectedAreas.length === 0) {
      setError('Please select at least one service area in Tirupati.');
      return;
    }

    setSubmitting(true);

    const newCaterer: Caterer = {
      id: 'd' + Math.floor(100000000000 + Math.random() * 900000000000),
      owner_id: ownerId,
      business_name: businessName,
      description: description || null,
      city,
      service_areas: selectedAreas,
      cuisines,
      fssai_number: fssaiNumber.trim(),
      gst_number: gstNumber.trim() || null,
      status: 'pending',
      rejection_reason: null,
      avg_rating: 0.0,
      review_count: 0,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    setTimeout(() => {
      setSubmitting(false);
      onSuccess(newCaterer);
    }, 400);
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs max-w-2xl mx-auto">
      <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500 text-white">
          <ChefHat className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Register Your Catering Business</h2>
          <p className="text-xs text-slate-500">
            Submit your business profile and FSSAI certificate to start accepting bookings in Tirupati.
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <div>
          <label className="block text-xs font-semibold uppercase text-slate-600">Business Name</label>
          <input
            type="text"
            required
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="e.g. Balaji Royal Caterers"
            className="mt-1 w-full rounded-lg border border-slate-300 py-2 px-3 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase text-slate-600">Description</label>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Specializing in traditional Telugu Brahmin, Rayalaseema, and North Indian wedding feasts..."
            className="mt-1 w-full rounded-lg border border-slate-300 py-2 px-3 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600">City</label>
            <input
              type="text"
              readOnly
              value={city}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 py-2 px-3 text-sm font-semibold text-slate-700 cursor-not-allowed"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600">FSSAI License (14 Digits)</label>
            <input
              type="text"
              required
              maxLength={14}
              value={fssaiNumber}
              onChange={(e) => setFssaiNumber(e.target.value)}
              placeholder="10123000001234"
              className="mt-1 w-full rounded-lg border border-slate-300 py-2 px-3 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase text-slate-600">GST Number (Optional)</label>
          <input
            type="text"
            value={gstNumber}
            onChange={(e) => setGstNumber(e.target.value)}
            placeholder="37AAAAA0000A1Z5"
            className="mt-1 w-full rounded-lg border border-slate-300 py-2 px-3 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase text-slate-600">Service Areas in Tirupati</label>
          <div className="mt-2 flex flex-wrap gap-2">
            {AVAILABLE_AREAS.map((area) => (
              <button
                type="button"
                key={area}
                onClick={() => toggleArea(area)}
                className={`rounded-full px-3 py-1 text-xs font-medium border transition ${
                  selectedAreas.includes(area)
                    ? 'border-amber-500 bg-amber-50 text-amber-900 font-semibold'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                }`}
              >
                {area} {selectedAreas.includes(area) && '✓'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase text-slate-600">Cuisines</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="text"
              value={newCuisine}
              onChange={(e) => setNewCuisine(e.target.value)}
              placeholder="e.g. rayalaseema, tandoor"
              className="w-full rounded-lg border border-slate-300 py-1.5 px-3 text-sm"
            />
            <button
              type="button"
              onClick={addCuisine}
              className="rounded-lg bg-slate-800 text-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-900 shrink-0"
            >
              Add
            </button>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {cuisines.map((c) => (
              <span key={c} className="inline-flex items-center gap-1 rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-700 capitalize">
                {c}
                <button type="button" onClick={() => removeCuisine(c)} className="hover:text-red-600">×</button>
              </span>
            ))}
          </div>
        </div>

        <div className="pt-2 border-t border-slate-100 space-y-3">
          <label className="block text-xs font-bold uppercase text-slate-700">Verification Documents (FSSAI & ID)</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-dashed border-slate-300 p-3 text-center">
              <span className="text-xs font-medium text-slate-700 block">FSSAI Certificate</span>
              <input
                type="file"
                className="mt-2 text-xs text-slate-500"
                onChange={(e) => setFssaiDocName(e.target.files?.[0]?.name || '')}
              />
              {fssaiDocName && <span className="text-[11px] text-emerald-600 block mt-1">Uploaded: {fssaiDocName}</span>}
            </div>

            <div className="rounded-lg border border-dashed border-slate-300 p-3 text-center">
              <span className="text-xs font-medium text-slate-700 block">Government ID Proof</span>
              <input
                type="file"
                className="mt-2 text-xs text-slate-500"
                onChange={(e) => setIdDocName(e.target.files?.[0]?.name || '')}
              />
              {idDocName && <span className="text-[11px] text-emerald-600 block mt-1">Uploaded: {idDocName}</span>}
            </div>
          </div>
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="w-full mt-4 rounded-lg bg-amber-600 py-2.5 text-sm font-semibold text-white shadow hover:bg-amber-700 disabled:opacity-50 transition"
        >
          {submitting ? 'Submitting Application...' : 'Submit Caterer Application (Status: Pending)'}
        </button>
      </form>
    </div>
  );
};
