import React, { useState } from 'react';
import { X, AlertCircle, Phone, CheckCircle2 } from 'lucide-react';
import { formatPaiseToINR } from '@/lib/formatters';
import { createBookingRequest } from '../api';
import { updatePhoneApi } from '../../auth/api';
import { useAuth } from '@/lib/auth/AuthContext';
import type { Caterer, Package, Booking } from '@/types/database';

interface Props {
  caterer: Caterer;
  packageItem: Package;
  customerId: string;
  onClose: () => void;
  onSuccess: (booking: Booking) => void;
}

export const BookingRequestModal: React.FC<Props> = ({
  caterer,
  packageItem,
  customerId: _customerId,
  onClose,
  onSuccess,
}) => {
  const { user, updateUser } = useAuth();

  // Tomorrow's date as min
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const minDateStr = tomorrow.toISOString().split('T')[0];

  const [eventDate, setEventDate] = useState(minDateStr);
  const [eventTime, setEventTime] = useState('12:30');
  const [guestCount, setGuestCount] = useState<number>(packageItem.min_guests || 50);
  const [venueAddress, setVenueAddress] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Phone number state for users without a registered mobile number
  const [phone, setPhone] = useState(user?.phone || '+91');
  const [phoneSaved, setPhoneSaved] = useState(Boolean(user?.phone));

  const estimatedTotalPaise = guestCount * packageItem.price_per_plate;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const effectiveMinGuests = Math.max(packageItem.min_guests || 10, caterer.min_guests || 25);
    const effectiveMaxGuests = caterer.max_guests || packageItem.max_guests;

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
      const res = await createBookingRequest({
        catererId: caterer.id,
        packageId: packageItem.id,
        eventDate,
        eventTime: eventTime.length === 5 ? `${eventTime}:00` : eventTime,
        guestCount,
        venueAddress: venueAddress.trim(),
        city: caterer.city || 'Tirupati',
        state: caterer.state || 'Andhra Pradesh',
        pincode: caterer.pincode || null,
        specialRequests: specialRequests.trim() || null,
      });

      onSuccess(res.booking);
    } catch (err: any) {
      setError(err.message || 'Failed to submit booking request. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs">
      <div className="relative w-full max-w-lg rounded-xl bg-white p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <button onClick={onClose} className="absolute right-4 top-4 text-slate-400 hover:text-slate-600">
          <X className="h-5 w-5" />
        </button>

        <div>
          <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-bold text-emerald-800">
            Send Booking Request
          </span>
          <h2 className="mt-1 text-lg font-bold text-slate-900">{packageItem.name}</h2>
          <p className="text-xs text-slate-500">
            By <b>{caterer.business_name}</b> • {formatPaiseToINR(packageItem.price_per_plate)} / plate
          </p>
        </div>

        {error && (
          <div className="mt-4 flex items-center gap-2 rounded-lg bg-red-50 p-3 text-xs text-red-700">
            <AlertCircle className="h-4 w-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600">Event Date</label>
              <div className="relative mt-1">
                <input
                  type="date"
                  required
                  min={minDateStr}
                  value={eventDate}
                  onChange={(e) => setEventDate(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 py-2 px-3 text-xs focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold uppercase text-slate-600">Event Time</label>
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
              <label className="block text-xs font-semibold uppercase text-slate-600">Guest Count</label>
              <span className="text-[10px] text-slate-400">
                Min: {Math.max(packageItem.min_guests || 10, caterer.min_guests || 25)} guests
              </span>
            </div>
            <input
              type="number"
              required
              min={Math.max(packageItem.min_guests || 10, caterer.min_guests || 25)}
              max={caterer.max_guests || packageItem.max_guests || undefined}
              value={guestCount}
              onChange={(e) => setGuestCount(Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-300 py-2 px-3 text-xs focus:border-emerald-500 focus:outline-none font-semibold"
            />
          </div>

          {/* Contact Mobile Phone Number (Verification Field for Order Alerts & SMS) */}
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
              Required for receiving caterer acceptance updates, payment links, and booking confirmations.
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
              placeholder="e.g. No onion/garlic in prasadam, extra ghee for pappu, live counter setup time..."
              value={specialRequests}
              onChange={(e) => setSpecialRequests(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-300 py-2 px-3 text-xs focus:border-emerald-500 focus:outline-none"
            />
          </div>

          {/* Pricing summary */}
          <div className="rounded-lg bg-emerald-50/70 p-3 border border-emerald-100 flex items-center justify-between">
            <div>
              <span className="text-[11px] text-emerald-800 font-medium block">Estimated Amount</span>
              <span className="text-[10px] text-emerald-600">
                {guestCount} guests × {formatPaiseToINR(packageItem.price_per_plate)}
              </span>
            </div>
            <span className="text-base font-extrabold text-emerald-950">
              {formatPaiseToINR(estimatedTotalPaise)}
            </span>
          </div>

          <p className="text-[11px] text-slate-500">
            Payment will only be requested after the caterer accepts your booking. The caterer has 48 hours to respond.
          </p>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {submitting ? 'Sending Request...' : 'Confirm & Request Booking'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
