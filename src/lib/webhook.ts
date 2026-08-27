// Flatline — outbound webhook alerting
//
// Deliberately webhook-only for v1 (see product scope notes): the customer
// supplies their own endpoint, so there is zero new third-party credential
// dependency to provision. Cloudflare does not bill outbound fetch/subrequest
// calls, so this is $0 incremental cost per alert (confirmed by cost analysis
// against live Cloudflare pricing).

import type { Check, CheckStatus } from '../types';

export interface WebhookPayload {
  check_id: string;
  check_name: string;
  status: CheckStatus;
  previous_status: CheckStatus;
  occurred_at: string;
  message: string;
  /** Top-level `text` field makes this payload directly usable as a Slack
   * incoming webhook without any transformation on the customer's side. */
  text: string;
}

export function buildWebhookPayload(
  check: Check,
  toStatus: CheckStatus,
  fromStatus: CheckStatus,
  occurredAt: string
): WebhookPayload {
  const emoji = toStatus === 'down' ? '\u{1F534}' : '\u{1F7E2}';
  const message =
    toStatus === 'down'
      ? `Check "${check.name}" went DOWN — no ping received within ${check.period_seconds + check.grace_seconds}s (period ${check.period_seconds}s + grace ${check.grace_seconds}s).`
      : `Check "${check.name}" recovered — ping received again.`;

  return {
    check_id: check.id,
    check_name: check.name,
    status: toStatus,
    previous_status: fromStatus,
    occurred_at: occurredAt,
    message,
    text: `${emoji} ${message}`,
  };
}

export interface WebhookAttemptResult {
  success: boolean;
  statusCode: number | null;
  error: string | null;
}

/**
 * Fires a single webhook attempt with a short timeout. v1 is deliberately
 * one-shot (no retry queue) — out of scope per CEO decision; the attempt
 * outcome is recorded in `webhook_deliveries` for later manual/operational
 * visibility regardless of success or failure.
 */
export async function fireWebhook(url: string, payload: WebhookPayload): Promise<WebhookAttemptResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
      // Never transparently follow a redirect: a webhook_url that passed
      // config-time validation as a legitimate public host could otherwise
      // 30x to an internal target at delivery time, bypassing the
      // private/loopback-IP check in checks.ts entirely. `redirect: 'manual'`
      // makes workerd's fetch() return an opaqueredirect-style response
      // (status 0, `res.ok` false, `res.type === 'opaqueredirect'`) instead
      // of following it — the branch below already treats any non-ok
      // response as a failed delivery, so a redirect is correctly recorded
      // as `success: false` rather than silently treated as delivered.
      redirect: 'manual',
    });
    return { success: res.ok, statusCode: res.status, error: res.ok ? null : `HTTP ${res.status}` };
  } catch (err) {
    return { success: false, statusCode: null, error: err instanceof Error ? err.message : String(err) };
  } finally {
    clearTimeout(timeout);
  }
}
