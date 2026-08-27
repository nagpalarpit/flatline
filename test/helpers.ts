// Shared test helpers for the Flatline automated test suite — mirrors
// snapog's test/helpers.ts pattern (call the Worker's fetch handler
// directly, wait on the ExecutionContext for any waitUntil()ed work).

import {
  createExecutionContext,
  createScheduledController,
  env as rawEnv,
  waitOnExecutionContext,
} from 'cloudflare:test';
import worker from '../src/index';
import type { Env, Tier } from '../src/types';

export const env = rawEnv as unknown as Env;

export async function request(path: string, init?: RequestInit): Promise<Response> {
  const ctx = createExecutionContext();
  const req = new Request(`https://flatline.test${path}`, init);
  const res = await worker.fetch(req, env, ctx);
  await waitOnExecutionContext(ctx);
  return res;
}

/** Drives the cron sweep exactly the way the platform would every minute. */
export async function runScheduledSweep(): Promise<void> {
  const ctx = createExecutionContext();
  const controller = createScheduledController();
  await worker.scheduled(controller, env, ctx);
  await waitOnExecutionContext(ctx);
}

export interface RegisterResult {
  res: Response;
  email: string;
  apiKey: string;
}

export async function registerAccount(opts: { email?: string; ip?: string } = {}): Promise<RegisterResult> {
  const email = opts.email ?? `test-${crypto.randomUUID()}@flatline.test`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.ip) headers['CF-Connecting-IP'] = opts.ip;

  const res = await request('/register', {
    method: 'POST',
    headers,
    body: JSON.stringify({ email }),
  });
  const body = await res.json<{ api_key?: string; error?: string }>();
  if (!body.api_key) {
    throw new Error(`registerAccount(): no api_key in response (status ${res.status}): ${JSON.stringify(body)}`);
  }
  return { res, email, apiKey: body.api_key };
}

export interface CreateCheckResult {
  res: Response;
  body: { check?: { id: string; ping_url: string; [k: string]: unknown }; error?: string };
}

export async function createCheck(
  apiKey: string,
  overrides: Record<string, unknown> = {}
): Promise<CreateCheckResult> {
  const payload = { name: 'Nightly Backup', period_seconds: 300, ...overrides };
  const res = await request('/checks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(payload),
  });
  const body = await res.json<CreateCheckResult['body']>();
  return { res, body };
}

/** Directly promotes an account to a paid tier for tests that need Pro/Business limits. */
export async function setAccountTier(apiKey: string, tier: Tier): Promise<void> {
  const hash = await sha256Hex(apiKey);
  await env.DB.prepare('UPDATE api_keys SET tier = ? WHERE key_hash = ?').bind(tier, hash).run();
}

/**
 * Directly inserts `count` checks for an account via a D1 batch, bypassing
 * the HTTP API. Used to reach check-count limits (e.g. the business tier's
 * 1000) without paying for `count` round-trips through the Worker per test.
 */
export async function seedChecks(apiKey: string, count: number): Promise<void> {
  const hash = await sha256Hex(apiKey);
  const row = await env.DB.prepare('SELECT id FROM api_keys WHERE key_hash = ?').bind(hash).first<{ id: string }>();
  if (!row) throw new Error('seedChecks(): no api_key row for the given apiKey');

  const now = new Date().toISOString().replace('T', ' ').slice(0, 19);
  const stmts = Array.from({ length: count }, (_, i) =>
    env.DB.prepare(
      `INSERT INTO checks
         (id, api_key_id, name, period_seconds, grace_seconds, status, last_state_change_at, created_at, updated_at)
       VALUES (?, ?, ?, 300, 300, 'up', ?, ?, ?)`
    ).bind(crypto.randomUUID(), row.id, `seed-${i}`, now, now, now)
  );
  await env.DB.batch(stmts);
}

/** Directly rewrites a check's last_ping_at / created_at so sweep/interval tests don't need real sleeps. */
export async function setCheckTimestamps(
  checkId: string,
  fields: { last_ping_at?: string | null; created_at?: string }
): Promise<void> {
  if (fields.last_ping_at !== undefined) {
    await env.DB.prepare('UPDATE checks SET last_ping_at = ? WHERE id = ?').bind(fields.last_ping_at, checkId).run();
  }
  if (fields.created_at !== undefined) {
    await env.DB.prepare('UPDATE checks SET created_at = ? WHERE id = ?').bind(fields.created_at, checkId).run();
  }
}

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

/** Returns a timestamp `seconds` in the past, in the same sqlite-compatible shape `sqliteNow()` writes. */
export function secondsAgoIso(seconds: number): string {
  return new Date(Date.now() - seconds * 1000).toISOString().replace('T', ' ').slice(0, 19);
}
