# Production Live-to-CSV Pipeline Readiness

This document prepares the production rollout. It does not authorise or perform a deployment.

## Proven in isolated development

- FootyWire fetcher generates one CSV per completed match.
- Round and CSV environment validation stop mismatched imports.
- New match CSV files replace only the matching live rows.
- Existing CSV rows are protected and skipped by default.
- Simultaneous live and CSV writes finished safely in 20 out of 20 local races.
- A production-shaped local test proved live replacement, CSV protection and explicit deletion.
- The private Windows GitHub runner fetches, validates and imports into local Supabase.
- The production workflow is locked and its test dispatch skipped all runner steps.
- The dashboard production dispatcher is locked unless explicitly enabled.
- Read-only production audit confirmed all nine Round 20 matches have complete match IDs, provider IDs, team IDs, team names, app team codes and start times.

## Local production-mode rehearsal evidence

- Run `29794731459`: 9 match files imported, 414 rows inserted, production not contacted.
- Run `29794934167`: repeat run imported 0 files and 0 rows; all 9 files were protected; production not contacted.
- Run `29803155970`: after removing one local match, imported only 1 missing file and 46 rows while protecting 8 files; production not contacted.
- Run `29803365574`: Round 20 confirmation against Round 19 FootyWire output failed during validation; the import step was skipped and all 414 protected local rows remained intact.
- Next.js 16.1.6 production build passed on 21 July 2026, including TypeScript, all 18 static pages and both production pipeline admin routes. The local Windows build used `NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS=1` to download the existing Google fonts.

## Production database prerequisites

Before applying migrations, run `supabase/production-readiness-schema-audit.sql` in the production Supabase SQL editor. Every result must say `READY`.

Read-only audit on 21 July 2026 found the production tables and unique keys ready except for `afl_player_round_stats.score_source` and `afl_player_round_stats.updated_at`. The protected migration adds both columns. Existing manually imported rows are backfilled as protected CSV rows, while future rows default to live unless the writer explicitly selects CSV.

Apply and verify these migrations only during an approved rollout:

1. `202607210005_protected_stats_pipeline.sql`
2. `202607210006_production_finalisation_compatibility.sql`

After migration, confirm the service role can execute:

- `replace_match_with_protected_csv`
- `upsert_live_match_if_unprotected`
- `delete_protected_round_csv`

## Production GitHub repository prerequisites

Repository: `damoduke91-ui/COACH-SELECTION-APP`

- Copy the approved production workflow to the production repository.
- Register or authorise a Windows self-hosted runner for the production repository.
- Add Actions secret `PRODUCTION_SUPABASE_URL`.
- Add Actions secret `PRODUCTION_SUPABASE_SERVICE_ROLE_KEY`.
- Keep repository variable `PRODUCTION_PIPELINE_ENABLED` absent or `false` during setup.
- Enable `PRODUCTION_PIPELINE_ENABLED=true` only for the approved end-to-end production test.
- Restrict repository administration and Actions secret access to trusted administrators.

## Production Vercel prerequisites

- Add server-only `GITHUB_PRODUCTION_WORKFLOW_TOKEN` with access only to the production repository and permission to dispatch/read Actions runs.
- Keep `PRODUCTION_PIPELINE_DISPATCH_ENABLED` absent or `false` during setup.
- Keep `PRODUCTION_CSV_DELETE_ENABLED` absent or `false` during setup and normal operation. Enable it only for an approved exception deletion window, then disable it immediately.
- Confirm `NEXT_PUBLIC_APP_ENV=production`.
- Confirm existing Supabase URL, anonymous key and service-role key refer to the intended production project.
- Enable `PRODUCTION_PIPELINE_DISPATCH_ENABLED=true` only after the database migration and GitHub workflow checks pass.

## Approved rollout order

1. Back up the production database.
2. Run the read-only schema audit and resolve every missing requirement.
3. Apply the protected database migrations.
4. Verify function permissions and run non-mutating database checks.
5. Add production GitHub secrets while leaving its enable variable off.
6. Deploy approved application code while leaving the Vercel dispatcher switch off.
7. Confirm the production dashboard reports the dispatcher as locked.
8. Enable the GitHub and Vercel switches for a controlled single-match test.
9. Verify row counts, sources, workflow artifact and app results.
10. Repeat the pipeline and confirm all existing CSV files are protected and zero rows change.

## Rollback and exception rules

- Do not use the old direct-clear endpoint for the automated workflow.
- If fetching or validation fails, retain existing live and CSV rows.
- Never overwrite protected CSV rows during a retry.
- Use the separate production deletion control only for an approved exception.
- The exception control must inspect first, require the exact round phrase and delete only CSV rows.
- Disable both production switches immediately if an end-to-end test does not match expected counts.
