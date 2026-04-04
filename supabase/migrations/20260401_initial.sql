-- ============================================================
-- Daily Predict — Initial Schema
-- Created: 2026-04-01
-- ============================================================

-- Enable UUID extension
create extension if not exists "pgcrypto";

-- ============================================================
-- predictions
-- One row per daily prediction question.
-- ============================================================
create table if not exists predictions (
  id            uuid primary key default gen_random_uuid(),

  -- Question text (bilingual)
  question_en   text not null,
  question_ja   text not null,

  -- Binary options (both languages stored in option_a / option_b)
  option_a      text not null,  -- e.g. "Yes / はい"
  option_b      text not null,  -- e.g. "No / いいえ"

  -- Metadata
  category      text not null check (
    category in ('crypto', 'weather', 'sports', 'tech', 'world', 'entertainment')
  ),

  -- Lifecycle
  status        text not null default 'open' check (status in ('open', 'closed', 'resolved')),
  closes_at     timestamptz not null,

  -- Result: null = unresolved, 'A' or 'B' = resolved
  result        text check (result in ('A', 'B')),

  -- Denormalized vote counters (updated via trigger or Edge Function)
  vote_count    integer not null default 0,
  option_a_votes integer not null default 0,

  -- Generation / resolution metadata (optional JSON blob)
  meta          jsonb,

  created_at    timestamptz not null default now()
);

-- Index to quickly fetch today's open prediction
create index if not exists idx_predictions_status_closes
  on predictions (status, closes_at);


-- ============================================================
-- users
-- One row per World-ID-verified unique human.
-- Primary key is the World ID nullifier hash.
-- ============================================================
create table if not exists users (
  address         text primary key,           -- World ID nullifier hash
  display_name    text not null default 'Predictor',

  -- Gamification counters
  total_predictions integer not null default 0,
  total_correct     integer not null default 0,
  streak            integer not null default 0,
  best_streak       integer not null default 0,
  points            integer not null default 0,

  -- Streak tracking
  last_correct_date date,

  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Index for leaderboard queries
create index if not exists idx_users_points  on users (points desc);
create index if not exists idx_users_correct on users (total_correct desc);


-- ============================================================
-- user_predictions
-- One row per user per prediction (enforced by unique constraint).
-- ============================================================
create table if not exists user_predictions (
  id             uuid primary key default gen_random_uuid(),
  user_address   text not null references users (address) on delete cascade,
  prediction_id  uuid not null references predictions (id) on delete cascade,
  chosen_option  text not null check (chosen_option in ('A', 'B')),

  -- Populated when the prediction is resolved
  is_correct     boolean,

  created_at     timestamptz not null default now(),

  -- Each user can vote only once per prediction
  unique (user_address, prediction_id)
);

-- Indexes for common queries
create index if not exists idx_up_user    on user_predictions (user_address, created_at desc);
create index if not exists idx_up_pred    on user_predictions (prediction_id);


-- ============================================================
-- weekly_leaderboard (materialised view, refreshed by cron)
-- ============================================================
create materialized view if not exists weekly_leaderboard as
select
  u.address,
  u.display_name,
  count(up.id) filter (where up.is_correct = true) as correct_this_week,
  count(up.id) as total_this_week,
  u.streak,
  u.points
from users u
left join user_predictions up
  on up.user_address = u.address
  and up.created_at >= date_trunc('week', now())
group by u.address, u.display_name, u.streak, u.points
order by correct_this_week desc, u.streak desc;

create unique index if not exists idx_wl_address on weekly_leaderboard (address);


-- ============================================================
-- Row-Level Security
-- Allow anonymous reads on predictions; restrict writes to service role.
-- user_predictions are readable only by the owning user.
-- ============================================================
alter table predictions      enable row level security;
alter table users            enable row level security;
alter table user_predictions enable row level security;

-- Predictions: anyone can read
create policy "predictions_read_all"
  on predictions for select using (true);

-- Users: anyone can read (leaderboard), only self can update
create policy "users_read_all"
  on users for select using (true);

create policy "users_insert_self"
  on users for insert with check (true);   -- insert via API route (service role)

create policy "users_update_self"
  on users for update using (true);        -- update via API route (service role)

-- user_predictions: read own rows; insert via API route
create policy "up_read_own"
  on user_predictions for select using (true);

create policy "up_insert"
  on user_predictions for insert with check (true);  -- service role validates

create policy "up_update"
  on user_predictions for update using (true);       -- resolution cron (service role)
