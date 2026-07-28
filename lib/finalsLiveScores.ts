import { getPlayersForCoach } from "./playersByCoach";

type TeamData = Record<string, { onField?: string[]; emergencies?: string[] }>;

export type FinalsLiveStat = {
  afl_round: number;
  afl_team_code: string;
  player_name: string;
  d: number;
  m: number;
  g: number;
  b: number;
  t: number;
  ho: number;
  ff: number;
  fa: number;
};

const POSITIONS = ["KD", "DEF", "MID", "FOR", "KF", "RUC"];
const normaliseName = (value: string) => value.trim().toLowerCase();
const normaliseClub = (value: string | null | undefined) => {
  const club = value?.trim().toUpperCase() ?? "";
  return ({ BRL: "BRI", NTH: "NM" } as Record<string, string>)[club] ?? club;
};
const points = (stat: FinalsLiveStat) =>
  stat.d * 3 + stat.m * 4 + stat.g * 6 + stat.b + stat.t * 4 + stat.ho + stat.ff - stat.fa;

export function calculateFinalsLiveScore(params: {
  coachId: number;
  coachName: string;
  teamData: TeamData;
  stats: FinalsLiveStat[];
  aflRound: number;
}): number {
  const roundStats = params.stats.filter((stat) => stat.afl_round === params.aflRound);
  const statsByPlayer = new Map(roundStats.map((stat) => [normaliseName(stat.player_name), stat]));
  const importedClubs = new Set(roundStats.map((stat) => normaliseClub(stat.afl_team_code)));
  const playerClubs = new Map<string, string>();

  for (const players of Object.values(
    getPlayersForCoach({ coachId: params.coachId, coachName: params.coachName }),
  )) {
    for (const player of players) {
      playerClubs.set(normaliseName(player.name), normaliseClub(player.club));
    }
  }

  let total = 0;
  const usedEmergencies = new Set<string>();

  for (const position of POSITIONS) {
    const selection = params.teamData[position];
    if (!selection) continue;
    const emergencies = selection.emergencies ?? [];

    for (const playerName of selection.onField ?? []) {
      const playerKey = normaliseName(playerName);
      const stat = statsByPlayer.get(playerKey);
      if (stat) {
        total += points(stat);
        continue;
      }

      const club = playerClubs.get(playerKey);
      if (!club || !importedClubs.has(club)) continue;

      for (const emergencyName of emergencies) {
        const emergencyKey = normaliseName(emergencyName);
        if (usedEmergencies.has(emergencyKey)) continue;
        const emergencyClub = playerClubs.get(emergencyKey);
        if (!emergencyClub || !importedClubs.has(emergencyClub)) break;
        const emergencyStat = statsByPlayer.get(emergencyKey);
        if (emergencyStat) {
          usedEmergencies.add(emergencyKey);
          total += points(emergencyStat);
          break;
        }
      }
    }
  }

  return total;
}
