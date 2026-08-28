// Flatline — Main Cloudflare Worker
// "You get called the moment it goes flat."
//
// Routes:
//   GET  /                 HTML landing page (Carbon Terminal design)
//   GET  /health            liveness
//   POST /register          self-serve free-tier API key (IP rate-limited)
//   POST /checks             create a check
//   GET  /checks              list checks for the authenticated account
//   GET  /checks/:id           view a single check
//   PATCH /checks/:id           update a check
//   DELETE /checks/:id           soft-delete a check
//   GET|POST /ping/:id            the heartbeat itself — no API key required,
//                                   the check id is the credential
//
// scheduled(): runs every minute (see wrangler.toml [triggers]) and sweeps
// for overdue checks — see src/lib/sweep.ts for why that's also where most
// of the system's D1 writes live, deliberately, instead of on the ping path.

import { Hono, type Context } from 'hono';
import { extractRawKey, generateRawKey, resolveApiKey, sha256Hex } from './lib/auth';
import { parseCheckInput } from './lib/checks';
import { landingPage } from './dashboard/pages';
import { runSweep } from './lib/sweep';
import { parseSqliteDate, sqliteNow } from './lib/time';
import { applyStatusChange } from './lib/transition';
import type { ApiKey, Check, Env, Tier } from './types';
import { TIER_LIMITS } from './types';

const app = new Hono<{ Bindings: Env }>();

function htmlResponse(html: string, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(html, {
    status,
    headers: { 'Content-Type': 'text/html; charset=utf-8', ...extraHeaders },
  });
}

// ─── Helpers ────────────────────────────────────────────────────────────────

async function requireApiKey(
  db: D1Database,
  req: Request
): Promise<{ ok: true; apiKey: ApiKey } | { ok: false; error: string }> {
  const rawKey = extractRawKey(req);
  const apiKey = await resolveApiKey(db, rawKey);
  if (!apiKey) return { ok: false, error: 'invalid or missing API key' };
  return { ok: true, apiKey };
}

function checkResponse(check: Check, host: string) {
  return {
    id: check.id,
    name: check.name,
    period_seconds: check.period_seconds,
    grace_seconds: check.grace_seconds,
    webhook_url: check.webhook_url,
    status: check.status,
    last_ping_at: check.last_ping_at,
    last_state_change_at: check.last_state_change_at,
    created_at: check.created_at,
    updated_at: check.updated_at,
    ping_url: `https://${host}/ping/${check.id}`,
  };
}

// ─── Landing / health ───────────────────────────────────────────────────────

app.get('/', c => {
  const host = new URL(c.req.url).host;
  return htmlResponse(landingPage(host), 200, {
    'Cache-Control': 'public, max-age=86400, s-maxage=604800',
  });
});

app.get('/health', c => c.json({ ok: true, ts: new Date().toISOString() }));

// ─── Registration ───────────────────────────────────────────────────────────

app.post('/register', async c => {
  // Same abuse-prevention pattern shipped for snapog (commits d278978/
  // f4d61df): no email verification exists (that needs a credentialed
  // transactional-email provider, which is out of scope for the same reason
  // email alerting is — see CEO decision doc), so IP throttling is the only
  // thing stopping a script from minting unlimited free-tier accounts. The
  // atomic INSERT...SELECT...WHERE avoids the check-then-insert race that
  // required a follow-up fix on snapog; applied here from day one instead.
  const ip = c.req.header('CF-Connecting-IP') ?? 'unknown';
  const REGISTER_RATE_LIMIT = 5;

  const [, insertResult] = await c.env.DB.batch([
    c.env.DB.prepare(`DELETE FROM registration_attempts WHERE created_at < datetime('now', '-24 hours')`),
    c.env.DB
      .prepare(
        `INSERT INTO registration_attempts (id, ip)
         SELECT ?, ? WHERE (
           SELECT COUNT(*) FROM registration_attempts
           WHERE ip = ? AND created_at >= datetime('now', '-1 hours')
         ) < ?`
      )
      .bind(crypto.randomUUID(), ip, ip, REGISTER_RATE_LIMIT),
  ]);
  if (insertResult.meta.changes === 0) {
    return c.json({ error: 'too many registration attempts from your network, please try again later' }, 429);
  }

  let body: { email?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }

  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return c.json({ error: 'a valid email is required' }, 400);
  }

  // Self-serve signup only ever grants the free tier — Stripe billing wiring
  // is deliberately out of scope for this cycle (follows snapog's pattern
  // later, per CEO decision doc).
  const userId = crypto.randomUUID();
  await c.env.DB
    .prepare('INSERT INTO users (id, email) VALUES (?, ?) ON CONFLICT(email) DO NOTHING')
    .bind(userId, email)
    .run();

  const user = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: string }>();
  if (!user) {
    return c.json({ error: 'database error, please try again' }, 500);
  }

  const rawKey = generateRawKey();
  const keyHash = await sha256Hex(rawKey);
  const keyPrefix = rawKey.slice(0, 12);
  const keyId = crypto.randomUUID();

  await c.env.DB
    .prepare(
      `INSERT INTO api_keys (id, user_id, name, key_prefix, key_hash, tier) VALUES (?, ?, 'default', ?, ?, 'free')`
    )
    .bind(keyId, user.id, keyPrefix, keyHash)
    .run();

  return c.json({ api_key: rawKey, key_prefix: keyPrefix, tier: 'free', email }, 201);
});

