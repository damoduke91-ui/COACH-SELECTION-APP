import type { FinalsMatchCode, FinalsResult } from "./finals";

export const PREVIEW_FINALS_SCENARIOS = [
  { week: 1, aflRound: 21, super8Round: 15, prerequisiteMatches: [] },
  { week: 2, aflRound: 22, super8Round: 16, prerequisiteMatches: ["QF", "EF"] },
  { week: 3, aflRound: 23, super8Round: 17, prerequisiteMatches: ["QF", "EF", "SF1", "SF2"] },
  { week: 4, aflRound: 24, super8Round: 18, prerequisiteMatches: ["QF", "EF", "SF1", "SF2", "PF"] },
] as const satisfies ReadonlyArray<{
  week: 1 | 2 | 3 | 4;
  aflRound: number;
  super8Round: number;
  prerequisiteMatches: readonly FinalsMatchCode[];
}>;

const DETERMINISTIC_SCORES: Record<FinalsMatchCode, readonly [number, number]> = {
  QF: [101, 91],
  EF: [102, 92],
  SF1: [103, 93],
  SF2: [104, 94],
  PF: [105, 95],
  GF: [106, 96],
};

export function getPreviewFinalsScenario(week: number) {
  return PREVIEW_FINALS_SCENARIOS.find((scenario) => scenario.week === week) ?? null;
}

export function buildPreviewFinalsPrerequisites(week: number): FinalsResult[] {
  const scenario = getPreviewFinalsScenario(week);
  if (!scenario) return [];
  return scenario.prerequisiteMatches.map((match_code) => ({
    match_code,
    coach_1_score: DETERMINISTIC_SCORES[match_code][0],
    coach_2_score: DETERMINISTIC_SCORES[match_code][1],
  }));
}
