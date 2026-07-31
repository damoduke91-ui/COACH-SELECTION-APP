alter table public.afl_matches
  add column if not exists venue text;

comment on column public.afl_matches.venue is
  'Short venue name supplied by the AFL fixture feed or an approved fixture override.';
