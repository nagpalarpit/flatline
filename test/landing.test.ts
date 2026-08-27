// Coverage for GET / — the Carbon Terminal landing page shipped per
// the landing page design notes. Snapog has no equivalent
// dedicated landing-route test (its GET / was never covered either), so this
// is a new file rather than a mirrored one.
import { describe, expect, it } from 'vitest';
import { request } from './helpers';

describe('GET /', () => {
  it('returns 200 HTML with the hero tagline and pricing tier names', async () => {
    const res = await request('/');
    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/html');
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=86400, s-maxage=604800');

    const html = await res.text();
    expect(html).toContain('We watch your heartbeat.');
    expect(html).toContain('You only hear from us when it');

    // Pricing tiers, real TIER_LIMITS values
    expect(html).toContain('Free');
    expect(html).toContain('25 checks · 5-min minimum interval');
    expect(html).toContain('Pro');
    expect(html).toContain('100 checks · 1-min minimum interval');
    expect(html).toContain('Business');
    expect(html).toContain('1,000 checks · 1-min minimum interval');

    // Zero-signup section required by the critic's binding condition
    expect(html).toContain('id="get-alerted"');
    expect(html).toContain('Discord');
    expect(html).toContain('Zapier');

    // snapog cross-link, and no banned "ecosystem" language anywhere
    expect(html).toContain('https://snapog.dev');
    expect(html.toLowerCase()).not.toContain('flywheel');
    expect(html.toLowerCase()).not.toContain('ecosystem');
    expect(html.toLowerCase()).not.toContain('suite');
  });
});
