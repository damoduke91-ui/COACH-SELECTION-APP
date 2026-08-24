-- Make future Production closeouts season-aware without changing archived 2026 data.
-- Version 202608240002 follows the season-scoped natural primary-key migration.
-- The season row lock and trigger share lock serialize closeout against competition writes.

CREATE OR REPLACE FUNCTION public.reject_locked_season_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  target_environment text;
  target_season_year integer;
  target_status text;
BEGIN
  target_environment := COALESCE(NEW.environment, OLD.environment);
  target_season_year := COALESCE(NEW.season_year, OLD.season_year);

  SELECT status
  INTO target_status
  FROM public.competition_seasons
  WHERE environment = target_environment
    AND season_year = target_season_year
  FOR SHARE;

  IF target_status IS NULL THEN
    RAISE EXCEPTION 'Season %/% does not exist.', target_environment, target_season_year;
  END IF;

  IF target_status IN ('completed', 'archived') THEN
    RAISE EXCEPTION 'Season %/% is locked and cannot be changed.',
      target_environment, target_season_year;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE OR REPLACE FUNCTION public.archive_production_season(
  p_season_year integer,
  p_payload jsonb,
  p_source_row_counts jsonb,
  p_checksum text,
  p_premier_name text,
  p_confirmation text
)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  archive_id bigint;
  expected_count integer;
  actual_count integer;
  table_name text;
  controlled_season_year integer;
  controlled_status text;
  normalised_premier text := btrim(COALESCE(p_premier_name, ''));
BEGIN
  IF p_season_year IS NULL OR p_season_year < 2000 OR p_season_year > 2100 THEN
    RAISE EXCEPTION 'A valid Production season year is required.';
  END IF;
  IF normalised_premier = '' THEN
    RAISE EXCEPTION 'The Premiers must be confirmed before archiving.';
  END IF;
  IF p_confirmation <> format(
    'ARCHIVE PRODUCTION %s %s',
    p_season_year,
    upper(normalised_premier)
  ) THEN
    RAISE EXCEPTION 'Typed Production archive confirmation did not match.';
  END IF;
  IF p_payload IS NULL OR p_source_row_counts IS NULL THEN
    RAISE EXCEPTION 'Archive payload and source row counts are required.';
  END IF;
  IF COALESCE(p_checksum, '') !~ '^[0-9a-fA-F]{64}$' THEN
    RAISE EXCEPTION 'A SHA-256 archive checksum is required.';
  END IF;

  SELECT season_year
  INTO controlled_season_year
  FROM public.app_settings
  WHERE environment = 'production';
  IF controlled_season_year IS DISTINCT FROM p_season_year THEN
    RAISE EXCEPTION 'Only the currently controlled Production season can be archived.';
  END IF;

  SELECT status
  INTO controlled_status
  FROM public.competition_seasons
  WHERE environment = 'production'
    AND season_year = p_season_year
  FOR UPDATE;
  IF controlled_status IS NULL THEN
    RAISE EXCEPTION 'The requested Production season does not exist.';
  END IF;
  IF controlled_status <> 'active' THEN
    RAISE EXCEPTION 'The requested Production season is not active.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.finals_results
    WHERE environment = 'production'
      AND season_year = p_season_year
      AND match_code = 'GF'
      AND coach_1_score IS NOT NULL
      AND coach_2_score IS NOT NULL
      AND coach_1_score <> coach_2_score
      AND completed_at IS NOT NULL
  ) THEN
    RAISE EXCEPTION 'The Production Grand Final is not complete.';
  END IF;

  FOREACH table_name IN ARRAY ARRAY[
    'super8_match_results', 'finals_results', 'season_fixture',
    'coach_team_selections', 'round_submissions', 'afl_player_round_stats',
    'afl_matches', 'afl_round_finalisation', 'weekly_team_lists',
    'admin_team_audit_log'
  ] LOOP
    BEGIN
      expected_count := NULLIF(p_source_row_counts ->> table_name, '')::integer;
    EXCEPTION WHEN invalid_text_representation THEN
      RAISE EXCEPTION 'Archive row count is invalid for %.', table_name;
    END;
    IF expected_count IS NULL OR expected_count < 0 THEN
      RAISE EXCEPTION 'Archive row count is missing or invalid for %.', table_name;
    END IF;
    EXECUTE format(
      'SELECT count(*) FROM public.%I WHERE environment = $1 AND season_year = $2',
      table_name
    ) INTO actual_count USING 'production', p_season_year;
    IF actual_count <> expected_count THEN
      RAISE EXCEPTION 'Archive row count changed for %: expected %, found %.',
        table_name, expected_count, actual_count;
    END IF;
  END LOOP;

  INSERT INTO public.season_archives (
    environment, season_year, payload, source_row_counts, checksum, created_by
  ) VALUES (
    'production', p_season_year, p_payload, p_source_row_counts,
    lower(p_checksum), auth.uid()
  ) RETURNING id INTO archive_id;

  UPDATE public.competition_seasons
  SET status = 'archived',
      premier_name = normalised_premier,
      completed_at = COALESCE(completed_at, now()),
      archived_at = now(),
      locked_at = now(),
      updated_at = now()
  WHERE environment = 'production'
    AND season_year = p_season_year
    AND status = 'active';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Production season state changed before archive commit.';
  END IF;

  RETURN archive_id;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_production_season(integer, jsonb, jsonb, text, text, text)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_production_season(integer, jsonb, jsonb, text, text, text)
  TO service_role;
