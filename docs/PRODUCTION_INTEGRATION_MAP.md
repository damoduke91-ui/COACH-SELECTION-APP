# Production Integration Map

This map is preparation only. It does not authorise a production merge, database migration or deployment.

## Source and destination

- Approved development source: private repository `damoduke91-ui/COACH-SELECTION-APP-DEVELOPMENT`, branch `master`.
- Production repository: `damoduke91-ui/COACH-SELECTION-APP`, branch `master`.
- Common baseline commit: `6a2b91f` (`Use final match count for round status`).
- Original local production folder: `C:\Dev\COACH-SELECTION-APP`.

## Preserve before any integration

The original production worktree currently has uncommitted user changes in:

- `app/results/page.tsx`
- `app/select-team/page.tsx`

Do not overwrite, restore, reset, checkout, stash or copy over these files. Before a future integration, the user should decide how to save them, preferably as their own reviewed commit or recoverable patch.

Do not merge or cherry-pick the complete development branch. It contains development-only Preview infrastructure and copied versions of the two protected files.

## Production application allowlist

Only these application files are required for the production pipeline:

- `.github/workflows/production-afl-csv-replacement.yml`
- `app/api/admin/delete-production-round-csv/route.ts`
- `app/api/admin/dispatch-production-github-pipeline/route.ts`
- `app/api/cron/live-afl-stats/route.ts`
- `app/dashboard/page.tsx`
- `tools/afl-preview-fetcher/afl_stats_scheduled_runner.py`
- `tools/afl-preview-fetcher/requirements.txt`
- `tools/import-production-worker-csv.py`
- `tools/validate-preview-worker-output.py`

The dashboard file must be integrated against the production baseline with a reviewed patch. Do not use an unreviewed whole-branch merge.

## Production database allowlist

Apply only these reviewed migrations, in order:

1. `supabase/migrations/202607210005_protected_stats_pipeline.sql`
2. `supabase/migrations/202607210006_production_finalisation_compatibility.sql`

Do not apply local Preview migrations `202607190001` through `202607200004` to hosted production.

The read-only audit file may be retained for verification:

- `supabase/production-readiness-schema-audit.sql`

## Explicit development-only exclusions

Do not copy these into the production integration unless separately reviewed for another purpose:

- `.github/workflows/preview-afl-csv-fetch.yml`
- `.github/workflows/local-production-pipeline-rehearsal.yml`
- `app/api/admin/check-preview-csv-import/`
- `app/api/admin/delete-preview-round-stats/`
- `app/api/admin/dispatch-preview-github-pipeline/`
- `app/api/admin/import-preview-csv-files/`
- `app/api/admin/preview-afl-csv-pipeline/`
- `app/api/admin/run-preview-afl-fetcher/`
- `app/api/admin/run-preview-live-csv-pipeline/`
- `lib/localPreviewSupabaseAdmin.ts`
- `supabase/migrations/202607190001_local_preview_csv_pipeline.sql`
- `supabase/migrations/202607190002_local_preview_service_permissions.sql`
- `supabase/migrations/202607200003_local_preview_pipeline_runs.sql`
- `supabase/migrations/202607200004_atomic_preview_live_writes.sql`
- `supabase/config.toml`
- `tools/import-local-production-rehearsal-csv.py`
- `tools/import-preview-worker-csv.py`
- `tools/test-local-csv-protection.mjs`
- `tools/test-local-live-csv-concurrency.mjs`
- `tools/test-local-production-stats-protection.mjs`
- development-only Supabase CLI package changes
- Preview login/bootstrap changes

## Locked production configuration

Keep both switches disabled during integration:

- GitHub repository variable `PRODUCTION_PIPELINE_ENABLED` absent or `false`.
- Vercel environment variable `PRODUCTION_PIPELINE_DISPATCH_ENABLED` absent or `false`.
- Vercel environment variable `PRODUCTION_CSV_DELETE_ENABLED` absent or `false`.

The production workflow also requires, but must not receive until the approved rollout stage:

- GitHub Actions secret `PRODUCTION_SUPABASE_URL`.
- GitHub Actions secret `PRODUCTION_SUPABASE_SERVICE_ROLE_KEY`.
- Vercel server-only variable `GITHUB_PRODUCTION_WORKFLOW_TOKEN`.
- A Windows self-hosted runner registered or authorised for the production repository.

## Future integration sequence

1. Preserve the two existing uncommitted user files.
2. Create a dedicated production integration branch from the current production `master`.
3. Apply only the allowlisted application changes.
4. Copy only migrations `005` and `006`.
5. Keep both production enable switches off.
6. Run TypeScript and the full production build.
7. Review the integration diff and verify the protected user files are unchanged.
8. Push the integration branch and use a reviewed pull request; do not deploy yet.
9. Apply the database migration only in the separately approved rollout window.
10. Configure secrets, verify the locked state, then conduct the controlled production test.
