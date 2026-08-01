begin;

alter table public.app_settings
  add column if not exists latest_team_list_round integer;

update public.app_settings
set latest_team_list_round = current_afl_round
where latest_team_list_round is null
  and current_afl_round is not null;

commit;
