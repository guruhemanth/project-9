import crypto from 'node:crypto';

export const TEST_USERS = {
  admin: {
    id: 'c0000000-0000-0000-0000-000000000003',
    email: 'admin@caterconnect.in',
    password: 'Password123!',
    role: 'admin' as const,
    fullName: 'Platform Administrator',
  },
  caterer: {
    id: 'c0000000-0000-0000-0000-000000000002',
    email: 'caterer@example.com',
    password: 'Password123!',
    role: 'caterer' as const,
    fullName: 'Venkateswara Caterers',
  },
  customer: {
    id: 'c0000000-0000-0000-0000-000000000001',
    email: 'customer@example.com',
    password: 'Password123!',
    role: 'customer' as const,
    fullName: 'Rajesh Kumar',
  },
};

export const TEST_CATERER = {
  id: 'd0000000-0000-0000-0000-000000000001',
  businessName: 'Sri Venkateswara Catering Services',
  city: 'Tirupati',
  packageId: 'e0000000-0000-0000-0000-000000000001',
};

export const RAZORPAY_CONFIG = {
  keyId: process.env.RAZORPAY_KEY_ID || 'rzp_test_TsGPMrG0b8mQdH',
  keySecret: process.env.RAZORPAY_KEY_SECRET || '2F6s5xy8AlIINFngqlztxY7P',
  webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || 'caterconnect_test_webhook_secret_key',
};

export const DATABASE_URL =
  process.env.CATER_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:Guru%40123@127.0.0.1:5432/caterconnect';

export function generateWebhookSignature(
  rawBody: string,
  secret = RAZORPAY_CONFIG.webhookSecret,
): string {
  return crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
}

export function generatePaymentSignature(
  orderId: string,
  paymentId: string,
  secret = RAZORPAY_CONFIG.keySecret,
): string {
  return crypto.createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
}

export function generateHmacToken(
  payload: string,
  secret = process.env.JWT_SECRET || 'caterconnect-super-secret-development-jwt-key-min-32-chars',
): string {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}
