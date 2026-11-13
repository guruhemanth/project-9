import React, { useState } from 'react';
import { X, AlertCircle, Phone, CheckCircle2, Sparkles, Utensils } from 'lucide-react';
import { formatPaiseToINR } from '@/lib/formatters';
import { createBookingRequest } from '../api';
import { updatePhoneApi } from '../../auth/api';
import { useAuth } from '@/lib/auth/AuthContext';
import type { Caterer, Package, Booking, MenuItem } from '@/types/database';

interface Props {
  caterer: Caterer;
  packageItem?: Package | null;
  customCombo?: {
    comboName: string;
    selectedItems: MenuItem[];
    pricePerPlatePaise: number;
    guestCount: number;
  } | null;
  initialGuestCount?: number;
  customerId: string;
  onClose: () => void;
  onSuccess: (booking: Booking) => void;
}

export const BookingRequestModal: React.FC<Props> = ({
  caterer,
  packageItem,
  customCombo,
  initialGuestCount,
  customerId: _customerId,
  onClose,
  onSuccess,
}) => {
  const { user, updateUser } = useAuth();

  // Tomorrow's date as min
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDateStr = tomorrow.toISOString().split('T')[0];

  const defaultGuests =
    initialGuestCount ||
    customCombo?.guestCount ||
    packageItem?.min_guests ||
    caterer.min_guests ||
    50;

  const [eventDate, setEventDate] = useState(minDateStr);
  const [eventTime, setEventTime] = useState('12:30');
  const [guestCount, setGuestCount] = useState<number>(defaultGuests);
  const [venueAddress, setVenueAddress] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Phone number state for users without a registered mobile number
  const [phone, setPhone] = useState(user?.phone || '+91');
  const [phoneSaved, setPhoneSaved] = useState(Boolean(user?.phone));

  const effectivePricePerPlate = customCombo
    ? customCombo.pricePerPlatePaise
    : packageItem
    ? packageItem.price_per_plate
    : 0;

  const estimatedTotalPaise = guestCount * effectivePricePerPlate;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const effectiveMinGuests = Math.max(
      packageItem?.min_guests || 10,
      caterer.min_guests || 25
    );
    const effectiveMaxGuests = caterer.max_guests || packageItem?.max_guests;

    if (guestCount < effectiveMinGuests) {
      setError(`Minimum guests required by ${caterer.business_name} is ${effectiveMinGuests} guests.`);
      return;
    }

    if (effectiveMaxGuests && guestCount > effectiveMaxGuests) {
      setError(`Maximum capacity for ${caterer.business_name} is ${effectiveMaxGuests} guests.`);
      return;
    }

    if (!venueAddress.trim()) {
      setError('Please provide the venue address.');
      return;
    }

    // Require customer to provide and verify phone number if missing from account
    if (!phoneSaved) {
      const phoneRegex = /^\+91[6-9]\d{9}$/;
      if (!phoneRegex.test(phone.trim())) {
        setError('Please enter a valid 10-digit Indian mobile number (+91 followed by 10 digits).');
        return;
      }

      try {
        setSubmitting(true);
        const updateRes = await updatePhoneApi(phone.trim());
        updateUser(updateRes.user);
        setPhoneSaved(true);
      } catch (phoneErr: any) {
        setError(phoneErr.message || 'Failed to update phone number.');
        setSubmitting(false);
        return;
      }
    }

    setSubmitting(true);

    try {
      const payload: any = {
        catererId: caterer.id,
        eventDate,
        eventTime: eventTime.length === 5 ? `${eventTime}:00` : eventTime,
        guestCount,
        venueAddress: venueAddress.trim(),
        city: caterer.city || 'Tirupati',
        state: caterer.state || 'Andhra Pradesh',
        pincode: caterer.pincode || null,
        specialRequests: specialRequests.trim() || null,
      };

      if (customCombo) {
        payload.customComboName = customCombo.comboName;
        payload.customizedItems = customCombo.selectedItems.map((item) => ({
          id: item.id,
          name: item.name,
          category: item.category,
          pricePaise: item.price_paise,
          isVeg: item.is_veg,
        }));
      } else if (packageItem) {
        payload.packageId = packageItem.id;
      }

      const res = await createBookingRequest(payload);
      onSuccess(res.booking);
    } catch (err: any) {
      setError(err.message || 'Failed to submit booking request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const title = customCombo
    ? customCombo.comboName
    : packageItem?.name || 'Catering Feast';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-400 hover:text-slate-600 transition"
        >
          <X className="h-5 w-5" />
        </button>

        <div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
              Booking Request
            </span>
            {customCombo && (
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-800">
                <Sparkles className="h-3 w-3 text-amber-600" />
                Custom Feast Combo
              </span>
            )}
          </div>
          <h2 className="mt-1 text-lg font-bold text-slate-900">{title}</h2>
          <p className="text-xs text-slate-500">
            By <b>{caterer.business_name}</b> • {formatPaiseToINR(effectivePricePerPlate)} / plate
          </p>
        </div>

        {/* Selected Dishes Pill Preview if Custom Combo */}
        {customCombo && customCombo.selectedItems.length > 0 && (
          <div className="mt-3 rounded-xl border border-amber-200/80 bg-amber-50/50 p-3 space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900">
              <Utensils className="h-3.5 w-3.5 text-amber-700" />
              <span>{customCombo.selectedItems.length} Custom Dishes Included:</span>
            </div>
            <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto">
              {customCombo.selectedItems.map((item) => (
                <span
                  key={item.id}
                  className="inline-flex items-center gap-1 rounded bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-700 border border-amber-200"
                >
                  <span className={`h-1.5 w-1.5 rounded-full ${item.is_veg ? 'bg-emerald-500' : 'bg-red-500'}`} />
                  {item.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4 text-left">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600">Event Date</label>
              <input
                type="date"
                required
                min={minDateStr}
                value={eventDate}
                onChange={(e) => setEventDate(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 py-2 px-3 text-xs focus:border-emerald-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600">Service Time</label>
              <input
                type="time"
                required
                value={eventTime}
                onChange={(e) => setEventTime(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-300 py-2 px-3 text-xs focus:border-emerald-500 focus:outline-none"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label className="block text-xs font-semibold uppercase text-slate-600">
                Number of Guests for Service
              </label>
              <span className="text-[10px] text-slate-400">
                Min: {Math.max(packageItem?.min_guests || 10, caterer.min_guests || 25)} guests
                {caterer.max_guests && ` • Max: ${caterer.max_guests}`}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="number"
                required
                min={Math.max(packageItem?.min_guests || 10, caterer.min_guests || 25)}
                max={caterer.max_guests || packageItem?.max_guests || undefined}
                value={guestCount}
                onChange={(e) => setGuestCount(Math.max(1, Number(e.target.value)))}
                className="w-full rounded-lg border border-slate-300 py-2 px-3 text-xs focus:border-emerald-500 focus:outline-none font-bold text-slate-900"
              />
            </div>
            {/* Quick Guest Count Presets */}
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {[50, 100, 200, 350, 500, 1000].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setGuestCount(preset)}
                  className={`rounded-md px-2 py-0.5 text-[10px] font-semibold transition ${
                    guestCount === preset
                      ? 'bg-emerald-700 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {preset} Guests
                </button>
              ))}
            </div>
          </div>

          {/* Contact Mobile Phone Number */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5">
            <div className="flex items-center justify-between mb-1.5">
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-800">
                <Phone className="h-3.5 w-3.5 text-emerald-600" />
                Contact Mobile Number (+91)
              </label>
              {phoneSaved && (
                <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                  Verified
                </span>
              )}
            </div>
            <input
              type="tel"
              required
              placeholder="+919876543210"
              value={phone}
              onChange={(e) => {
                setPhone(e.target.value);
                setPhoneSaved(e.target.value === user?.phone);
              }}
              className="w-full rounded-lg border border-slate-300 bg-white py-2 px-3 text-xs font-medium focus:border-emerald-500 focus:outline-none"
            />
            <p className="mt-1 text-[10px] text-slate-500">
              Required for caterer confirmation, dispatch alerts, and digital invoice.
            </p>
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600">Venue Address ({caterer.city})</label>
            <input
              type="text"
              required
              placeholder={`e.g. Banquet Hall / Event Venue, Landmark, ${caterer.city}`}
              value={venueAddress}
              onChange={(e) => setVenueAddress(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 py-2 px-3 text-xs focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold uppercase text-slate-600">
              Special Requests / Dietary Notes (Optional)
            </label>
            <textarea
              rows={2}
              placeholder="e.g. Traditional plantain leaf service, specific buffet setup timing, extra ghee..."
              value={specialRequests}
              onChange={(e) => setSpecialRequests(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 py-2 px-3 text-xs focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Pricing summary */}
          <div className="rounded-xl bg-emerald-50/70 p-3.5 border border-emerald-100 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-emerald-800 font-medium block">Estimated Amount</span>
              <span className="text-[10px] text-emerald-600">
                {guestCount} guests × {formatPaiseToINR(effectivePricePerPlate)}
              </span>
            </div>
            <div className="text-right">
              <span className="text-base font-extrabold text-emerald-950 block">
                {formatPaiseToINR(estimatedTotalPaise)}
              </span>
              <span className="text-[10px] text-emerald-700">25% Advance: {formatPaiseToINR(Math.round(estimatedTotalPaise * 0.25))}</span>
            </div>
          </div>

          <p className="text-[11px] text-slate-500">
            Payment will only be requested after the caterer reviews and accepts your booking within 48 hours.
          </p>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 transition shadow-xs"
            >
              {submitting ? 'Sending Request...' : 'Confirm & Request Booking'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
