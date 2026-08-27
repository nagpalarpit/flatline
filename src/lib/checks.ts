// Flatline — check create/update input validation
//
// The period-floor check here is the other half of the interval-floor fix
// (the first half is enforced at ping time in src/index.ts): a check can't
// even be *configured* with an expected period below its tier's minimum
// interval, so the common case (a customer's cron actually matches what
// they declared) never gets near the abuse floor in the first place.

import type { Tier } from '../types';
import { TIER_LIMITS } from '../types';

const MAX_NAME_LENGTH = 200;
const MAX_PERIOD_SECONDS = 30 * 24 * 60 * 60; // 30 days — generous upper bound, prevents nonsense values
const MAX_GRACE_SECONDS = 7 * 24 * 60 * 60; // 7 days
const MAX_WEBHOOK_URL_LENGTH = 2048;

// --- SSRF-adjacent hardening: reject webhook_url hosts that are IP-literal
// loopback/link-local/private addresses, at config time. This is
// defense-in-depth against a customer (or a compromised account) pointing
// our outbound fetch at an internal target via an IP literal — it is
// explicitly NOT a defense against DNS rebinding (a hostname that resolves
// to a private address only at request time, after passing this check as a
// normal-looking public hostname). That's a real residual risk and is
// intentionally out of scope for this pass; see the implementation notes for detail.
//
// Handy side effect of using the WHATWG URL parser upstream of this check:
// it already canonicalizes IPv4 literals written in decimal/octal/hex form
// (e.g. `2130706433`, `0177.0.0.1`, `0x7f.0.0.1`) into standard dotted-quad
// notation, and wraps IPv6 literals in brackets and compresses them — so we
// only need to recognize the two canonical forms below, not every obscure
// encoding a URL can spell an IP address in.

function parseIPv4(host: string): [number, number, number, number] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!m) return null;
  const nums = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
  if (nums.some(n => n > 255)) return null;
  return nums as [number, number, number, number];
}

function isPrivateIPv4([a, b, c, d]: [number, number, number, number]): boolean {
  void c;
  void d;
  if (a === 127) return true; // 127.0.0.0/8 — loopback
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 — link-local, includes cloud metadata (169.254.169.254)
  if (a === 0) return true; // 0.0.0.0/8
  return false;
}

/** Expands a (bracket-stripped) IPv6 literal into 8 16-bit groups, or null if unparseable. */
function expandIPv6(addr: string): number[] | null {
  const zoneless = addr.split('%')[0]; // strip a zone id like %eth0 if present
  const parts = zoneless.split('::');
  if (parts.length > 2) return null; // more than one '::' is never valid

  const parseGroups = (s: string): number[] | null => {
    if (s === '') return [];
    const result: number[] = [];
    for (const g of s.split(':')) {
      if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
      result.push(parseInt(g, 16));
    }
    return result;
  };

  if (parts.length === 1) {
    const groups = parseGroups(parts[0]);
    return groups && groups.length === 8 ? groups : null;
  }

  const head = parseGroups(parts[0]);
  const tail = parseGroups(parts[1]);
  if (!head || !tail) return null;
  const missing = 8 - head.length - tail.length;
  if (missing < 0) return null;
  return [...head, ...Array(missing).fill(0), ...tail];
}

function isPrivateIPv6(groups: number[]): boolean {
  const [g0, g1, g2, g3, g4, g5, g6, g7] = groups;
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0 && g6 === 0 && g7 === 1) {
    return true; // ::1 — loopback
  }
  if ((g0 & 0xffc0) === 0xfe80) return true; // fe80::/10 — link-local
  if ((g0 & 0xfe00) === 0xfc00) return true; // fc00::/7 — unique local (ULA)
  // ::ffff:0:0/96 — IPv4-mapped IPv6; unwrap and re-check as IPv4.
  if (g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0 && g5 === 0xffff) {
    const mapped: [number, number, number, number] = [(g6 >> 8) & 0xff, g6 & 0xff, (g7 >> 8) & 0xff, g7 & 0xff];
    return isPrivateIPv4(mapped);
  }
  return false;
}

