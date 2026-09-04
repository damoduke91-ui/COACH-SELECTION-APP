import assert from "node:assert/strict";
import test from "node:test";

import {
  buildCoachBreakdownRows,
  type CoachTeamData,
  type PlayerClubInfo,
  type PlayerStatRow,
} from "../lib/super8LiveFinalisation.ts";

function stat(playerName: string, club: string, points = 50): PlayerStatRow {
  return {
    afl_team_code: club,
    player_name: playerName,
    d: points / 5,
    m: 5,
    g: 0,
    b: 0,
    t: 0,
    ho: 0,
    ff: 0,
    fa: 0,
  };
}

function playerLookup(entries: Array<[string, string]>): Map<string, PlayerClubInfo> {
  return new Map(entries.map(([name, club]) => [name.toLowerCase(), { club }]));
}

const teamData: CoachTeamData = {
  MID: {
    onField: ["On-field DNP"],
    emergencies: ["Emergency One", "Emergency Two", "Emergency Three", "Emergency Four", "Emergency Five"],
  },
};

const lookup = playerLookup([
  ["On-field DNP", "DNP"],
  ["Emergency One", "E1"],
  ["Emergency Two", "E2"],
  ["Emergency Three", "E3"],
  ["Emergency Four", "E4"],
  ["Emergency Five", "E5"],
]);

test("does not promote a lower-priority emergency while I1 is still pending", () => {
  const rows = buildCoachBreakdownRows({
    teamData,
    statsMap: new Map([["emergency five", stat("Emergency Five", "E5")]]),
    importedClubCodes: new Set(["DNP", "E5"]),
    playerLookup: lookup,
  });

  const countingRows = rows.filter((row) => row.countsToTotal);
  assert.deepEqual(countingRows.map((row) => row.selectedType), []);
  assert.equal(rows.find((row) => row.selectedType === "I5")?.played, true);
});

test("moves to I2 only after I1's club has been imported and I1 has no stat row", () => {
  const rows = buildCoachBreakdownRows({
    teamData,
    statsMap: new Map([
      ["emergency two", stat("Emergency Two", "E2")],
      ["emergency five", stat("Emergency Five", "E5")],
    ]),
    importedClubCodes: new Set(["DNP", "E1", "E2", "E5"]),
    playerLookup: lookup,
  });

  const replacement = rows.find((row) => row.countsToTotal);
  assert.equal(replacement?.selectedType, "I2");
});

test("promotes I5 only after I1 through I4 are confirmed DNPs", () => {
  const rows = buildCoachBreakdownRows({
    teamData,
    statsMap: new Map([["emergency five", stat("Emergency Five", "E5")]]),
    importedClubCodes: new Set(["DNP", "E1", "E2", "E3", "E4", "E5"]),
    playerLookup: lookup,
  });

  const replacement = rows.find((row) => row.countsToTotal);
  assert.equal(replacement?.selectedType, "I5");
});
