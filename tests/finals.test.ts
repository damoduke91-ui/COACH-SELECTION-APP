import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFinalsBracket,
  displayFinalsTeam,
  getFinalsWeekForAflRound,
  getFinalsWeekForCompetitionRound,
  type FinalsResult,
  type RegularSeasonResult,
} from "../lib/finals.ts";
import {
  buildPreviewFinalsPrerequisites,
  getPreviewFinalsScenario,
} from "../lib/previewFinalsScenarios.ts";
import { buildDeterministicPreviewStats } from "../lib/previewAflStats.ts";

const regularSeasonResults: RegularSeasonResult[] = [
  { round_number: 1, coach_1_name: "Seed 1", coach_1_score: 500, coach_2_name: "Seed 5", coach_2_score: 100 },
  { round_number: 1, coach_1_name: "Seed 2", coach_1_score: 400, coach_2_name: "Seed 4", coach_2_score: 100 },
  { round_number: 2, coach_1_name: "Seed 3", coach_1_score: 300, coach_2_name: "Seed 5", coach_2_score: 100 },
  { round_number: 2, coach_1_name: "Seed 4", coach_1_score: 200, coach_2_name: "Seed 5", coach_2_score: 100 },
  { round_number: 15, coach_1_name: "Seed 5", coach_1_score: 9999, coach_2_name: "Seed 1", coach_2_score: 0 },
];

const completedFinals: FinalsResult[] = [
  { match_code: "QF", coach_1_score: 100, coach_2_score: 110 },
  { match_code: "EF", coach_1_score: 120, coach_2_score: 90 },
  { match_code: "SF1", coach_1_score: 130, coach_2_score: 100 },
  { match_code: "SF2", coach_1_score: 125, coach_2_score: 115 },
  { match_code: "PF", coach_1_score: 140, coach_2_score: 120 },
  { match_code: "GF", coach_1_score: 135, coach_2_score: 145 },
];

test("maps Super 8 and AFL finals rounds to Finals Weeks 1-4", () => {
  assert.deepEqual([15, 16, 17, 18].map(getFinalsWeekForCompetitionRound), [1, 2, 3, 4]);
  assert.deepEqual([21, 22, 23, 24].map(getFinalsWeekForAflRound), [1, 2, 3, 4]);
  assert.equal(getFinalsWeekForCompetitionRound(14), null);
  assert.equal(getFinalsWeekForCompetitionRound(19), null);
  assert.equal(getFinalsWeekForAflRound(20), null);
  assert.equal(getFinalsWeekForAflRound(25), null);
});

test("builds the top-five bracket without counting finals as regular-season games", () => {
  const bracket = buildFinalsBracket(regularSeasonResults, []);

  assert.deepEqual(bracket.seeds.map((team) => team.name), ["Seed 1", "Seed 2", "Seed 3", "Seed 4", "Seed 5"]);
  assert.equal(bracket.bye?.name, "Seed 1");
  assert.deepEqual(
    bracket.matches.map((match) => [match.code, match.week, match.home?.name, match.away?.name]),
    [
      ["QF", 1, "Seed 2", "Seed 3"],
      ["EF", 1, "Seed 4", "Seed 5"],
      ["SF1", 2, "Seed 1", undefined],
      ["SF2", 2, undefined, undefined],
      ["PF", 3, undefined, undefined],
      ["GF", 4, undefined, undefined],
    ],
  );
});

test("progresses winners and losers through all four finals weeks", () => {
  const bracket = buildFinalsBracket(regularSeasonResults, completedFinals);
  const match = (code: FinalsResult["match_code"]) => bracket.matches.find((item) => item.code === code);

  assert.deepEqual(
    bracket.matches.map((item) => [item.code, item.home?.name, item.away?.name, item.winner?.name]),
    [
      ["QF", "Seed 2", "Seed 3", "Seed 3"],
      ["EF", "Seed 4", "Seed 5", "Seed 4"],
      ["SF1", "Seed 1", "Seed 3", "Seed 1"],
      ["SF2", "Seed 2", "Seed 4", "Seed 2"],
      ["PF", "Seed 3", "Seed 2", "Seed 3"],
      ["GF", "Seed 1", "Seed 3", "Seed 3"],
    ],
  );
  assert.equal(match("PF")?.loser?.name, "Seed 2");
  assert.equal(bracket.premier?.name, "Seed 3");
  assert.equal(displayFinalsTeam(bracket.premier, "To be decided"), "3. Seed 3");
  assert.equal(displayFinalsTeam(null, "To be decided"), "To be decided");
});

test("does not progress a tied or incomplete final", () => {
  const bracket = buildFinalsBracket(regularSeasonResults, [
    { match_code: "QF", coach_1_score: 100, coach_2_score: 100 },
    { match_code: "EF", coach_1_score: 120, coach_2_score: null },
  ]);

  assert.equal(bracket.matches[0]?.complete, false);
  assert.equal(bracket.matches[0]?.winner, null);
  assert.equal(bracket.matches[1]?.complete, false);
  assert.equal(bracket.matches[1]?.winner, null);
});

test("defines matching deterministic Preview staging rounds for Finals Weeks 1-4", () => {
  assert.deepEqual(
    [1, 2, 3, 4].map((week) => getPreviewFinalsScenario(week)),
    [
      { week: 1, aflRound: 21, super8Round: 15, prerequisiteMatches: [] },
      { week: 2, aflRound: 22, super8Round: 16, prerequisiteMatches: ["QF", "EF"] },
      { week: 3, aflRound: 23, super8Round: 17, prerequisiteMatches: ["QF", "EF", "SF1", "SF2"] },
      { week: 4, aflRound: 24, super8Round: 18, prerequisiteMatches: ["QF", "EF", "SF1", "SF2", "PF"] },
    ],
  );
  assert.equal(getPreviewFinalsScenario(0), null);
  assert.equal(getPreviewFinalsScenario(5), null);
});

test("stages only completed prerequisite matches with stable non-drawn scores", () => {
  assert.deepEqual(buildPreviewFinalsPrerequisites(1), []);
  assert.deepEqual(buildPreviewFinalsPrerequisites(4), [
    { match_code: "QF", coach_1_score: 101, coach_2_score: 91 },
    { match_code: "EF", coach_1_score: 102, coach_2_score: 92 },
    { match_code: "SF1", coach_1_score: 103, coach_2_score: 93 },
    { match_code: "SF2", coach_1_score: 104, coach_2_score: 94 },
    { match_code: "PF", coach_1_score: 105, coach_2_score: 95 },
  ]);
});

test("builds repeatable Preview fixture stats for mapped players", () => {
  const params = {
    aflRound: 21,
    players: [
      { player_name: "Player One", afl_team: "Club One" },
      { player_name: "Player Two", afl_team: "Club Two" },
      { player_name: "Unmapped Player", afl_team: "Unknown" },
    ],
    teamCodeByName: new Map([["club one", "ONE"], ["club two", "TWO"]]),
    importedAt: "2026-08-10T00:00:00.000Z",
  };
  const first = buildDeterministicPreviewStats(params);
  const second = buildDeterministicPreviewStats(params);
  assert.deepEqual(first, second);
  assert.equal(first.length, 2);
  assert.deepEqual(first.map((row) => row.afl_team_code), ["ONE", "TWO"]);
  assert.ok(first.every((row) => row.d === row.k + row.hb && row.af > 0));
});
