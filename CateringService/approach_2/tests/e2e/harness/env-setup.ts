import path from 'node:path';
import dotenv from 'dotenv';

// Intercept dotenv.config so that when individual service db.ts files call dotenv.config({ override: true }),
// test mode environment variables are preserved and servers don't auto-bind to ports on import.
const origDotenvConfig = dotenv.config;
dotenv.config = (options?: dotenv.DotenvConfigOptions) => {
  const result = origDotenvConfig(options);
  process.env.NODE_ENV = 'test';
  process.env.VITEST = 'true';
  return result;
};

const envPath = path.resolve(__dirname, '../../../.env');
dotenv.config({ path: envPath, override: true });

process.env.NODE_ENV = 'test';
process.env.VITEST = 'true';
process.env.PORT = '8080';
process.env.ENFORCE_HTTPS = 'true';

if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
  process.env.JWT_SECRET = 'caterconnect-super-secret-development-jwt-key-min-32-chars';
}

process.env.DATABASE_URL =
  process.env.CATER_DATABASE_URL ||
  process.env.DATABASE_URL ||
  'postgresql://postgres:Guru%40123@127.0.0.1:5432/caterconnect';
process.env.CATER_DATABASE_URL = process.env.DATABASE_URL;

process.env.AUTH_SERVICE_URL = 'http://127.0.0.1:4001';
process.env.CATERER_SERVICE_URL = 'http://127.0.0.1:4002';
process.env.BOOKING_SERVICE_URL = 'http://127.0.0.1:4003';
process.env.PAYMENT_SERVICE_URL = 'http://127.0.0.1:4004';
process.env.NOTIFICATION_SERVICE_URL = 'http://127.0.0.1:4005';
process.env.CHAT_SERVICE_URL = 'http://127.0.0.1:4006';
