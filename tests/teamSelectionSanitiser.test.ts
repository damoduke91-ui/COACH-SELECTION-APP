import assert from "node:assert/strict";
import test from "node:test";

import { sanitiseTeamSelection } from "../lib/teamSelectionSanitiser.ts";

const positions = ["DEF", "MID"] as const;
const roster = {
  DEF: [{ name: "Current Defender" }],
  MID: [{ name: "Current Midfielder" }],
};

test("removes drafted-out players while retaining current players in their positions", () => {
  const result = sanitiseTeamSelection({
    input: {
      DEF: {
        onField: ["Drafted-out Defender", "Current Defender"],
        emergencies: [],
      },
      MID: {
        onField: [],
        emergencies: ["Current Midfielder", "Drafted-out Midfielder"],
      },
    },
    positions,
    roster,
  });

  assert.deepEqual(result, {
    DEF: { onField: ["Current Defender"], emergencies: [] },
    MID: { onField: [], emergencies: ["Current Midfielder"] },
  });
});

test("does not reinterpret a snapshot when no current roster is supplied", () => {
  const result = sanitiseTeamSelection({
    input: {
      DEF: { onField: ["Historical Defender"], emergencies: [] },
    },
    positions,
  });

  assert.deepEqual(result.DEF.onField, ["Historical Defender"]);
});
