-- Seed prediction for testing Daily Predict app
-- Run this in the Supabase SQL Editor

INSERT INTO predictions (question_en, question_ja, option_a, option_b, category, status, closes_at, vote_count, option_a_votes)
VALUES (
  'Will Bitcoin be above $85,000 at tomorrow''s close?',
  'ビットコインは明日の終値で8万5千ドルを超えると思う？',
  'Yes',
  'No',
  'crypto',
  'open',
  (now() AT TIME ZONE 'Asia/Tokyo' + interval '1 day')::date + time '23:59:00',
  0,
  0
);
