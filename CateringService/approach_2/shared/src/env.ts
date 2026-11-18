import { z } from 'zod';

export type AppEnvironment = 'development' | 'test' | 'staging' | 'production';

const appEnvSchema = z.enum(['development', 'test', 'staging', 'production']).default('development');

export function isTestEnv(env?: string): boolean {
  if (env) {
    return env === 'test';
  }
  return process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
}

/**
 * Validates CORS allowed origins list.
 * Returns array of allowed origin strings.
 */
export function resolveAllowedOrigins(allowedOriginsStr?: string, isDev = false): string[] {
  if (allowedOriginsStr && allowedOriginsStr.trim().length > 0) {
    return allowedOriginsStr
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  if (isDev) {
    return ['http://localhost:3000', 'http://localhost:3001', 'http://localhost:5173', 'http://localhost:5174'];
  }

  return [];
}

/**
 * Base environment schema for all services
 */
export const baseEnvSchema = z.object({
  NODE_ENV: appEnvSchema,
  PORT: z.coerce.number().optional(),
  ALLOWED_ORIGINS: z.string().optional(),
});

export interface GatewayEnv {
  NODE_ENV: AppEnvironment;
  PORT: number;
  ALLOWED_ORIGINS?: string;
  JWT_SECRET: string;
  AUTH_SERVICE_URL: string;
  CATERER_SERVICE_URL: string;
  BOOKING_SERVICE_URL: string;
  PAYMENT_SERVICE_URL: string;
  NOTIFICATION_SERVICE_URL: string;
  CHAT_SERVICE_URL: string;
}

export interface DbEnv {
  NODE_ENV: AppEnvironment;
  PORT?: number;
  ALLOWED_ORIGINS?: string;
  DATABASE_URL: string;
}

export interface AuthEnv extends DbEnv {
  JWT_SECRET: string;
  GOOGLE_CLIENT_ID?: string;
}

export interface PaymentEnv extends DbEnv {
  RAZORPAY_KEY_ID: string;
  RAZORPAY_KEY_SECRET: string;
  RAZORPAY_WEBHOOK_SECRET: string;
}

export interface NotificationEnv extends DbEnv {
  NOTIFY_MODE: 'log' | 'live';
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  WHATSAPP_TOKEN?: string;
  SMS_API_KEY?: string;
}

/**
 * Database environment schema.
 * Rejects startup in non-test environments if CATER_DATABASE_URL / CATERDBURL / APP_DATABASE_URL / DATABASE_URL is absent.
 */
export function createDbEnvSchema(): z.ZodType<DbEnv, z.ZodTypeDef, unknown> {
  return z.object({
    NODE_ENV: appEnvSchema,
    PORT: z.coerce.number().optional(),
    ALLOWED_ORIGINS: z.string().optional(),
    CATER_DATABASE_URL: z.string().optional(),
    CATERDBURL: z.string().optional(),
    APP_DATABASE_URL: z.string().optional(),
    DATABASE_URL: z.string().optional(),
  }).transform((data): DbEnv => {
    const isTesting = isTestEnv(data.NODE_ENV);
    const rawUrl = data.CATER_DATABASE_URL || data.CATERDBURL || data.APP_DATABASE_URL || data.DATABASE_URL;

    if (isTesting && (!rawUrl || (!rawUrl.includes('caterconnect') && !rawUrl.includes('54322')))) {
      return {
        NODE_ENV: data.NODE_ENV,
        PORT: data.PORT,
        ALLOWED_ORIGINS: data.ALLOWED_ORIGINS,
        DATABASE_URL: 'postgresql://postgres:CaterPG123@127.0.0.1:54322/caterconnect',
      };
    }

    if (!rawUrl) {
      throw new Error(
        '[Environment Validation] Fatal: DATABASE_URL (or CATER_DATABASE_URL / CATERDBURL) is required in non-test environments. Refusing to start.'
      );
    }

    if (!rawUrl.startsWith('postgresql://') && !rawUrl.startsWith('postgres://')) {
      throw new Error(
        `[Environment Validation] Fatal: DATABASE_URL must start with postgresql:// or postgres://. Received: ${rawUrl.substring(0, 15)}...`
      );
    }

    return {
      NODE_ENV: data.NODE_ENV,
      PORT: data.PORT,
      ALLOWED_ORIGINS: data.ALLOWED_ORIGINS,
      DATABASE_URL: rawUrl,
    };
  });
}

/**
 * API Gateway environment schema.
 * Enforces JWT_SECRET (minimum 32 chars) in non-test environments.
 */
export function createGatewayEnvSchema(): z.ZodType<GatewayEnv, z.ZodTypeDef, unknown> {
  return z.object({
    NODE_ENV: appEnvSchema,
    PORT: z.coerce.number().default(8080),
    ALLOWED_ORIGINS: z.string().optional(),
    JWT_SECRET: z.string().optional(),
    AUTH_SERVICE_URL: z.string().default('http://127.0.0.1:4001'),
    CATERER_SERVICE_URL: z.string().default('http://127.0.0.1:4002'),
    BOOKING_SERVICE_URL: z.string().default('http://127.0.0.1:4003'),
    PAYMENT_SERVICE_URL: z.string().default('http://127.0.0.1:4004'),
    NOTIFICATION_SERVICE_URL: z.string().default('http://127.0.0.1:4005'),
    CHAT_SERVICE_URL: z.string().default('http://127.0.0.1:4006'),
  }).transform((data): GatewayEnv => {
    const isTesting = isTestEnv(data.NODE_ENV);
    let secret = data.JWT_SECRET;
    if (!secret || secret.trim().length === 0) {
      if (isTesting) {
        secret = 'testing-jwt-secret-with-at-least-32-chars-long';
      } else {
        throw new Error(
          '[Environment Validation] Fatal: JWT_SECRET must be defined with at least 32 characters in non-test environments.'
        );
      }
    } else if (secret.length < 32) {
      throw new Error(
        `[Environment Validation] Fatal: JWT_SECRET is too short (${secret.length} chars). Minimum length is 32 characters.`
      );
    }

    return {
      NODE_ENV: data.NODE_ENV,
      PORT: data.PORT,
      ALLOWED_ORIGINS: data.ALLOWED_ORIGINS,
      JWT_SECRET: secret,
      AUTH_SERVICE_URL: data.AUTH_SERVICE_URL,
      CATERER_SERVICE_URL: data.CATERER_SERVICE_URL,
      BOOKING_SERVICE_URL: data.BOOKING_SERVICE_URL,
      PAYMENT_SERVICE_URL: data.PAYMENT_SERVICE_URL,
      NOTIFICATION_SERVICE_URL: data.NOTIFICATION_SERVICE_URL,
      CHAT_SERVICE_URL: data.CHAT_SERVICE_URL,
    };
  });
}

/**
 * Auth Service environment schema.
 */
export function createAuthEnvSchema(): z.ZodType<AuthEnv, z.ZodTypeDef, unknown> {
  return z.object({
    NODE_ENV: appEnvSchema,
    PORT: z.coerce.number().default(4001),
    ALLOWED_ORIGINS: z.string().optional(),
    CATER_DATABASE_URL: z.string().optional(),
    CATERDBURL: z.string().optional(),
    APP_DATABASE_URL: z.string().optional(),
    DATABASE_URL: z.string().optional(),
    JWT_SECRET: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
  }).transform((data): AuthEnv => {
    const isTesting = isTestEnv(data.NODE_ENV);
    const rawUrl = data.CATER_DATABASE_URL || data.CATERDBURL || data.APP_DATABASE_URL || data.DATABASE_URL;
    let dbUrl = rawUrl;

    if (isTesting && (!dbUrl || (!dbUrl.includes('caterconnect') && !dbUrl.includes('54322')))) {
      dbUrl = 'postgresql://postgres:CaterPG123@127.0.0.1:54322/caterconnect';
    } else if (!dbUrl) {
      throw new Error(
        '[Environment Validation] Fatal: DATABASE_URL is required in non-test environments.'
      );
    }

    let secret = data.JWT_SECRET;
    if (!secret || secret.trim().length === 0) {
      if (isTesting) {
        secret = 'testing-jwt-secret-with-at-least-32-chars-long';
      } else {
        throw new Error(
          '[Environment Validation] Fatal: JWT_SECRET must be defined with at least 32 characters in non-test environments.'
        );
      }
    } else if (secret.length < 32) {
      throw new Error(
        `[Environment Validation] Fatal: JWT_SECRET is too short (${secret.length} chars). Minimum length is 32 characters.`
      );
    }

    return {
      NODE_ENV: data.NODE_ENV,
      PORT: data.PORT,
      ALLOWED_ORIGINS: data.ALLOWED_ORIGINS,
      DATABASE_URL: dbUrl,
      JWT_SECRET: secret,
      GOOGLE_CLIENT_ID: data.GOOGLE_CLIENT_ID,
    };
  });
}

/**
 * Payment Service environment schema.
 * Enforces Razorpay credentials and webhook secret in non-test environments.
 */
export function createPaymentEnvSchema(): z.ZodType<PaymentEnv, z.ZodTypeDef, unknown> {
  return z.object({
    NODE_ENV: appEnvSchema,
    PORT: z.coerce.number().default(4004),
    ALLOWED_ORIGINS: z.string().optional(),
    CATER_DATABASE_URL: z.string().optional(),
    CATERDBURL: z.string().optional(),
    APP_DATABASE_URL: z.string().optional(),
    DATABASE_URL: z.string().optional(),
    RAZORPAY_KEY_ID: z.string().optional(),
    RAZORPAY_KEY_SECRET: z.string().optional(),
    RAZORPAY_WEBHOOK_SECRET: z.string().optional(),
  }).transform((data): PaymentEnv => {
    const isTesting = isTestEnv(data.NODE_ENV);
    const rawUrl = data.CATER_DATABASE_URL || data.CATERDBURL || data.APP_DATABASE_URL || data.DATABASE_URL;
    let dbUrl = rawUrl;

    if (isTesting && (!dbUrl || (!dbUrl.includes('caterconnect') && !dbUrl.includes('54322')))) {
      dbUrl = 'postgresql://postgres:CaterPG123@127.0.0.1:54322/caterconnect';
    } else if (!dbUrl) {
      throw new Error(
        '[Environment Validation] Fatal: DATABASE_URL is required in non-test environments.'
      );
    }

    let keyId = data.RAZORPAY_KEY_ID;
    let keySecret = data.RAZORPAY_KEY_SECRET;
    let webhookSecret = data.RAZORPAY_WEBHOOK_SECRET;

    if (!keyId || !keySecret || !webhookSecret) {
      if (isTesting) {
        keyId = keyId || 'test_rzp_key_id_vitest';
        keySecret = keySecret || 'test_rzp_key_secret_vitest';
        webhookSecret = webhookSecret || 'test_webhook_secret_vitest_hmac';
      } else {
        throw new Error(
          '[Environment Validation] Fatal: RAZORPAY_KEY_ID, RAZORPAY_KEY_SECRET, and RAZORPAY_WEBHOOK_SECRET are required in non-test environments.'
        );
      }
    }

    return {
      NODE_ENV: data.NODE_ENV,
      PORT: data.PORT,
      ALLOWED_ORIGINS: data.ALLOWED_ORIGINS,
      DATABASE_URL: dbUrl,
      RAZORPAY_KEY_ID: keyId,
      RAZORPAY_KEY_SECRET: keySecret,
      RAZORPAY_WEBHOOK_SECRET: webhookSecret,
    };
  });
}

/**
 * Notification Service environment schema.
 * Supports NOTIFY_MODE ('log' | 'live') and VAPID keys for Web Push.
 */
export function createNotificationEnvSchema(): z.ZodType<NotificationEnv, z.ZodTypeDef, unknown> {
  return z.object({
    NODE_ENV: appEnvSchema,
    PORT: z.coerce.number().default(4005),
    ALLOWED_ORIGINS: z.string().optional(),
    CATER_DATABASE_URL: z.string().optional(),
    CATERDBURL: z.string().optional(),
    APP_DATABASE_URL: z.string().optional(),
    DATABASE_URL: z.string().optional(),
    NOTIFY_MODE: z.enum(['log', 'live']).default('log'),
    VAPID_PUBLIC_KEY: z.string().optional(),
    VAPID_PRIVATE_KEY: z.string().optional(),
    VAPID_SUBJECT: z.string().default('mailto:support@caterconnect.in'),
    WHATSAPP_TOKEN: z.string().optional(),
    SMS_API_KEY: z.string().optional(),
  }).transform((data): NotificationEnv => {
    const isTesting = isTestEnv(data.NODE_ENV);
    const rawUrl = data.CATER_DATABASE_URL || data.CATERDBURL || data.APP_DATABASE_URL || data.DATABASE_URL;
    let dbUrl = rawUrl;

    if (isTesting && (!dbUrl || (!dbUrl.includes('caterconnect') && !dbUrl.includes('54322')))) {
      dbUrl = 'postgresql://postgres:CaterPG123@127.0.0.1:54322/caterconnect';
    } else if (!dbUrl) {
      throw new Error(
        '[Environment Validation] Fatal: DATABASE_URL is required in non-test environments.'
      );
    }

    return {
      NODE_ENV: data.NODE_ENV,
      PORT: data.PORT,
      ALLOWED_ORIGINS: data.ALLOWED_ORIGINS,
      DATABASE_URL: dbUrl,
      NOTIFY_MODE: data.NOTIFY_MODE,
      VAPID_PUBLIC_KEY: data.VAPID_PUBLIC_KEY,
      VAPID_PRIVATE_KEY: data.VAPID_PRIVATE_KEY,
      VAPID_SUBJECT: data.VAPID_SUBJECT,
      WHATSAPP_TOKEN: data.WHATSAPP_TOKEN,
      SMS_API_KEY: data.SMS_API_KEY,
    };
  });
}

/**
 * Generic validator helper that parses and validates raw environment records.
 */
export function validateEnv<TOutput>(
  schema: z.ZodType<TOutput, any, any>,
  rawEnv: Record<string, string | undefined> = process.env
): TOutput {
  const result = schema.safeParse(rawEnv);
  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => `${issue.path.join('.') || 'root'}: ${issue.message}`)
      .join('; ');
    throw new Error(`[Environment Validation Failed] ${errorDetails}`);
  }
  return result.data;
}
