import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildNotificationServer } from '../src';
import { pgPool } from '../src/db';

describe('Notification Service Integration (WhatsApp & SMS)', () => {
  const app = buildNotificationServer();
  const testBookingId = 'f0000000-0000-0000-0000-000000000001';

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
    await pgPool.end();
  });

  it('responds with 200 on /health', async () => {
    const res = await app.inject({ method: 'GET', url: '/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', service: 'notification-service' });
  });

  it('rejects notification dispatch with invalid phone format', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/notify/dispatch',
      payload: {
        bookingId: testBookingId,
        recipientPhone: '9876543210', // Missing +91
        recipientRole: 'customer',
        channel: 'whatsapp',
        templateType: 'booking_accepted',
        params: {
          catererName: 'Sri Venkateswara Catering',
          totalAmountINR: '₹35,000',
        },
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('ValidationError');
  });

  it('dispatches a transactional WhatsApp alert and records in audit log', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/notify/dispatch',
      payload: {
        bookingId: testBookingId,
        recipientPhone: '+919876543210',
        recipientRole: 'customer',
        channel: 'whatsapp',
        templateType: 'booking_accepted',
        params: {
          catererName: 'Sri Venkateswara Catering',
          totalAmountINR: '₹35,000',
          eventDate: '2026-12-15',
        },
      },
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.notification.status).toBe('sent');
    expect(body.notification.channel).toBe('whatsapp');
    expect(body.notification.content).toContain('Sri Venkateswara Catering');
    expect(body.notification.content).toContain('₹35,000');

    // Verify retrieval via logs endpoint
    const logsRes = await app.inject({
      method: 'GET',
      url: `/api/notify/logs/${testBookingId}`,
    });
    expect(logsRes.statusCode).toBe(200);
    expect(logsRes.json().logs.length).toBeGreaterThanOrEqual(1);
    expect(logsRes.json().logs[0].recipient_phone).toBe('+919876543210');
  });
});