import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const selectTeamPage = readFileSync(
  new URL("../app/select-team/page.tsx", import.meta.url),
  "utf8"
);

test("resetting all teams clears manual lockout and rolls an enabled schedule forward", () => {
  const resetHandler = selectTeamPage.match(
    /async function handleResetAllTeams\(\) \{[\s\S]*?\n  \}\n\n  async function handleToggleTeamLockout/
  )?.[0];

  assert.ok(resetHandler, "handleResetAllTeams must remain present");
  assert.match(resetHandler, /buildLockoutAtIso\(/);
  assert.match(resetHandler, /team_lockout: false/);
  assert.match(resetHandler, /lockout_at: nextLockoutAt/);
  assert.match(resetHandler, /setManualTeamLockout\(false\)/);
  assert.match(resetHandler, /setLockoutScheduleAt\(nextLockoutAt\)/);
});
