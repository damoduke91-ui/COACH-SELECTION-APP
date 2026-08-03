grant select on table public.afl_matches to authenticated;

alter table public.afl_matches enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'afl_matches'
      and policyname = 'Authenticated users can read preview AFL fixtures'
  ) then
    create policy "Authenticated users can read preview AFL fixtures"
      on public.afl_matches
      for select
      to authenticated
      using (environment = 'preview');
  end if;
end
$$;