// ─── Check management (requires API key) ────────────────────────────────────

app.post('/checks', async c => {
  const auth = await requireApiKey(c.env.DB, c.req.raw);
  if (!auth.ok) return c.json({ error: auth.error }, 401);
  const { apiKey } = auth;

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }

  const limit = TIER_LIMITS[apiKey.tier];

  const parsed = parseCheckInput(body as Record<string, unknown>, apiKey.tier);
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);

  // Same atomic INSERT...SELECT...WHERE pattern as /register (commits
  // d278978/f4d61df, see the comment there): a plain SELECT COUNT(*) followed
  // by a separate INSERT is a check-then-act race — concurrent requests all
  // read the same pre-insert count and all pass the guard, so the account can
  // blow past maxChecks under bursty concurrent creation (verified by
  // qa-bach: 10 concurrent POSTs at the 24/25 boundary all succeeded,
  // landing the account at 34 active checks against a cap of 25). Folding
  // the count check into the INSERT's WHERE clause makes the read-then-write
  // a single atomic D1 statement instead of two round-trips with a gap
  // between them.
  const id = crypto.randomUUID();
  const nowIso = sqliteNow();
  const insertResult = await c.env.DB
    .prepare(
      `INSERT INTO checks
         (id, api_key_id, name, period_seconds, grace_seconds, webhook_url, status, last_state_change_at, created_at, updated_at)
       SELECT ?, ?, ?, ?, ?, ?, 'up', ?, ?, ?
       WHERE (
         SELECT COUNT(*) FROM checks WHERE api_key_id = ? AND deleted_at IS NULL
       ) < ?`
    )
    .bind(
      id,
      apiKey.id,
      parsed.value.name,
      parsed.value.period_seconds,
      parsed.value.grace_seconds,
      parsed.value.webhook_url,
      nowIso,
      nowIso,
      nowIso,
      apiKey.id,
      limit.maxChecks
    )
    .run();

  if (insertResult.meta.changes === 0) {
    return c.json(
      {
        error: `check limit reached for the ${apiKey.tier} tier (${limit.maxChecks} checks)`,
        tier: apiKey.tier,
        limit: limit.maxChecks,
      },
      429
    );
  }

  const host = new URL(c.req.url).host;
  const check: Check = {
    id,
    api_key_id: apiKey.id,
    name: parsed.value.name,
    period_seconds: parsed.value.period_seconds,
    grace_seconds: parsed.value.grace_seconds,
    webhook_url: parsed.value.webhook_url,
    status: 'up',
    last_ping_at: null,
    last_state_change_at: nowIso,
    created_at: nowIso,
    updated_at: nowIso,
    deleted_at: null,
    version: 1,
  };

  return c.json({ check: checkResponse(check, host) }, 201);
});

app.get('/checks', async c => {
  const auth = await requireApiKey(c.env.DB, c.req.raw);
  if (!auth.ok) return c.json({ error: auth.error }, 401);
  const { apiKey } = auth;

  const { results } = await c.env.DB
    .prepare('SELECT * FROM checks WHERE api_key_id = ? AND deleted_at IS NULL ORDER BY created_at DESC')
    .bind(apiKey.id)
    .all<Check>();

  const host = new URL(c.req.url).host;
  return c.json({ checks: results.map(check => checkResponse(check, host)) });
});

app.get('/checks/:id', async c => {
  const auth = await requireApiKey(c.env.DB, c.req.raw);
  if (!auth.ok) return c.json({ error: auth.error }, 401);
  const { apiKey } = auth;

  const check = await c.env.DB
    .prepare('SELECT * FROM checks WHERE id = ? AND api_key_id = ? AND deleted_at IS NULL')
    .bind(c.req.param('id'), apiKey.id)
    .first<Check>();
  if (!check) return c.json({ error: 'check not found' }, 404);

  const host = new URL(c.req.url).host;
  return c.json({ check: checkResponse(check, host) });
});

