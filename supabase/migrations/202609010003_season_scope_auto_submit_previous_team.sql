-- Restore the exact-previous-round carry-forward rule after season rollover.
-- The active season is derived from app_settings and must also be marked active;
-- completed/archived 2026 data is therefore never selected or changed.
-- Every current team writer now uses the season-aware conflict targets. Remove
-- the transitional environment-only constraints so an active season can keep
-- its own rows alongside preserved 2026 records.
ALTER TABLE public.coach_team_selections
  DROP CONSTRAINT IF EXISTS coach_team_selections_coach_environment_key;

ALTER TABLE public.round_submissions
  DROP CONSTRAINT IF EXISTS round_submissions_coach_round_environment_key;

CREATE OR REPLACE FUNCTION public.auto_submit_previous_teams_at_lockout(
  requested_environment text DEFAULT 'production'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  settings_row public.app_settings%ROWTYPE;
  selection_row public.coach_team_selections%ROWTYPE;
  previous_row public.round_submissions%ROWTYPE;
  previous_round_number integer;
  submitted_coaches jsonb := '[]'::jsonb;
  skipped_coaches jsonb := '[]'::jsonb;
  submitted_count integer := 0;
  skipped_count integer := 0;
  submitted_now timestamptz := clock_timestamp();
BEGIN
  IF requested_environment IS NULL OR btrim(requested_environment) = '' THEN
    RAISE EXCEPTION 'Environment is required';
  END IF;

  SELECT * INTO settings_row
  FROM public.app_settings
  WHERE environment = requested_environment
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'skipped', 'reason', 'app_settings_not_found');
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext('auto_submit_previous_teams_at_lockout'),
    hashtext(requested_environment || ':' || settings_row.season_year::text)
  );

  IF NOT EXISTS (
    SELECT 1 FROM public.competition_seasons
    WHERE environment = requested_environment
      AND season_year = settings_row.season_year
      AND status = 'active'
  ) THEN
    RETURN jsonb_build_object(
      'status', 'skipped',
      'reason', 'season_not_active',
      'environment', requested_environment,
      'season_year', settings_row.season_year
    );
  END IF;

  IF settings_row.lockout_enabled IS DISTINCT FROM true
    OR settings_row.lockout_at IS NULL
    OR settings_row.lockout_at > submitted_now THEN
    RETURN jsonb_build_object(
      'status', 'skipped', 'reason', 'scheduled_lockout_not_active',
      'environment', requested_environment, 'season_year', settings_row.season_year
    );
  END IF;

  IF settings_row.lockout_at < submitted_now - interval '24 hours' THEN
    RETURN jsonb_build_object(
      'status', 'skipped', 'reason', 'scheduled_lockout_is_stale',
      'environment', requested_environment, 'season_year', settings_row.season_year
    );
  END IF;

  IF settings_row.current_super8_round IS NULL OR settings_row.current_super8_round < 1 THEN
    RETURN jsonb_build_object(
      'status', 'skipped', 'reason', 'current_super8_round_not_set',
      'environment', requested_environment, 'season_year', settings_row.season_year
    );
  END IF;

  previous_round_number := settings_row.current_super8_round - 1;
  IF previous_round_number < 1 THEN
    RETURN jsonb_build_object(
      'status', 'skipped', 'reason', 'previous_super8_round_not_available',
      'environment', requested_environment, 'season_year', settings_row.season_year,
      'round_number', settings_row.current_super8_round
    );
  END IF;

  FOR selection_row IN
    SELECT selection.*
    FROM public.coach_team_selections AS selection
    WHERE selection.environment = requested_environment
      AND selection.season_year = settings_row.season_year
      AND selection.is_submitted IS DISTINCT FROM true
      AND NOT EXISTS (
        SELECT 1 FROM public.round_submissions AS current_submission
        WHERE current_submission.environment = requested_environment
          AND current_submission.season_year = settings_row.season_year
          AND current_submission.coach_id = selection.coach_id
          AND current_submission.round_number = settings_row.current_super8_round
          AND current_submission.is_submitted = true
      )
    ORDER BY selection.coach_id
    FOR UPDATE
  LOOP
    SELECT previous_submission.* INTO previous_row
    FROM public.round_submissions AS previous_submission
    WHERE previous_submission.environment = requested_environment
      AND previous_submission.season_year = settings_row.season_year
      AND previous_submission.coach_id = selection_row.coach_id
      AND previous_submission.round_number = previous_round_number
      AND previous_submission.is_submitted = true
    ORDER BY previous_submission.submitted_at DESC NULLS LAST,
      previous_submission.snapshot_created_at DESC
    LIMIT 1;

    IF NOT FOUND THEN
      skipped_count := skipped_count + 1;
      skipped_coaches := skipped_coaches || jsonb_build_array(jsonb_build_object(
        'coach_id', selection_row.coach_id,
        'coach_name', selection_row.coach_name,
        'reason', 'exact_previous_round_submission_not_found',
        'expected_source_round', previous_round_number
      ));
      CONTINUE;
    END IF;

    UPDATE public.coach_team_selections
    SET coach_name = COALESCE(selection_row.coach_name, previous_row.coach_name),
      team_data = previous_row.team_data,
      is_submitted = true,
      submitted_at = submitted_now,
      updated_at = submitted_now
    WHERE environment = requested_environment
      AND season_year = settings_row.season_year
      AND coach_id = selection_row.coach_id
      AND is_submitted IS DISTINCT FROM true;

    IF NOT FOUND THEN CONTINUE; END IF;

    INSERT INTO public.round_submissions (
      coach_id, coach_name, team_data, is_submitted, submitted_at, updated_at,
      environment, season_year, round_number, lockout_at, snapshot_created_at, afl_round
    ) VALUES (
      selection_row.coach_id,
      COALESCE(selection_row.coach_name, previous_row.coach_name),
      previous_row.team_data, true, submitted_now, submitted_now,
      requested_environment, settings_row.season_year,
      settings_row.current_super8_round, settings_row.lockout_at,
      submitted_now, settings_row.current_afl_round
    )
    ON CONFLICT (environment, season_year, coach_id, round_number)
    DO UPDATE SET
      coach_name = EXCLUDED.coach_name,
      team_data = EXCLUDED.team_data,
      is_submitted = true,
      submitted_at = EXCLUDED.submitted_at,
      updated_at = EXCLUDED.updated_at,
      lockout_at = EXCLUDED.lockout_at,
      snapshot_created_at = EXCLUDED.snapshot_created_at,
      afl_round = EXCLUDED.afl_round
    WHERE public.round_submissions.is_submitted IS DISTINCT FROM true;

    submitted_count := submitted_count + 1;
    submitted_coaches := submitted_coaches || jsonb_build_array(jsonb_build_object(
      'coach_id', selection_row.coach_id,
      'coach_name', selection_row.coach_name,
      'source_round', previous_round_number,
      'source_afl_round', previous_row.afl_round
    ));
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'completed',
    'environment', requested_environment,
    'season_year', settings_row.season_year,
    'round_number', settings_row.current_super8_round,
    'afl_round', settings_row.current_afl_round,
    'expected_source_round', previous_round_number,
    'lockout_at', settings_row.lockout_at,
    'submitted_count', submitted_count,
    'submitted_coaches', submitted_coaches,
    'skipped_count', skipped_count,
    'skipped_coaches', skipped_coaches
  );
END;
$$;

REVOKE ALL ON FUNCTION public.auto_submit_previous_teams_at_lockout(text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auto_submit_previous_teams_at_lockout(text)
TO service_role;
