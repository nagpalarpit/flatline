// Flatline — shared status-transition writer
//
// Both the cron sweep (up -> down) and a recovery ping (down -> up) go
// through this single code path: a conditional UPDATE to `checks` (guarded
// on the row still being in `fromStatus`) and, only if that UPDATE actually
// matched a row, one INSERT to `check_events` followed by a webhook attempt
// if the check has one configured. This is the *only* place
// `check_events`/`webhook_deliveries` rows get written — never on a routine
// successful ping — which is what keeps write volume proportional to
// incidents rather than to ping traffic.
//
// The UPDATE's `WHERE status = ?` guard exists because two callers can race
// for the same check: a monitored service that retries a timed-out
// heartbeat call routinely sends two near-simultaneous recovery pings, and
// without the guard both would read the same pre-transition snapshot,
// both pass the caller's status check, and both fire a webhook — paging a
// customer twice for one real transition. The guard makes at most one of
// them win; the loser's UPDATE matches zero rows and it returns false
// without touching `check_events`/`webhook_deliveries`.

import type { Check, CheckStatus } from '../types';
import { buildWebhookPayload, fireWebhook } from './webhook';

export async function applyStatusChange(
  db: D1Database,
  check: Check,
  toStatus: CheckStatus,
  fromStatus: CheckStatus,
  nowIso: string
): Promise<boolean> {
  const updateStmt =
    toStatus === 'up'
      ? db
          .prepare(
            `UPDATE checks SET status = 'up', last_ping_at = ?, last_state_change_at = ?, updated_at = ? WHERE id = ? AND status = ?`
          )
          .bind(nowIso, nowIso, nowIso, check.id, fromStatus)
      : db
          .prepare(`UPDATE checks SET status = 'down', last_state_change_at = ?, updated_at = ? WHERE id = ? AND status = ?`)
          .bind(nowIso, nowIso, check.id, fromStatus);

  const updateResult = await updateStmt.run();
  if (updateResult.meta.changes === 0) {
    return false;
  }

  const eventId = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO check_events (id, check_id, from_status, to_status, occurred_at) VALUES (?, ?, ?, ?, ?)`
    )
    .bind(eventId, check.id, fromStatus, toStatus, nowIso)
    .run();

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

  return true;
}
