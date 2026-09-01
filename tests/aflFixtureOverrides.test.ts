import assert from "node:assert/strict";
import test from "node:test";

import { getAflFixtureOverride } from "../lib/aflFixtureOverrides.ts";

test("preserves the approved 2026 fixture override", () => {
  assert.deepEqual(getAflFixtureOverride(2026, 23, "ADE", "FRE"), {
    seasonYear: 2026,
    round: 23,
    homeTeamCode: "ADE",
    awayTeamCode: "FRE",
    utcStartTime: "2026-08-14T10:10:00.000Z",
    venue: "OS",
  });
});

test("does not apply a 2026 override to the active 2027 season", () => {
  assert.equal(getAflFixtureOverride(2027, 23, "ADE", "FRE"), null);
});

test("requires the exact season, round, and home-away pairing", () => {
  assert.equal(getAflFixtureOverride(2026, 22, "ADE", "FRE"), null);
  assert.equal(getAflFixtureOverride(2026, 23, "FRE", "ADE"), null);
});
