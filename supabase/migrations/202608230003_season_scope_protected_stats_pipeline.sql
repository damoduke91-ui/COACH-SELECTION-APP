-- Make protected live/CSV operations season-aware. Old signatures are removed
-- so stale callers fail closed instead of mutating a same-numbered prior round.

-- Remove legacy non-primary uniqueness that does not include season_year. Those
-- keys would otherwise reject a valid 2027 row that shares a 2026 round/key.
DO $$
DECLARE
  target_table text;
  legacy_constraint record;
  legacy_index record;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'coach_team_selections', 'round_submissions', 'season_fixture',
    'super8_match_results', 'afl_player_round_stats', 'afl_matches',
    'afl_round_finalisation', 'weekly_team_lists', 'super8_ladder_snapshots'
  ] LOOP
    FOR legacy_constraint IN
      SELECT constraint_name
      FROM information_schema.table_constraints tc
      WHERE tc.table_schema = 'public'
        AND tc.table_name = target_table
        AND tc.constraint_type = 'UNIQUE'
        AND NOT EXISTS (
          SELECT 1
          FROM information_schema.constraint_column_usage ccu
          WHERE ccu.constraint_schema = tc.constraint_schema
            AND ccu.constraint_name = tc.constraint_name
            AND ccu.table_name = tc.table_name
            AND ccu.column_name = 'season_year'
        )
    LOOP
      EXECUTE format(
        'ALTER TABLE public.%I DROP CONSTRAINT %I',
        target_table,
        legacy_constraint.constraint_name
      );
    END LOOP;

    FOR legacy_index IN
      SELECT index_class.relname AS index_name
      FROM pg_index index_info
      JOIN pg_class table_class ON table_class.oid = index_info.indrelid
      JOIN pg_namespace table_namespace ON table_namespace.oid = table_class.relnamespace
      JOIN pg_class index_class ON index_class.oid = index_info.indexrelid
      WHERE table_namespace.nspname = 'public'
        AND table_class.relname = target_table
        AND index_info.indisunique
        AND NOT index_info.indisprimary
        AND NOT EXISTS (
          SELECT 1
          FROM unnest(index_info.indkey) AS key(attnum)
          JOIN pg_attribute attribute
            ON attribute.attrelid = table_class.oid
           AND attribute.attnum = key.attnum
          WHERE attribute.attname = 'season_year'
        )
    LOOP
      EXECUTE format('DROP INDEX IF EXISTS public.%I', legacy_index.index_name);
    END LOOP;
  END LOOP;
END;
$$;

CREATE UNIQUE INDEX IF NOT EXISTS season_fixture_season_match_key
  ON public.season_fixture (environment, season_year, competition_round, matchup_index, coach_id);
CREATE UNIQUE INDEX IF NOT EXISTS afl_matches_season_match_key
  ON public.afl_matches (environment, season_year, afl_match_id);

DROP FUNCTION IF EXISTS public.replace_preview_match_with_csv(text, integer, text[], jsonb);
DROP FUNCTION IF EXISTS public.upsert_preview_live_match(text, integer, text[], jsonb);
DROP FUNCTION IF EXISTS public.replace_match_with_protected_csv(text, integer, text[], jsonb);
DROP FUNCTION IF EXISTS public.upsert_live_match_if_unprotected(text, integer, text[], jsonb);
DROP FUNCTION IF EXISTS public.delete_protected_round_csv(text, integer);

