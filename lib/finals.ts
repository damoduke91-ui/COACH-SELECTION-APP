export const REGULAR_SEASON_ROUNDS = 14;
export const FINALS_AFL_ROUNDS = [21, 22, 23, 24] as const;

export const FINALS_TEAM_NAMES: Record<number, string> = {
  1: "The Cattery",
  2: "Kalamata Pythons",
  3: "Damos Magpies",
  4: "Spread Eagle",
  5: "Push Up Kings",
  6: "Western Warriors",
  7: "Pogers Bombers",
  8: "Snow Coast",
};

export type RegularSeasonResult = {
  round_number: number | null;
  coach_1_name: string | null;
  coach_1_score: number | null;
  coach_2_name: string | null;
  coach_2_score: number | null;
};

export type FinalsMatchCode = "QF" | "EF" | "SF1" | "SF2" | "PF" | "GF";
export type FinalsResult = {
  match_code: FinalsMatchCode;
  coach_1_score: number | null;
  coach_2_score: number | null;
};
export type FinalsTeam = { seed: number | null; name: string };
export type FinalsMatch = {
  code: FinalsMatchCode;
  week: 1 | 2 | 3 | 4;
  label: string;
  home: FinalsTeam | null;
  away: FinalsTeam | null;
  homeScore: number | null;
  awayScore: number | null;
  winner: FinalsTeam | null;
  loser: FinalsTeam | null;
  complete: boolean;
};
export type FinalsBracket = {
  seeds: FinalsTeam[];
  bye: FinalsTeam | null;
  matches: FinalsMatch[];
  premier: FinalsTeam | null;
};

function makeMatch(
  results: FinalsResult[],
  code: FinalsMatchCode,
  week: 1 | 2 | 3 | 4,
  label: string,
  home: FinalsTeam | null,
  away: FinalsTeam | null,
): FinalsMatch {
  const result = results.find((row) => row.match_code === code);
  const homeScore = result?.coach_1_score ?? null;
  const awayScore = result?.coach_2_score ?? null;
  const complete =
    Boolean(home && away) &&
    homeScore !== null &&
    awayScore !== null &&
    homeScore !== awayScore;
  let winner: FinalsTeam | null = null;
  let loser: FinalsTeam | null = null;
  if (complete && home && away) {
    winner = homeScore > awayScore ? home : away;
    loser = homeScore > awayScore ? away : home;
  }
  return { code, week, label, home, away, homeScore, awayScore, winner, loser, complete };
}

export function buildFinalsSeeds(results: RegularSeasonResult[]): FinalsTeam[] {
  const table = new Map<
    string,
    { name: string; points: number; pointsFor: number; pointsAgainst: number }
  >();
  const team = (name: string) => {
    const existing = table.get(name);
    if (existing) return existing;
    const created = { name, points: 0, pointsFor: 0, pointsAgainst: 0 };
    table.set(name, created);
    return created;
  };

  for (const result of results) {
    if ((result.round_number ?? 0) > REGULAR_SEASON_ROUNDS) continue;
    const homeName = result.coach_1_name?.trim();
    const awayName = result.coach_2_name?.trim();
    const homeScore = result.coach_1_score;
    const awayScore = result.coach_2_score;
    if (!homeName || !awayName || homeScore === null || awayScore === null) continue;
    const home = team(homeName);
    const away = team(awayName);
    home.pointsFor += homeScore;
    home.pointsAgainst += awayScore;
    away.pointsFor += awayScore;
    away.pointsAgainst += homeScore;
    if (homeScore > awayScore) home.points += 4;
    else if (awayScore > homeScore) away.points += 4;
    else {
      home.points += 2;
      away.points += 2;
    }
  }

  return [...table.values()]
    .sort(
      (a, b) =>
        b.points - a.points ||
        b.pointsFor - a.pointsFor ||
        a.name.localeCompare(b.name),
    )
    .slice(0, 5)
    .map((row, index) => ({ seed: index + 1, name: row.name }));
}

export function buildFinalsBracket(
  regularResults: RegularSeasonResult[],
  finalsResults: FinalsResult[],
): FinalsBracket {
  const seeds = buildFinalsSeeds(regularResults);
  const seed = (position: number) => seeds[position - 1] ?? null;
  const qf = makeMatch(finalsResults, "QF", 1, "Qualifying Final", seed(2), seed(3));
  const ef = makeMatch(finalsResults, "EF", 1, "Elimination Final", seed(4), seed(5));
  const sf1 = makeMatch(finalsResults, "SF1", 2, "1st Semi Final", seed(1), qf.winner);
  const sf2 = makeMatch(finalsResults, "SF2", 2, "2nd Semi Final", qf.loser, ef.winner);
  const pf = makeMatch(finalsResults, "PF", 3, "Preliminary Final", sf1.loser, sf2.winner);
  const gf = makeMatch(finalsResults, "GF", 4, "Grand Final", sf1.winner, pf.winner);
  return {
    seeds,
    bye: seed(1),
    matches: [qf, ef, sf1, sf2, pf, gf],
    premier: gf.winner,
  };
}

export function getFinalsWeekForCompetitionRound(round: number | null): number | null {
  if (round === null || round < 15 || round > 18) return null;
  return round - REGULAR_SEASON_ROUNDS;
}

export function getFinalsWeekForAflRound(round: number | null): number | null {
  if (round === null) return null;
  const index = FINALS_AFL_ROUNDS.indexOf(round as (typeof FINALS_AFL_ROUNDS)[number]);
  return index === -1 ? null : index + 1;
}

export function displayFinalsTeam(team: FinalsTeam | null, fallback: string): string {
  return team ? `${team.seed ? `${team.seed}. ` : ""}${team.name}` : fallback;
}