app.patch('/checks/:id', async c => {
  const auth = await requireApiKey(c.env.DB, c.req.raw);
  if (!auth.ok) return c.json({ error: auth.error }, 401);
  const { apiKey } = auth;

  const existing = await c.env.DB
    .prepare('SELECT * FROM checks WHERE id = ? AND api_key_id = ? AND deleted_at IS NULL')
    .bind(c.req.param('id'), apiKey.id)
    .first<Check>();
  if (!existing) return c.json({ error: 'check not found' }, 404);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON body' }, 400);
  }

  const parsed = parseCheckInput(body as Record<string, unknown>, apiKey.tier, {
    name: existing.name,
    period_seconds: existing.period_seconds,
    grace_seconds: existing.grace_seconds,
    webhook_url: existing.webhook_url,
  });
  if (!parsed.ok) return c.json({ error: parsed.error }, 400);

  // Optimistic concurrency: two concurrent PATCHes to different fields of
  // the same check would otherwise both merge against this same `existing`
  // snapshot, and whichever UPDATE lands second silently overwrites the
  // first request's change (a lost update). Gating the UPDATE on the
  // `version` read alongside `existing` means a losing request's WHERE
  // clause matches zero rows instead of clobbering the winner.
  const nowIso = sqliteNow();
  const result = await c.env.DB
    .prepare(
      `UPDATE checks SET name = ?, period_seconds = ?, grace_seconds = ?, webhook_url = ?, updated_at = ?, version = version + 1
       WHERE id = ? AND version = ?`
    )
    .bind(
      parsed.value.name,
      parsed.value.period_seconds,
      parsed.value.grace_seconds,
      parsed.value.webhook_url,
      nowIso,
      existing.id,
      existing.version
    )
    .run();
  if (result.meta.changes === 0) {
    return c.json({ error: 'check was modified concurrently, please retry' }, 409);
  }

  const host = new URL(c.req.url).host;
  const updated: Check = { ...existing, ...parsed.value, updated_at: nowIso, version: existing.version + 1 };
  return c.json({ check: checkResponse(updated, host) });
});

app.delete('/checks/:id', async c => {
  const auth = await requireApiKey(c.env.DB, c.req.raw);
  if (!auth.ok) return c.json({ error: auth.error }, 401);
  const { apiKey } = auth;

  const nowIso = sqliteNow();
  const result = await c.env.DB
    .prepare('UPDATE checks SET deleted_at = ?, updated_at = ? WHERE id = ? AND api_key_id = ? AND deleted_at IS NULL')
    .bind(nowIso, nowIso, c.req.param('id'), apiKey.id)
    .run();

  if (result.meta.changes === 0) return c.json({ error: 'check not found' }, 404);
  return c.json({ ok: true, deleted: true });
});

// ─── Ping ingestion ──────────────────────────────────────────────────────────
// No API key required — the check id itself (a random UUID) is the
// credential, same pattern healthchecks.io popularized. This route is the
// one that will see by far the most traffic, so it is deliberately the
// cheapest path in the system: one SELECT (joined to read the account's
// tier for the interval-floor check) and, in the overwhelmingly common
// case, exactly one UPDATE. No history row is written here.

interface CheckWithTier extends Check {
  tier: Tier;
}

async function handlePing(c: Context<{ Bindings: Env }>) {
  const id = c.req.param('id');
  const row = await c.env.DB
    .prepare(
      `SELECT checks.*, api_keys.tier as tier
       FROM checks JOIN api_keys ON checks.api_key_id = api_keys.id
       WHERE checks.id = ? AND checks.deleted_at IS NULL`
    )
    .bind(id)
    .first<CheckWithTier>();

  if (!row) return c.json({ error: 'check not found' }, 404);

  const limit = TIER_LIMITS[row.tier];
  const now = new Date();
  const nowIso = sqliteNow(now);

  // Interval-floor enforcement: a ping arriving faster than the account's
  // tier allows is rejected before any write happens (the read above is
  // effectively free per Cloudflare's D1 pricing — reads are ~1000x cheaper
  // than writes — so rejecting here costs nothing worth worrying about).
  if (row.last_ping_at) {
    const elapsedSeconds = (now.getTime() - parseSqliteDate(row.last_ping_at).getTime()) / 1000;
    if (elapsedSeconds < limit.minIntervalSeconds) {
      return c.json(
        {
          error: `ping rejected — pings on the ${row.tier} tier must be at least ${limit.minIntervalSeconds}s apart`,
          min_interval_seconds: limit.minIntervalSeconds,
          retry_after_seconds: Math.max(0, Math.ceil(limit.minIntervalSeconds - elapsedSeconds)),
        },
        429
      );
    }
  }

  if (row.status === 'down') {
    // Recovery path — the only ping-triggered write that touches
    // check_events/webhook_deliveries, and only because a real transition
    // actually happened.
    await applyStatusChange(c.env.DB, row, 'up', 'down', nowIso);
  } else {
    // Common path — exactly one UPDATE, no history row.
    await c.env.DB
      .prepare('UPDATE checks SET last_ping_at = ?, updated_at = ? WHERE id = ?')
      .bind(nowIso, nowIso, row.id)
      .run();
  }

  return c.json({ ok: true, status: 'up', check_id: row.id });
}

app.get('/ping/:id', handlePing);
app.post('/ping/:id', handlePing);

// ─── 404 / error fallback ────────────────────────────────────────────────────

app.notFound(c => c.json({ error: 'not found' }, 404));
app.onError((err, c) => {
  console.error('Unhandled error:', err);
  return c.json({ error: 'internal server error' }, 500);
});

export default {
  fetch: app.fetch,
  async scheduled(_controller: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(runSweep(env.DB));
  },
};
