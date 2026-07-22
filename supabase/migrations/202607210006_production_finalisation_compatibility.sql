-- Align protected CSV operations with the production finalisation schema.
-- The added columns only support the isolated local Preview schema; production
-- already uses player_row_count and club_count.

alter table public.afl_round_finalisation
  add column if not exists player_row_count integer not null default 0,
  add column if not exists club_count integer not null default 0;

create or replace function public.replace_match_with_protected_csv(
  p_environment text,
  p_afl_round integer,
  p_team_codes text[],
  p_rows jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expected_count integer;
  v_existing_csv_count integer;
  v_inserted_count integer;
  v_round_player_count integer;
  v_round_club_count integer;
begin
  if p_environment not in ('preview', 'production') then
    raise exception 'Only preview or production environments are accepted.';
  end if;

  if p_afl_round is null or p_afl_round < 1 then
    raise exception 'A valid AFL round is required.';
  end if;

  if coalesce(array_length(p_team_codes, 1), 0) <> 2
     or p_team_codes[1] is null
     or p_team_codes[2] is null
     or trim(p_team_codes[1]) = ''
     or trim(p_team_codes[2]) = ''
     or p_team_codes[1] = p_team_codes[2] then
    raise exception 'Exactly two distinct match team codes are required.';
  end if;

  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'A non-empty CSV row array is required.';
  end if;

  v_expected_count := jsonb_array_length(p_rows);
  perform pg_advisory_xact_lock(hashtext(p_environment || ':' || p_afl_round::text));

  create temporary table protected_csv_rows
  on commit drop
  as
  select *
  from jsonb_to_recordset(p_rows) as row_data(
    environment text, afl_round integer, afl_team_name text, afl_team_code text,
    player_name text, k integer, hb integer, d integer, m integer, g integer,
    b integer, t integer, ho integer, ga integer, i50 integer, cl integer,
    cg integer, r50 integer, ff integer, fa integer, af integer, sc integer
  );

  if (select count(*) from protected_csv_rows) <> v_expected_count then
    raise exception 'CSV row parsing changed the expected row count.';
  end if;

  if exists (
    select 1 from protected_csv_rows
    where environment <> p_environment
       or afl_round <> p_afl_round
       or not (afl_team_code = any(p_team_codes))
       or nullif(trim(afl_team_code), '') is null
       or nullif(trim(player_name), '') is null
  ) then
    raise exception 'CSV rows do not match the requested environment, round, and teams.';
  end if;

  if (select count(distinct afl_team_code) from protected_csv_rows) <> 2 then
    raise exception 'CSV rows must contain exactly the two requested teams.';
  end if;

  if exists (
    select 1
    from protected_csv_rows
    group by environment, afl_round, afl_team_code, player_name
    having count(*) > 1
  ) then
    raise exception 'The CSV contains duplicate player rows.';
  end if;

  select count(*)
  into v_existing_csv_count
  from public.afl_player_round_stats
  where environment = p_environment
    and afl_round = p_afl_round
    and afl_team_code = any(p_team_codes)
    and score_source = 'csv';

  if v_existing_csv_count > 0 then
    return jsonb_build_object(
      'status', case when v_existing_csv_count = v_expected_count then 'protected' else 'partial_conflict' end,
      'inserted_rows', 0,
      'protected_rows', v_existing_csv_count
    );
  end if;

  delete from public.afl_player_round_stats
  where environment = p_environment
    and afl_round = p_afl_round
    and afl_team_code = any(p_team_codes)
    and score_source = 'live';

  insert into public.afl_player_round_stats (
    environment, afl_round, afl_team_name, afl_team_code, player_name,
    k, hb, d, m, g, b, t, ho, ga, i50, cl, cg, r50, ff, fa, af, sc,
    score_source, imported_at, updated_at
  )
  select
    environment, afl_round, afl_team_name, afl_team_code, player_name,
    k, hb, d, m, g, b, t, ho, ga, i50, cl, cg, r50, ff, fa, af, sc,
    'csv', now(), now()
  from protected_csv_rows;

  get diagnostics v_inserted_count = row_count;
  if v_inserted_count <> v_expected_count then
    raise exception 'CSV replacement validation failed; no changes were retained.';
  end if;

  select count(*), count(distinct afl_team_code)
  into v_round_player_count, v_round_club_count
  from public.afl_player_round_stats
  where environment = p_environment
    and afl_round = p_afl_round;

  insert into public.afl_round_finalisation (
    environment, afl_round, active_source, csv_imported_at,
    player_row_count, club_count, updated_at
  )
  values (
    p_environment,
    p_afl_round,
    case when v_round_club_count >= 18 then 'csv' else null end,
    case when v_round_club_count >= 18 then now() else null end,
    v_round_player_count,
    v_round_club_count,
    now()
  )
  on conflict (environment, afl_round) do update
  set active_source = case
        when excluded.club_count >= 18 then 'csv'
        else public.afl_round_finalisation.active_source
      end,
      csv_imported_at = case
        when excluded.club_count >= 18 then excluded.csv_imported_at
        else public.afl_round_finalisation.csv_imported_at
      end,
      player_row_count = excluded.player_row_count,
      club_count = excluded.club_count,
      updated_at = excluded.updated_at;

  return jsonb_build_object(
    'status', 'imported',
    'inserted_rows', v_inserted_count,
    'protected_rows', 0
  );
end;
$$;

create or replace function public.delete_protected_round_csv(
  p_environment text,
  p_afl_round integer
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_count integer;
  v_remaining_player_count integer;
  v_remaining_club_count integer;
begin
  if p_environment not in ('preview', 'production') then
    raise exception 'Only preview or production environments are accepted.';
  end if;

  if p_afl_round is null or p_afl_round < 1 then
    raise exception 'A valid AFL round is required.';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_environment || ':' || p_afl_round::text));

  delete from public.afl_player_round_stats
  where environment = p_environment
    and afl_round = p_afl_round
    and score_source = 'csv';
  get diagnostics v_deleted_count = row_count;

  select count(*), count(distinct afl_team_code)
  into v_remaining_player_count, v_remaining_club_count
  from public.afl_player_round_stats
  where environment = p_environment
    and afl_round = p_afl_round;

  update public.afl_round_finalisation
  set active_source = case when v_remaining_player_count > 0 then 'live_fallback' else null end,
      csv_imported_at = null,
      player_row_count = v_remaining_player_count,
      club_count = v_remaining_club_count,
      updated_at = now()
  where environment = p_environment
    and afl_round = p_afl_round;

  return jsonb_build_object(
    'status', 'deleted',
    'deleted_rows', v_deleted_count,
    'environment', p_environment,
    'afl_round', p_afl_round
  );
