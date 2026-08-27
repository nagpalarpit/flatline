// Flatline — the cron sweep (runs every minute via [triggers] crons in
// wrangler.toml)
//
// This is deliberately the primary write-heavy path in the system, not the
// ping path. Write volume here is bounded by how many checks are actually
// overdue in a given minute — a function of real incidents — rather than by
// inbound ping traffic, which is what let a single Business-tier customer's
// legitimate max-volume usage threaten to flip to negative gross margin
// (see the v1 implementation notes and
// the unit-economics analysis).

import type { Check, CheckStatus } from '../types';
import { applyStatusChange } from './transition';
import { sqliteNow } from './time';

export interface SweepResult {
  checked_at: string;
  transitioned: Array<{ check: Check; toStatus: CheckStatus }>;
}

/**
 * Finds checks that are currently `up` but have gone silent past
 * `period_seconds + grace_seconds` (measured from their last ping, or from
 * creation if they've never been pinged), flips them to `down`, records a
 * `check_events` row, and fires the configured webhook (if any).
 */
export async function runSweep(db: D1Database, now: Date = new Date()): Promise<SweepResult> {
  const nowIso = sqliteNow(now);

  const { results: overdue } = await db
    .prepare(
      `SELECT * FROM checks
       WHERE deleted_at IS NULL
         AND status = 'up'
         AND datetime(COALESCE(last_ping_at, created_at), '+' || (period_seconds + grace_seconds) || ' seconds') < datetime(?)`
    )
    .bind(nowIso)
    .all<Check>();

  const transitioned: SweepResult['transitioned'] = [];

  for (const check of overdue) {
    await applyStatusChange(db, check, 'down', 'up', nowIso);
    transitioned.push({ check: { ...check, status: 'down', last_state_change_at: nowIso }, toStatus: 'down' });
  }

  return { checked_at: nowIso, transitioned };
}
