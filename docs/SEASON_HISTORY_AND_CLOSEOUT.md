# Season history and closeout

## Active and historical seasons

`app_settings.season_year` is the controlled active season for each environment.
All competition reads and writes use that value unless the user is on the
read-only Season History or Admin Team Audit Log pages.

The Season History page reads `competition_seasons`, `super8_match_results`,
and `finals_results` by both environment and season. It contains no mutation
controls. Archived seasons remain protected by database write-lock triggers.

## Production closeout safeguards

The Production archive function is service-role only. It requires:

- the requested year to be the currently controlled Production season;
- an active `competition_seasons` row;
- a completed, non-drawn Grand Final;
- a non-empty Premiers name;
- an exact typed confirmation in the form
  `ARCHIVE PRODUCTION <year> <PREMIERS NAME>`;
- an exact source-row count for every archived table;
- a 64-character SHA-256 checksum.

The function locks the season row before verifying row counts. Competition
write triggers take a shared lock on the same row, preventing a write from
racing the archive transaction. Once archived, the season remains immutable.

The original 2026 archive is not changed or recreated. Its version 1 archive,
Snow Coast Premiers record, ladder, results and Finals remain season-scoped and
available through Season History.

## Future rollover sequence

1. Complete and verify the Grand Final.
2. Build and independently store the archive payload and SHA-256 checksum.
3. Record exact source-row counts.
4. Call the guarded Production archive function.
5. Verify the archived season and its checksum.
6. Create the next `competition_seasons` row and change `app_settings` only
   through the separately rehearsed rollover process.
7. Smoke-test active-season writes and historical-season reads.

Never reset or delete the previous Production season during rollover.

## AFL fixture context

Coach Selection reads opponent, venue and start time from the season-scoped
`afl_matches` rows for the controlled active season. The spreadsheet-derived
Round 23 and 24 overrides in `lib/aflFixtureOverrides.ts` are historical 2026
fallbacks only. Their lookup includes the season year so a future fixture with
the same round and clubs cannot inherit a 2026 date or venue.

For 2027 and later seasons, configure the current AFL provider season and sync
fixtures into `afl_matches`. Do not extend the 2026 override set or read the
spreadsheet live.