end;
$$;

revoke all on function public.replace_match_with_protected_csv(text, integer, text[], jsonb)
  from public, anon, authenticated;
revoke all on function public.delete_protected_round_csv(text, integer)
  from public, anon, authenticated;
grant execute on function public.replace_match_with_protected_csv(text, integer, text[], jsonb)
  to service_role;
grant execute on function public.delete_protected_round_csv(text, integer)
  to service_role;

-- Mark only complete 18-club production rounds as CSV-active. Partial legacy
-- rounds remain unchanged, while their player rows are still protected.
insert into public.afl_round_finalisation (
  environment, afl_round, active_source, csv_imported_at,
  player_row_count, club_count, updated_at
)
select
  stats.environment,
  stats.afl_round,
  'csv',
  max(stats.imported_at),
  count(*),
  count(distinct stats.afl_team_code),
  now()
from public.afl_player_round_stats stats
where stats.environment = 'production'
  and stats.score_source = 'csv'
group by stats.environment, stats.afl_round
having count(distinct stats.afl_team_code) >= 18
on conflict (environment, afl_round) do update
set active_source = 'csv',
    csv_imported_at = excluded.csv_imported_at,
    player_row_count = excluded.player_row_count,
    club_count = excluded.club_count,
    updated_at = excluded.updated_at;