CREATE OR REPLACE FUNCTION public.write_season_match_stats(
  p_environment text,
  p_season_year integer,
  p_afl_round integer,
  p_team_codes text[],
  p_rows jsonb,
  p_score_source text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_expected_count integer;
  v_existing_csv_count integer;
  v_written_count integer;
  v_round_player_count integer;
  v_round_club_count integer;
BEGIN
  IF p_environment NOT IN ('preview', 'production') THEN
    RAISE EXCEPTION 'Only preview or production environments are accepted.';
  END IF;
  IF p_season_year IS NULL OR p_season_year < 2000 OR p_season_year > 2100 THEN
    RAISE EXCEPTION 'A controlled season year is required.';
  END IF;
  IF p_afl_round IS NULL OR p_afl_round < 1 THEN
    RAISE EXCEPTION 'A valid AFL round is required.';
  END IF;
  IF p_score_source NOT IN ('live', 'csv') THEN
    RAISE EXCEPTION 'Only live or csv score sources are accepted.';
  END IF;
  IF coalesce(array_length(p_team_codes, 1), 0) <> 2
     OR nullif(trim(p_team_codes[1]), '') IS NULL
     OR nullif(trim(p_team_codes[2]), '') IS NULL
     OR p_team_codes[1] = p_team_codes[2] THEN
    RAISE EXCEPTION 'Exactly two distinct match team codes are required.';
  END IF;
  IF jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'A non-empty player row array is required.';
  END IF;

  v_expected_count := jsonb_array_length(p_rows);
  PERFORM pg_advisory_xact_lock(
    hashtext(p_environment || ':' || p_season_year::text || ':' || p_afl_round::text)
  );

  CREATE TEMPORARY TABLE season_match_rows ON COMMIT DROP AS
  SELECT *
  FROM jsonb_to_recordset(p_rows) AS row_data(
    environment text, season_year integer, afl_round integer,
    afl_team_name text, afl_team_code text, player_name text,
    k integer, hb integer, d integer, m integer, g integer, b integer,
    t integer, ho integer, ga integer, i50 integer, cl integer, cg integer,
    r50 integer, ff integer, fa integer, af integer, sc integer
  );

  IF (SELECT count(*) FROM season_match_rows) <> v_expected_count THEN
    RAISE EXCEPTION 'Player row parsing changed the expected row count.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM season_match_rows
    WHERE environment <> p_environment
       OR season_year <> p_season_year
       OR afl_round <> p_afl_round
       OR NOT (afl_team_code = ANY(p_team_codes))
       OR nullif(trim(afl_team_code), '') IS NULL
       OR nullif(trim(player_name), '') IS NULL
  ) THEN
    RAISE EXCEPTION 'Player rows do not match the requested environment, season, round, and teams.';
  END IF;
  IF (SELECT count(DISTINCT afl_team_code) FROM season_match_rows) <> 2 THEN
    RAISE EXCEPTION 'Player rows must contain exactly the two requested teams.';
  END IF;
  IF EXISTS (
    SELECT 1 FROM season_match_rows
    GROUP BY environment, season_year, afl_round, afl_team_code, player_name
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'The payload contains duplicate player rows.';
  END IF;

  SELECT count(*) INTO v_existing_csv_count
  FROM public.afl_player_round_stats
  WHERE environment = p_environment
    AND season_year = p_season_year
    AND afl_round = p_afl_round
    AND afl_team_code = ANY(p_team_codes)
    AND score_source = 'csv';

  IF v_existing_csv_count > 0 THEN
    RETURN jsonb_build_object(
      'status', CASE
        WHEN p_score_source = 'live' THEN 'protected'
        WHEN v_existing_csv_count = v_expected_count THEN 'protected'
        ELSE 'partial_conflict'
      END,
      'written_rows', 0,
      'inserted_rows', 0,
      'protected_rows', v_existing_csv_count
    );
  END IF;

  DELETE FROM public.afl_player_round_stats
  WHERE environment = p_environment
    AND season_year = p_season_year
    AND afl_round = p_afl_round
    AND afl_team_code = ANY(p_team_codes)
    AND score_source = 'live';

  INSERT INTO public.afl_player_round_stats (
    environment, season_year, afl_round, afl_team_name, afl_team_code, player_name,
    k, hb, d, m, g, b, t, ho, ga, i50, cl, cg, r50, ff, fa, af, sc,
    score_source, imported_at, updated_at
  )
  SELECT
    environment, season_year, afl_round, afl_team_name, afl_team_code, player_name,
    k, hb, d, m, g, b, t, ho, ga, i50, cl, cg, r50, ff, fa, af, sc,
    p_score_source, now(), now()
  FROM season_match_rows;
  GET DIAGNOSTICS v_written_count = ROW_COUNT;
  IF v_written_count <> v_expected_count THEN
    RAISE EXCEPTION 'Protected write validation failed; no changes were retained.';
  END IF;

  IF p_score_source = 'csv' THEN
    SELECT count(*), count(DISTINCT afl_team_code)
    INTO v_round_player_count, v_round_club_count
    FROM public.afl_player_round_stats
    WHERE environment = p_environment
      AND season_year = p_season_year
      AND afl_round = p_afl_round;

    INSERT INTO public.afl_round_finalisation (
      environment, season_year, afl_round, active_source, csv_imported_at,
      player_row_count, club_count, updated_at
    ) VALUES (
      p_environment, p_season_year, p_afl_round,
      CASE WHEN v_round_club_count >= 18 THEN 'csv' ELSE NULL END,
      CASE WHEN v_round_club_count >= 18 THEN now() ELSE NULL END,
      v_round_player_count, v_round_club_count, now()
    )
    ON CONFLICT (environment, season_year, afl_round) DO UPDATE
    SET active_source = CASE WHEN excluded.club_count >= 18 THEN 'csv'
                             ELSE public.afl_round_finalisation.active_source END,
        csv_imported_at = CASE WHEN excluded.club_count >= 18 THEN excluded.csv_imported_at
                               ELSE public.afl_round_finalisation.csv_imported_at END,
        player_row_count = excluded.player_row_count,
        club_count = excluded.club_count,
        updated_at = excluded.updated_at;
  END IF;

  RETURN jsonb_build_object(
    'status', 'imported',
    'written_rows', v_written_count,
    'inserted_rows', v_written_count,
    'protected_rows', 0
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_match_with_protected_csv(
  p_environment text, p_season_year integer, p_afl_round integer,
  p_team_codes text[], p_rows jsonb
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.write_season_match_stats(
    p_environment, p_season_year, p_afl_round, p_team_codes, p_rows, 'csv'
  );
$$;

CREATE OR REPLACE FUNCTION public.upsert_live_match_if_unprotected(
  p_environment text, p_season_year integer, p_afl_round integer,
  p_team_codes text[], p_rows jsonb
) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT public.write_season_match_stats(
    p_environment, p_season_year, p_afl_round, p_team_codes, p_rows, 'live'
  );
$$;

CREATE OR REPLACE FUNCTION public.delete_protected_round_csv(
  p_environment text, p_season_year integer, p_afl_round integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_deleted_count integer;
  v_remaining_player_count integer;
  v_remaining_club_count integer;
BEGIN
  IF p_environment NOT IN ('preview', 'production') THEN
    RAISE EXCEPTION 'Only preview or production environments are accepted.';
  END IF;
  IF p_season_year IS NULL OR p_season_year < 2000 OR p_season_year > 2100 THEN
    RAISE EXCEPTION 'A controlled season year is required.';
  END IF;
  IF p_afl_round IS NULL OR p_afl_round < 1 THEN
    RAISE EXCEPTION 'A valid AFL round is required.';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtext(p_environment || ':' || p_season_year::text || ':' || p_afl_round::text)
  );
  DELETE FROM public.afl_player_round_stats
  WHERE environment = p_environment
    AND season_year = p_season_year
    AND afl_round = p_afl_round
    AND score_source = 'csv';
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  SELECT count(*), count(DISTINCT afl_team_code)
  INTO v_remaining_player_count, v_remaining_club_count
  FROM public.afl_player_round_stats
  WHERE environment = p_environment
    AND season_year = p_season_year
    AND afl_round = p_afl_round;

  UPDATE public.afl_round_finalisation
  SET active_source = CASE WHEN v_remaining_player_count > 0 THEN 'live_fallback' ELSE NULL END,
      csv_imported_at = NULL,
      player_row_count = v_remaining_player_count,
      club_count = v_remaining_club_count,
      updated_at = now()
  WHERE environment = p_environment
    AND season_year = p_season_year
    AND afl_round = p_afl_round;

  RETURN jsonb_build_object(
    'status', 'deleted', 'deleted_rows', v_deleted_count,
    'environment', p_environment, 'season_year', p_season_year, 'afl_round', p_afl_round
  );
END;
$$;

REVOKE ALL ON FUNCTION public.write_season_match_stats(text, integer, integer, text[], jsonb, text)
  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.replace_match_with_protected_csv(text, integer, integer, text[], jsonb)
  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.upsert_live_match_if_unprotected(text, integer, integer, text[], jsonb)
  FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.delete_protected_round_csv(text, integer, integer)
  FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_match_with_protected_csv(text, integer, integer, text[], jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_live_match_if_unprotected(text, integer, integer, text[], jsonb)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_protected_round_csv(text, integer, integer)
  TO service_role;
