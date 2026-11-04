import { supabase } from '@/lib/supabase';
import type { Caterer, Package, PackageItem, Booking } from '@/types/database';

export async function fetchApprovedCaterers(filters?: {
  cuisine?: string;
  maxPricePaise?: number;
}): Promise<(Caterer & { packages: Package[] })[]> {
  let query = supabase
    .from('caterers')
    .select('*, packages(*)')
    .eq('status', 'approved');

  if (filters?.cuisine && filters.cuisine !== 'all') {
    query = query.contains('cuisines', [filters.cuisine]);
  }

  const { data, error } = await query;
  if (error) {
    console.error('Error fetching approved caterers:', error);
    return [];
  }
  return (data || []) as (Caterer & { packages: Package[] })[];
}

export async function fetchCatererProfileWithPackages(
  catererId: string
): Promise<{ caterer: Caterer; packages: (Package & { items: PackageItem[] })[] } | null> {
  const { data: caterer, error: catError } = await supabase
    .from('caterers')
    .select('*')
    .eq('id', catererId)
    .single();

  if (catError || !caterer) {
    console.error('Error fetching caterer:', catError);
    return null;
  }

  const { data: packages, error: pkgError } = await supabase
    .from('packages')
    .select('*, items:package_items(*)')
    .eq('caterer_id', catererId)
    .eq('is_active', true);

  if (pkgError) {
    console.error('Error fetching packages:', pkgError);
    return { caterer, packages: [] };
  }

  return { caterer, packages: packages as (Package & { items: PackageItem[] })[] };
}

export async function createBookingRequest(payload: {
  customer_id: string;
  caterer_id: string;
  package_id: string;
  event_date: string;
  event_time: string;
  guest_count: number;
  venue_address: string;
  city: string;
  special_requests?: string;
}): Promise<Booking | null> {
  const { data, error } = await supabase
    .from('bookings')
    .insert([
      {
        ...payload,
        status: 'requested',
      },
    ])
    .select()
    .single();

  if (error) {
    console.error('Error creating booking request:', error);
    return null;
  }
  return data as Booking;
}

export async function fetchCustomerBookings(
  customerId: string
): Promise<(Booking & { caterer?: Caterer; package?: Package })[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*, caterer:caterers(*), package:packages(*)')
    .eq('customer_id', customerId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching customer bookings:', error);
    return [];
  }
  return (data || []) as (Booking & { caterer?: Caterer; package?: Package })[];
}

export async function fetchCatererIncomingBookings(
  catererId: string
): Promise<(Booking & { package?: Package })[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select('*, package:packages(*)')
    .eq('caterer_id', catererId)
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching caterer bookings:', error);
    return [];
  }
  return (data || []) as (Booking & { package?: Package })[];
}

// RPC state machine triggers
export async function acceptBookingRPC(bookingId: string, note?: string): Promise<Booking | null> {
  const { data, error } = await supabase.rpc('accept_booking', {
    p_booking_id: bookingId,
    p_note: note || null,
  });

  if (error) {
    console.error('Error accepting booking:', error);
    return null;
  }
  return data as Booking;
}

export async function rejectBookingRPC(bookingId: string, note?: string): Promise<Booking | null> {
  const { data, error } = await supabase.rpc('reject_booking', {
    p_booking_id: bookingId,
    p_note: note || null,
  });

  if (error) {
    console.error('Error rejecting booking:', error);
    return null;
  }
  return data as Booking;
}

export async function cancelBookingRPC(bookingId: string, reason: string): Promise<Booking | null> {
  const { data, error } = await supabase.rpc('cancel_booking', {
    p_booking_id: bookingId,
    p_reason: reason,
  });

  if (error) {
    console.error('Error cancelling booking:', error);
    return null;
  }
  return data as Booking;
}
