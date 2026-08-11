# Repository automation setup

## Supabase migrations

The `Supabase migrations` workflow is intentionally disabled until migration history and credentials are configured.

1. Create a protected GitHub environment named `production-database` and require approval.
2. Add environment secrets:
   - `SUPABASE_ACCESS_TOKEN`
   - `SUPABASE_PROJECT_REF`
   - `SUPABASE_DB_PASSWORD`
3. Reconcile migrations previously applied manually with `supabase migration repair` before the first automated push. Confirm `supabase migration list --linked` shows local and remote history aligned.
4. Add repository variable `SUPABASE_MIGRATIONS_ENABLED=true` only after that reconciliation.
5. Run the workflow manually once and review the protected-environment approval and migration output.

After enablement, changes under `supabase/migrations/` on `master` trigger the protected workflow automatically.

## Preview Finals browser test

1. Create a protected GitHub environment named `preview-testing`.
2. Add environment secrets `E2E_ADMIN_EMAIL` and `E2E_ADMIN_PASSWORD` for a Preview-capable admin account.
3. Open **Actions → Preview Finals browser test → Run workflow**.
4. Enter the immutable Vercel Preview deployment URL.

The test signs in, verifies readiness, stages Week 4, and resets Preview back to a clean Week 1 state. Failure traces and screenshots are retained as a workflow artifact.
