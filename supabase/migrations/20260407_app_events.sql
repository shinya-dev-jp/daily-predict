-- ============================================================================
-- 20260407_app_events.sql
-- Minimal first-party analytics for Daily Predict.
-- Stores client-emitted events used to compute DAU, funnels, and feature usage.
-- All data stays in our own Supabase — no third-party tracker.
-- ============================================================================

CREATE TABLE IF NOT EXISTS app_events (
  id           BIGSERIAL PRIMARY KEY,
  user_address TEXT,                 -- nullable: pre-auth events allowed
  event_name   TEXT NOT NULL,
  metadata     JSONB,
  session_id   TEXT,
  locale       TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes tuned for the DAU / funnel queries we will run
CREATE INDEX IF NOT EXISTS idx_events_created_at
  ON app_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_user
  ON app_events (user_address)
  WHERE user_address IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_events_name_created
  ON app_events (event_name, created_at DESC);

-- DAU view: count of distinct verified users per UTC day
CREATE OR REPLACE VIEW daily_active_users AS
  SELECT
    DATE(created_at) AS day,
    COUNT(DISTINCT user_address) AS dau
  FROM app_events
  WHERE user_address IS NOT NULL
  GROUP BY DATE(created_at)
  ORDER BY day DESC;

-- Event funnel view: counts per event per day (last 30 days)
CREATE OR REPLACE VIEW event_counts_30d AS
  SELECT
    DATE(created_at) AS day,
    event_name,
    COUNT(*) AS count
  FROM app_events
  WHERE created_at >= NOW() - INTERVAL '30 days'
  GROUP BY DATE(created_at), event_name
  ORDER BY day DESC, count DESC;

-- Row-level security: writes go through service role only.
-- Reads via service role for admin dashboards.
ALTER TABLE app_events ENABLE ROW LEVEL SECURITY;

-- No public read/write policies — service role bypasses RLS by design.
-- This keeps event data private while allowing the /api/events endpoint
-- (which uses the service role key on the server) to insert freely.
