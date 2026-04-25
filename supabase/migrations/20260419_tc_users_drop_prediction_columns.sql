-- ============================================================
-- TuringVote — Drop Daily Predict prediction columns from `users`
-- Created: 2026-04-19
--
-- Rationale (C5 from Critical Evaluator Round 1)
--   TuringVote is a 2-choice vote app. The `users` table inherited seven
--   Daily Predict columns (total_predictions / total_correct / streak /
--   best_streak / points / last_correct_date / badges jsonb) that the
--   TuringVote product does not use. Keeping them creates:
--     - Worldcoin review risk: "why does a vote app store prediction
--       counters" is hard to answer.
--     - Dead data surface for K-anonymity: even unused columns that may
--       leak through public SELECTs are additional attack surface.
--
-- What this migration does
--   - Drops the seven prediction-specific columns from `users`.
--   - Leaves `address` (PK), `display_name`, `created_at`, `updated_at`
--     intact — these are the only columns TuringVote needs to round-trip.
--   - Does NOT rename `users` → `tc_users` to avoid breaking any code path
--     that still reads the table. If/when the legacy Daily Predict screens
--     (ProfileScreen / LeaderboardScreen / PredictScreen) are deleted, a
--     follow-up migration can rename the table.
--
-- Compatibility
--   src/app/api/auth/wallet/route.ts was updated (2026-04-19) to select
--   only {address, display_name, created_at} from `users`, so this DROP
--   is safe to apply before or after the code deploy.
--
--   The legacy /api/profile route DOES still select `*` from users and
--   reads user.total_predictions / total_correct / best_streak / points.
--   After this migration, those fields become undefined. The route does
--   `?? 0` fallbacks so it will return zeros, and page.tsx never renders
--   ProfileScreen, so user-visible behavior is unchanged.
-- ============================================================

begin;

-- Drop Daily Predict counters. Use IF EXISTS so the migration is idempotent
-- in environments where columns were already stripped.
alter table users drop column if exists total_predictions;
alter table users drop column if exists total_correct;
alter table users drop column if exists streak;
alter table users drop column if exists best_streak;
alter table users drop column if exists points;
alter table users drop column if exists last_correct_date;

-- `badges` was a jsonb column backing the Daily Predict gamification loop.
-- TuringVote has no badge system. Drop it as well.
alter table users drop column if exists badges;

-- Also drop the indexes that were built for leaderboard-by-points sorting.
drop index if exists idx_users_points;
drop index if exists idx_users_correct;

-- Document the new minimal semantics of the users table.
comment on table users is
  'TuringVote session subjects. One row per verified human wallet that has '
  'completed SIWE wallet auth via MiniKit.walletAuth. Stores only identity '
  '(address) + display name + timestamps — no per-vote counters, badges, '
  'or points. All vote identity is stored action-scoped in tc_votes.nullifier_hash.';

commit;
