-- Migration 0002: optimistic-concurrency version counter for checks
--
-- PATCH /checks/:id was a SELECT-then-merge-then-UPDATE-all-columns: two
-- concurrent PATCHes to different fields of the same check both merge their
-- partial input against the same stale `existing` snapshot, and whichever
-- UPDATE lands second silently overwrites the first request's field change
-- (a lost update). `updated_at` can't serve as the version token for this —
-- it has only second-level precision (see sqliteNow()), so two writes inside
-- the same wall-clock second collapse to the same string and the guard
-- would never trip. A dedicated integer counter is immune to that.

ALTER TABLE checks ADD COLUMN version INTEGER NOT NULL DEFAULT 1;
