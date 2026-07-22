-- Production-capable protected live/CSV operations.
-- This migration is prepared and tested locally before any production use.

-- Production already contains manually imported historical rows. Protect every
-- existing row as CSV; all future live writers explicitly set score_source=live.
alter table public.afl_player_round_stats
  add column if not exists score_source text,
  add column if not exists updated_at timestamptz;

update public.afl_player_round_stats
set score_source = 'csv'
where score_source is null;

update public.afl_player_round_stats
set updated_at = coalesce(imported_at, now())
where updated_at is null;

alter table public.afl_player_round_stats
  alter column score_source set default 'live',
  alter column score_source set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.afl_player_round_stats'::regclass
      and conname = 'afl_player_round_stats_score_source_check'
  ) then
    alter table public.afl_player_round_stats
      add constraint afl_player_round_stats_score_source_check
      check (score_source in ('live', 'csv'));
  end if;
end;
$$;

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
  v_round_csv_count integer;
  v_round_csv_club_count integer;
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
  into v_round_csv_count, v_round_csv_club_count
  from public.afl_player_round_stats
  where environment = p_environment
    and afl_round = p_afl_round
    and score_source = 'csv';

  insert into public.afl_round_finalisation (
    environment, afl_round, active_source, csv_imported_at,
    imported_player_count, imported_club_count, updated_at
  )
  values (
    p_environment,
    p_afl_round,
    case when v_round_csv_club_count >= 18 then 'csv' else 'mixed' end,
    now(),
    v_round_csv_count,
    v_round_csv_club_count,
    now()
  )
  on conflict (environment, afl_round) do update
  set active_source = excluded.active_source,
      csv_imported_at = excluded.csv_imported_at,
      imported_player_count = excluded.imported_player_count,
      imported_club_count = excluded.imported_club_count,
      updated_at = excluded.updated_at;

  return jsonb_build_object(
    'status', 'imported',
    'inserted_rows', v_inserted_count,
    'protected_rows', 0
  );
end;
$$;

create or replace function public.upsert_live_match_if_unprotected(
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
  v_written_count integer;
  v_protected_count integer;
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
    raise exception 'A non-empty live row array is required.';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_environment || ':' || p_afl_round::text));

  select count(*)
  into v_protected_count
  from public.afl_player_round_stats
  where environment = p_environment
    and afl_round = p_afl_round
    and afl_team_code = any(p_team_codes)
    and score_source = 'csv';

  if v_protected_count > 0 then
    return jsonb_build_object(
      'status', 'protected',
      'written_rows', 0,
      'protected_rows', v_protected_count
    );
  end if;

  create temporary table unprotected_live_rows
  on commit drop
  as
  select *
  from jsonb_to_recordset(p_rows) as row_data(
    environment text, afl_round integer, afl_team_name text, afl_team_code text,
    player_name text, k integer, hb integer, d integer, m integer, g integer,
    b integer, t integer, ho integer, ga integer, i50 integer, cl integer,
    cg integer, r50 integer, ff integer, fa integer, af integer, sc integer,
    imported_at timestamptz
  );

  if exists (
    select 1 from unprotected_live_rows
    where environment <> p_environment
       or afl_round <> p_afl_round
       or not (afl_team_code = any(p_team_codes))
       or nullif(trim(afl_team_code), '') is null
       or nullif(trim(player_name), '') is null
  ) then
    raise exception 'Live rows do not match the requested environment, round, and teams.';
  end if;

  if (select count(distinct afl_team_code) from unprotected_live_rows) <> 2 then
    raise exception 'Live rows must contain exactly the two requested teams.';
  end if;

  if exists (
    select 1
    from unprotected_live_rows
    group by environment, afl_round, afl_team_code, player_name
    having count(*) > 1
  ) then
    raise exception 'The live payload contains duplicate player rows.';
  end if;

  select count(*) into v_expected_count from unprotected_live_rows;

  insert into public.afl_player_round_stats (
    environment, afl_round, afl_team_name, afl_team_code, player_name,
    k, hb, d, m, g, b, t, ho, ga, i50, cl, cg, r50, ff, fa, af, sc,
    score_source, imported_at, updated_at
  )
  select
    environment, afl_round, afl_team_name, afl_team_code, player_name,
    k, hb, d, m, g, b, t, ho, ga, i50, cl, cg, r50, ff, fa, af, sc,
    'live', coalesce(imported_at, now()), now()
  from unprotected_live_rows
  on conflict (environment, afl_round, afl_team_code, player_name) do update
  set afl_team_name = excluded.afl_team_name,
      k = excluded.k,
      hb = excluded.hb,
      d = excluded.d,
      m = excluded.m,
      g = excluded.g,
      b = excluded.b,
      t = excluded.t,
      ho = excluded.ho,
      ga = excluded.ga,
      i50 = excluded.i50,
      cl = excluded.cl,
      cg = excluded.cg,
      r50 = excluded.r50,
      ff = excluded.ff,
      fa = excluded.fa,
      af = excluded.af,
      sc = excluded.sc,
      score_source = 'live',
      imported_at = excluded.imported_at,
      updated_at = now()
  where public.afl_player_round_stats.score_source <> 'csv';

  get diagnostics v_written_count = row_count;
  if v_written_count <> v_expected_count then
    raise exception 'Live write validation failed; no changes were retained.';
  end if;

  return jsonb_build_object(
    'status', 'imported',
    'written_rows', v_written_count,
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

  update public.afl_round_finalisation
  set active_source = 'live',
      csv_imported_at = null,
      imported_player_count = 0,
      imported_club_count = 0,
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

-- Keep existing Preview callers working through the generic protected functions.
create or replace function public.replace_preview_match_with_csv(
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
begin
  if p_environment <> 'preview' then
    raise exception 'This Preview wrapper only accepts the preview environment.';
  end if;
  return public.replace_match_with_protected_csv(p_environment, p_afl_round, p_team_codes, p_rows);
end;
$$;

create or replace function public.upsert_preview_live_match(
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
begin
  if p_environment <> 'preview' then
    raise exception 'This Preview wrapper only accepts the preview environment.';
  end if;
  return public.upsert_live_match_if_unprotected(p_environment, p_afl_round, p_team_codes, p_rows);
end;
$$;

revoke all on function public.replace_match_with_protected_csv(text, integer, text[], jsonb) from public, anon, authenticated;
revoke all on function public.upsert_live_match_if_unprotected(text, integer, text[], jsonb) from public, anon, authenticated;
revoke all on function public.delete_protected_round_csv(text, integer) from public, anon, authenticated;
grant execute on function public.replace_match_with_protected_csv(text, integer, text[], jsonb) to service_role;
grant execute on function public.upsert_live_match_if_unprotected(text, integer, text[], jsonb) to service_role;
grant execute on function public.delete_protected_round_csv(text, integer) to service_role;
