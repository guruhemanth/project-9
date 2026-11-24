import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  fullName: z.string().min(2, 'Full name is required'),
  phone: z.string().regex(/^\+91[6-9]\d{9}$/, 'Must be a valid +91 Indian mobile number'),
  role: z.enum(['customer', 'caterer']),
  dpdpConsent: z.boolean().optional(),
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
  bankAccountHolderName: z.string().min(2).max(100).optional().nullable(),
  bankAccountNumber: z.string().regex(/^\d{9,18}$/, 'Bank account number must be between 9 and 18 digits').optional().nullable(),
  bankIfsc: z.string().regex(/^[a-zA-Z]{4}0[a-zA-Z0-9]{6}$/, 'Invalid IFSC code format (e.g. SBIN0001234)').optional().nullable(),
  bankName: z.string().min(2).max(100).optional().nullable(),
  upiId: z.string().regex(/^[\w.-]+@[\w.-]+$/, 'Invalid UPI VPA format (e.g. user@bank)').optional().nullable(),
});

export const catererBankDetailsSchema = z.object({
  bankAccountHolderName: z.string().min(2, 'Account holder name must be at least 2 characters').max(100),
  bankAccountNumber: z.string().regex(/^\d{9,18}$/, 'Bank account number must be between 9 and 18 digits'),
  bankIfsc: z.string().regex(/^[a-zA-Z]{4}0[a-zA-Z0-9]{6}$/, 'Invalid IFSC code format (e.g. SBIN0001234)'),
  bankName: z.string().min(2, 'Bank name is required').max(100).optional().nullable(),
  upiId: z.string().regex(/^[\w.-]+@[\w.-]+$/, 'Invalid UPI VPA format (e.g. caterer@bank)').optional().nullable(),
  bankChequeUrl: z.string().optional().nullable(),
});

