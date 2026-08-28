// Coverage for the IP-based rate limit on POST /register — same
// atomic-batch pattern snapog uses (see migrations/0001_init.sql's
// registration_attempts table and the guard clause at the top of
// app.post('/register', ...) in src/index.ts), applied here from day one
// per cfo-campbell's explicit recommendation rather than retrofitted later.
import { describe, expect, it } from 'vitest';
import { env, registerAccount, request } from './helpers';

function registerJson(email: string, ip: string) {
  return request('/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip },
    body: JSON.stringify({ email }),
  });
}

describe('POST /register — IP rate limiting', () => {
  it('allows registrations up to the limit from the same IP', async () => {
    const ip = `1.2.3.${crypto.randomUUID().slice(0, 4)}`;
    for (let i = 0; i < 5; i++) {
      const { res } = await registerAccount({ ip });
      expect(res.status).toBe(201);
    }
  });

  it('rejects the request that exceeds the limit with a 429', async () => {
    const ip = `5.6.7.${crypto.randomUUID().slice(0, 4)}`;
    for (let i = 0; i < 5; i++) {
      const { res } = await registerAccount({ ip });
      expect(res.status).toBe(201);
    }

    const res = await registerJson(`overflow-${crypto.randomUUID()}@flatline.test`, ip);
    expect(res.status).toBe(429);
    const body = await res.json<{ error: string }>();
    expect(body.error).toMatch(/too many/i);
  });

  it('does not let one IP exhausting its limit affect a different IP', async () => {
    const ipA = `10.0.0.${crypto.randomUUID().slice(0, 4)}`;
    const ipB = `10.0.1.${crypto.randomUUID().slice(0, 4)}`;

    for (let i = 0; i < 5; i++) {
      const { res } = await registerAccount({ ip: ipA });
      expect(res.status).toBe(201);
    }
    const overLimit = await registerJson(`blocked-${crypto.randomUUID()}@flatline.test`, ipA);
    expect(overLimit.status).toBe(429);

    const { res } = await registerAccount({ ip: ipB });
    expect(res.status).toBe(201);
  });

  it('allows exactly 5 successes under truly concurrent requests from one IP, not more', async () => {
    const ip = `203.0.113.${crypto.randomUUID().slice(0, 4)}`;
    const results = await Promise.all(
      Array.from({ length: 10 }, () => registerJson(`concurrent-${crypto.randomUUID()}@flatline.test`, ip))
    );
    const succeeded = results.filter(res => res.status === 201);
    const limited = results.filter(res => res.status === 429);
    expect(succeeded.length).toBe(5);
    expect(limited.length).toBe(5);
  });

  it('prunes attempts older than 24 hours as a side effect of the next registration', async () => {
    const staleIp = `172.16.0.${crypto.randomUUID().slice(0, 4)}`;
    await env.DB
      .prepare(`INSERT INTO registration_attempts (id, ip, created_at) VALUES (?, ?, datetime('now', '-25 hours'))`)
      .bind(crypto.randomUUID(), staleIp)
      .run();

    const { res } = await registerAccount({ ip: `172.16.1.${crypto.randomUUID().slice(0, 4)}` });
    expect(res.status).toBe(201);

    const remaining = await env.DB
      .prepare('SELECT COUNT(*) as count FROM registration_attempts WHERE ip = ?')
      .bind(staleIp)
      .first<{ count: number }>();
    expect(remaining?.count ?? 0).toBe(0);
  });
});
