// Flatline — shared types

export type Tier = 'free' | 'pro' | 'business';

export type CheckStatus = 'up' | 'down';

export interface TierLimit {
  /** Max active (non-deleted) checks an account on this tier may have. */
  maxChecks: number;
  /**
   * Minimum allowed seconds between two accepted pings on a single check,
   * and the minimum allowed `period_seconds` when creating/updating a check.
   * This is the fix for the abuse/quota risk flagged by critic-munger and
   * cfo-campbell: pricing meters check *count*, but Cloudflare cost and
   * request-quota exposure scale with ping *volume*. Capping the floor per
   * tier bounds worst-case volume regardless of how many checks an account
   * configures.
   */
  minIntervalSeconds: number;
}

export const TIER_LIMITS: Record<Tier, TierLimit> = {
  // Free: 25 checks, 5-minute floor -> worst case 25 * (86400/300) = 7,200
  // pings/day/account, versus 36,000/day under an unenforced 1-minute floor.
  free: { maxChecks: 25, minIntervalSeconds: 300 },
  // Pro / Business: 1-minute floor, matching the CEO's original spec — these
  // are paying tiers, and the write-minimization fix (state-change-only
  // history writes) is what keeps their worst case margin-positive rather
  // than the ping-interval floor.
  pro: { maxChecks: 100, minIntervalSeconds: 60 },
  business: { maxChecks: 1000, minIntervalSeconds: 60 },
};

export interface User {
  id: string;
  email: string;
  created_at: string;
}

export interface ApiKey {
  id: string;
  user_id: string;
  name: string;
  key_prefix: string;
  key_hash: string;
  tier: Tier;
  created_at: string;
}

export interface Check {
  id: string;
  api_key_id: string;
  name: string;
  period_seconds: number;
  grace_seconds: number;
  webhook_url: string | null;
  status: CheckStatus;
  last_ping_at: string | null;
  last_state_change_at: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface CheckEvent {
  id: string;
  check_id: string;
  from_status: CheckStatus;
  to_status: CheckStatus;
  occurred_at: string;
}

export interface WebhookDelivery {
  id: string;
  check_id: string;
  event_id: string;
  url: string;
  status_code: number | null;
  success: number;
  error: string | null;
  attempted_at: string;
}

export interface Env {
  DB: D1Database;
  ENVIRONMENT: string;
}
