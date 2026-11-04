import { describe, it, expect } from 'vitest';
import {
  createGatewayEnvSchema,
  createAuthEnvSchema,
  createPaymentEnvSchema,
  createDbEnvSchema,
  validateEnv,
  resolveAllowedOrigins,
} from '../src/env';

describe('Shared Environment Validator', () => {
  it('parses allowed origins correctly for dev and custom strings', () => {
    const devOrigins = resolveAllowedOrigins(undefined, true);
    expect(devOrigins).toContain('http://localhost:3000');
    expect(devOrigins).toContain('http://localhost:5173');

    const prodOrigins = resolveAllowedOrigins('https://caterconnect.in, https://partner.caterconnect.in', false);
    expect(prodOrigins).toEqual(['https://caterconnect.in', 'https://partner.caterconnect.in']);
  });

  it('fails fast on gateway env if JWT_SECRET is less than 32 characters in production', () => {
    expect(() => {
      validateEnv(createGatewayEnvSchema(), {
        NODE_ENV: 'production',
        JWT_SECRET: 'too-short',
      });
    }).toThrow(/Fatal: JWT_SECRET is too short/);
  });

  it('fails fast on gateway env if JWT_SECRET is missing in production', () => {
    expect(() => {
      validateEnv(createGatewayEnvSchema(), {
        NODE_ENV: 'production',
        JWT_SECRET: '',
      });
    }).toThrow(/Fatal: JWT_SECRET must be defined with at least 32 characters/);
  });

  it('validates gateway env when valid secrets are provided', () => {
    const env = validateEnv(createGatewayEnvSchema(), {
      NODE_ENV: 'production',
      PORT: '8080',
      JWT_SECRET: 'a'.repeat(32),
    });
    expect(env.PORT).toBe(8080);
    expect(env.JWT_SECRET).toBe('a'.repeat(32));
  });

  it('fails fast on DB env if DATABASE_URL is missing in production', () => {
    expect(() => {
      validateEnv(createDbEnvSchema(), {
        NODE_ENV: 'production',
      });
    }).toThrow(/Fatal: DATABASE_URL/);
  });

  it('fails fast on payment env if Razorpay secrets are missing in production', () => {
    expect(() => {
      validateEnv(createPaymentEnvSchema(), {
        NODE_ENV: 'production',
        DATABASE_URL: 'postgresql://usr:pwd@localhost:5432/caterconnect',
      });
    }).toThrow(/Fatal: RAZORPAY_KEY_ID/);
  });
});
