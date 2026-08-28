import { describe, expect, it } from 'vitest';
import { createCheck, registerAccount, request, seedChecks, setAccountTier } from './helpers';

describe('POST /checks', () => {
  it('creates a check and returns a ping_url', async () => {
    const { apiKey } = await registerAccount();
    const { res, body } = await createCheck(apiKey, { name: 'Nightly Backup', period_seconds: 300 });
    expect(res.status).toBe(201);
    expect(body.check?.id).toBeTruthy();
    expect(body.check?.ping_url).toMatch(new RegExp(`/ping/${body.check?.id}$`));
    expect(body.check?.status).toBe('up');
    expect(body.check?.grace_seconds).toBe(300); // defaults to period_seconds
  });

  it('rejects requests with no API key', async () => {
    const res = await request('/checks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'x', period_seconds: 300 }),
    });
    expect(res.status).toBe(401);
  });

  it('rejects requests with an invalid API key', async () => {
    const res = await request('/checks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer sk_not_a_real_key' },
      body: JSON.stringify({ name: 'x', period_seconds: 300 }),
    });
    expect(res.status).toBe(401);
  });

  it('authenticates via the X-API-Key header, not just Authorization: Bearer', async () => {
    const { apiKey } = await registerAccount();
    const res = await request('/checks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({ name: 'x', period_seconds: 300 }),
    });
    expect(res.status).toBe(201);
  });

  it('rejects a missing name', async () => {
    const { apiKey } = await registerAccount();
    const { res, body } = await createCheck(apiKey, { name: '', period_seconds: 300 });
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/name/i);
  });

  it('truncates a name longer than 200 chars rather than rejecting it', async () => {
    const { apiKey } = await registerAccount();
    const { res, body } = await createCheck(apiKey, { name: 'x'.repeat(250), period_seconds: 300 });
    expect(res.status).toBe(201);
    expect(body.check?.name).toHaveLength(200);
  });

  it('rejects a period_seconds above the 30-day upper bound', async () => {
    const { apiKey } = await registerAccount();
    const { res, body } = await createCheck(apiKey, { period_seconds: 30 * 24 * 60 * 60 + 1 });
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/period_seconds/i);
  });

  it('rejects a grace_seconds above the 7-day upper bound', async () => {
    const { apiKey } = await registerAccount();
    const { res, body } = await createCheck(apiKey, { period_seconds: 300, grace_seconds: 7 * 24 * 60 * 60 + 1 });
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/grace_seconds/i);
  });

  it.each([
    ['a non-integer period_seconds', { period_seconds: 300.5 }, /period_seconds/i],
    ['a zero period_seconds', { period_seconds: 0 }, /period_seconds/i],
    ['a negative period_seconds', { period_seconds: -300 }, /period_seconds/i],
    ['a non-integer grace_seconds', { period_seconds: 300, grace_seconds: 60.5 }, /grace_seconds/i],
    ['a negative grace_seconds', { period_seconds: 300, grace_seconds: -1 }, /grace_seconds/i],
  ])('rejects %s', async (_label, overrides, errorPattern) => {
    const { apiKey } = await registerAccount();
    const { res, body } = await createCheck(apiKey, overrides);
    expect(res.status).toBe(400);
    expect(body.error).toMatch(errorPattern);
  });

  it('rejects an invalid webhook_url', async () => {
    const { apiKey } = await registerAccount();
    const { res, body } = await createCheck(apiKey, { webhook_url: 'not-a-url' });
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/webhook_url/i);
  });

  it('accepts a valid https webhook_url', async () => {
    const { apiKey } = await registerAccount();
    const { res, body } = await createCheck(apiKey, { webhook_url: 'https://hooks.example.com/alert' });
    expect(res.status).toBe(201);
    expect(body.check?.webhook_url).toBe('https://hooks.example.com/alert');
  });

  it.each([
    'http://127.0.0.1/hook',
    'http://localhost/hook',
    'http://sub.localhost/hook',
    'http://169.254.169.254/latest/meta-data', // cloud metadata endpoint
    'http://10.0.0.5/hook',
    'http://172.16.0.1/hook',
    'http://192.168.1.1/hook',
    'http://0.0.0.0/hook',
    'http://[::1]/hook',
    'http://[fe80::1]/hook',
    'http://2130706433/hook', // decimal-encoded 127.0.0.1
    'http://0177.0.0.1/hook', // octal-encoded 127.0.0.1
  ])('rejects a webhook_url pointing at a private/loopback address (%s)', async url => {
    const { apiKey } = await registerAccount();
    const { res, body } = await createCheck(apiKey, { webhook_url: url });
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/private|loopback|link-local/i);
  });

  it('enforces the free-tier check-count limit (25)', async () => {
    const { apiKey } = await registerAccount();
    for (let i = 0; i < 25; i++) {
      const { res } = await createCheck(apiKey, { name: `check-${i}`, period_seconds: 300 });
      expect(res.status).toBe(201);
    }
    const { res, body } = await createCheck(apiKey, { name: 'over-limit', period_seconds: 300 });
    expect(res.status).toBe(429);
    expect(body.error).toMatch(/limit/i);
  });

  // Same race qa-bach found and fixed for /register (commits d278978/
  // f4d61df), reproduced against POST /checks: a plain SELECT COUNT(*)
  // followed by a separate INSERT lets concurrent requests all read the
  // same pre-insert count and all pass the guard. Mirrors
  // register-rate-limit.test.ts's "allows exactly N successes under truly
  // concurrent requests... not more".
  it('allows exactly up-to-the-limit successes under truly concurrent requests, not more', async () => {
    const { apiKey } = await registerAccount();
    // Build the account up to maxChecks - 1 (24) sequentially first.
    for (let i = 0; i < 24; i++) {
      const { res } = await createCheck(apiKey, { name: `pre-${i}`, period_seconds: 300 });
      expect(res.status).toBe(201);
    }

    // Fire 10 concurrent requests at the 24/25 boundary — only 1 should
    // succeed (taking the account to exactly 25), the other 9 must be
    // rejected with 429.
    const results = await Promise.all(
      Array.from({ length: 10 }, (_, i) => createCheck(apiKey, { name: `concurrent-${i}`, period_seconds: 300 }))
    );
    const succeeded = results.filter(r => r.res.status === 201);
    const limited = results.filter(r => r.res.status === 429);
    expect(succeeded.length).toBe(1);
    expect(limited.length).toBe(9);

    const listRes = await request('/checks', { headers: { Authorization: `Bearer ${apiKey}` } });
    const finalChecks = await listRes.json<{ checks: unknown[] }>();
    expect(finalChecks.checks.length).toBe(25);
  });
});

