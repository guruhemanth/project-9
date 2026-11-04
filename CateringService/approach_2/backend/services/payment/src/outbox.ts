import { pgPool } from './db';

export async function enqueueOutboxNotification(
  eventType: string,
  payload: Record<string, any>,
  client?: any
): Promise<void> {
  const runner = client || pgPool;
  try {
    await runner.query(
      `INSERT INTO notify_svc.notification_outbox (event_type, payload)
       VALUES ($1, $2)`,
      [eventType, JSON.stringify(payload)]
    );
  } catch (err) {
    console.error(`[Outbox] Failed to enqueue event ${eventType}:`, err);
  }
}
