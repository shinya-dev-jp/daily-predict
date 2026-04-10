-- ============================================================
-- Add Orb nullifier_hash to user_predictions — 2026-04-10
--
-- World App review requires Incognito Action (Orb verify) for
-- Sybil-resistant voting. Each vote now carries a nullifier_hash
-- derived from the user's Orb-verified World ID proof.
--
-- UNIQUE(prediction_id, nullifier_hash) enforces 1-human-1-vote
-- per prediction question, regardless of how many wallet addresses
-- a single human controls.
--
-- Effects:
--   - Adds nullifier_hash TEXT column to user_predictions
--   - Clears existing test data so NOT NULL can be set safely
--   - Adds UNIQUE constraint on (prediction_id, nullifier_hash)
-- ============================================================

begin;

-- 1. Clear any existing rows (only test data at this stage)
delete from user_predictions;

-- 2. Add the column
alter table user_predictions
  add column if not exists nullifier_hash text;

-- 3. Set NOT NULL (safe because table is now empty)
alter table user_predictions
  alter column nullifier_hash set not null;

-- 4. Drop legacy unique constraint if it exists (user_address, prediction_id)
--    We keep user_address for analytics but uniqueness is now per-human (nullifier).
alter table user_predictions
  drop constraint if exists user_predictions_user_address_prediction_id_key;

-- 5. Add the new Sybil-resistant uniqueness constraint
alter table user_predictions
  add constraint uq_user_predictions_prediction_nullifier
  unique (prediction_id, nullifier_hash);

-- 6. Index for quick lookups by nullifier
create index if not exists idx_up_nullifier
  on user_predictions (nullifier_hash);

commit;
