-- =============================================================================
-- Security fixes: Restrict RLS policies + add atomic RPC functions
-- =============================================================================

-- ── Drop overly permissive anon policies ────────────────────────────────────

drop policy if exists "users_insert_self" on users;
drop policy if exists "users_update_self" on users;
drop policy if exists "up_insert" on user_predictions;
drop policy if exists "up_update" on user_predictions;
drop policy if exists "up_read_own" on user_predictions;

-- ── Users: read-only for anon ───────────────────────────────────────────────
-- All writes go through service role in API routes.
-- users_read_all already exists (select using true) — keep it for leaderboard.

-- ── user_predictions: read-only for anon ────────────────────────────────────
drop policy if exists "up_read_all" on user_predictions;
create policy "up_read_all"
  on user_predictions for select using (true);

-- No INSERT/UPDATE policies for anon role.
-- Service role (used in API routes) bypasses RLS entirely.

-- ── Atomic vote increment function ──────────────────────────────────────────
create or replace function increment_vote(
  pred_id uuid,
  is_option_a boolean
)
returns json
language plpgsql
security definer
as $$
declare
  new_vc int;
  new_av int;
begin
  update predictions
  set vote_count = vote_count + 1,
      option_a_votes = option_a_votes + (case when is_option_a then 1 else 0 end)
  where id = pred_id
  returning vote_count, option_a_votes into new_vc, new_av;

  return json_build_object(
    'new_vote_count', new_vc,
    'new_option_a_votes', new_av
  );
end;
$$;

-- ── Atomic user prediction count increment ──────────────────────────────────
create or replace function increment_user_predictions(user_addr text)
returns void
language plpgsql
security definer
as $$
begin
  update users
  set total_predictions = total_predictions + 1
  where address = user_addr;
end;
$$;
