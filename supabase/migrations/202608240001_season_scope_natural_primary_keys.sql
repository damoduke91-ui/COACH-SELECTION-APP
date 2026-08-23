-- Upgrade legacy natural primary keys so the same business key can coexist in
-- multiple seasons. Identity-based `id` primary keys remain unchanged.

DO $$
DECLARE
  target_table text;
  primary_key record;
  primary_key_columns text;
BEGIN
  FOREACH target_table IN ARRAY ARRAY[
    'coach_team_selections', 'round_submissions', 'season_fixture',
    'super8_match_results', 'finals_results', 'afl_player_round_stats',
    'afl_matches', 'afl_round_finalisation', 'weekly_team_lists',
    'admin_team_audit_log', 'super8_ladder_snapshots'
  ] LOOP
    IF to_regclass(format('public.%I', target_table)) IS NULL THEN
      CONTINUE;
    END IF;

    SELECT
      constraint_info.conname AS constraint_name,
      array_agg(attribute.attname ORDER BY key_column.ordinality) AS column_names
    INTO primary_key
    FROM pg_constraint constraint_info
    CROSS JOIN LATERAL unnest(constraint_info.conkey)
      WITH ORDINALITY AS key_column(attnum, ordinality)
    JOIN pg_attribute attribute
      ON attribute.attrelid = constraint_info.conrelid
     AND attribute.attnum = key_column.attnum
    WHERE constraint_info.conrelid = format('public.%I', target_table)::regclass
      AND constraint_info.contype = 'p'
    GROUP BY constraint_info.conname;

    IF primary_key.constraint_name IS NULL
       OR 'season_year' = ANY(primary_key.column_names)
       OR 'id' = ANY(primary_key.column_names) THEN
      CONTINUE;
    END IF;

    SELECT string_agg(format('%I', column_name), ', ' ORDER BY ordinality)
    INTO primary_key_columns
    FROM unnest(primary_key.column_names) WITH ORDINALITY AS columns(column_name, ordinality);

    EXECUTE format(
      'ALTER TABLE public.%I DROP CONSTRAINT %I',
      target_table,
      primary_key.constraint_name
    );
    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I PRIMARY KEY (%s, season_year)',
      target_table,
      primary_key.constraint_name,
      primary_key_columns
    );
  END LOOP;
END;
$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint constraint_info
    CROSS JOIN LATERAL unnest(constraint_info.conkey) AS key_column(attnum)
    JOIN pg_attribute attribute
      ON attribute.attrelid = constraint_info.conrelid
     AND attribute.attnum = key_column.attnum
    WHERE constraint_info.conrelid = 'public.coach_team_selections'::regclass
      AND constraint_info.contype = 'p'
      AND attribute.attname = 'season_year'
  ) THEN
    RAISE EXCEPTION 'coach_team_selections primary key is still missing season_year.';
  END IF;
END;
$$;
