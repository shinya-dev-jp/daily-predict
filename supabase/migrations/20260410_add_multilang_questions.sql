-- ============================================================
-- Add multilingual question columns (ko, th, pt)
-- question_es may already exist from earlier ad-hoc inserts
-- ============================================================

-- Add question_es if it doesn't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'predictions' AND column_name = 'question_es'
  ) THEN
    ALTER TABLE predictions ADD COLUMN question_es text;
  END IF;
END $$;

-- Add question_ko
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS question_ko text;

-- Add question_th
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS question_th text;

-- Add question_pt
ALTER TABLE predictions ADD COLUMN IF NOT EXISTS question_pt text;
