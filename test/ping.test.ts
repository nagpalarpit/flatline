// Ping ingestion + the tier-based interval-floor fix required by
// an earlier design review: pricing meters check count,
// but Cloudflare cost/abuse-potential scales with ping *volume*, so pings
// arriving faster than the account's tier floor must be rejected before any
// write happens (free: 300s, pro/business: 60s — see src/types.ts).
import { fetchMock } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { parseSqliteDate } from '../src/lib/time';
import { createCheck, env, registerAccount, request, secondsAgoIso, setAccountTier, setCheckTimestamps } from './helpers';

beforeAll(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});

describe('GET/POST /ping/:id — ingestion', () => {
  it('returns 404 for an unknown check id', async () => {
    const res = await request(`/ping/${crypto.randomUUID()}`);
    expect(res.status).toBe(404);
  });

  it('accepts a GET ping (cron-friendly curl) and records last_ping_at', async () => {
    const { apiKey } = await registerAccount();
    const { body } = await createCheck(apiKey, { period_seconds: 300 });
    const id = body.check!.id;

    const res = await request(`/ping/${id}`);
    expect(res.status).toBe(200);
    const payload = await res.json<{ ok: boolean; status: string }>();
    expect(payload.ok).toBe(true);
    expect(payload.status).toBe('up');

    const row = await env.DB.prepare('SELECT last_ping_at FROM checks WHERE id = ?').bind(id).first<{
      last_ping_at: string | null;
    }>();
    expect(row?.last_ping_at).toBeTruthy();
  });

  it('accepts a POST ping identically to GET', async () => {
    const { apiKey } = await registerAccount();
    const { body } = await createCheck(apiKey, { period_seconds: 300 });
    const res = await request(`/ping/${body.check!.id}`, { method: 'POST' });
    expect(res.status).toBe(200);
  });

  it('does not require an API key to ping — the check id is the credential', async () => {
    const { apiKey } = await registerAccount();
    const { body } = await createCheck(apiKey);
    const res = await request(`/ping/${body.check!.id}`); // no Authorization header
    expect(res.status).toBe(200);
  });
});

describe('GET/POST /ping/:id — tier interval floor', () => {
  it('rejects a second free-tier ping arriving under 300s later, with no write', async () => {
    const { apiKey } = await registerAccount();
    const { body } = await createCheck(apiKey, { period_seconds: 300 });
    const id = body.check!.id;

    // Seed a last_ping_at 60s ago — well under the free tier's 300s floor.
    await setCheckTimestamps(id, { last_ping_at: secondsAgoIso(60) });

    const res = await request(`/ping/${id}`);
    expect(res.status).toBe(429);
    const payload = await res.json<{ min_interval_seconds: number }>();
    expect(payload.min_interval_seconds).toBe(300);

    // Rejected ping must not have advanced last_ping_at.
    const row = await env.DB.prepare('SELECT last_ping_at FROM checks WHERE id = ?').bind(id).first<{
      last_ping_at: string;
    }>();
    expect(parseSqliteDate(row!.last_ping_at).getTime()).toBeLessThan(Date.now() - 55_000);
  });

  it('accepts a free-tier ping arriving 300s or more after the last one', async () => {
    const { apiKey } = await registerAccount();
    const { body } = await createCheck(apiKey, { period_seconds: 300 });
    const id = body.check!.id;

    await setCheckTimestamps(id, { last_ping_at: secondsAgoIso(301) });

    const res = await request(`/ping/${id}`);
    expect(res.status).toBe(200);
  });

  it('rejects a pro-tier ping arriving under 60s later', async () => {
    const { apiKey } = await registerAccount();
    await setAccountTier(apiKey, 'pro');
    const { body } = await createCheck(apiKey, { period_seconds: 60 });
    const id = body.check!.id;

    await setCheckTimestamps(id, { last_ping_at: secondsAgoIso(30) });

    const res = await request(`/ping/${id}`);
    expect(res.status).toBe(429);
    const payload = await res.json<{ min_interval_seconds: number }>();
    expect(payload.min_interval_seconds).toBe(60);
  });

  it('accepts a pro-tier ping arriving 60s or more after the last one — tighter than free tier allows', async () => {
    const { apiKey } = await registerAccount();
    await setAccountTier(apiKey, 'pro');
    const { body } = await createCheck(apiKey, { period_seconds: 60 });
    const id = body.check!.id;

    await setCheckTimestamps(id, { last_ping_at: secondsAgoIso(61) });

    const res = await request(`/ping/${id}`);
    expect(res.status).toBe(200);
  });

  it('business tier shares the pro-tier 60s floor', async () => {
    const { apiKey } = await registerAccount();
    await setAccountTier(apiKey, 'business');
    const { body } = await createCheck(apiKey, { period_seconds: 60 });
    const id = body.check!.id;

    await setCheckTimestamps(id, { last_ping_at: secondsAgoIso(45) });
    const rejected = await request(`/ping/${id}`);
    expect(rejected.status).toBe(429);

    await setCheckTimestamps(id, { last_ping_at: secondsAgoIso(61) });
    const accepted = await request(`/ping/${id}`);
    expect(accepted.status).toBe(200);
  });
});

describe('GET/POST /ping/:id — recovery path', () => {
  it('flips a down check back to up, records a check_event, and fires the webhook', async () => {
    const origin = fetchMock.get('https://hooks.example.test');
    origin.intercept({ path: '/alert', method: 'POST' }).reply(200, 'ok');

    const { apiKey } = await registerAccount();
    const { body } = await createCheck(apiKey, {
      period_seconds: 300,
      webhook_url: 'https://hooks.example.test/alert',
    });
    const id = body.check!.id;

    // Force the check into 'down' directly, simulating a prior sweep transition.
    await env.DB.prepare("UPDATE checks SET status = 'down' WHERE id = ?").bind(id).run();

    const res = await request(`/ping/${id}`);
    expect(res.status).toBe(200);

    const row = await env.DB.prepare('SELECT status FROM checks WHERE id = ?').bind(id).first<{ status: string }>();
    expect(row?.status).toBe('up');

    const event = await env.DB
      .prepare("SELECT from_status, to_status FROM check_events WHERE check_id = ? ORDER BY occurred_at DESC LIMIT 1")
      .bind(id)
      .first<{ from_status: string; to_status: string }>();
    expect(event?.from_status).toBe('down');
    expect(event?.to_status).toBe('up');

    const delivery = await env.DB
      .prepare('SELECT success FROM webhook_deliveries WHERE check_id = ?')
      .bind(id)
      .first<{ success: number }>();
    expect(delivery?.success).toBe(1);
  });

  it('a routine (non-recovery) ping never writes a check_events row', async () => {
    const { apiKey } = await registerAccount();
    const { body } = await createCheck(apiKey, { period_seconds: 300 });
    const id = body.check!.id;

    await request(`/ping/${id}`);
    await setCheckTimestamps(id, { last_ping_at: secondsAgoIso(301) });
    await request(`/ping/${id}`);

    const count = await env.DB.prepare('SELECT COUNT(*) as cnt FROM check_events WHERE check_id = ?').bind(id).first<{
      cnt: number;
    }>();
    expect(count?.cnt).toBe(0);
  });
});
