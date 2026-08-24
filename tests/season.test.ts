import assert from "node:assert/strict";
import test from "node:test";

import {
  buildSeasonYearOptions,
  canWriteSeason,
  isSeasonYear,
  nextSeasonYear,
  requireSeasonYear,
} from "../lib/season.ts";

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
