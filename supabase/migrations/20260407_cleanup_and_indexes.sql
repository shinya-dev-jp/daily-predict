-- ============================================================================
-- 20260407_cleanup_and_indexes.sql
-- Loop 6 cleanup: drop dead schema, add missing performance indexes.
-- ============================================================================

-- ── Drop dead column ─────────────────────────────────────────────────────────
-- last_correct_date was declared in the initial schema but never read or
-- written by any application code. Streak tracking happens via the `streak`
-- counter on resolution.
ALTER TABLE users DROP COLUMN IF EXISTS last_correct_date;

-- ── Drop dead materialized view ──────────────────────────────────────────────
-- weekly_leaderboard was declared but never refreshed and never queried.
-- /api/leaderboard reads from the users table directly.
DROP MATERIALIZED VIEW IF EXISTS weekly_leaderboard;

-- ── Performance indexes ──────────────────────────────────────────────────────

-- cron/generate's "does today's question exist?" filter:
--   WHERE created_at >= <jst-start> AND status IN ('open','closed')
-- Without this, the cron does a full table scan once a day.
CREATE INDEX IF NOT EXISTS idx_predictions_created_at
  ON predictions (created_at DESC);

-- cron/resolve's idempotency check (Loop 5):
--   WHERE prediction_id = ? AND is_correct IS NULL
-- A partial index makes this query touch only unresolved rows.
CREATE INDEX IF NOT EXISTS idx_up_pending
  ON user_predictions (prediction_id)
  WHERE is_correct IS NULL;

-- /api/question's "yesterday resolved" filter:
--   WHERE status = 'resolved' AND created_at BETWEEN ? AND ?
CREATE INDEX IF NOT EXISTS idx_predictions_resolved_created
  ON predictions (status, created_at DESC)
  WHERE status = 'resolved';
