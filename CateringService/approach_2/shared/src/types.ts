export type UserRole = 'customer' | 'caterer' | 'admin';
export type CatererStatus = 'pending' | 'approved' | 'rejected' | 'suspended';
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
export type PaymentOption = 'full' | 'advance';

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

export type SettlementStatus = 'pending' | 'processing' | 'settled' | 'held';

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
  createdAt: string;
  updatedAt: string;
  catererBusinessName?: string;
  bankAccountHolderName?: string | null;
  bankAccountNumber?: string | null;
  bankIfsc?: string | null;
  bankName?: string | null;
  upiId?: string | null;
  bankVerified?: boolean;
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
