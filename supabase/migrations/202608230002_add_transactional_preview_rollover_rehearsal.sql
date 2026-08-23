-- Transaction-contained Preview rehearsal. Synthetic seasons are created,
-- archived, locked, verified, and removed before the function commits.

CREATE OR REPLACE FUNCTION public.rehearse_preview_season_rollover(
  p_confirmation text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  active_preview_year integer;
  locked_write_rejected boolean := false;
  archive_checksum constant text :=
    'preview-rehearsal-0000000000000000000000000000000000000000000000';
BEGIN
  IF p_confirmation <> 'REHEARSE PREVIEW ROLLOVER' THEN
    RAISE EXCEPTION 'Typed Preview rehearsal confirmation did not match.';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('rehearse_preview_season_rollover'));

  SELECT season_year
  INTO active_preview_year
  FROM public.competition_seasons
  WHERE environment = 'preview'
    AND status = 'active'
  FOR UPDATE;

  IF active_preview_year IS NULL THEN
    RAISE EXCEPTION 'Preview must have one active season before rehearsal.';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.competition_seasons
    WHERE environment = 'preview' AND season_year IN (2099, 2100)
  ) THEN
    RAISE EXCEPTION 'Synthetic Preview rehearsal seasons already exist.';
  END IF;

  -- Temporarily free the one-active-season constraint. These intermediate
  -- changes are invisible outside this transaction and are restored below.
  UPDATE public.competition_seasons
  SET status = 'draft', updated_at = now()
  WHERE environment = 'preview' AND season_year = active_preview_year;

  INSERT INTO public.competition_seasons (
    environment, season_year, status, started_at
  ) VALUES (
    'preview', 2099, 'active', now()
  );

  INSERT INTO public.finals_results (
    environment, season_year, match_code,
    coach_1_score, coach_2_score, completed_at, updated_at
  ) VALUES (
    'preview', 2099, 'GF', 100, 90, now(), now()
  );

  INSERT INTO public.season_archives (
    environment, season_year, payload, source_row_counts, checksum
  ) VALUES (
    'preview',
    2099,
    jsonb_build_object(
      'rehearsal', true,
      'premier', 'Preview Rehearsal Premiers',
      'grand_final', jsonb_build_object('home', 100, 'away', 90)
    ),
    jsonb_build_object('finals_results', 1),
    archive_checksum
  );

  UPDATE public.competition_seasons
  SET status = 'archived',
      completed_at = now(),
      archived_at = now(),
      locked_at = now(),
      premier_name = 'Preview Rehearsal Premiers',
      updated_at = now()
  WHERE environment = 'preview' AND season_year = 2099;

  BEGIN
    UPDATE public.finals_results
    SET coach_1_score = 101
    WHERE environment = 'preview'
      AND season_year = 2099
      AND match_code = 'GF';
  EXCEPTION
    WHEN raise_exception THEN
      IF SQLERRM LIKE 'Season preview/2099 is locked%' THEN
        locked_write_rejected := true;
      ELSE
        RAISE;
      END IF;
  END;

  IF NOT locked_write_rejected THEN
    RAISE EXCEPTION 'Archived Preview season accepted a write during rehearsal.';
  END IF;

  INSERT INTO public.competition_seasons (
    environment, season_year, status
  ) VALUES (
    'preview', 2100, 'draft'
  );

  IF NOT EXISTS (
    SELECT 1 FROM public.competition_seasons
    WHERE environment = 'preview'
      AND season_year = 2100
      AND status = 'draft'
  ) THEN
    RAISE EXCEPTION 'Preview next-season draft was not created.';
  END IF;

  -- Restore and clean up while still inside the same transaction. Temporarily
  -- unlock the synthetic season so its guarded Finals row can be removed.
  UPDATE public.competition_seasons
  SET status = 'draft',
      completed_at = NULL,
      archived_at = NULL,
      locked_at = NULL,
      updated_at = now()
  WHERE environment = 'preview' AND season_year = 2099;

  DELETE FROM public.season_archives
  WHERE environment = 'preview' AND season_year IN (2099, 2100);

  DELETE FROM public.finals_results
  WHERE environment = 'preview' AND season_year IN (2099, 2100);

  DELETE FROM public.competition_seasons
  WHERE environment = 'preview' AND season_year IN (2099, 2100);

  UPDATE public.competition_seasons
  SET status = 'active', updated_at = now()
  WHERE environment = 'preview' AND season_year = active_preview_year;

  RETURN jsonb_build_object(
    'success', true,
    'environment', 'preview',
    'restored_active_season', active_preview_year,
    'archived_write_rejected', locked_write_rejected,
    'next_draft_created', true,
    'synthetic_rows_remaining', 0
  );
END;
$$;

REVOKE ALL ON FUNCTION public.rehearse_preview_season_rollover(text)
FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rehearse_preview_season_rollover(text)
TO service_role;
