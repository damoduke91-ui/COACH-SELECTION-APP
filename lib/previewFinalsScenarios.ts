import type { FinalsMatchCode, FinalsResult } from "./finals";

export const PREVIEW_FINALS_REGULAR_RESULTS = [
  { matchupIndex: 1, coach1Id: 1, coach1Name: "The Cattery", coach1Score: 1800, coach2Id: 8, coach2Name: "Snow Coast", coach2Score: 1000 },
  { matchupIndex: 2, coach1Id: 2, coach1Name: "Kalamata Pythons", coach1Score: 1700, coach2Id: 7, coach2Name: "Pogers Bombers", coach2Score: 1100 },
  { matchupIndex: 3, coach1Id: 3, coach1Name: "Damos Magpies", coach1Score: 1600, coach2Id: 6, coach2Name: "Western Warriors", coach2Score: 1200 },
  { matchupIndex: 4, coach1Id: 4, coach1Name: "Spread Eagle", coach1Score: 1500, coach2Id: 5, coach2Name: "Push Up Kings", coach2Score: 1300 },
] as const;

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
