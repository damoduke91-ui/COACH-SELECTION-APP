export type LadderMatchResult = {
  round_number: number | null;
  coach_1_name: string | null;
  coach_1_score: number | null;
  coach_2_name: string | null;
  coach_2_score: number | null;
};

export type LadderStanding = {
  team: string;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  pointsFor: number;
  pointsAgainst: number;
  percentage: number;
  ladderPoints: number;
};

export function buildLadderStandings(
  results: LadderMatchResult[],
  maximumRound = 14,
): LadderStanding[] {
  const ladder = new Map<string, LadderStanding>();

  function team(name: string): LadderStanding {
    const existing = ladder.get(name);
    if (existing) return existing;
    const created: LadderStanding = {
      team: name,
      played: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      pointsFor: 0,
      pointsAgainst: 0,
      percentage: 0,
      ladderPoints: 0,
    };
    ladder.set(name, created);
    return created;
  }

  for (const result of results) {
    if ((result.round_number ?? 0) < 1 || (result.round_number ?? 0) > maximumRound) continue;
    const homeName = result.coach_1_name?.trim();
    const awayName = result.coach_2_name?.trim();
    const homeScore = result.coach_1_score;
    const awayScore = result.coach_2_score;
    if (!homeName || !awayName || homeScore === null || awayScore === null) continue;

    const home = team(homeName);
    const away = team(awayName);
    home.played += 1;
    away.played += 1;
    home.pointsFor += homeScore;
    home.pointsAgainst += awayScore;
    away.pointsFor += awayScore;
    away.pointsAgainst += homeScore;

    if (homeScore > awayScore) {
      home.wins += 1;
      home.ladderPoints += 4;
      away.losses += 1;
    } else if (awayScore > homeScore) {
      away.wins += 1;
      away.ladderPoints += 4;
      home.losses += 1;
    } else {
      home.draws += 1;
      away.draws += 1;
      home.ladderPoints += 2;
      away.ladderPoints += 2;
    }
  }

  return [...ladder.values()]
    .map((standing) => ({
      ...standing,
      percentage:
        standing.pointsAgainst > 0
          ? (standing.pointsFor / standing.pointsAgainst) * 100
          : 0,
    }))
    .sort(
      (left, right) =>
        right.ladderPoints - left.ladderPoints ||
        right.pointsFor - left.pointsFor ||
        left.team.localeCompare(right.team),
    );
}
