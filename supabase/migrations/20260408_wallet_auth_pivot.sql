-- ============================================================
-- Wallet Auth Pivot — 2026-04-08
--
-- Daily Predict's review was rejected with reason "use wallet auth to login".
-- We are replacing the IDKit/orbLegacy login flow with MiniKit walletAuth (SIWE).
--
-- Effects:
--  - The `users.address` column now stores Ethereum wallet addresses
--    (lowercase, 0x-prefixed, 42 chars) instead of World ID nullifier hashes.
--  - All existing user data is cleared. Only 2 test users exist; clearing them
--    avoids any chance of an old nullifier-keyed row colliding with a new
--    wallet-keyed row, and forces every account to be re-created via SIWE.
--  - The on-delete-cascade from user_predictions handles vote rows
--    automatically; we explicitly clean app_events too since it has no FK.
-- ============================================================

begin;

-- 1. Wipe per-user analytics rows (no FK to users, so do it explicitly)
delete from app_events
 where user_address is not null;

-- 2. Wipe vote history. Cascades from users would do this, but being explicit
--    here keeps the migration safe to read and rerun.
delete from user_predictions;

-- 3. Wipe users. The on-delete-cascade on user_predictions covers any stragglers.
delete from users;

-- 4. (Note: weekly_leaderboard materialized view was dropped in
--    20260407_cleanup_and_indexes.sql, so no refresh needed.)

-- 5. Document the new semantics on the address column
comment on column users.address is
  'Lowercase 0x-prefixed Ethereum wallet address (42 chars), set during SIWE Wallet Auth via MiniKit.walletAuth. Replaced the previous World ID nullifier_hash on 2026-04-08.';

commit;
