CREATE OR REPLACE FUNCTION public.stage_preview_finals_scenario(
  p_week integer,
  p_season_year integer,
  p_prerequisites jsonb,
  p_now timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_afl_round integer;
  target_super8_round integer;
BEGIN
  IF p_week NOT BETWEEN 1 AND 4 THEN
    RAISE EXCEPTION 'Finals week must be between 1 and 4.';
  END IF;

  target_afl_round := 20 + p_week;
  target_super8_round := 14 + p_week;

  DELETE FROM public.finals_results
  WHERE environment = 'preview' AND season_year = p_season_year;

  DELETE FROM public.afl_player_round_stats
  WHERE environment = 'preview' AND afl_round = ANY (ARRAY[21, 22, 23, 24]);

  DELETE FROM public.afl_round_finalisation
  WHERE environment = 'preview' AND afl_round = ANY (ARRAY[21, 22, 23, 24]);

  DELETE FROM public.round_submissions
  WHERE environment = 'preview' AND round_number = ANY (ARRAY[15, 16, 17, 18]);

  INSERT INTO public.finals_results (
    environment, season_year, match_code, coach_1_score, coach_2_score, completed_at, updated_at
  )
  SELECT
    'preview', p_season_year, prerequisite.match_code,
    prerequisite.coach_1_score, prerequisite.coach_2_score, p_now, p_now
  FROM jsonb_to_recordset(COALESCE(p_prerequisites, '[]'::jsonb)) AS prerequisite(
    match_code text, coach_1_score numeric, coach_2_score numeric
  );

  UPDATE public.coach_team_selections
  SET is_submitted = false, submitted_at = null, updated_at = p_now
  WHERE environment = 'preview';

  UPDATE public.app_settings
  SET current_afl_round = target_afl_round,
      current_super8_round = target_super8_round,
      updated_at = p_now
  WHERE environment = 'preview';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Preview Round Control settings were not found.';
  END IF;

  RETURN jsonb_build_object(
    'week', p_week,
    'currentAflRound', target_afl_round,
    'currentSuper8Round', target_super8_round,
    'prerequisiteCount', jsonb_array_length(COALESCE(p_prerequisites, '[]'::jsonb))
  );
END;
$$;

REVOKE ALL ON FUNCTION public.stage_preview_finals_scenario(integer, integer, jsonb, timestamptz)
FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.stage_preview_finals_scenario(integer, integer, jsonb, timestamptz)
TO service_role;
