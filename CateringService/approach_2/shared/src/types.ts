export type UserRole = 'customer' | 'caterer' | 'admin';
export type CatererStatus =
  | 'pending'
  | 'approved'
  | 'rejected'
  | 'needs_correction'
  | 'under_review'
  | 'suspended';
export type BookingMode = 'instant' | 'on_request';
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
export type PaymentOption = 'full' | 'advance' | 'split';

export interface UserProfile {
  id: string;
  role: UserRole;
  fullName: string | null;
  phone: string | null;
  createdAt: string;
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
  catererId: string;
  name: string;
  category: MenuItemCategory;
  pricePaise: number;
  isVeg: boolean;
  description: string | null;
  isAvailable: boolean;
  imageUrl?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Caterer {
  id: string;
  ownerId: string;
  businessName: string;
  description: string | null;
  city: string;
  serviceAreas: string[];
  cuisines: string[];
  fssaiNumber: string;
  gstNumber: string | null;
  status: CatererStatus;
  rejectionReason: string | null;
  correctionNotes?: string | null;
  avgRating: number;
  reviewCount: number;
  minGuests?: number;
  maxGuests?: number;
  leadTimeDays?: number;
  allowsCustomCombo?: boolean;
  instantBookingEnabled?: boolean;
  bankAccountHolderName?: string | null;
  bankAccountNumber?: string | null;
  bankIfsc?: string | null;
  bankName?: string | null;
  upiId?: string | null;
  bankChequeUrl?: string | null;
  bankVerified?: boolean;
  bankUpdatedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CatererBankDetails {
  bankAccountHolderName?: string | null;
  bankAccountNumber?: string | null;
  bankIfsc?: string | null;
  bankName?: string | null;
  upiId?: string | null;
  bankChequeUrl?: string | null;
  bankVerified?: boolean;
  bankUpdatedAt?: string | null;
}

export interface PackageItem {
  id: string;
  packageId: string;
  name: string;
  category: 'starter' | 'main' | 'dessert' | 'beverage';
}

export interface CatererAvailability {
  id: string;
  catererId: string;
  unavailableDate: string; // YYYY-MM-DD
  reason: string | null;
  autoLocked: boolean;
  bookingId: string | null;
  createdAt: string;
}

export type NotificationChannel = 'whatsapp' | 'sms';
export type NotificationTemplate =
  | 'booking_requested'
  | 'booking_accepted'
  | 'payment_captured'
  | 'booking_cancelled';

export interface NotificationLog {
  id: string;
  bookingId: string;
  recipientPhone: string;
  recipientRole: UserRole;
  channel: NotificationChannel;
  templateType: NotificationTemplate;
  content: string;
  status: 'queued' | 'sent' | 'failed';
  providerMessageId: string | null;
  createdAt: string;
}

export interface ChatThread {
  id: string;
  bookingId: string;
  customerId: string;
  catererId: string;
  lastMessageAt: string;
  createdAt: string;
}

export interface ChatMessage {
  id: string;
  threadId: string;
  senderId: string;
  senderRole: UserRole;
  message: string;
  isRead: boolean;
  createdAt: string;
}

export type SettlementStatus = 'pending' | 'processing' | 'settled' | 'held' | 'failed';

export interface CatererSettlement {
  id: string;
  bookingId: string;
  catererId: string;
  grossAmountPaise: number;
  commissionPct: number;
  commissionAmountPaise: number;
  netPayoutPaise: number;
  status: SettlementStatus;
  utrReference: string | null;
  settledAt: string | null;
  payoutId?: string | null;
  payoutStatus?: 'pending' | 'queued' | 'processing' | 'processed' | 'reversed' | 'cancelled' | 'rejected' | 'failed' | null;
  payoutMode?: 'NEFT' | 'RTGS' | 'IMPS' | 'UPI' | 'manual_utr' | 'razorpayx' | null;
  retryCount?: number;
  nextRetryAt?: string | null;
  lastError?: string | null;
  createdAt: string;
  updatedAt: string;
  catererBusinessName?: string;
  bankAccountHolderName?: string | null;
  bankAccountNumber?: string | null;
  bankIfsc?: string | null;
  bankName?: string | null;
  upiId?: string | null;
  bankVerified?: boolean;
  eventDate?: string | null;
  guestCount?: number | null;
  bookingStatus?: string | null;
}

export interface Package {
  id: string;
  catererId: string;
  name: string;
  description: string | null;
  pricePerPlatePaise: number;
  minGuests: number;
  maxGuests: number | null;
  isVeg: boolean;
  isActive: boolean;
  createdAt: string;
  items?: PackageItem[];
}

export interface Booking {
  id: string;
  customerId: string;
  catererId: string;
  packageId: string;
  eventDate: string;
  eventTime: string;
  guestCount: number;
  venueAddress: string;
  city: string;
  specialRequests: string | null;
  status: BookingStatus;
  bookingMode?: BookingMode;
  paymentDeadline?: string | null;
  refundId?: string | null;
  refundedAt?: string | null;
  totalAmountPaise: number | null;
  commissionPct: number | null;
  commissionAmountPaise: number | null;
  paymentType: PaymentOption | null;
  advancePct: number | null;
  amountPaidPaise: number;
  balanceDuePaise: number;
  catererNote: string | null;
  cancelledBy: UserRole | null;
  cancelReason: string | null;
  refundAmountPaise: number;
  rebookedFromBookingId?: string | null;
  catererPenaltyPaise?: number;
  createdAt: string;
  updatedAt: string;
}

export interface PaymentRecord {
  id: string;
  bookingId: string;
  razorpayOrderId: string;
  razorpayPaymentId: string | null;
  amountPaise: number;
  currency: string;
  status: PaymentStatus;
  paymentType: PaymentOption;
  createdAt: string;
}

export interface Review {
  id: string;
  bookingId: string;
  customerId: string;
  catererId: string;
  rating: number; // 1 to 5
  comment: string | null;
  createdAt: string;
}

export interface PlatformAnalytics {
  totalGMVPaise: number;
  totalCommissionPaise: number;
  totalDisbursedPaise: number;
  pendingPayoutsPaise: number;
  totalBookingsCount: number;
  paidBookingsCount: number;
  pendingSettlementCount: number;
  settledCount: number;
  totalCaterersCount: number;
  approvedCaterersCount: number;
  pendingCaterersCount: number;
}

export interface AdminCaterer extends Caterer {
  ownerName?: string;
  ownerPhone?: string;
  ownerEmail?: string;
}

// System Ops & Node Monitoring Contracts
export type NodeHealthStatus = 'healthy' | 'degraded' | 'down';

export interface ServiceNodeMetric {
  id: string;
  name: string;
  serviceKey: string;
  url: string;
  port: number;
  status: NodeHealthStatus;
  latencyMs: number;
  httpStatus?: number;
  uptimeSeconds?: number;
  lastChecked: string;
  error?: string;
  details?: Record<string, any>;
}

export interface HostServerMetrics {
  totalMemBytes: number;
  freeMemBytes: number;
  usedMemPct: number;
  loadAvg: [number, number, number];
  uptimeSeconds: number;
  cpuCount: number;
  platform: string;
  arch: string;
  nodeVersion: string;
}

export interface ContainerInfo {
  id: string;
  name: string;
  image: string;
  state: string;
  status: string;
  created: number;
  ports?: string;
}

export interface OpsNodesResponse {
  timestamp: string;
  host: HostServerMetrics;
  nodes: ServiceNodeMetric[];
  summary: {
    totalNodes: number;
    healthyCount: number;
    degradedCount: number;
    downCount: number;
    avgLatencyMs: number;
  };
}

export interface OpsLogsResponse {
  container: string;
  lines: string[];
  tail: number;
  timestamp: string;
  source: 'docker-engine' | 'simulated';
}

// ==========================================
// Caterer Documents & FSSAI Verification (P1-9, P1-14)
// ==========================================
export type CatererDocumentType =
  | 'fssai_certificate'
  | 'id_proof'
  | 'photo'
  | 'gst_certificate'
  | 'menu_card'
  | string;

export type CatererDocumentStatus =
  | 'pending'
  | 'verified'
  | 'rejected'
  | 'needs_correction'
  | 'expired'
  | 'uploaded';

export interface CatererDocument {
  id: string;
  catererId: string;
  documentType: CatererDocumentType;
  filePath: string;
  status: CatererDocumentStatus;
  verificationNotes?: string | null;
  expiresAt?: string | null;
  signedToken?: string | null;
  signedTokenExpiresAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// Disputes & Complaint Flow (P1-12)
// ==========================================
export type DisputeCategory =
  | 'food_quality'
  | 'tardiness'
  | 'hygiene'
  | 'service_shortage'
  | 'other';

export type DisputeStatus =
  | 'open'
  | 'under_review'
  | 'under_investigation'
  | 'resolved'
  | 'dismissed';

export type DisputeResolution =
  | 'refund_customer'
  | 'dismiss'
  | 'split_adjustment'
  | 'caterer_penalized'
  | 'other';

export interface Dispute {
  id: string;
  bookingId: string;
  customerId: string;
  catererId: string;
  category: DisputeCategory;
  description: string;
  evidenceUrls: string[];
  status: DisputeStatus;
  resolution?: DisputeResolution | null;
  resolutionNotes?: string | null;
  refundAmountPaise?: number | null;
  settlementHoldId?: string | null;
  resolvedBy?: string | null;
  resolvedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

// ==========================================
// Invoices & Tax Ledger (P1-6)
// ==========================================
export type InvoiceType =
  | 'commission'
  | 'customer_receipt'
  | 'caterer_settlement'
  | 'platform_commission'
  | 'customer_booking'
  | 'commission_invoice'
  | 'customer_invoice'
  | 'platform_fee';

export type InvoiceStatus = 'draft' | 'issued' | 'void' | 'paid' | 'cancelled' | 'refunded';

export interface InvoiceLineItem {
  description: string;
  quantity?: number;
  unitPricePaise?: number;
  amountPaise?: number;
  sacCode?: string;
  taxableAmountPaise?: number;
  cgstRateBasisPoints?: number;
  cgstPaise?: number;
  sgstRateBasisPoints?: number;
  sgstPaise?: number;
  igstRateBasisPoints?: number;
  igstPaise?: number;
  totalPaise?: number;
}

export interface Invoice {
  id: string;
  bookingId: string;
  catererId: string;
  customerId: string;
  invoiceNumber: string;
  invoiceType: InvoiceType;
  totalAmountPaise: number;
  taxableAmountPaise: number;
  cgstPaise: number;
  sgstPaise: number;
  igstPaise: number;
  sacCode: string;
  status: InvoiceStatus;
  lineItems?: InvoiceLineItem[];
  pdfUrl?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export type TaxType =
  | 'tds_194o'
  | 'tcs_section_52'
  | 'tcs_52'
  | 'tcs_gst_sec52'
  | 'gst_commission'
  | 'gst_catering'
  | 'gst_input'
  | 'gst';

export type TaxEntityType = 'caterer' | 'platform' | 'customer' | 'booking' | 'settlement';

export type TaxLedgerStatus =
  | 'accrued'
  | 'deposited'
  | 'filed'
  | 'waived'
  | 'remitted'
  | 'reversed'
  | 'recorded'
  | 'reconciled';

export interface TaxLedgerRecord {
  id: string;
  bookingId?: string | null;
  catererId?: string | null;
  entityType: TaxEntityType;
  entityId: string;
  taxType: TaxType;
  rateBasisPoints: number;
  taxableAmountPaise: number;
  taxAmountPaise: number;
  financialYear: string;
  quarter: 'Q1' | 'Q2' | 'Q3' | 'Q4';
  status: TaxLedgerStatus;
  challanReference?: string | null;
  depositedAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export type TaxLedgerEntry = TaxLedgerRecord;

// ==========================================
// Razorpay Reconciliation Runs & Discrepancies (P1-1)
// ==========================================
export type ReconciliationStatus =
  | 'pending'
  | 'running'
  | 'in_progress'
  | 'completed'
  | 'failed'
  | 'reconciled';

export type DiscrepancyType =
  | 'amount_mismatch'
  | 'status_mismatch'
  | 'missing_in_razorpay'
  | 'missing_in_db'
  | 'missing_in_gateway'
  | 'refund_mismatch'
  | 'other';

export type DiscrepancyStatus =
  | 'open'
  | 'detected'
  | 'resolved'
  | 'manually_resolved'
  | 'auto_healed'
  | 'ignored';

export interface ReconciliationRun {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: ReconciliationStatus;
  totalRecords: number;
  matchedCount: number;
  discrepancyCount: number;
  autoHealedCount?: number;
  errorMessage?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReconciliationDiscrepancy {
  id: string;
  runId: string;
  discrepancyType: DiscrepancyType;
  razorpayEntityId?: string | null;
  localEntityId?: string | null;
  amountPaise?: number | null;
  status: DiscrepancyStatus;
  resolutionNotes?: string | null;
  createdAt: string;
  updatedAt?: string;
}

// ==========================================
// Caterer Penalties (P1-10)
// ==========================================
export type PenaltyType =
  | 'late_cancellation'
  | 'no_show'
  | 'service_shortage'
  | 'quality_breach'
  | 'quality_default'
  | 'other';

export type PenaltyStatus =
  | 'pending'
  | 'pending_deduction'
  | 'deducted'
  | 'waived'
  | 'disputed';

export interface CatererPenalty {
  id: string;
  catererId: string;
  bookingId?: string | null;
  penaltyType: PenaltyType;
  penaltyAmountPaise: number;
  deductedFromSettlementId?: string | null;
  status: PenaltyStatus;
  reason: string;
  waivedBy?: string | null;
  waivedReason?: string | null;
  createdAt: string;
  updatedAt?: string;
}

// ==========================================
// Reminders Sent Tracking (P1-11)
// ==========================================
export type ReminderType =
  | 't_minus_24h'
  | 'payment_deadline_t_minus_2h'
  | 'event_day'
  | 'post_event_feedback'
  | string;

export interface ReminderSent {
  id: string;
  bookingId: string;
  reminderType: ReminderType;
  channel: NotificationChannel | 'web_push' | 'email' | 'all';
  sentAt: string;
  payload?: Record<string, unknown>;
}

// ==========================================
// Error Monitoring & Alert Webhook (P1-15)
// ==========================================
export type AlertSeverity = 'info' | 'warn' | 'error' | 'critical';

export type AlertType =
  | 'payment_failure'
  | 'payout_failure'
  | 'reconciliation_discrepancy'
  | 'webhook_signature_failure'
  | 'dead_letter_event'
  | 'system_error';

export interface AlertWebhookPayload {
  alertId: string;
  service: string;
  alertType: AlertType;
  severity: AlertSeverity;
  message: string;
  timestamp: string;
  environment: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

// ==========================================
// Real-Time WebSocket Events (R2)
// ==========================================
export type RealtimeEventName =
  | 'booking_requested'
  | 'booking_accepted'
  | 'booking_rejected'
  | 'payment_in_progress'
  | 'booking_paid'
  | 'booking_cancelled'
  | 'dispute_filed'
  | 'settlement_updated';

export interface RealtimeEventPayload {
  bookingId: string;
  catererId?: string;
  customerId?: string;
  status?: string;
  amountPaise?: number;
  [key: string]: unknown;
}

export interface RealtimeEventEnvelope {
  event: RealtimeEventName;
  timestamp: string;
  payload: RealtimeEventPayload;
}
