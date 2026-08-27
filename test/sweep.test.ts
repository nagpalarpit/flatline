// The cron sweep is the primary write-heavy path by design (see
// src/lib/sweep.ts) — it's what turns an overdue check into a `down` status,
// a single check_events row, and a fired webhook, without any of that
// depending on ping volume.
import { fetchMock } from 'cloudflare:test';
import { beforeAll, describe, expect, it } from 'vitest';
import { createCheck, env, registerAccount, request, runScheduledSweep, secondsAgoIso, setCheckTimestamps } from './helpers';

beforeAll(() => {
  fetchMock.activate();
  fetchMock.disableNetConnect();
});

describe('scheduled() cron sweep', () => {
  it('flags a check overdue past period+grace and leaves a fresh check alone', async () => {
    const { apiKey } = await registerAccount();

    const { body: overdueBody } = await createCheck(apiKey, {
      name: 'Overdue Job',
      period_seconds: 300,
      grace_seconds: 60,
    });
    const overdueId = overdueBody.check!.id;
    // Last ping 400s ago > period(300) + grace(60) = 360s threshold.
    await setCheckTimestamps(overdueId, { last_ping_at: secondsAgoIso(400) });

    const { body: freshBody } = await createCheck(apiKey, {
      name: 'Fresh Job',
      period_seconds: 300,
      grace_seconds: 60,
    });
    const freshId = freshBody.check!.id;
    await setCheckTimestamps(freshId, { last_ping_at: secondsAgoIso(100) });

    await runScheduledSweep();

    const overdueRow = await env.DB.prepare('SELECT status FROM checks WHERE id = ?').bind(overdueId).first<{
      status: string;
    }>();
    expect(overdueRow?.status).toBe('down');

    const freshRow = await env.DB.prepare('SELECT status FROM checks WHERE id = ?').bind(freshId).first<{
      status: string;
    }>();
    expect(freshRow?.status).toBe('up');

    const event = await env.DB
      .prepare('SELECT from_status, to_status FROM check_events WHERE check_id = ?')
      .bind(overdueId)
      .first<{ from_status: string; to_status: string }>();
    expect(event).toEqual({ from_status: 'up', to_status: 'down' });

    const noEvent = await env.DB
      .prepare('SELECT COUNT(*) as cnt FROM check_events WHERE check_id = ?')
      .bind(freshId)
      .first<{ cnt: number }>();
    expect(noEvent?.cnt).toBe(0);
  });

  it('treats a never-pinged check as overdue once period+grace has elapsed since creation', async () => {
    const { apiKey } = await registerAccount();
    const { body } = await createCheck(apiKey, { period_seconds: 300, grace_seconds: 0 });
    const id = body.check!.id;
    await setCheckTimestamps(id, { created_at: secondsAgoIso(301) });

    await runScheduledSweep();

    const row = await env.DB.prepare('SELECT status, last_ping_at FROM checks WHERE id = ?').bind(id).first<{
      status: string;
      last_ping_at: string | null;
    }>();
    expect(row?.status).toBe('down');
    expect(row?.last_ping_at).toBeNull();
  });

  it('fires the configured webhook on the down transition and logs the delivery', async () => {
    const origin = fetchMock.get('https://hooks.example.test');
    origin
      .intercept({ path: '/incident', method: 'POST' })
      .reply(200, (opts: { body?: unknown }) => {
        const payload = JSON.parse(String(opts.body)) as { status: string; check_name: string; text: string };
        expect(payload.status).toBe('down');
        expect(payload.check_name).toBe('Payroll Sync');
        expect(payload.text).toMatch(/DOWN/);
        return 'ok';
      });

    const { apiKey } = await registerAccount();
    const { body } = await createCheck(apiKey, {
      name: 'Payroll Sync',
      period_seconds: 300,
      grace_seconds: 0,
      webhook_url: 'https://hooks.example.test/incident',
    });
    const id = body.check!.id;
    await setCheckTimestamps(id, { last_ping_at: secondsAgoIso(301) });

    await runScheduledSweep();

    const delivery = await env.DB
      .prepare('SELECT url, success, status_code FROM webhook_deliveries WHERE check_id = ?')
      .bind(id)
      .first<{ url: string; success: number; status_code: number }>();
    expect(delivery?.url).toBe('https://hooks.example.test/incident');
    expect(delivery?.success).toBe(1);
    expect(delivery?.status_code).toBe(200);
  });

  it('records a failed delivery without throwing when the webhook endpoint errors', async () => {
    const origin = fetchMock.get('https://hooks.example.test');
    origin.intercept({ path: '/flaky', method: 'POST' }).reply(500, 'nope');

    const { apiKey } = await registerAccount();
    const { body } = await createCheck(apiKey, {
      period_seconds: 300,
      grace_seconds: 0,
      webhook_url: 'https://hooks.example.test/flaky',
    });
    const id = body.check!.id;
    await setCheckTimestamps(id, { last_ping_at: secondsAgoIso(301) });

    await runScheduledSweep();

    const row = await env.DB.prepare('SELECT status FROM checks WHERE id = ?').bind(id).first<{ status: string }>();
    expect(row?.status).toBe('down'); // the transition itself still happened

    const delivery = await env.DB
      .prepare('SELECT success, status_code FROM webhook_deliveries WHERE check_id = ?')
      .bind(id)
      .first<{ success: number; status_code: number }>();
    expect(delivery?.success).toBe(0);
    expect(delivery?.status_code).toBe(500);
  });

  it('treats a redirect from the webhook endpoint as a failed delivery instead of following it', async () => {
    // fireWebhook uses redirect: 'manual' specifically so a webhook_url that
    // passed config-time validation as a legitimate public host can't 30x to
    // an internal target at delivery time. A mocked 302 here proves that
    // path is actually exercised, not just present in the code.
    const origin = fetchMock.get('https://hooks.example.test');
    origin
      .intercept({ path: '/redirect-me', method: 'POST' })
      .reply(302, '', { headers: { location: 'http://169.254.169.254/' } });

    const { apiKey } = await registerAccount();
    const { body } = await createCheck(apiKey, {
      period_seconds: 300,
      grace_seconds: 0,
      webhook_url: 'https://hooks.example.test/redirect-me',
    });
    const id = body.check!.id;
    await setCheckTimestamps(id, { last_ping_at: secondsAgoIso(301) });

    await runScheduledSweep();

    const delivery = await env.DB
      .prepare('SELECT success FROM webhook_deliveries WHERE check_id = ?')
      .bind(id)
      .first<{ success: number }>();
    expect(delivery?.success).toBe(0);
  });

  it('records a failed delivery with an error message on a network failure, without throwing', async () => {
    // The catch (err) branch in fireWebhook — DNS failure, connection
    // refused, or the 5s AbortController timeout — is the one path that, if
    // broken, could throw out of applyStatusChange and abort the sweep for
    // every other overdue check in the same batch.
    const origin = fetchMock.get('https://hooks.example.test');
    origin.intercept({ path: '/unreachable', method: 'POST' }).replyWithError(new Error('ECONNREFUSED'));

    const { apiKey } = await registerAccount();
    const { body } = await createCheck(apiKey, {
      period_seconds: 300,
      grace_seconds: 0,
      webhook_url: 'https://hooks.example.test/unreachable',
    });
    const id = body.check!.id;
    await setCheckTimestamps(id, { last_ping_at: secondsAgoIso(301) });

    await expect(runScheduledSweep()).resolves.not.toThrow();

    const row = await env.DB.prepare('SELECT status FROM checks WHERE id = ?').bind(id).first<{ status: string }>();
    expect(row?.status).toBe('down'); // the transition itself still happened

    const delivery = await env.DB
      .prepare('SELECT success, status_code, error FROM webhook_deliveries WHERE check_id = ?')
      .bind(id)
      .first<{ success: number; status_code: number | null; error: string | null }>();
    expect(delivery?.success).toBe(0);
    expect(delivery?.status_code).toBeNull();
    expect(delivery?.error).toBeTruthy();
  });

  it('does not re-fire for a check that is already down', async () => {
    const { apiKey } = await registerAccount();
    const { body } = await createCheck(apiKey, { period_seconds: 300, grace_seconds: 0 });
    const id = body.check!.id;
    await setCheckTimestamps(id, { last_ping_at: secondsAgoIso(301) });

    await runScheduledSweep();
    await runScheduledSweep();

    const count = await env.DB.prepare('SELECT COUNT(*) as cnt FROM check_events WHERE check_id = ?').bind(id).first<{
      cnt: number;
    }>();
    expect(count?.cnt).toBe(1);
  });

  it('does not sweep a soft-deleted check', async () => {
    const { apiKey } = await registerAccount();
    const { body } = await createCheck(apiKey, { period_seconds: 300, grace_seconds: 0 });
    const id = body.check!.id;
    await setCheckTimestamps(id, { last_ping_at: secondsAgoIso(301) });
    await request(`/checks/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${apiKey}` } });

    await runScheduledSweep();

    const row = await env.DB.prepare('SELECT status FROM checks WHERE id = ?').bind(id).first<{ status: string }>();
    expect(row?.status).toBe('up'); // untouched — sweep skips deleted checks
  });
});
