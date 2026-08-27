import { describe, expect, it } from 'vitest';
import { env, registerAccount, request, sha256Hex } from './helpers';

describe('POST /register', () => {
  it('creates a free-tier account and returns a raw API key', async () => {
    const { res, apiKey, email } = await registerAccount();
    expect(res.status).toBe(201);
    expect(apiKey).toMatch(/^sk_[0-9a-f]{64}$/);

    const hash = await sha256Hex(apiKey);
    const row = await env.DB.prepare('SELECT tier, key_prefix FROM api_keys WHERE key_hash = ?').bind(hash).first<{
      tier: string;
      key_prefix: string;
    }>();
    expect(row?.tier).toBe('free');
    expect(row?.key_prefix).toBe(apiKey.slice(0, 12));

    const user = await env.DB.prepare('SELECT email FROM users WHERE email = ?').bind(email).first<{ email: string }>();
    expect(user?.email).toBe(email);
  });

  it('rejects an invalid email', async () => {
    const res = await request('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'not-an-email' }),
    });
    expect(res.status).toBe(400);
  });

  it('rejects malformed JSON', async () => {
    const res = await request('/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json',
    });
    expect(res.status).toBe(400);
  });

  it('reuses the same user row for a repeat registration with the same email but issues a distinct key', async () => {
    const email = `dup-${crypto.randomUUID()}@flatline.test`;
    const first = await registerAccount({ email });
    const second = await registerAccount({ email });
    expect(first.apiKey).not.toBe(second.apiKey);

    const userCount = await env.DB.prepare('SELECT COUNT(*) as cnt FROM users WHERE email = ?').bind(email).first<{
      cnt: number;
    }>();
    expect(userCount?.cnt).toBe(1);
  });
});
