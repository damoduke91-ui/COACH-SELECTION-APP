import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSeasonYearOptions,
  canWriteSeason,
  isSeasonYear,
  nextSeasonYear,
  requireSeasonYear,
} from "../lib/season.ts";
import { buildLadderStandings } from "../lib/ladder.ts";

test("season years stay within the supported operational range", () => {
  assert.equal(isSeasonYear(2026), true);
  assert.equal(isSeasonYear(2100), true);
  assert.equal(isSeasonYear(1999), false);
  assert.equal(isSeasonYear(2026.5), false);
  assert.equal(isSeasonYear("2026"), false);
});

test("invalid controlled season settings fail closed", () => {
  assert.throws(() => requireSeasonYear(null), /controlled season year/i);
  assert.throws(() => requireSeasonYear(2101), /controlled season year/i);
});

test("only draft and active seasons accept writes", () => {
  assert.equal(canWriteSeason("draft"), true);
  assert.equal(canWriteSeason("active"), true);
  assert.equal(canWriteSeason("completed"), false);
  assert.equal(canWriteSeason("archived"), false);
});

test("the next season is derived from controlled state", () => {
  assert.equal(nextSeasonYear(2026), 2027);
});

test("season selectors retain history and prefer the active season", () => {
  assert.deepEqual(buildSeasonYearOptions(2027, [2026, 2027, 2026, null, "2025"]), [
    2027,
    2026,
  ]);
});

test("historical ladders ignore finals and incomplete results", () => {
  const ladder = buildLadderStandings([
    { round_number: 1, coach_1_name: "A", coach_1_score: 100, coach_2_name: "B", coach_2_score: 90 },
    { round_number: 2, coach_1_name: "A", coach_1_score: null, coach_2_name: "B", coach_2_score: null },
    { round_number: 15, coach_1_name: "B", coach_1_score: 200, coach_2_name: "A", coach_2_score: 10 },
  ]);

  assert.deepEqual(ladder.map((standing) => ({ team: standing.team, played: standing.played, points: standing.ladderPoints })), [
    { team: "A", played: 1, points: 4 },
    { team: "B", played: 1, points: 0 },
  ]);
});
