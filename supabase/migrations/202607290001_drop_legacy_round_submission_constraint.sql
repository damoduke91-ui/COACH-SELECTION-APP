-- The original production schema used this constraint name for coach/round
-- uniqueness. It does not include environment, so a Preview submission can
-- incorrectly block the matching Production submission.
ALTER TABLE public.round_submissions
  DROP CONSTRAINT IF EXISTS uniq_round_submissions_coach_round;

DROP INDEX IF EXISTS public.uniq_round_submissions_coach_round;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.round_submissions'::regclass
      AND conname = 'round_submissions_coach_round_environment_key'
  ) THEN
    ALTER TABLE public.round_submissions
      ADD CONSTRAINT round_submissions_coach_round_environment_key
      UNIQUE (coach_id, round_number, environment);
  END IF;
END
$$;
