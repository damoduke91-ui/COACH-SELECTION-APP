begin;

alter table public.app_settings
  add column if not exists team_list_sync_status text,
  add column if not exists team_list_sync_at timestamptz,
  add column if not exists team_list_sync_round integer,
  add column if not exists team_list_sync_player_count integer,
  add column if not exists team_list_sync_team_count integer,
  add column if not exists team_list_sync_message text;

commit;
