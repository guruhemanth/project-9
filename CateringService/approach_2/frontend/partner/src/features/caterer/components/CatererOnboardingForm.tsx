import React, { useState } from 'react';
import { ChefHat, AlertCircle, Plus, X, MapPin } from 'lucide-react';
import { INDIAN_STATES_AND_UTS } from '@caterconnect/shared';
import { submitCatererOnboarding } from '../api';
import type { Caterer } from '@/types/database';

interface Props {
  ownerId: string;
  onSuccess: (caterer: Caterer) => void;
}

export const CatererOnboardingForm: React.FC<Props> = ({ ownerId, onSuccess }) => {
  const [businessName, setBusinessName] = useState('');
  const [description, setDescription] = useState('');
  const [state, setState] = useState('Andhra Pradesh');
  const [city, setCity] = useState('Tirupati');
  const [pincode, setPincode] = useState('');
  const [address, setAddress] = useState('');
  const [fssaiNumber, setFssaiNumber] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [serviceAreas, setServiceAreas] = useState<string[]>(['Alipiri', 'MR Palli', 'Chandragiri']);
  const [newArea, setNewArea] = useState('');
  const [cuisines, setCuisines] = useState<string[]>(['south_indian', 'traditional_meals']);
  const [newCuisine, setNewCuisine] = useState('');
  const [fssaiDocName, setFssaiDocName] = useState('');
  const [idDocName, setIdDocName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const addArea = () => {
    const trimmed = newArea.trim();
    if (trimmed && !serviceAreas.map((a) => a.toLowerCase()).includes(trimmed.toLowerCase())) {
      setServiceAreas([...serviceAreas, trimmed]);
      setNewArea('');
    }
  };

  const removeArea = (areaToRemove: string) => {
    setServiceAreas(serviceAreas.filter((a) => a !== areaToRemove));
  };

  const addCuisine = () => {
    const trimmed = newCuisine.trim().toLowerCase();
    if (trimmed && !cuisines.includes(trimmed)) {
      setCuisines([...cuisines, trimmed]);
      setNewCuisine('');
    }
  };

  const removeCuisine = (c: string) => {
    setCuisines(cuisines.filter((x) => x !== c));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // Validate 14 digits FSSAI
    if (!/^\d{14}$/.test(fssaiNumber.trim())) {
      setError('FSSAI license must be exactly 14 numeric digits.');
      return;
    }

    // Validate 6 digits PIN code
    if (pincode.trim() && !/^[1-9][0-9]{5}$/.test(pincode.trim())) {
      setError('Pincode must be a valid 6-digit Indian postal code.');
      return;
    }

    if (serviceAreas.length === 0) {
      setError('Please add at least one serviceable locality or area.');
      return;
    }

    if (cuisines.length === 0) {
      setError('Please specify at least one cuisine type.');
      return;
    }

    setSubmitting(true);

    const payload = {
      ownerId,
      businessName: businessName.trim(),
      description: description.trim() || undefined,
      state,
      city: city.trim(),
      pincode: pincode.trim() || null,
      address: address.trim() || null,
      serviceAreas,
      cuisines,
      fssaiNumber: fssaiNumber.trim(),
      gstNumber: gstNumber.trim() || null,
    };

    try {
      const res = await submitCatererOnboarding(payload);
      onSuccess({
        id: res.caterer?.id || 'd' + Math.floor(100000000000 + Math.random() * 900000000000),
        owner_id: ownerId,
        business_name: payload.businessName,
        description: payload.description || null,
        city: payload.city,
        state: payload.state,
        pincode: payload.pincode,
        address: payload.address,
        service_areas: payload.serviceAreas,
        cuisines: payload.cuisines,
        fssai_number: payload.fssaiNumber,
        gst_number: payload.gstNumber,
        status: 'pending',
        rejection_reason: null,
        avg_rating: 0.0,
        review_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    } catch (err: any) {
      setError(err.message || 'Failed to submit application. Please check your connection.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs max-w-3xl mx-auto">
      <div className="flex items-center gap-3 pb-4 border-b border-slate-100">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-amber-500 text-white shadow-2xs">
          <ChefHat className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold text-slate-900">Register Your Catering Business</h2>
          <p className="text-xs text-slate-500">
            Submit your Pan-India business details and FSSAI license to begin receiving booking orders.
          </p>
        </div>
      </div>

      {error && (
        <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 border border-red-200">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="mt-6 space-y-5">
        <div>
          <label className="block text-xs font-semibold uppercase text-slate-600">Business Name</label>
          <input
            type="text"
            required
            value={businessName}
            onChange={(e) => setBusinessName(e.target.value)}
            placeholder="e.g. Balaji Royal Feast Caterers"
            className="mt-1 w-full rounded-lg border border-slate-300 py-2 px-3 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold uppercase text-slate-600">Business Description</label>
          <textarea
            rows={2}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe your specialties, event capacity, traditions, and special banquet counters..."
            className="mt-1 w-full rounded-lg border border-slate-300 py-2 px-3 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
          />
        </div>

        {/* Pan-India Geographic Location */}
        <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-4 space-y-4">
          <div className="flex items-center gap-2 text-xs font-bold uppercase text-slate-700">
            <MapPin className="h-4 w-4 text-amber-600" />
            <span>Operating Location in India</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 uppercase">State / UT</label>
              <select
                value={state}
                onChange={(e) => setState(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white py-2 px-3 text-xs sm:text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                {INDIAN_STATES_AND_UTS.map((st) => (
                  <option key={st} value={st}>
                    {st}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 uppercase">City / District</label>
              <input
                type="text"
                required
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="e.g. Tirupati, Bengaluru, Hyderabad"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white py-2 px-3 text-xs sm:text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 uppercase">PIN Code (6 Digits)</label>
              <input
                type="text"
                maxLength={6}
                value={pincode}
                onChange={(e) => setPincode(e.target.value.replace(/\D/g, ''))}
                placeholder="e.g. 517501"
                className="mt-1 w-full rounded-lg border border-slate-300 bg-white py-2 px-3 text-xs sm:text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase">Kitchen / Base Address</label>
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="e.g. Plot No 45, Industrial Estate, Renigunta Road"
              className="mt-1 w-full rounded-lg border border-slate-300 bg-white py-2 px-3 text-xs sm:text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          {/* Dynamic Service Areas Tag Input */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 uppercase">
              Serviceable Localities / Delivery Radiuses (where you accept catering events)
            </label>
            <div className="mt-1.5 flex items-center gap-2">
              <input
                type="text"
                value={newArea}
                onChange={(e) => setNewArea(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addArea();
                  }
                }}
                placeholder="e.g. Alipiri, Koramangala, Gachibowli (press Enter)"
                className="w-full rounded-lg border border-slate-300 bg-white py-1.5 px-3 text-xs sm:text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500"
              />
              <button
                type="button"
                onClick={addArea}
                className="flex items-center gap-1 rounded-lg bg-slate-800 text-white px-3 py-1.5 text-xs font-semibold hover:bg-slate-900 shrink-0"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add</span>
              </button>
            </div>

            <div className="mt-2.5 flex flex-wrap gap-1.5">
              {serviceAreas.map((area) => (
                <span
                  key={area}
                  className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 border border-amber-200 px-3 py-1 text-xs font-medium text-amber-950"
                >
                  <span>{area}</span>
                  <button
                    type="button"
                    onClick={() => removeArea(area)}
                    className="hover:text-red-700 text-amber-800"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Regulatory & Licenses */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600">FSSAI License (14 Digits)</label>
            <input
              type="text"
              required
              maxLength={14}
              value={fssaiNumber}
              onChange={(e) => setFssaiNumber(e.target.value.replace(/\D/g, ''))}
              placeholder="10123000001234"
              className="mt-1 w-full rounded-lg border border-slate-300 py-2 px-3 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600">GSTIN Number (Optional)</label>
            <input
              type="text"
              value={gstNumber}
              onChange={(e) => setGstNumber(e.target.value.toUpperCase())}
              placeholder="37AAAAA0000A1Z5"
              className="mt-1 w-full rounded-lg border border-slate-300 py-2 px-3 text-sm focus:border-amber-500 focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
            />
          </div>
        </div>

        {/* Cuisines Tag Input */}
        <div>
          <label className="block text-xs font-semibold uppercase text-slate-600">Cuisine Specialties</label>
          <div className="mt-1 flex items-center gap-2">
            <input
              type="text"
              value={newCuisine}
              onChange={(e) => setNewCuisine(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addCuisine();
                }
              }}
              placeholder="e.g. hyderabadi, north_indian, chettinad (press Enter)"
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
              <span
                key={c}
                className="inline-flex items-center gap-1 rounded-md bg-slate-100 border border-slate-200 px-2.5 py-1 text-xs text-slate-700 capitalize"
              >
                <span>{c.replace('_', ' ')}</span>
                <button type="button" onClick={() => removeCuisine(c)} className="hover:text-red-600">
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        </div>

        {/* Documents */}
        <div className="pt-2 border-t border-slate-100 space-y-3">
          <label className="block text-xs font-bold uppercase text-slate-700">Verification Documents (FSSAI & ID)</label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="rounded-lg border border-dashed border-slate-300 p-3 text-center bg-slate-50/50">
              <span className="text-xs font-medium text-slate-700 block">FSSAI Certificate</span>
              <input
                type="file"
                className="mt-2 text-xs text-slate-500"
                onChange={(e) => setFssaiDocName(e.target.files?.[0]?.name || '')}
              />
              {fssaiDocName && <span className="text-[11px] text-emerald-600 block mt-1">Uploaded: {fssaiDocName}</span>}
            </div>

            <div className="rounded-lg border border-dashed border-slate-300 p-3 text-center bg-slate-50/50">
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
          className="w-full mt-4 rounded-lg bg-amber-600 py-2.5 text-sm font-semibold text-white shadow-xs hover:bg-amber-700 disabled:opacity-50 transition"
        >
          {submitting ? 'Submitting Application...' : 'Submit Pan-India Caterer Application (Status: Pending)'}
        </button>
      </form>
    </div>
  );
};
