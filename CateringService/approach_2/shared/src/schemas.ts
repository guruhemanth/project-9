import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  fullName: z.string().min(2, 'Full name is required'),
  phone: z.string().regex(/^\+91[6-9]\d{9}$/, 'Must be a valid +91 Indian mobile number'),
  role: z.enum(['customer', 'caterer']),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
});

export const catererOnboardingSchema = z.object({
  businessName: z.string().min(3, 'Business name must be at least 3 characters'),
  description: z.string().optional(),
  state: z.string().min(2, 'State / Union Territory is required').default('Andhra Pradesh'),
  city: z.string().min(2, 'City is required').default('Tirupati'),
  pincode: z.string().regex(/^[1-9][0-9]{5}$/, 'Pincode must be a 6-digit Indian PIN code').optional().nullable(),
  address: z.string().optional().nullable(),
  serviceAreas: z.array(z.string()).min(1, 'Add at least one service locality or district'),
  cuisines: z.array(z.string()).min(1, 'Select at least one cuisine'),
  fssaiNumber: z.string().regex(/^\d{14}$/, 'FSSAI license must be exactly 14 numeric digits'),
  gstNumber: z.string().regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GST format').optional().nullable(),
});

export const packageSchema = z.object({
  name: z.string().min(2, 'Package name is required'),
  description: z.string().optional(),
  pricePerPlatePaise: z.number().int().positive('Price per plate must be positive integer paise'),
  minGuests: z.number().int().min(10, 'Minimum 10 guests required'),
  maxGuests: z.number().int().positive().optional().nullable(),
  isVeg: z.boolean().default(false),
  items: z.array(
    z.object({
      name: z.string().min(1, 'Item name is required'),
      category: z.enum(['starter', 'main', 'dessert', 'beverage']),
    })
  ).default([]),
});

export const bookingRequestSchema = z.object({
  catererId: z.string().uuid(),
  packageId: z.string().uuid().optional().nullable(),
  customComboName: z.string().optional().nullable(),
  customizedItems: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        pricePaise: z.number().int().nonnegative().optional(),
        category: z.string().optional(),
        isVeg: z.boolean().optional(),
      })
    )
    .optional()
    .nullable(),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  eventTime: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, 'Time must be HH:MM or HH:MM:SS'),
  guestCount: z.number().int().positive(),
  venueAddress: z.string().min(5, 'Detailed venue address is required'),
  city: z.string().default('Tirupati'),
  state: z.string().default('Andhra Pradesh'),
  pincode: z.string().regex(/^[1-9][0-9]{5}$/, 'Pincode must be a 6-digit Indian PIN code').optional().nullable(),
  specialRequests: z.string().optional().nullable(),
});

export const createOrderSchema = z.object({
  bookingId: z.string().uuid(),
  paymentOption: z.enum(['full', 'advance']),
  advancePct: z.number().min(10).max(100).default(25),
});

export const reviewSchema = z.object({
  bookingId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional().nullable(),
});

export const blackoutDateSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
  reason: z.string().max(255).optional().default('Unavailable'),
});

export const disburseSettlementSchema = z.object({
  utrReference: z.string().min(5, 'UTR reference or transaction ID is required'),
});

export const notificationDispatchSchema = z.object({
  bookingId: z.string().uuid(),
  recipientPhone: z.string().regex(/^\+91[6-9]\d{9}$/, 'Must be a valid +91 Indian mobile number'),
  recipientRole: z.enum(['customer', 'caterer', 'admin']),
  channel: z.enum(['whatsapp', 'sms']),
  templateType: z.enum(['booking_requested', 'booking_accepted', 'payment_captured', 'booking_cancelled']),
  params: z.record(z.string(), z.any()),
});

export const sendMessageSchema = z.object({
  message: z.string().trim().min(1, 'Message cannot be empty').max(2000, 'Message cannot exceed 2000 characters'),
});
