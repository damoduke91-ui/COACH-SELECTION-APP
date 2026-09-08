import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { getExactPreviousRound } from "../lib/teamCarryForward.ts";

const selectTeamPage = readFileSync(
  new URL("../app/select-team/page.tsx", import.meta.url),
  "utf8",
);
const migration = readFileSync(
  new URL(
    "../supabase/migrations/202609010003_season_scope_auto_submit_previous_team.sql",
    import.meta.url,
  ),
  "utf8",
);
const cronRoute = readFileSync(
  new URL("../app/api/cron/auto-submit-teams/route.ts", import.meta.url),
  "utf8",
);

test("last round means exactly current Super 8 round minus one", () => {
  assert.equal(getExactPreviousRound(14), 13);
  assert.equal(getExactPreviousRound(2), 1);
  assert.equal(getExactPreviousRound(1), null);
  assert.equal(getExactPreviousRound(null), null);
  assert.equal(getExactPreviousRound(14.5), null);
});

test("coach carry-forward requires the exact submitted prior round in the active season", () => {
  assert.match(selectTeamPage, /\.eq\("season_year", seasonYear\)/);
  assert.match(selectTeamPage, /\.eq\("round_number", previousRoundNumber\)/);
  assert.match(selectTeamPage, /\.eq\("is_submitted", true\)/);
  assert.doesNotMatch(
    selectTeamPage.slice(
      selectTeamPage.indexOf("async function handleUseLastWeekTeam"),
      selectTeamPage.indexOf("function validateTeamState"),
    ),
    /\.order\("round_number", \{ ascending: false \}\)/,
  );
});

test("automatic carry-forward cannot read or write another season", () => {
  assert.match(migration, /status = 'active'/);
  assert.match(migration, /selection\.season_year = settings_row\.season_year/);
  assert.match(migration, /previous_submission\.season_year = settings_row\.season_year/);
  assert.match(migration, /current_submission\.season_year = settings_row\.season_year/);
  assert.match(migration, /previous_submission\.round_number = previous_round_number/);
  assert.match(migration, /ON CONFLICT \(environment, season_year, coach_id, round_number\)/);
  assert.match(
    migration,
    /DROP CONSTRAINT IF EXISTS coach_team_selections_coach_environment_key/,
  );
  assert.match(
    migration,
    /DROP CONSTRAINT IF EXISTS round_submissions_coach_round_environment_key/,
  );
});

test("the scheduled endpoint is protected and invokes only the service-role RPC", () => {
  assert.match(cronRoute, /authorization === `Bearer \$\{cronSecret\}`/);
  assert.match(cronRoute, /auto_submit_previous_teams_at_lockout/);
  assert.match(cronRoute, /supabaseAdmin\.rpc/);
});
