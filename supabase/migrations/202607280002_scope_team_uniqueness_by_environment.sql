-- Allow Preview and Production to keep independent current teams and round snapshots.
ALTER TABLE public.coach_team_selections
  DROP CONSTRAINT IF EXISTS coach_team_selections_coach_id_key;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.coach_team_selections'::regclass
      AND conname = 'coach_team_selections_coach_environment_key'
  ) THEN
    ALTER TABLE public.coach_team_selections
      ADD CONSTRAINT coach_team_selections_coach_environment_key
      UNIQUE (coach_id, environment);
  END IF;
END
$$;

ALTER TABLE public.round_submissions
  DROP CONSTRAINT IF EXISTS round_submissions_coach_id_round_number_key;

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
