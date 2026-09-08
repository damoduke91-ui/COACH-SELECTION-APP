import assert from "node:assert/strict";
import test from "node:test";

import { calculateLivePlayerCounts } from "../lib/livePlayerCounts.ts";

test("pending plus counting always accounts for every selected scoring slot", () => {
  const rows = [
    ...Array.from({ length: 18 }, (_, index) => ({
      selectedType: "X",
      countsToTotal: index === 0,
    })),
    { selectedType: "I1", countsToTotal: false },
    { selectedType: "I2", countsToTotal: false },
  ];

  assert.deepEqual(calculateLivePlayerCounts(rows), {
    countingPlayers: 1,
    pendingPlayers: 17,
    selectedScoringSlots: 18,
  });
});

test("a played but unused interchange player does not consume a scoring slot", () => {
  const rows = [
    { selectedType: "X", countsToTotal: false },
    { selectedType: "I1", countsToTotal: false },
  ];

  assert.deepEqual(calculateLivePlayerCounts(rows), {
    countingPlayers: 0,
    pendingPlayers: 1,
    selectedScoringSlots: 1,
  });
});

test("a promoted interchange player resolves the on-field scoring slot", () => {
  const rows = [
    { selectedType: "X", countsToTotal: false },
    { selectedType: "I1", countsToTotal: true },
  ];

  assert.deepEqual(calculateLivePlayerCounts(rows), {
    countingPlayers: 1,
    pendingPlayers: 0,
    selectedScoringSlots: 1,
  });
});
