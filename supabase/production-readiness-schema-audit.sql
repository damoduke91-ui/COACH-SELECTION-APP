-- READ-ONLY production readiness audit.
-- This file only reads PostgreSQL metadata. It does not alter tables or data.

with required_columns(table_name, column_name) as (
  values
    ('afl_player_round_stats', 'environment'),
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
    'unique key public.afl_player_round_stats(environment, afl_round, afl_team_code, player_name)' as requirement,
    exists (
      select 1 from unique_indexes
      where table_name = 'afl_player_round_stats'
        and column_names = array['environment', 'afl_round', 'afl_team_code', 'player_name']::name[]
    ) as passed
  union all
  select
    'unique key public.afl_round_finalisation(environment, afl_round)',
    exists (
      select 1 from unique_indexes
      where table_name = 'afl_round_finalisation'
        and column_names = array['environment', 'afl_round']::name[]
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
  select * from score_source_check
) checks
order by passed, requirement;
