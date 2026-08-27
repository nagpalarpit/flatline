// Flatline — shared status-transition writer
//
// Both the cron sweep (up -> down) and a recovery ping (down -> up) go
// through this single code path: one UPDATE to `checks` + one INSERT to
// `check_events`, batched as a single D1 round trip, followed by a webhook
// attempt if the check has one configured. This is the *only* place
// `check_events`/`webhook_deliveries` rows get written — never on a routine
// successful ping — which is what keeps write volume proportional to
// incidents rather than to ping traffic.

import type { Check, CheckStatus } from '../types';
import { buildWebhookPayload, fireWebhook } from './webhook';

export async function applyStatusChange(
  db: D1Database,
  check: Check,
  toStatus: CheckStatus,
  fromStatus: CheckStatus,
  nowIso: string
): Promise<void> {
  const eventId = crypto.randomUUID();

  const updateStmt =
    toStatus === 'up'
      ? db
          .prepare(
            `UPDATE checks SET status = 'up', last_ping_at = ?, last_state_change_at = ?, updated_at = ? WHERE id = ?`
          )
          .bind(nowIso, nowIso, nowIso, check.id)
      : db
          .prepare(`UPDATE checks SET status = 'down', last_state_change_at = ?, updated_at = ? WHERE id = ?`)
          .bind(nowIso, nowIso, check.id);

  const insertEventStmt = db
    .prepare(
      `INSERT INTO check_events (id, check_id, from_status, to_status, occurred_at) VALUES (?, ?, ?, ?, ?)`
    )
    .bind(eventId, check.id, fromStatus, toStatus, nowIso);

  await db.batch([updateStmt, insertEventStmt]);

  if (check.webhook_url) {
    const payload = buildWebhookPayload(check, toStatus, fromStatus, nowIso);
    const result = await fireWebhook(check.webhook_url, payload);
    await db
      .prepare(
        `INSERT INTO webhook_deliveries (id, check_id, event_id, url, status_code, success, error, attempted_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .bind(
        crypto.randomUUID(),
        check.id,
        eventId,
        check.webhook_url,
        result.statusCode,
        result.success ? 1 : 0,
        result.error,
        nowIso
      )
      .run();
  }
}
