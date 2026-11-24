import React, { useEffect, useState } from 'react';
import { CatererOrderSettings } from './components/CatererOrderSettings';
import { apiFetch } from '@/lib/api-client';
import type { Caterer } from '@/types/database';

export const CatererPoliciesPage: React.FC = () => {
  const [caterer, setCaterer] = useState<Caterer | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchCaterer = async () => {
    try {
      const data = await apiFetch<any>('/api/caterers/me');
      setCaterer(data.caterer || data);
    } catch (err) {
      console.error('Failed to load caterer profile for policies', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCaterer();
  }, []);

  if (loading) {
    return <div className="p-8 text-center text-xs text-slate-500">Loading order policies...</div>;
  }

  if (!caterer) {
    return <div className="p-8 text-center text-xs text-slate-500">No caterer profile found.</div>;
  }

  return (
    <div className="max-w-4xl mx-auto py-6">
      <h1 className="text-2xl font-bold text-slate-900 mb-6">Caterer Order &amp; Cancellation Policies</h1>
      <CatererOrderSettings
        catererId={caterer.id}
        initialMinGuests={caterer.min_guests}
        initialMaxGuests={caterer.max_guests}
        initialLeadDays={caterer.lead_time_days}
        initialAllowsCustomCombo={caterer.allows_custom_combo}
        initialInstantBookingEnabled={caterer.instant_booking_enabled}
        onUpdate={fetchCaterer}
      />
    </div>
  );
};