describe('GET /checks and /checks/:id', () => {
  it('lists only the authenticated account\'s checks', async () => {
    const { apiKey: keyA } = await registerAccount();
    const { apiKey: keyB } = await registerAccount();
    await createCheck(keyA, { name: 'A1' });
    await createCheck(keyA, { name: 'A2' });
    await createCheck(keyB, { name: 'B1' });

    const resA = await request('/checks', { headers: { Authorization: `Bearer ${keyA}` } });
    const bodyA = await resA.json<{ checks: { name: string }[] }>();
    expect(bodyA.checks.map(c => c.name).sort()).toEqual(['A1', 'A2']);

    const resB = await request('/checks', { headers: { Authorization: `Bearer ${keyB}` } });
    const bodyB = await resB.json<{ checks: { name: string }[] }>();
    expect(bodyB.checks.map(c => c.name)).toEqual(['B1']);
  });

  it('returns 404 for a check owned by a different account', async () => {
    const { apiKey: keyA } = await registerAccount();
    const { apiKey: keyB } = await registerAccount();
    const { body } = await createCheck(keyA, { name: 'private' });

    const res = await request(`/checks/${body.check?.id}`, { headers: { Authorization: `Bearer ${keyB}` } });
    expect(res.status).toBe(404);
  });

  it('returns 404 for an unknown check id', async () => {
    const { apiKey } = await registerAccount();
    const res = await request(`/checks/${crypto.randomUUID()}`, { headers: { Authorization: `Bearer ${apiKey}` } });
    expect(res.status).toBe(404);
  });
});

