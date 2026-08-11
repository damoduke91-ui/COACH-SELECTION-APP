import { FINALS_TEAM_NAMES, type FinalsMatch } from "./finals.ts";

export type FinalsReadiness = {
  requiredTeamCount: number;
  submittedTeamCount: number;
  importedClubCount: number;
  playerRowCount: number;
  bracketReady: boolean;
  roundAligned: boolean;
  canComplete: boolean;
};

export function calculateFinalsReadiness(params: {
  week: number | null;
  aflRound: number | null;
  super8Round: number | null;
  matches: FinalsMatch[];
  submittedCoachIds: number[];
  statRows: Array<{ afl_round: number; afl_team_code: string }>;
}): FinalsReadiness {
  const currentMatches = params.week
    ? params.matches.filter((match) => match.week === params.week)
    : [];
  const requiredTeams = currentMatches.flatMap((match) => [match.home?.name, match.away?.name]).filter((name): name is string => Boolean(name));
  const coachIdByTeam = new Map(Object.entries(FINALS_TEAM_NAMES).map(([id, name]) => [name.trim().toLowerCase(), Number(id)]));
  const requiredCoachIds = requiredTeams.map((name) => coachIdByTeam.get(name.trim().toLowerCase())).filter((id): id is number => Boolean(id));
  const submitted = new Set(params.submittedCoachIds);
  const submittedTeamCount = requiredCoachIds.filter((id) => submitted.has(id)).length;
  const currentStats = params.aflRound === null ? [] : params.statRows.filter((row) => row.afl_round === params.aflRound);
  const importedClubCount = new Set(currentStats.map((row) => row.afl_team_code.trim().toUpperCase()).filter(Boolean)).size;
  const roundAligned = Boolean(params.week && params.aflRound === 20 + params.week && params.super8Round === 14 + params.week);
  const bracketReady = currentMatches.length > 0 && requiredTeams.length === currentMatches.length * 2;
  const requiredTeamCount = requiredCoachIds.length;

  return {
    requiredTeamCount,
    submittedTeamCount,
    importedClubCount,
    playerRowCount: currentStats.length,
    bracketReady,
    roundAligned,
    canComplete:
      roundAligned &&
      bracketReady &&
      requiredTeamCount > 0 &&
      submittedTeamCount === requiredTeamCount &&
      importedClubCount === 18,
  };
}
