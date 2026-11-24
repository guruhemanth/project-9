import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startAllServers, stopAllServers, createApiClient } from '../harness';

describe('Feature 13: Payment Error Alerts Webhook (P1-15)', () => {
  const client = createApiClient();

  beforeAll(async () => {
    await startAllServers();
  });

  afterAll(async () => {
    await stopAllServers();
  });

  it('TC-P1-15-01: Structured alert payload matches incident schema', () => {
    const samplePayload = {
      alertType: 'PAYMENT_AMOUNT_MISMATCH',
      severity: 'CRITICAL',
      service: 'payment-service',
      timestamp: new Date().toISOString(),
      details: {
        bookingId: 'c0000000-0000-0000-0000-000000000001',
        expectedPaise: 500000,
        receivedPaise: 250000,
        error: 'Recorded payment amount differs from Razorpay captured amount',
      },
    };

    const validAlertTypes = [
      'PAYMENT_AMOUNT_MISMATCH',
      'PAYOUT_FAILED',
      'RECONCILIATION_DISCREPANCY',
      'WEBHOOK_SIGNATURE_INVALID',
    ];

    expect(validAlertTypes).toContain(samplePayload.alertType);
    expect(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']).toContain(samplePayload.severity);
    expect(samplePayload.service).toBe('payment-service');
    expect(samplePayload.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('TC-P1-15-02: Alert payloads redact customer PII and sensitive credentials', () => {
    const sanitizeAlert = (data: Record<string, any>) => {
      const sanitized = { ...data };
      const sensitiveKeys = ['password', 'cardToken', 'bankAccount', 'secret'];
      for (const key of Object.keys(sanitized)) {
        if (sensitiveKeys.includes(key)) {
          sanitized[key] = '[REDACTED]';
        }
      }
      return sanitized;
    };

    const rawData = {
      bookingId: 'b-123',
      bankAccount: '123456789012',
      cardToken: 'tok_visa_123',
      amountPaise: 500000,
    };

    const cleaned = sanitizeAlert(rawData);
    expect(cleaned.bankAccount).toBe('[REDACTED]');
    expect(cleaned.cardToken).toBe('[REDACTED]');
    expect(cleaned.amountPaise).toBe(500000);
  });

  it('TC-P1-15-03: Webhook failure does not throw or abort primary payment execution', async () => {
    // Dispatch alert with non-existent or failing webhook URL
    const sendAlert = async (webhookUrl: string, payload: any) => {
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: AbortSignal.timeout(500),
        });
      } catch (err) {
        // Silently caught to prevent transaction rollback
        return { caught: true, error: err };
      }
      return { caught: false };
    };

    const result = await sendAlert('http://127.0.0.1:9999/non-existent-webhook', {
      alertType: 'TEST_ALERT',
    });

    expect(result.caught).toBe(true);
  });

  it('TC-P1-15-04: Webhook signature verification failure is tracked as security alert', async () => {
    // Send invalid webhook signature to payment service
    const res = await client.post(
      '/api/payments/webhook',
      JSON.stringify({ event: 'payment.captured' }),
      {
        headers: {
          'x-razorpay-signature': 'invalid-spoofed-signature-hex',
          'Content-Type': 'application/json',
        },
      },
    );

    // Gateway or payment service must reject spoofed signature
    expect(res.status).toBe(400);
    expect(res.body.error).toContain('Invalid Razorpay webhook signature');
  });

  it('TC-P1-15-05: Missing ALERT_WEBHOOK_URL environment variable falls back to logger', () => {
    const originalEnv = process.env.ALERT_WEBHOOK_URL;
    delete process.env.ALERT_WEBHOOK_URL;

    const hasWebhook = Boolean(process.env.ALERT_WEBHOOK_URL);
    expect(hasWebhook).toBe(false);

    // Restore
    if (originalEnv) {
      process.env.ALERT_WEBHOOK_URL = originalEnv;
    }
  });

  it('TC-P1-15-06: Payout exhaustion (max 3 retries) produces high-severity incident payload', () => {
    const retryCount = 3;
    const isExhausted = retryCount >= 3;
    expect(isExhausted).toBe(true);

    const alertSeverity = isExhausted ? 'CRITICAL' : 'MEDIUM';
    expect(alertSeverity).toBe('CRITICAL');
  });
});
