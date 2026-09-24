begin;

create table if not exists public.afl_live_stats_runs (
  id uuid primary key,
  environment text not null check (environment in ('preview', 'production')),
  season_year integer,
  afl_round integer,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null check (status in ('running', 'completed', 'degraded', 'failed', 'skipped')),
  error text,
  checked_matches integer,
  candidate_matches integer,
  results jsonb not null default '[]'::jsonb check (jsonb_typeof(results) = 'array')
);

create index if not exists afl_live_stats_runs_environment_started_idx
  on public.afl_live_stats_runs (environment, started_at desc);

alter table public.afl_live_stats_runs enable row level security;
revoke all on public.afl_live_stats_runs from anon, authenticated;
grant select, insert, update, delete on public.afl_live_stats_runs to service_role;

comment on table public.afl_live_stats_runs is
  'Best-effort cron heartbeat and match outcomes. Admin API only; no client access. Retain according to operator policy.';

commit;