export const packageSchema = z.object({
  name: z.string().min(2, 'Package name is required'),
  description: z.string().optional(),
  pricePerPlatePaise: z.number().int().positive('Price per plate must be positive integer paise'),
  minGuests: z.number().int().min(10, 'Minimum 10 guests required'),
  maxGuests: z.number().int().positive().optional().nullable(),
  isVeg: z.boolean().default(false),
  imageUrl: z.string().optional().nullable(),
  items: z.array(
    z.object({
      name: z.string().min(1, 'Item name is required'),
      category: z.enum(['starter', 'main', 'dessert', 'beverage']),
      imageUrl: z.string().optional().nullable(),
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
  paymentOption: z.enum(['full', 'advance', 'split']),
  advancePct: z.number().min(10).max(100).default(25).optional(),
  trancheAmountPaise: z.number().int().positive().optional(),
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

// ==========================================
// 1. Caterer Status & Documents Schemas (P1-8, P1-9, P1-14)
// ==========================================

export const catererStatusSchema = z.enum([
  'pending',
  'approved',
  'rejected',
  'needs_correction',
  'under_review',
  'suspended',
]);

export const updateCatererStatusSchema = z.object({
  status: catererStatusSchema,
  rejectionReason: z.string().optional().nullable(),
  correctionNotes: z.string().optional().nullable(),
});

export const catererDocumentTypeSchema = z.enum([
  'fssai_certificate',
  'id_proof',
  'photo',
  'gst_certificate',
  'menu_card',
]);

export const catererDocumentStatusSchema = z.enum([
  'pending',
  'verified',
  'rejected',
  'needs_correction',
  'expired',
  'uploaded',
]);

export const uploadDocumentSchema = z.object({
  documentType: catererDocumentTypeSchema,
  filePath: z.string().min(1, 'File path or storage key is required'),
  expiresAt: z.string().datetime().optional().nullable(),
});

// ==========================================
// 2. Dispute Schemas (P1-12)
// ==========================================

export const disputeCategorySchema = z.enum([
  'food_quality',
  'tardiness',
  'hygiene',
  'service_shortage',
  'other',
]);

export const disputeStatusSchema = z.enum([
  'open',
  'under_review',
  'under_investigation',
  'resolved',
  'dismissed',
]);

export const disputeResolutionSchema = z.enum([
  'refund_customer',
  'dismiss',
  'split_adjustment',
  'caterer_penalized',
  'other',
]);

export const createDisputeSchema = z.object({
  category: disputeCategorySchema,
  description: z.string().trim().min(10, 'Description must be at least 10 characters').max(3000),
  evidenceUrls: z.array(z.string().url('Invalid evidence URL')).default([]),
  refundRequestedPaise: z.number().int().nonnegative().optional(),
});

export const fileDisputeSchema = createDisputeSchema;

export const resolveDisputeSchema = z.object({
  resolution: disputeResolutionSchema,
  resolutionNotes: z.string().trim().min(5, 'Resolution notes are required').max(2000),
  refundAmountPaise: z.number().int().nonnegative().optional(),
  refundPaise: z.number().int().nonnegative().optional(),
});

// ==========================================
// 3. Tax & Invoice Schemas (P1-6)
// ==========================================

export const invoiceTypeSchema = z.enum([
  'commission',
  'customer_receipt',
  'caterer_settlement',
  'platform_commission',
  'customer_booking',
  'commission_invoice',
  'customer_invoice',
  'platform_fee',
]);

export const invoiceStatusSchema = z.enum([
  'draft',
  'issued',
  'void',
  'paid',
  'cancelled',
  'refunded',
]);

export const taxTypeSchema = z.enum([
  'tds_194o',
  'tcs_section_52',
  'tcs_52',
  'tcs_gst_sec52',
  'gst_commission',
  'gst_catering',
  'gst_input',
  'gst',
]);

export const taxEntityTypeSchema = z.enum([
  'caterer',
  'platform',
  'customer',
  'booking',
  'settlement',
]);

export const taxLedgerStatusSchema = z.enum([
  'accrued',
  'deposited',
  'filed',
  'waived',
  'remitted',
  'reversed',
  'recorded',
  'reconciled',
]);

export const invoiceLineItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().int().positive().optional(),
  unitPricePaise: z.number().int().nonnegative().optional(),
  amountPaise: z.number().int().nonnegative().optional(),
  sacCode: z.string().regex(/^\d{4,8}$/, 'Valid SAC/HSN code required').optional(),
  taxableAmountPaise: z.number().int().nonnegative().optional(),
  cgstRateBasisPoints: z.number().int().nonnegative().default(0),
  cgstPaise: z.number().int().nonnegative().default(0),
  sgstRateBasisPoints: z.number().int().nonnegative().default(0),
  sgstPaise: z.number().int().nonnegative().default(0),
  igstRateBasisPoints: z.number().int().nonnegative().default(0),
  igstPaise: z.number().int().nonnegative().default(0),
  totalPaise: z.number().int().positive().optional(),
});

export const createInvoiceSchema = z.object({
  bookingId: z.string().uuid(),
  catererId: z.string().uuid(),
  customerId: z.string().uuid(),
  invoiceNumber: z.string().min(3),
  invoiceType: invoiceTypeSchema,
  totalAmountPaise: z.number().int().nonnegative(),
  taxableAmountPaise: z.number().int().nonnegative(),
  cgstPaise: z.number().int().nonnegative().default(0),
  sgstPaise: z.number().int().nonnegative().default(0),
  igstPaise: z.number().int().nonnegative().default(0),
  sacCode: z.string().default('998311'),
  status: invoiceStatusSchema.default('issued'),
  lineItems: z.array(invoiceLineItemSchema).optional(),
});

export const createTaxLedgerRecordSchema = z.object({
  entityType: taxEntityTypeSchema,
  entityId: z.string(),
  taxType: taxTypeSchema,
  rateBasisPoints: z.number().int().nonnegative(),
  taxableAmountPaise: z.number().int().nonnegative(),
  taxAmountPaise: z.number().int().nonnegative(),
  financialYear: z.string(),
  quarter: z.enum(['Q1', 'Q2', 'Q3', 'Q4']),
  status: taxLedgerStatusSchema.default('accrued'),
});

// ==========================================
// 4. Reconciliation Schemas (P1-1)
// ==========================================

export const reconciliationStatusSchema = z.enum([
  'pending',
  'running',
  'in_progress',
  'completed',
  'failed',
  'reconciled',
]);

export const discrepancyTypeSchema = z.enum([
  'amount_mismatch',
  'status_mismatch',
  'missing_in_db',
  'missing_in_razorpay',
  'missing_in_gateway',
  'refund_mismatch',
  'other',
]);

export const discrepancyStatusSchema = z.enum([
  'open',
  'detected',
  'resolved',
  'manually_resolved',
  'auto_healed',
  'ignored',
]);

export const reconciliationRunSchema = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  autoHeal: z.boolean().default(true),
});

export const triggerReconciliationSchema = reconciliationRunSchema;

export const resolveDiscrepancySchema = z.object({
  status: z.enum(['open', 'resolved', 'manually_resolved', 'auto_healed', 'ignored']),
  resolutionNotes: z.string().trim().min(5, 'Resolution notes are required').max(2000),
});

// ==========================================
// 5. Settlement & Payout Retry Schemas (P1-2)
// ==========================================

export const retrySettlementSchema = z.object({
  settlementId: z.string().uuid(),
  force: z.boolean().default(false),
});

export const retryPayoutSchema = retrySettlementSchema;

// ==========================================
// 6. Error Monitoring & Alert Webhook Schemas (P1-15)
// ==========================================

export const alertSeveritySchema = z.enum(['info', 'warn', 'error', 'critical']);

export const alertTypeSchema = z.enum([
  'payment_failure',
  'payout_failure',
  'reconciliation_discrepancy',
  'webhook_signature_failure',
  'dead_letter_event',
  'system_error',
]);

export const alertWebhookPayloadSchema = z.object({
  alertId: z.string().uuid(),
  service: z.string().min(1),
  alertType: alertTypeSchema,
  severity: alertSeveritySchema,
  message: z.string().min(1),
  timestamp: z.string(),
  environment: z.string().default('development'),
  context: z.record(z.string(), z.unknown()).optional(),
  error: z
    .object({
      name: z.string(),
      message: z.string(),
      stack: z.string().optional(),
    })
    .optional(),
});

// ==========================================
// 7. Real-Time WebSocket Schemas (R2)
// ==========================================

export const realtimeEventNameSchema = z.enum([
  'booking_requested',
  'booking_accepted',
  'booking_rejected',
  'payment_in_progress',
  'booking_paid',
  'booking_cancelled',
  'dispute_filed',
  'settlement_updated',
]);

export const realtimeEventEnvelopeSchema = z.object({
  event: realtimeEventNameSchema,
  timestamp: z.string(),
  payload: z.record(z.string(), z.unknown()),
});