/** True if `hostname` (as given by `URL.hostname`) is a loopback/link-local/private IP literal or `localhost`. */
function isPrivateOrLoopbackHostname(hostname: string): boolean {
  const host = hostname.toLowerCase();

  if (host === 'localhost' || host.endsWith('.localhost')) return true;

  if (host.startsWith('[') && host.endsWith(']')) {
    const groups = expandIPv6(host.slice(1, -1));
    // Unparseable bracketed literal: fail closed rather than let a
    // malformed-but-URL-legal IPv6 literal slip past unrecognized.
    if (!groups) return true;
    return isPrivateIPv6(groups);
  }

  const v4 = parseIPv4(host);
  if (v4) return isPrivateIPv4(v4);

  return false; // ordinary hostname — DNS-rebinding is out of scope here
}

export interface CheckInput {
  name: string;
  period_seconds: number;
  grace_seconds: number;
  webhook_url: string | null;
}

export type ValidationResult = { ok: true; value: CheckInput } | { ok: false; error: string };

interface RawCheckBody {
  name?: unknown;
  period_seconds?: unknown;
  grace_seconds?: unknown;
  webhook_url?: unknown;
}

/**
 * Validates a create/update payload. `existing` supplies defaults for a
 * PATCH where the caller only sent a subset of fields.
 */
export function parseCheckInput(
  body: RawCheckBody,
  tier: Tier,
  existing?: Partial<CheckInput>
): ValidationResult {
  const limit = TIER_LIMITS[tier];

  const rawName = body.name !== undefined ? body.name : existing?.name;
  if (typeof rawName !== 'string' || rawName.trim().length === 0) {
    return { ok: false, error: 'name is required and must be a non-empty string' };
  }
  const name = rawName.trim().slice(0, MAX_NAME_LENGTH);

  const rawPeriod = body.period_seconds !== undefined ? body.period_seconds : existing?.period_seconds;
  const period = Number(rawPeriod);
  if (!Number.isInteger(period) || period <= 0) {
    return { ok: false, error: 'period_seconds is required and must be a positive integer' };
  }
  if (period > MAX_PERIOD_SECONDS) {
    return { ok: false, error: `period_seconds must not exceed ${MAX_PERIOD_SECONDS} (30 days)` };
  }
  if (period < limit.minIntervalSeconds) {
    return {
      ok: false,
      error: `period_seconds must be at least ${limit.minIntervalSeconds}s on the ${tier} tier`,
    };
  }

  // grace defaults to the period itself if omitted — generous, matches the
  // "don't punish a slightly-late job" instinct without any config burden.
  const rawGrace = body.grace_seconds !== undefined ? body.grace_seconds : existing?.grace_seconds;
  const grace = rawGrace === undefined || rawGrace === null ? period : Number(rawGrace);
  if (!Number.isInteger(grace) || grace < 0) {
    return { ok: false, error: 'grace_seconds must be a non-negative integer' };
  }
  if (grace > MAX_GRACE_SECONDS) {
    return { ok: false, error: `grace_seconds must not exceed ${MAX_GRACE_SECONDS} (7 days)` };
  }

  const rawWebhook = body.webhook_url !== undefined ? body.webhook_url : existing?.webhook_url;
  let webhook_url: string | null = null;
  if (rawWebhook !== undefined && rawWebhook !== null && rawWebhook !== '') {
    if (typeof rawWebhook !== 'string' || rawWebhook.length > MAX_WEBHOOK_URL_LENGTH) {
      return { ok: false, error: 'webhook_url must be a string' };
    }
    let parsed: URL;
    try {
      parsed = new URL(rawWebhook);
    } catch {
      return { ok: false, error: 'webhook_url must be a valid URL' };
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, error: 'webhook_url must use http:// or https://' };
    }
    if (isPrivateOrLoopbackHostname(parsed.hostname)) {
      return { ok: false, error: 'webhook_url must not point to a private, loopback, or link-local address' };
    }
    webhook_url = rawWebhook;
  }

  return { ok: true, value: { name, period_seconds: period, grace_seconds: grace, webhook_url } };
}
