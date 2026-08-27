// Flatline — timestamp formatting
//
// SQLite's own `datetime('now')` (used in column DEFAULTs) produces a
// canonical "YYYY-MM-DD HH:MM:SS" string (UTC, space separator, no
// milliseconds, no 'Z'). If application code wrote `Date.toISOString()`
// values ("YYYY-MM-DDTHH:MM:SS.sssZ") into the same columns, chronological
// comparisons (including the sweep's `datetime(col, '+N seconds') < ?`
// query) would be comparing two different string shapes — safe most of the
// time, but not something worth relying on across SQLite versions. Every
// timestamp this app writes goes through `sqliteNow()` so every value in
// every timestamp column — whether written by SQLite's DEFAULT or by us —
// is in the exact same comparable, sortable format.

export function sqliteNow(d: Date = new Date()): string {
  return d.toISOString().replace('T', ' ').slice(0, 19);
}

/** Parses a value written by `sqliteNow()` (or SQLite's own `datetime('now')`) back into a JS Date, as UTC. */
export function parseSqliteDate(value: string): Date {
  return new Date(`${value.replace(' ', 'T')}Z`);
}
