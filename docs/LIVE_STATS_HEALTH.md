# Live Stats Health

Open **Dashboard → Live Stats Health** (`/admin/live-stats`) while signed in as an admin. The page refreshes every 30 seconds while visible. It performs read-only requests and never invokes an importer.

## Installation

1. Apply `supabase/migrations/202609210001_add_live_stats_health.sql` using the normal migration process for each target database.
2. Deploy the changed application files.
3. Optionally set the server environment variable `LIVE_STATS_EXPECTED_INTERVAL_MINUTES` to the actual scheduler interval. The default is 5 minutes; stale means more than two intervals since the last recorded call. No schedule is added or changed by this feature.
4. Confirm that a scheduler actually calls `/api/cron/live-afl-stats` before expecting history. None was identified in the checked configuration as of 23 September 2026. Deploying this dashboard does not create a schedule. History starts with the first authorized call; previous errors/counts cannot be reconstructed.

## What is recorded

`afl_live_stats_runs` stores a heartbeat before settings load, season/round context, candidate counts, per-match outcomes as they finish, and completion/failure. Fixture refresh and finalisation errors also appear. An interrupted process leaves a running heartbeat which becomes stale. Monitoring requests have a 1.5 second timeout; the first monitoring failure disables further logging for that invocation. Monitoring failure never throws into the import pipeline. No stats RPC, CSV protection, match eligibility, final validation or season guard was changed.

The API verifies Supabase bearer tokens and admin profiles on the server. Preview accepts its existing Production-admin fallback; Production does not accept Preview-only admins. The table has RLS enabled and no client policies or client grants; access is through the service-role API only. Responses are private/no-store and scoped to the server's environment. Match data uses the controlled season and round.

## Interpretation and limits

- Heartbeat reports calls to the cron endpoint, including authorized manual calls. It does not prove that an external scheduler is configured. Production's `vercel.json` schedules `/api/cron/auto-submit-teams` only; that existing schedule is preserved.
- The latest 100 runs are read per environment. Per-match outcomes are selected within the current season and round from this window; older outcomes show as unavailable. Up to 30 recent errors are displayed.
- Last poll/import are existing match timestamps for the current round. The existing pipeline only updates its poll timestamp after a successful import; use cron history to see failed or skipped attempts.
- Counts are rows reported by an attempt, not cumulative totals. Missing counts remain unknown. Protected/final skips may not report counts. A failure after a stats write can leave an unknown written count.
- The manual import and preview routes are unchanged and are not included in cron history. The manual import route currently uses a direct upsert, unlike the protected cron RPC.
- Missing migration/history is shown explicitly while existing match timestamps remain visible. No telemetry exists for a request rejected by authorization or a failure before the database client can be created.
- There is no automatic history deletion. At a five-minute interval there are 288 runs/day/environment. Apply your normal database retention policy (for example, delete runs older than 30 days during scheduled maintenance).

## Test and rollout checks

Run `npm test`, `npm run typecheck`, `npm run check:encoding` and `npm run build`.

Initial validation completed with 30 tests, TypeScript, targeted ESLint, encoding and the production build passing. Validation on the current Production baseline includes 50 passing tests. On this Windows host the build needed `NEXT_TURBOPACK_EXPERIMENTAL_USE_SYSTEM_TLS_CERTS=1` to download the existing Google fonts. No repository font configuration was changed.

A local headless Edge check with fixture data passed for the anonymous API/page, populated desktop and mobile dashboard, lack of page-wide mobile overflow, and clearing the display after an admin-access rejection. No browser exceptions occurred. These fixture checks do not validate the deployed database. The owner subsequently reported applying the migration successfully through the Production SQL Editor. The migration is retained here for version control and is safe to reapply through the normal migration process.

## Deployment preparation (23 September 2026)

The deployment branch is based on current Production commit `2b9025b`, not the older local checkout. It adds only the dashboard, health API, telemetry helper, migration, tests, documentation and the dashboard navigation link. It preserves newer team-submission, historical-export and other Production changes. Unrelated local edits are not included.

Read-only checks confirmed Production points to 2027 Round 1, with 2026 archived and 2027 active. Both new dashboard URLs returned 404 before deployment. The active Windows FootyWire tasks invoke a CSV fetch/import script, and the latest inspected GitHub CSV job skipped fetch/import. Neither is evidence of calls to the live-stats endpoint.

Live-stat scheduling needs a separate decision after dashboard deployment. Before enabling it, verify the 2027 AFL competition-season identifier and fixtures, the required server secrets, authenticated scheduler access, and the intended cadence. The existing cron route accepts a `vercel-cron` user-agent as authorization; replace that with secret verification before connecting a new scheduler. Do not invoke the write-capable cron endpoint merely to test dashboard deployment.

After deployment, verify `/admin/live-stats` loads for an administrator and anonymous `/api/admin/live-stats-health` returns 401. Read the empty history state without invoking an importer. This installation has only a Production database; use fixture-based tests for failure scenarios instead of disrupting that database.

In a Preview deployment/database:

1. Before the migration, confirm the page reports history unavailable without breaking the existing cron response.
2. Apply the migration. Confirm signed-out API access returns 401 and a coach token returns 403. An admin should see the controlled environment/season/round.
3. Let the existing cron run. Verify its candidates/outcomes match the page, including protected CSV skips and already-finalised skips. The dashboard itself must not initiate imports.
4. Check a failed match or fixture refresh in Preview: its reason should appear in recent errors and a completed run should be marked degraded. An interrupted run should become stale after two expected intervals.
5. Confirm no-candidate runs still record a completed heartbeat; a completed/archived season records a skip without a false error.
6. Verify an unavailable telemetry table leaves the importer operational. Do not delete or disrupt the production monitoring table to test this.

No database migration or live import should be triggered merely to render or refresh the dashboard.
