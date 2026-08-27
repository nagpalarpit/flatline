-- Flatline D1 Schema
-- Migration 0001: initial tables
--
-- Write-minimization design (see docs/fullstack/2026-08-25-flatline-v1-implementation.md):
-- a successful ping in the common case does exactly ONE write — an UPDATE of
-- `checks.last_ping_at` (and touching `status`/`last_state_change_at` only on
-- the rare down->up recovery path). There is no per-ping history log table.
-- `check_events` only ever receives a row on an actual status transition
-- (up->down via the cron sweep, or down->up via a recovery ping), which is
-- bounded by how often checks actually fail/recover, not by ping volume.

CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,
  email       TEXT UNIQUE NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS api_keys (
  id          TEXT PRIMARY KEY,
  user_id     TEXT NOT NULL,
  name        TEXT NOT NULL DEFAULT 'default',
  -- First 12 chars of the raw key, for display only (safe to store)
  key_prefix  TEXT NOT NULL,
  -- SHA-256 hex of the full raw key — used for lookup
  key_hash    TEXT UNIQUE NOT NULL,
  tier        TEXT NOT NULL DEFAULT 'free',   -- free | pro | business
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE INDEX IF NOT EXISTS idx_api_keys_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_api_keys_user ON api_keys(user_id);

-- `id` doubles as the unguessable ping token embedded in the ping URL
-- (POST/GET /ping/:id) — same pattern healthchecks.io popularized: a
-- 128-bit random UUID is the credential, no separate secret header needed
-- for the high-frequency ping path.
CREATE TABLE IF NOT EXISTS checks (
  id                    TEXT PRIMARY KEY,
  api_key_id            TEXT NOT NULL,
  name                  TEXT NOT NULL,
  -- Expected period between pings, and how much slack after the deadline
  -- before we consider the check overdue. Both in seconds.
  period_seconds        INTEGER NOT NULL,
  grace_seconds         INTEGER NOT NULL,
  webhook_url           TEXT,
  status                TEXT NOT NULL DEFAULT 'up',  -- up | down
  last_ping_at          TEXT,                        -- null until first ping
  last_state_change_at  TEXT NOT NULL DEFAULT (datetime('now')),
  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at            TEXT,                        -- soft delete
  FOREIGN KEY (api_key_id) REFERENCES api_keys(id)
);

CREATE INDEX IF NOT EXISTS idx_checks_api_key ON checks(api_key_id);
-- Backs both the cron sweep's overdue scan and the per-ping interval-floor
-- lookup (both filter on id/status and read last_ping_at).
CREATE INDEX IF NOT EXISTS idx_checks_status ON checks(status, last_ping_at);

-- One row per actual status transition, not per ping. This is the entire
-- "history" a v1 dead-man's-switch needs — when did it go down, when did it
-- recover — and keeps this table's write volume proportional to incidents,
-- not to traffic.
CREATE TABLE IF NOT EXISTS check_events (
  id            TEXT PRIMARY KEY,
  check_id      TEXT NOT NULL,
  from_status   TEXT NOT NULL,
  to_status     TEXT NOT NULL,
  occurred_at   TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (check_id) REFERENCES checks(id)
);

CREATE INDEX IF NOT EXISTS idx_check_events_check ON check_events(check_id);

-- One row per webhook delivery attempt. Also gated behind a status
-- transition (fired alongside the check_events row), so this scales with
-- incidents, not pings.
CREATE TABLE IF NOT EXISTS webhook_deliveries (
  id            TEXT PRIMARY KEY,
  check_id      TEXT NOT NULL,
  event_id      TEXT NOT NULL,
  url           TEXT NOT NULL,
  status_code   INTEGER,
  success       INTEGER NOT NULL DEFAULT 0,
  error         TEXT,
  attempted_at  TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (check_id) REFERENCES checks(id),
  FOREIGN KEY (event_id) REFERENCES check_events(id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_check ON webhook_deliveries(check_id);

-- Same IP-based registration throttle snapog shipped after the fact
-- (migration 0003 there, commits d278978/f4d61df) — applied from day one
-- here per the CFO's explicit recommendation, since a generous free tier
-- with no email verification is a structurally identical abuse target.
CREATE TABLE IF NOT EXISTS registration_attempts (
  id          TEXT PRIMARY KEY,
  ip          TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_registration_attempts_ip_created
  ON registration_attempts(ip, created_at);
