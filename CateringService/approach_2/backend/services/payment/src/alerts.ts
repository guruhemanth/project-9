import crypto from 'node:crypto';

export interface AlertInput {
  alertType: 'PAYMENT_AMOUNT_MISMATCH' | 'PAYOUT_FAILED' | 'RECONCILIATION_DISCREPANCY' | 'WEBHOOK_SIGNATURE_INVALID' | 'DEAD_LETTER_EXHAUSTED' | 'GATEWAY_TIMEOUT' | 'OTHER';
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW';
  message: string;
  service?: string;
  details?: Record<string, any>;
}

export function sanitizeAlertDetails(data?: Record<string, any>): Record<string, any> {
  if (!data || typeof data !== 'object') return {};
  const sanitized: Record<string, any> = { ...data };
  const sensitiveKeys = [
    'password',
    'cardtoken',
    'card_token',
    'bankaccount',
    'bank_account',
    'accountnumber',
    'account_number',
    'account',
    'secret',
    'keysecret',
    'apikey',
    'api_key',
    'token',
  ];

  for (const key of Object.keys(sanitized)) {
    const lowerKey = key.toLowerCase();
    if (sensitiveKeys.some((s) => lowerKey.includes(s))) {
      sanitized[key] = '[REDACTED]';
    } else if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
      sanitized[key] = sanitizeAlertDetails(sanitized[key]);
    }
  }

  return sanitized;
}

export async function sendPaymentAlertWebhook(alert: AlertInput, logger?: any): Promise<boolean> {
  const alertId = crypto.randomUUID();
  const service = alert.service || 'payment-service';
  const environment = process.env.NODE_ENV || 'development';
  const timestamp = new Date().toISOString();
  const sanitizedDetails = sanitizeAlertDetails(alert.details);

  const payload = {
    alertId,
    service,
    alertType: alert.alertType,
    severity: alert.severity,
    message: alert.message,
    timestamp,
    environment,
    details: sanitizedDetails,
  };

  const webhookUrl = process.env.ALERT_WEBHOOK_URL || process.env.PAYMENT_ALERT_WEBHOOK_URL;
  if (!webhookUrl) {
    if (logger && typeof logger.warn === 'function') {
      logger.warn({ alert: payload }, '[AlertDispatcher] No ALERT_WEBHOOK_URL configured, logged alert locally');
    } else {
      console.warn('[AlertDispatcher] No ALERT_WEBHOOK_URL configured, logged alert locally:', JSON.stringify(payload));
    }
    return false;
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'CaterConnect-PaymentService-AlertDispatcher/1.0',
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(2000),
    });

    return res.ok;
  } catch (err: any) {
    if (logger && typeof logger.error === 'function') {
      logger.error({ err, alertId }, '[AlertDispatcher] Failed to dispatch external alert webhook');
    } else {
      console.error('[AlertDispatcher] Failed to dispatch external alert webhook:', err?.message || err);
    }
    // Never throw or abort caller transaction
    return false;
  }
}
