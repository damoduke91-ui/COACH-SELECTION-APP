-- Complete the season boundary for weekly AFL team-list imports.
-- The legacy (round, player_name) key was removed by the protected pipeline
-- migration, but the replacement season-aware key was not created there.

CREATE UNIQUE INDEX IF NOT EXISTS weekly_team_lists_season_player_key
ON public.weekly_team_lists (
  environment,
  season_year,
  round,
  player_name
);
