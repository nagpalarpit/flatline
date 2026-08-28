import { describe, expect, it } from 'vitest';
import { request } from './helpers';

describe('GET /health', () => {
  it('returns 200 with an ok payload', async () => {
    const res = await request('/health');
    expect(res.status).toBe(200);
    const body = await res.json<{ ok: boolean; ts: string }>();
    expect(body.ok).toBe(true);
    expect(typeof body.ts).toBe('string');
    expect(() => new Date(body.ts).toISOString()).not.toThrow();
  });
});

// GET / now serves the HTML landing page (see test/landing.test.ts) rather
// than a JSON info payload — moved there when the Carbon Terminal landing
// page shipped per docs/ui/2026-08-27-flatline-landing-direction.md.
