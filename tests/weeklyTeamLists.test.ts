import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const syncScript = readFileSync("scripts/sync_weekly_team_lists.py", "utf8");
const migration = readFileSync(
  "supabase/migrations/202609010001_season_scope_weekly_team_lists.sql",
  "utf8",
);

test("weekly team-list sync resolves and writes the controlled active season", () => {
  assert.match(syncScript, /def controlled_season/);
  assert.match(syncScript, /"competition_seasons"/);
  assert.match(syncScript, /season_rows\[0\]\.get\("status"\) != "active"/);
  assert.match(syncScript, /"environment": environment/);
  assert.match(syncScript, /"season_year": season_year/);
});

test("weekly team-list operations use the complete season-aware identity", () => {
  assert.match(
    syncScript,
    /on_conflict=environment,season_year,round,player_name/,
  );
  assert.match(syncScript, /"environment": f"eq\.\{environment\}"/);
  assert.match(syncScript, /"season_year": f"eq\.\{season_year\}"/);
  assert.match(
    migration,
    /environment,[\s\S]*season_year,[\s\S]*round,[\s\S]*player_name/,
  );
});
