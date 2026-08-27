// Flatline — API key helpers (same hashing/lookup pattern as snapog)

import type { ApiKey } from '../types';

export async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}

export function generateRawKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return 'sk_' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Extracts a raw API key from `Authorization: Bearer <key>` or `X-API-Key`. */
export function extractRawKey(req: Request): string | null {
  const authHeader = req.headers.get('Authorization');
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim() || null;
  }
  return req.headers.get('X-API-Key');
}

export async function resolveApiKey(db: D1Database, rawKey: string | null): Promise<ApiKey | null> {
  if (!rawKey) return null;
  const hash = await sha256Hex(rawKey);
  const row = await db.prepare('SELECT * FROM api_keys WHERE key_hash = ?').bind(hash).first<ApiKey>();
  return row ?? null;
}
