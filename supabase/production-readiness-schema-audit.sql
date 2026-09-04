-- READ-ONLY production readiness audit.
-- This file only reads PostgreSQL metadata. It does not alter tables or data.

with required_columns(table_name, column_name) as (
  values
    ('app_settings', 'environment'),
    ('app_settings', 'season_year'),
    ('competition_seasons', 'environment'),
    ('competition_seasons', 'season_year'),
    ('competition_seasons', 'status'),
    ('afl_player_round_stats', 'environment'),
    ('afl_player_round_stats', 'season_year'),
    ('afl_player_round_stats', 'afl_round'),
    ('afl_player_round_stats', 'afl_team_name'),
    ('afl_player_round_stats', 'afl_team_code'),
    ('afl_player_round_stats', 'player_name'),
    ('afl_player_round_stats', 'k'),
    ('afl_player_round_stats', 'hb'),
    ('afl_player_round_stats', 'd'),
    ('afl_player_round_stats', 'm'),
    ('afl_player_round_stats', 'g'),
    ('afl_player_round_stats', 'b'),
    ('afl_player_round_stats', 't'),
    ('afl_player_round_stats', 'ho'),
    ('afl_player_round_stats', 'ga'),
    ('afl_player_round_stats', 'i50'),
    ('afl_player_round_stats', 'cl'),
    ('afl_player_round_stats', 'cg'),
    ('afl_player_round_stats', 'r50'),
    ('afl_player_round_stats', 'ff'),
    ('afl_player_round_stats', 'fa'),
    ('afl_player_round_stats', 'af'),
    ('afl_player_round_stats', 'sc'),
    ('afl_player_round_stats', 'score_source'),
    ('afl_player_round_stats', 'imported_at'),
    ('afl_player_round_stats', 'updated_at'),
    ('afl_round_finalisation', 'environment'),
    ('afl_round_finalisation', 'season_year'),
    ('afl_round_finalisation', 'afl_round'),
    ('afl_round_finalisation', 'active_source'),
    ('afl_round_finalisation', 'csv_imported_at'),
    ('afl_round_finalisation', 'player_row_count'),
    ('afl_round_finalisation', 'club_count'),
    ('afl_round_finalisation', 'updated_at')
),
column_checks as (
  select
    'column public.' || required.table_name || '.' || required.column_name as requirement,
    exists (
      select 1
      from information_schema.columns actual
      where actual.table_schema = 'public'
        and actual.table_name = required.table_name
        and actual.column_name = required.column_name
    ) as passed
  from required_columns required
),
unique_indexes as (
  select
    table_class.relname as table_name,
    array_agg(attribute.attname order by key_column.ordinality) as column_names
  from pg_index index_definition
  join pg_class table_class on table_class.oid = index_definition.indrelid
  join pg_namespace table_namespace on table_namespace.oid = table_class.relnamespace
  cross join lateral unnest(index_definition.indkey) with ordinality as key_column(attnum, ordinality)
  join pg_attribute attribute
    on attribute.attrelid = table_class.oid
   and attribute.attnum = key_column.attnum
  where table_namespace.nspname = 'public'
    and index_definition.indisunique
  group by index_definition.indexrelid, table_class.relname
),
unique_checks as (
  select
    'unique key public.afl_player_round_stats(environment, season_year, afl_round, afl_team_code, player_name)' as requirement,
    exists (
      select 1 from unique_indexes
      where table_name = 'afl_player_round_stats'
        and column_names = array['environment', 'season_year', 'afl_round', 'afl_team_code', 'player_name']::name[]
    ) as passed
  union all
  select
    'unique key public.afl_round_finalisation(environment, season_year, afl_round)',
    exists (
      select 1 from unique_indexes
      where table_name = 'afl_round_finalisation'
        and column_names = array['environment', 'season_year', 'afl_round']::name[]
    )
  union all
  select
    'primary key public.competition_seasons(environment, season_year)',
    exists (
      select 1 from unique_indexes
      where table_name = 'competition_seasons'
        and column_names = array['environment', 'season_year']::name[]
    )
),
function_signature_checks as (
  select
    'function public.replace_match_with_protected_csv(environment, season_year, afl_round, team_codes, rows)' as requirement,
    to_regprocedure('public.replace_match_with_protected_csv(text, integer, integer, text[], jsonb)') is not null as passed
  union all
  select
    'function public.upsert_live_match_if_unprotected(environment, season_year, afl_round, team_codes, rows)',
    to_regprocedure('public.upsert_live_match_if_unprotected(text, integer, integer, text[], jsonb)') is not null
  union all
  select
    'function public.delete_protected_round_csv(environment, season_year, afl_round)',
    to_regprocedure('public.delete_protected_round_csv(text, integer, integer)') is not null
  union all
  select
    'function public.archive_production_season(season_year, payload, row_counts, checksum, premier, confirmation)',
    to_regprocedure('public.archive_production_season(integer, jsonb, jsonb, text, text, text)') is not null
),
legacy_signature_checks as (
  select
    'legacy non-season replace_match_with_protected_csv signature is absent' as requirement,
    to_regprocedure('public.replace_match_with_protected_csv(text, integer, text[], jsonb)') is null as passed
  union all
  select
    'legacy non-season upsert_live_match_if_unprotected signature is absent',
    to_regprocedure('public.upsert_live_match_if_unprotected(text, integer, text[], jsonb)') is null
  union all
  select
    'legacy non-season delete_protected_round_csv signature is absent',
    to_regprocedure('public.delete_protected_round_csv(text, integer)') is null
),
locked_season_trigger_checks as (
  select
    'locked season write trigger exists on public.' || required.table_name as requirement,
    exists (
      select 1
      from information_schema.triggers actual
      where actual.trigger_schema = 'public'
        and actual.event_object_table = required.table_name
        and actual.trigger_name = 'reject_locked_season_write'
    ) as passed
  from (
    values
      ('super8_match_results'),
      ('season_fixture'),
      ('round_submissions'),
      ('coach_team_selections'),
      ('finals_results'),
      ('afl_player_round_stats'),
      ('afl_matches'),
      ('afl_round_finalisation'),
      ('weekly_team_lists')
  ) as required(table_name)
),
active_season_check as (
  select
    'production app_settings points at one draft or active competition season' as requirement,
    exists (
      select 1
      from public.app_settings settings
      join public.competition_seasons seasons
        on seasons.environment = settings.environment
       and seasons.season_year = settings.season_year
      where settings.environment = 'production'
        and seasons.status in ('draft', 'active')
    )
),
score_source_check as (
  select
    'score_source constraint permits live and csv' as requirement,
    not exists (
      select 1
      from pg_constraint constraint_definition
      join pg_class table_class on table_class.oid = constraint_definition.conrelid
      join pg_namespace table_namespace on table_namespace.oid = table_class.relnamespace
      where table_namespace.nspname = 'public'
        and table_class.relname = 'afl_player_round_stats'
        and constraint_definition.contype = 'c'
        and pg_get_constraintdef(constraint_definition.oid) ilike '%score_source%'
    )
    or exists (
      select 1
      from pg_constraint constraint_definition
      join pg_class table_class on table_class.oid = constraint_definition.conrelid
      join pg_namespace table_namespace on table_namespace.oid = table_class.relnamespace
      where table_namespace.nspname = 'public'
        and table_class.relname = 'afl_player_round_stats'
        and constraint_definition.contype = 'c'
        and pg_get_constraintdef(constraint_definition.oid) ilike '%score_source%'
        and pg_get_constraintdef(constraint_definition.oid) ilike '%live%'
        and pg_get_constraintdef(constraint_definition.oid) ilike '%csv%'
    ) as passed
)
select requirement, passed,
  case when passed then 'READY' else 'MISSING OR DIFFERENT' end as result
from (
  select * from column_checks
  union all
  select * from unique_checks
  union all
  select * from function_signature_checks
  union all
  select * from legacy_signature_checks
  union all
  select * from locked_season_trigger_checks
  union all
  select * from active_season_check
  union all
  select * from score_source_check
) checks
order by passed, requirement;
