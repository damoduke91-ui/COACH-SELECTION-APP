import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { mapAflPlayerStat } from "../lib/aflLiveStats.ts";
import type { AflMatchRow, AflPlayerStat } from "../lib/aflLiveStats.ts";

const migration = readFileSync(
  "supabase/migrations/202609010002_seed_afl_player_name_aliases.sql",
  "utf8",
);

const match: AflMatchRow = {
  id: 1,
  environment: "production",
  season_year: 2027,
  afl_round: 1,
  afl_match_id: 100,
  afl_match_provider_id: "provider-match",
  home_team_provider_id: "gws-provider",
  away_team_provider_id: "other-provider",
  home_team_code: "GWS",
  away_team_code: "CAR",
  home_app_team_code: "GWS",
  away_app_team_code: "CAR",
  home_team_name: "GWS Giants",
  away_team_name: "Carlton",
};

const nicholasMaddenStat: AflPlayerStat = {
  teamId: "gws-provider",
  playerStats: {
    player: {
      playerName: {
        givenName: "Nicholas",
        surname: "Madden",
      },
    },
    stats: {
      disposals: 4,
      hitouts: 12,
      dreamTeamPoints: 26,
    },
  },
};

test("Madden alias is provisioned for preview and production without a season scope", () => {
  assert.match(migration, /\('preview', 'Nicholas Madden', 'Nick Madden'\)/);
  assert.match(migration, /\('production', 'Nicholas Madden', 'Nick Madden'\)/);
  assert.doesNotMatch(migration, /season_year/);
  assert.match(migration, /ON CONFLICT \(environment, afl_name\) DO UPDATE/);
});

test("live AFL stats map Nicholas Madden to the canonical roster name in 2027", () => {
  const mapped = mapAflPlayerStat(
    match,
    nicholasMaddenStat,
    "2027-03-20T08:00:00.000Z",
    new Map([["Nicholas Madden", "Nick Madden"]]),
  );

  assert.ok(mapped);
  assert.equal(mapped.afl_player_name, "Nicholas Madden");
  assert.equal(mapped.row.player_name, "Nick Madden");
  assert.equal(mapped.row.season_year, 2027);
  assert.equal(mapped.row.af, 26);
});

test("the mapping does not reinterpret a completed 2026 row", () => {
  const historicalMatch = { ...match, season_year: 2026, afl_round: 22 };
  const mapped = mapAflPlayerStat(
    historicalMatch,
    nicholasMaddenStat,
    "2026-08-09T04:45:00.350Z",
    new Map([["Nicholas Madden", "Nick Madden"]]),
  );

  assert.ok(mapped);
  assert.equal(mapped.row.season_year, 2026);
  assert.equal(mapped.row.afl_round, 22);
  assert.equal(mapped.row.player_name, "Nick Madden");
  assert.equal(mapped.row.af, 26);
});