describe('PATCH /checks/:id', () => {
  it('updates the fields provided and preserves the rest', async () => {
    const { apiKey } = await registerAccount();
    const { body } = await createCheck(apiKey, { name: 'Original', period_seconds: 300, grace_seconds: 60 });
    const id = body.check!.id;

    const res = await request(`/checks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ name: 'Renamed' }),
    });
    expect(res.status).toBe(200);
    const updated = await res.json<{ check: { name: string; period_seconds: number; grace_seconds: number } }>();
    expect(updated.check.name).toBe('Renamed');
    expect(updated.check.period_seconds).toBe(300);
    expect(updated.check.grace_seconds).toBe(60);
  });

  it('re-validates the tier floor on update', async () => {
    const { apiKey } = await registerAccount();
    const { body } = await createCheck(apiKey, { period_seconds: 300 });
    const res = await request(`/checks/${body.check!.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ period_seconds: 30 }),
    });
    expect(res.status).toBe(400);
  });

  it('clears an existing webhook_url when patched with an explicit empty string', async () => {
    const { apiKey } = await registerAccount();
    const { body } = await createCheck(apiKey, {
      period_seconds: 300,
      webhook_url: 'https://hooks.example.com/alert',
    });
    const id = body.check!.id;

    const res = await request(`/checks/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ webhook_url: '' }),
    });
    expect(res.status).toBe(200);
    const updated = await res.json<{ check: { webhook_url: string | null } }>();
    expect(updated.check.webhook_url).toBeNull();

    const get = await request(`/checks/${id}`, { headers: { Authorization: `Bearer ${apiKey}` } });
    const refetched = await get.json<{ check: { webhook_url: string | null } }>();
    expect(refetched.check.webhook_url).toBeNull();
  });
});

describe('DELETE /checks/:id', () => {
  it('soft-deletes a check so it no longer appears or resolves', async () => {
    const { apiKey } = await registerAccount();
    const { body } = await createCheck(apiKey);
    const id = body.check!.id;

    const del = await request(`/checks/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${apiKey}` } });
    expect(del.status).toBe(200);

    const get = await request(`/checks/${id}`, { headers: { Authorization: `Bearer ${apiKey}` } });
    expect(get.status).toBe(404);

    const ping = await request(`/ping/${id}`);
    expect(ping.status).toBe(404);
  });

  it('returns 404 deleting a check that does not belong to the caller', async () => {
    const { apiKey: keyA } = await registerAccount();
    const { apiKey: keyB } = await registerAccount();
    const { body } = await createCheck(keyA);

    const res = await request(`/checks/${body.check!.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${keyB}` },
    });
    expect(res.status).toBe(404);
  });
});

describe('tier-based period floor at creation', () => {
  it('rejects a free-tier check with period_seconds below 300', async () => {
    const { apiKey } = await registerAccount();
    const { res, body } = await createCheck(apiKey, { period_seconds: 60 });
    expect(res.status).toBe(400);
    expect(body.error).toMatch(/300/);
  });

  it('allows a pro-tier check with period_seconds as low as 60', async () => {
    const { apiKey } = await registerAccount();
    await setAccountTier(apiKey, 'pro');
    const { res } = await createCheck(apiKey, { period_seconds: 60 });
    expect(res.status).toBe(201);
  });

  it('enforces the pro-tier check-count limit (100)', async () => {
    const { apiKey } = await registerAccount();
    await setAccountTier(apiKey, 'pro');
    for (let i = 0; i < 100; i++) {
      const { res } = await createCheck(apiKey, { name: `p-${i}`, period_seconds: 60 });
      expect(res.status).toBe(201);
    }
    const { res } = await createCheck(apiKey, { name: 'over', period_seconds: 60 });
    expect(res.status).toBe(429);
  });

  it('enforces the business-tier check-count limit (1000)', async () => {
    const { apiKey } = await registerAccount();
    await setAccountTier(apiKey, 'business');
    // Seed 999 directly (bypassing HTTP) so the test isn't 1000 Worker
    // round-trips — the two HTTP calls below are what actually exercise the
    // boundary the same way the free/pro-tier tests do.
    await seedChecks(apiKey, 999);
    const { res: atLimit } = await createCheck(apiKey, { name: 'the-1000th', period_seconds: 60 });
    expect(atLimit.status).toBe(201);
    const { res: overLimit } = await createCheck(apiKey, { name: 'over', period_seconds: 60 });
    expect(overLimit.status).toBe(429);
  });
});
