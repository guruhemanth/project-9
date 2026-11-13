import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { buildPaymentServer } from '../src';
import { pgPool } from '../src/db';

describe('Settlement Authorization Holes (Test-First)', () => {
  const app = buildPaymentServer();

  beforeAll(async () => {
    await app.ready();
  });

  afterAll(async () => {
    if (!(pgPool as any).ending) {
      await pgPool.end();
    }
    await app.close();
  });

  it('FAIL: customer cannot disburse settlement or view admin settlements', async () => {
    // F2: /api/payments/settlements/:id/disburse by customer must return 403
    const res = await app.inject({
      method: 'POST',
      url: '/api/payments/settlements/00000000-0000-0000-0000-000000000001/disburse',
      headers: {
        'x-user-id': 'c0000000-0000-0000-0000-000000000001',
        'x-user-role': 'customer',
      },
      payload: { utrReference: 'UTR123456789' },
    });
    expect(res.statusCode).toBe(403);
  });
});
