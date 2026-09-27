# Live Stats Health

Open **Dashboard → Live Stats Health** (`/admin/live-stats`) while signed in as an admin. The page refreshes every 30 seconds while visible. It performs read-only requests and never invokes an importer.

## Installation

1. Apply `supabase/migrations/202609210001_add_live_stats_health.sql` using the normal migration process for each target database.
2. Deploy the changed application files.
3. Optionally set the server environment variable `LIVE_STATS_EXPECTED_INTERVAL_MINUTES` to the actual scheduler interval. The default is 5 minutes; stale means more than two intervals since the last recorded call. No schedule is added or changed by this feature.
4. Confirm that a scheduler actually calls `/api/cron/live-afl-stats` before expecting history. None was identified in the checked configuration as of 23 September 2026. Deploying this dashboard does not create a schedule. History starts with the first authorized call; previous errors/counts cannot be reconstructed.

## What is recorded

`afl_live_stats_runs` stores a heartbeat before settings load, season/round context, candidate counts, per-match outcomes as they finish, and completion/failure. Fixture refresh and finalisation errors also appear. An interrupted process leaves a running heartbeat which becomes stale. Checkpoint writes have a 1.5 second timeout. After a transient failure, further checkpoints accumulate in memory and one completion upsert (bounded to 3 seconds) can repair the run using its original ID and start time. Missing-table and permission errors disable further writes. Monitoring failure never throws into the import pipeline. The protected stats RPC, CSV protection, match eligibility and final-snapshot validation are unchanged. AFL source-season validation is now enforced before fixture refresh/import writes.

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


## Reliability follow-up (26 September 2026)

Read-only Vercel log inspection identified `Upstash-QStash` as the caller. A sampled Production request returned 200 in 6.81 seconds, with a five-minute function maximum. The deployed route accepted this user-agent only with the existing admin secret; the user-agent itself is not proof of identity. The follow-up retains that header/query secret path and adds `Authorization: Bearer <CRON_SECRET>` support while rejecting user-agent-only access. No QStash schedule or secret was changed or exposed.

The checked 500-row history contained 467 completed runs and 33 without completion. The historical runtime logs were outside the account's available log window. A telemetry timeout previously disabled even the final write, which is a reproducible way to leave an unfinished row, not proof of what happened to each historical import. Completion upserts now get an independent bounded attempt after a transient checkpoint failure. The dashboard shows older unfinished records alongside recent errors, with outcome explicitly unknown.

The project and shared Vercel environment-variable search showed no `AFL_COMP` override. The public AFL fixture API confirms source ID 85 is the 2026 Premiership. Production's controlled season is 2027 and it has no 2027 match rows. The fallback to 85 is now allowed only for 2026; other years require an explicit positive `AFL_COMP_SEASON_ID`. Fixture responses must provide matching year evidence through their season/match provider ID or season name; conflicting or unverified rows stop the entire batch before writes. This applies to cron fixture refresh and manual fixture synchronization.

With the current configuration, deployment will cause cron calls to report a missing 2027 source configuration (HTTP 500 and a failed history entry) rather than silently querying 2026. QStash may retry unsuccessful deliveries according to its existing retry policy. Before live 2027 imports are wanted, verify the official 2027 AFL source ID and fixtures, configure the value in Vercel and redeploy. No 2027 ID has been assumed or fabricated. Do not run the manual fixture-sync endpoint using the 2026 source ID.

No database migration is required. No live importer was invoked for testing and no historical run status was overwritten. Validate with the unit/API tests and a build using placeholder database settings. After an approved deployment, inspect normal QStash calls for correct secret authorization and the expected configuration message; once the 2027 source is verified, use normal scheduled runs to observe completion recovery. Do not use spoofed user-agent requests against the existing Production route as an authentication test, as it is write-capable.
