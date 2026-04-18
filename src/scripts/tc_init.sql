-- TuringVote — Supabase initial schema
-- Apply this in Supabase SQL Editor for the `world-apps` project.
--
-- Tables:
--   tc_questions  — 30 neutral 2-choice questions (seeded from src/data/tc_questions.json)
--   tc_votes      — one vote per (nullifier_hash, question_id)
--
-- Safety:
--   - RLS enabled on both tables.
--   - Public read for aggregate tallies. Writes only through service-role API.
--   - UNIQUE(nullifier_hash, question_id) enforces "one verified human, one vote".

-- ─────────────────────────────────────────────────────────────────────────────
-- tc_questions
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tc_questions (
  id            INTEGER PRIMARY KEY,
  category      TEXT NOT NULL,
  ja_prompt     TEXT NOT NULL,
  ja_option_a   TEXT NOT NULL,
  ja_option_b   TEXT NOT NULL,
  en_prompt     TEXT NOT NULL,
  en_option_a   TEXT NOT NULL,
  en_option_b   TEXT NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─────────────────────────────────────────────────────────────────────────────
-- tc_votes
--   - nullifier_hash is the Orb-verified identity proof from World ID (legacy
--     verify). We also accept a wallet-signed address fallback that is hashed
--     server-side into the same column so the UNIQUE constraint still catches
--     duplicates.
--   - choice: 'A' or 'B' only.
-- ─────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS tc_votes (
  id               BIGSERIAL PRIMARY KEY,
  nullifier_hash   TEXT NOT NULL,
  question_id      INTEGER NOT NULL REFERENCES tc_questions(id) ON DELETE CASCADE,
  choice           CHAR(1) NOT NULL CHECK (choice IN ('A', 'B')),
  verification_tier TEXT NOT NULL DEFAULT 'orb_legacy' CHECK (verification_tier IN ('orb_legacy', 'wallet_siwe')),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (nullifier_hash, question_id)
);

CREATE INDEX IF NOT EXISTS idx_tc_votes_question  ON tc_votes(question_id);
CREATE INDEX IF NOT EXISTS idx_tc_votes_nullifier ON tc_votes(nullifier_hash);
CREATE INDEX IF NOT EXISTS idx_tc_votes_created   ON tc_votes(created_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- Row Level Security
-- ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE tc_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tc_votes     ENABLE ROW LEVEL SECURITY;

-- Public read (aggregate tallies shown in the Reveal screen after the user votes)
DROP POLICY IF EXISTS "tc_questions_public_read" ON tc_questions;
CREATE POLICY "tc_questions_public_read" ON tc_questions
  FOR SELECT USING (is_active = TRUE);

DROP POLICY IF EXISTS "tc_votes_public_read" ON tc_votes;
CREATE POLICY "tc_votes_public_read" ON tc_votes
  FOR SELECT USING (TRUE);

-- Writes go through service-role API only (no INSERT/UPDATE/DELETE policies for anon).

-- ─────────────────────────────────────────────────────────────────────────────
-- View: per-question tally (for the Reveal UI)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW tc_question_tally AS
SELECT
  q.id                                        AS question_id,
  q.category                                  AS category,
  COUNT(v.*)                                  AS total_votes,
  COUNT(v.*) FILTER (WHERE v.choice = 'A')    AS votes_a,
  COUNT(v.*) FILTER (WHERE v.choice = 'B')    AS votes_b
FROM tc_questions q
LEFT JOIN tc_votes v ON v.question_id = q.id
WHERE q.is_active = TRUE
GROUP BY q.id, q.category;

GRANT SELECT ON tc_question_tally TO anon, authenticated;
