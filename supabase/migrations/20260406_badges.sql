-- Add badges JSONB column to users table
alter table users add column if not exists badges jsonb not null default '[]'::jsonb;
