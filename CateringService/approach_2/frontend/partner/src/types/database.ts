export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole = 'customer' | 'caterer' | 'admin';
export type CatererStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
export type BookingStatus =
  | 'requested'
  | 'accepted'
  | 'rejected'
  | 'paid'
  | 'completed'
  | 'cancelled'
  | 'expired';
export type PaymentStatus =
  | 'created'
  | 'captured'
  | 'failed'
  | 'refunded'
  | 'partially_refunded';

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string | null;
  phone: string | null;
  created_at: string;
}

export interface Caterer {
  id: string;
  owner_id: string;
  business_name: string;
  description: string | null;
  city: string;
  state?: string;
  pincode?: string | null;
  address?: string | null;
  service_areas: string[];
  cuisines: string[];
  fssai_number: string;
  gst_number: string | null;
  status: CatererStatus;
  rejection_reason: string | null;
  avg_rating: number;
  review_count: number;
  min_guests?: number;
  max_guests?: number;
  lead_time_days?: number;
  allows_custom_combo?: boolean;
  created_at: string;
  updated_at: string;
}

export type MenuItemCategory =
  | 'welcome_drink'
  | 'starter'
  | 'main'
  | 'bread_rice'
  | 'dessert'
  | 'beverage'
  | 'accompaniment';

export interface MenuItem {
  id: string;
  caterer_id: string;
  name: string;
  category: MenuItemCategory;
  price_paise: number;
  is_veg: boolean;
  description: string | null;
  is_available: boolean;
  created_at: string;
  updated_at: string;
}

export interface CatererDocument {
  id: string;
  caterer_id: string;
  doc_type: 'fssai_certificate' | 'id_proof' | 'photo';
  storage_path: string;
  created_at: string;
}

export interface Package {
  id: string;
  caterer_id: string;
  name: string;
  description: string | null;
  price_per_plate: number; // in paise
  min_guests: number;
  max_guests: number | null;
  is_veg: boolean;
  is_active: boolean;
  created_at: string;
}

export interface PackageItem {
  id: string;
  package_id: string;
  name: string;
  category: 'starter' | 'main' | 'dessert' | 'beverage';
}

export interface Addon {
  id: string;
  caterer_id: string;
  name: string;
  price: number; // in paise
  pricing_unit: 'flat' | 'per_plate';
}

export interface Booking {
  id: string;
  customer_id: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  package_name?: string;
  caterer_id: string;
  package_id: string;
  event_date: string; // YYYY-MM-DD
  event_time: string; // HH:MM:SS
  guest_count: number;
  venue_address: string;
  city: string;
  special_requests: string | null;
  status: BookingStatus;
  total_amount: number | null; // in paise
  commission_pct: number | null;
  commission_amount: number | null; // in paise
  payment_type?: 'full' | 'advance';
  advance_pct?: number;
  amount_paid?: number; // in paise
  balance_due?: number; // in paise
  caterer_note: string | null;
  cancelled_by: UserRole | null;
  cancel_reason: string | null;
  refund_amount: number; // in paise
  created_at: string;
  updated_at: string;
}

export interface BookingAddon {
  id: string;
  booking_id: string;
  addon_id: string;
  quantity: number;
  price_at_booking: number; // in paise
}

export interface BookingStatusHistory {
  id: string;
  booking_id: string;
  from_status: BookingStatus | null;
  to_status: BookingStatus;
  changed_by: string | null;
  note: string | null;
  created_at: string;
}

export interface Payment {
  id: string;
  booking_id: string;
  razorpay_order_id: string;
  razorpay_payment_id: string | null;
  amount: number; // in paise
  currency: string;
  status: PaymentStatus;
  payment_type?: 'full' | 'advance';
  raw_event: Json | null;
  created_at: string;
  updated_at: string;
}

export interface Review {
  id: string;
  booking_id: string;
  customer_id: string;
  customer_name?: string | null;
  customer_phone?: string | null;
  customer_email?: string | null;
  package_name?: string;
  caterer_id: string;
  rating: number; // 1 to 5
  comment: string | null;
  created_at: string;
}

export interface PlatformSettings {
  id: number;
  commission_pct: number;
  updated_at: string;
}
