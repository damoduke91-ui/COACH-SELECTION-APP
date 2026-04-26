"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { APP_ENV, supabase } from "../../lib/supabase";
import { getPlayersForCoach } from "../../lib/playersByCoach";

type LoginSession = {
  userId: string;
  email: string;
  role: "admin" | "coach";
  coachId: number | null;
  coachName: string;
};

type UserProfileRow = {
  id: string;
  role: "admin" | "coach";
  coach_id: number | null;
  coach_name: string | null;
};

type AppSettingsRow = {
  current_afl_round: number | string | null;
};

type FixtureRow = {
  id: number;
  environment: "production" | "preview";
  competition_round: number;
  afl_round: number;
  matchup_index: number;
  coach_id: number;
  coach_name: string;
  opponent_coach_id: number;
  opponent_coach_name: string;
};

type MatchResultRow = {
  id: number;
  round_number: number;
  afl_round: number | null;
  matchup_index: number;
  coach_1_id: number;
  coach_1_name: string;
  coach_1_score: number;
  coach_2_id: number;
  coach_2_name: string;
  coach_2_score: number;
  imported_at: string;
};

type TeamPositionData = {
  onField?: string[];
  emergencies?: string[];
};

type CoachTeamData = Record<string, TeamPositionData>;

type RoundSubmissionRow = {
  id: number;
  coach_id: number;
  coach_name: string;
  round_number: number;
  team_data: CoachTeamData;
  submitted_at: string;
};

type AflPlayerRoundStatRow = {
  id: number;
  afl_round: number;
  afl_team_name: string | null;
  afl_team_code: string;
  player_name: string;
  k: number;
  hb: number;
  d: number;
  m: number;
  g: number;
  b: number;
  t: number;
  ho: number;
  ga: number;
  i50: number;
  cl: number;
  cg: number;
  r50: number;
  ff: number;
  fa: number;
  af: number;
  sc: number;
  imported_at: string;
};

type PlayerClubInfo = {
  club: string;
  position: string;
  number: number;
};

type PlayerBreakdownRow = {
  key: string;
  position: string;
  selectedType: string;
  playerName: string;
  playerClub: string | null;
  stat: AflPlayerRoundStatRow | null;
  points: number | null;
  played: boolean;
  clubImported: boolean;
  countsToTotal: boolean;
  replacedPlayerName: string | null;
};

type CoachAutoScoreDetails = {
  coachId: number;
  coachName: string;
  submission: RoundSubmissionRow | null;
  rows: PlayerBreakdownRow[];
  teamTotal: number;
  countedPlayers: number;
  pendingPlayers: number;
};

type MatchAutoOutcome = {
  label: string;
  margin: number | null;
  isDraw: boolean;
  winnerName: string | null;
  loserName: string | null;
  isReadyToScore: boolean;
};

type FixtureMatch = {
  key: string;
  roundNumber: number;
  aflRound: number | null;
  matchupIndex: number;
  coach1Id: number;
  coach1Name: string;
  coach2Id: number;
  coach2Name: string;
};

function toNumber(value: unknown, fallback = 0): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function toNullableNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

function formatScore(value: number | null | undefined): string {
  const num = Number(value);

  if (!Number.isFinite(num)) {
    return "0";
  }

  if (Number.isInteger(num)) {
    return String(num);
  }

  return num.toFixed(1);
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function sortFixtureRows(rows: FixtureRow[]): FixtureRow[] {
  return [...rows].sort((a, b) => {
    if (a.competition_round !== b.competition_round) {
      return a.competition_round - b.competition_round;
    }

    if (a.afl_round !== b.afl_round) {
      return a.afl_round - b.afl_round;
    }

    if (a.matchup_index !== b.matchup_index) {
      return a.matchup_index - b.matchup_index;
    }

    return a.coach_id - b.coach_id;
  });
}

function buildFixtureMatches(rows: FixtureRow[]): FixtureMatch[] {
  const matchMap = new Map<string, FixtureMatch>();

  for (const row of sortFixtureRows(rows)) {
    const coachIds = [row.coach_id, row.opponent_coach_id].sort((a, b) => a - b);
    const key = `${row.competition_round}-${row.afl_round}-${row.matchup_index}-${coachIds.join("-")}`;

    if (!matchMap.has(key)) {
      matchMap.set(key, {
        key,
        roundNumber: row.competition_round,
        aflRound: row.afl_round,
        matchupIndex: row.matchup_index,
        coach1Id: row.coach_id,
        coach1Name: row.coach_name,
        coach2Id: row.opponent_coach_id,
        coach2Name: row.opponent_coach_name,
      });
    }
  }

  return Array.from(matchMap.values()).sort((a, b) => {
    if (a.roundNumber !== b.roundNumber) return a.roundNumber - b.roundNumber;
    if ((a.aflRound ?? 0) !== (b.aflRound ?? 0)) return (a.aflRound ?? 0) - (b.aflRound ?? 0);
    return a.matchupIndex - b.matchupIndex;
  });
}

function buildResultKey(roundNumber: number, matchupIndex: number): string {
  return `${roundNumber}-${matchupIndex}`;
}

function isUsersMatch(match: FixtureMatch, coachId: number | null | undefined): boolean {
  if (!coachId) return false;
  return match.coach1Id === coachId || match.coach2Id === coachId;
}

function getResultOutcome(result: MatchResultRow | null) {
  if (!result) {
    return {
      label: "Result not entered",
      margin: null as number | null,
      isDraw: false,
      winnerName: null as string | null,
      loserName: null as string | null,
    };
  }

  const coach1Score = toNumber(result.coach_1_score);
  const coach2Score = toNumber(result.coach_2_score);

  if (coach1Score === coach2Score) {
    return {
      label: `${result.coach_1_name} ${formatScore(coach1Score)} drew with ${result.coach_2_name} ${formatScore(coach2Score)}`,
      margin: 0,
      isDraw: true,
      winnerName: null,
      loserName: null,
    };
  }

  const coach1Won = coach1Score > coach2Score;
  const winnerName = coach1Won ? result.coach_1_name : result.coach_2_name;
  const loserName = coach1Won ? result.coach_2_name : result.coach_1_name;
  const winnerScore = coach1Won ? coach1Score : coach2Score;
  const loserScore = coach1Won ? coach2Score : coach1Score;
  const margin = Math.abs(coach1Score - coach2Score);

  return {
    label: `${winnerName} ${formatScore(winnerScore)} def. ${loserName} ${formatScore(loserScore)}`,
    margin,
    isDraw: false,
    winnerName,
    loserName,
  };
}

const POSITION_ORDER = ["KD", "DEF", "MID", "FOR", "KF", "RUC"];

function normalisePlayerName(value: string): string {
  return value.trim().toLowerCase();
}

function calculatePlayerPoints(stat: AflPlayerRoundStatRow | null): number | null {
  if (!stat) return null;

  return stat.d * 3 + stat.m * 4 + stat.g * 6 + stat.b + stat.t * 4 + stat.ho + stat.ff - stat.fa;
}

function buildStatsMapForRound(statsRows: AflPlayerRoundStatRow[], aflRound: number | null): Map<string, AflPlayerRoundStatRow> {
  const map = new Map<string, AflPlayerRoundStatRow>();

  if (!aflRound) return map;

  for (const row of statsRows) {
    if (row.afl_round !== aflRound) continue;
    map.set(normalisePlayerName(row.player_name), row);
  }

  return map;
}

function buildImportedClubSetForRound(statsRows: AflPlayerRoundStatRow[], aflRound: number | null): Set<string> {
  const clubs = new Set<string>();

  if (!aflRound) return clubs;

  for (const row of statsRows) {
    if (row.afl_round !== aflRound) continue;

    const club = row.afl_team_code.trim().toUpperCase();
    if (club) clubs.add(club);
  }

  return clubs;
}

function buildPlayerClubLookup(params: {
  coachId: number;
  coachName: string;
}): Map<string, PlayerClubInfo> {
  const pool = getPlayersForCoach({ coachId: params.coachId, coachName: params.coachName });
  const lookup = new Map<string, PlayerClubInfo>();

  for (const [position, players] of Object.entries(pool)) {
    for (const player of players) {
      lookup.set(normalisePlayerName(player.name), {
        club: player.club.trim().toUpperCase(),
        position,
        number: player.number,
      });
    }
  }

  return lookup;
}

function getPlayerClub(params: {
  playerName: string;
  stat: AflPlayerRoundStatRow | null;
  playerLookup: Map<string, PlayerClubInfo>;
}): string | null {
  const fromLookup = params.playerLookup.get(normalisePlayerName(params.playerName))?.club ?? null;
  const fromStat = params.stat?.afl_team_code?.trim().toUpperCase() || null;

  return fromLookup || fromStat;
}

function buildCoachBreakdownRows(
  teamData: CoachTeamData | null | undefined,
  statsMap: Map<string, AflPlayerRoundStatRow>,
  importedClubCodes: Set<string>,
  playerLookup: Map<string, PlayerClubInfo>
): PlayerBreakdownRow[] {
  if (!teamData) return [];

  const usedEmergencyNames = new Set<string>();
  const rows: PlayerBreakdownRow[] = [];

  const positionKeys = Array.from(
    new Set([...POSITION_ORDER, ...Object.keys(teamData)])
  ).filter((position) => Boolean(teamData[position]));

  for (const position of positionKeys) {
    const positionData = teamData[position] ?? {};
    const onField = Array.isArray(positionData.onField) ? positionData.onField : [];
    const emergencies = Array.isArray(positionData.emergencies) ? positionData.emergencies : [];

    const emergencyStats = emergencies.map((playerName, index) => {
      const stat = statsMap.get(normalisePlayerName(playerName)) ?? null;
      const playerClub = getPlayerClub({ playerName, stat, playerLookup });
      const clubImported = playerClub ? importedClubCodes.has(playerClub) : false;

      return {
        playerName,
        index,
        selectedType: `I${index + 1}`,
        stat,
        playerClub,
        played: Boolean(stat),
        clubImported,
      };
    });

    for (const playerName of onField) {
      const stat = statsMap.get(normalisePlayerName(playerName)) ?? null;
      const playerClub = getPlayerClub({ playerName, stat, playerLookup });
      const clubImported = playerClub ? importedClubCodes.has(playerClub) : false;
      const played = Boolean(stat);

      if (played) {
        rows.push({
          key: `${position}-X-${playerName}`,
          position,
          selectedType: "X",
          playerName,
          playerClub,
          stat,
          points: calculatePlayerPoints(stat),
          played,
          clubImported,
          countsToTotal: true,
          replacedPlayerName: null,
        });

        continue;
      }

      rows.push({
        key: `${position}-X-${playerName}`,
        position,
        selectedType: "X",
        playerName,
        playerClub,
        stat,
        points: null,
        played: false,
        clubImported,
        countsToTotal: false,
        replacedPlayerName: null,
      });

      if (!clubImported) {
        continue;
      }

      const replacement = emergencyStats.find((emergency) => {
        if (!emergency.played || !emergency.stat) return false;
        return !usedEmergencyNames.has(normalisePlayerName(emergency.playerName));
      });

      if (replacement?.stat) {
        usedEmergencyNames.add(normalisePlayerName(replacement.playerName));
        rows.push({
          key: `${position}-${replacement.selectedType}-${replacement.playerName}-replacement`,
          position,
          selectedType: replacement.selectedType,
          playerName: replacement.playerName,
          playerClub: replacement.playerClub,
          stat: replacement.stat,
          points: calculatePlayerPoints(replacement.stat),
          played: true,
          clubImported: replacement.clubImported,
          countsToTotal: true,
          replacedPlayerName: playerName,
        });
      }
    }

    for (const emergency of emergencyStats) {
      const emergencyKey = normalisePlayerName(emergency.playerName);

      if (usedEmergencyNames.has(emergencyKey)) continue;

      rows.push({
        key: `${position}-${emergency.selectedType}-${emergency.playerName}`,
        position,
        selectedType: emergency.selectedType,
        playerName: emergency.playerName,
        playerClub: emergency.playerClub,
        stat: emergency.stat,
        points: calculatePlayerPoints(emergency.stat),
        played: emergency.played,
        clubImported: emergency.clubImported,
        countsToTotal: false,
        replacedPlayerName: null,
      });
    }
  }

  return rows;
}

function calculateTeamTotal(rows: PlayerBreakdownRow[]): number {
  return rows.reduce((total, row) => {
    if (!row.countsToTotal || row.points === null) return total;
    return total + row.points;
  }, 0);
}

function getAutoMatchOutcome(params: {
  coach1Name: string;
  coach1Total: number;
  coach1HasSubmission: boolean;
  coach2Name: string;
  coach2Total: number;
  coach2HasSubmission: boolean;
  pendingPlayers: number;
}): MatchAutoOutcome {
  const isReadyToScore = params.coach1HasSubmission && params.coach2HasSubmission;

  if (!isReadyToScore) {
    return {
      label: "Waiting for submitted teams",
      margin: null,
      isDraw: false,
      winnerName: null,
      loserName: null,
      isReadyToScore: false,
    };
  }

  const pendingLabel =
    params.pendingPlayers > 0
      ? ` (${params.pendingPlayers} selected player${params.pendingPlayers === 1 ? "" : "s"} pending)`
      : "";

  if (params.coach1Total === params.coach2Total) {
    return {
      label: `${params.coach1Name} ${formatScore(params.coach1Total)} drew with ${params.coach2Name} ${formatScore(params.coach2Total)}${pendingLabel}`,
      margin: 0,
      isDraw: true,
      winnerName: null,
      loserName: null,
      isReadyToScore: true,
    };
  }

  const coach1Won = params.coach1Total > params.coach2Total;
  const winnerName = coach1Won ? params.coach1Name : params.coach2Name;
  const loserName = coach1Won ? params.coach2Name : params.coach1Name;
  const winnerScore = coach1Won ? params.coach1Total : params.coach2Total;
  const loserScore = coach1Won ? params.coach2Total : params.coach1Total;
  const margin = Math.abs(params.coach1Total - params.coach2Total);

  return {
    label: `${winnerName} ${formatScore(winnerScore)} def. ${loserName} ${formatScore(loserScore)}${pendingLabel}`,
    margin,
    isDraw: false,
    winnerName,
    loserName,
    isReadyToScore: true,
  };
}

function getPlayingStatus(row: PlayerBreakdownRow): string {
  if (row.countsToTotal && row.replacedPlayerName) {
    return `Counts for ${row.replacedPlayerName}`;
  }

  if (row.countsToTotal) {
    return "Counts";
  }

  if (row.played) {
    return "Played - emergency only";
  }

  if (row.clubImported) {
    return "Did not play";
  }

  if (row.playerClub) {
    return `${row.playerClub} pending`;
  }

  return "Pending - club unknown";
}

function getStatNumber(stat: AflPlayerRoundStatRow | null, key: keyof AflPlayerRoundStatRow): string {
  if (!stat) return "—";
  const value = stat[key];

  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }

  return "—";
}

function parseTeamData(value: unknown): CoachTeamData {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const output: CoachTeamData = {};

  for (const [position, rawPositionData] of Object.entries(value as Record<string, unknown>)) {
    if (!rawPositionData || typeof rawPositionData !== "object" || Array.isArray(rawPositionData)) {
      output[position] = { onField: [], emergencies: [] };
      continue;
    }

    const positionData = rawPositionData as Record<string, unknown>;

    output[position] = {
      onField: Array.isArray(positionData.onField)
        ? positionData.onField.filter((player): player is string => typeof player === "string")
        : [],
      emergencies: Array.isArray(positionData.emergencies)
        ? positionData.emergencies.filter((player): player is string => typeof player === "string")
        : [],
    };
  }

  return output;
}


export default function ResultsPage() {
  const router = useRouter();

  const [loginSession, setLoginSession] = useState<LoginSession | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(true);
  const [message, setMessage] = useState("");
  const [currentAflRound, setCurrentAflRound] = useState<number | null>(null);
  const [fixtureRows, setFixtureRows] = useState<FixtureRow[]>([]);
  const [results, setResults] = useState<MatchResultRow[]>([]);
  const [roundSubmissions, setRoundSubmissions] = useState<RoundSubmissionRow[]>([]);
  const [playerStats, setPlayerStats] = useState<AflPlayerRoundStatRow[]>([]);
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [isLoadingPageData, setIsLoadingPageData] = useState(false);
  const [autoSaveMessage, setAutoSaveMessage] = useState("");

  const loadProfileForUser = useCallback(async (userId: string, email: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, role, coach_id, coach_name")
      .eq("id", userId)
      .eq("environment", APP_ENV)
      .single();

    if (error) {
      setMessage(`Profile load failed: ${error.message}`);
      return null;
    }

    const profile = data as UserProfileRow | null;

    if (!profile) {
      setMessage("No profile found for this user.");
      return null;
    }

    if (profile.role === "coach" && !profile.coach_id) {
      setMessage("Coach profile is missing coach_id.");
      return null;
    }

    return {
      userId,
      email,
      role: profile.role,
      coachId: profile.coach_id,
      coachName:
        profile.coach_name?.trim() ||
        (profile.role === "admin" ? "Admin" : `Coach ${profile.coach_id ?? ""}`.trim()),
    } satisfies LoginSession;
  }, []);

  const refreshCurrentRound = useCallback(async () => {
    const { data, error } = await supabase
      .from("app_settings")
      .select("current_afl_round")
      .eq("environment", APP_ENV)
      .maybeSingle();

    if (error) {
      setMessage(`Current AFL round load failed: ${error.message}`);
      setCurrentAflRound(null);
      return null;
    }

    const row = data as AppSettingsRow | null;
    const round = toNullableNumber(row?.current_afl_round ?? null);

    setCurrentAflRound(round);
    return round;
  }, []);

  const refreshFixtureRows = useCallback(async () => {
    const { data, error } = await supabase
      .from("season_fixture")
      .select(
        "id, environment, competition_round, afl_round, matchup_index, coach_id, coach_name, opponent_coach_id, opponent_coach_name"
      )
      .eq("environment", APP_ENV)
      .order("competition_round", { ascending: true })
      .order("afl_round", { ascending: true })
      .order("matchup_index", { ascending: true })
      .order("coach_id", { ascending: true });

    if (error) {
      setMessage(`Fixture load failed: ${error.message}`);
      setFixtureRows([]);
      return [];
    }

    const rows = sortFixtureRows((data ?? []) as FixtureRow[]);
    setFixtureRows(rows);
    return rows;
  }, []);

  const refreshResults = useCallback(async () => {
    const { data, error } = await supabase
      .from("super8_match_results")
      .select(
        "id, round_number, afl_round, matchup_index, coach_1_id, coach_1_name, coach_1_score, coach_2_id, coach_2_name, coach_2_score, imported_at"
      )
      .order("round_number", { ascending: true })
      .order("matchup_index", { ascending: true });

    if (error) {
      setMessage(`Results load failed: ${error.message}`);
      setResults([]);
      return [];
    }

    const rows: MatchResultRow[] = ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: toNumber(row.id),
      round_number: toNumber(row.round_number),
      afl_round: toNullableNumber(row.afl_round),
      matchup_index: toNumber(row.matchup_index),
      coach_1_id: toNumber(row.coach_1_id),
      coach_1_name: typeof row.coach_1_name === "string" ? row.coach_1_name : "Unknown Team",
      coach_1_score: toNumber(row.coach_1_score),
      coach_2_id: toNumber(row.coach_2_id),
      coach_2_name: typeof row.coach_2_name === "string" ? row.coach_2_name : "Unknown Team",
      coach_2_score: toNumber(row.coach_2_score),
      imported_at: typeof row.imported_at === "string" ? row.imported_at : "",
    }));

    setResults(rows);
    return rows;
  }, []);


  const refreshRoundSubmissions = useCallback(async () => {
    const { data, error } = await supabase
      .from("round_submissions")
      .select("id, coach_id, coach_name, round_number, team_data, submitted_at")
      .eq("environment", APP_ENV)
      .eq("is_submitted", true)
      .order("round_number", { ascending: false })
      .order("submitted_at", { ascending: false });

    if (error) {
      setMessage(`Round submissions load failed: ${error.message}`);
      setRoundSubmissions([]);
      return [];
    }

    const rows: RoundSubmissionRow[] = ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: toNumber(row.id),
      coach_id: toNumber(row.coach_id),
      coach_name: typeof row.coach_name === "string" ? row.coach_name : "Unknown Coach",
      round_number: toNumber(row.round_number),
      team_data: parseTeamData(row.team_data),
      submitted_at: typeof row.submitted_at === "string" ? row.submitted_at : "",
    }));

    setRoundSubmissions(rows);
    return rows;
  }, []);

  const refreshPlayerStats = useCallback(async () => {
    const { data, error } = await supabase
      .from("afl_player_round_stats")
      .select(
        "id, afl_round, afl_team_name, afl_team_code, player_name, k, hb, d, m, g, b, t, ho, ga, i50, cl, cg, r50, ff, fa, af, sc, imported_at"
      )
      .eq("environment", APP_ENV)
      .order("afl_round", { ascending: true })
      .order("player_name", { ascending: true });

    if (error) {
      setMessage(`Player stats load failed: ${error.message}`);
      setPlayerStats([]);
      return [];
    }

    const rows: AflPlayerRoundStatRow[] = ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      id: toNumber(row.id),
      afl_round: toNumber(row.afl_round),
      afl_team_name: typeof row.afl_team_name === "string" ? row.afl_team_name : null,
      afl_team_code: typeof row.afl_team_code === "string" ? row.afl_team_code : "",
      player_name: typeof row.player_name === "string" ? row.player_name : "",
      k: toNumber(row.k),
      hb: toNumber(row.hb),
      d: toNumber(row.d),
      m: toNumber(row.m),
      g: toNumber(row.g),
      b: toNumber(row.b),
      t: toNumber(row.t),
      ho: toNumber(row.ho),
      ga: toNumber(row.ga),
      i50: toNumber(row.i50),
      cl: toNumber(row.cl),
      cg: toNumber(row.cg),
      r50: toNumber(row.r50),
      ff: toNumber(row.ff),
      fa: toNumber(row.fa),
      af: toNumber(row.af),
      sc: toNumber(row.sc),
      imported_at: typeof row.imported_at === "string" ? row.imported_at : "",
    }));

    setPlayerStats(rows);
    return rows;
  }, []);

  const refreshPageData = useCallback(async () => {
    setIsLoadingPageData(true);
    setMessage("");

    const [aflRound, fixtureData, resultData] = await Promise.all([
      refreshCurrentRound(),
      refreshFixtureRows(),
      refreshResults(),
      refreshRoundSubmissions(),
      refreshPlayerStats(),
    ]);

    const fixtureMatches = buildFixtureMatches(fixtureData);
    const currentFixtureMatch = aflRound
      ? fixtureMatches.find((match) => match.aflRound === aflRound)
      : null;

    const resultRounds = resultData.map((row) => row.round_number).filter(Number.isFinite);
    const fixtureRounds = fixtureMatches.map((row) => row.roundNumber).filter(Number.isFinite);

    const preferredRound =
      currentFixtureMatch?.roundNumber ??
      (resultRounds.length > 0 ? Math.max(...resultRounds) : null) ??
      (fixtureRounds.length > 0 ? Math.min(...fixtureRounds) : null);

    setSelectedRound((previous) => previous ?? preferredRound);
    setIsLoadingPageData(false);
  }, [refreshCurrentRound, refreshFixtureRows, refreshResults, refreshRoundSubmissions, refreshPlayerStats]);

  useEffect(() => {
    let isMounted = true;

    async function bootstrapAuth() {
      setIsAuthenticating(true);
      setMessage("");

      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (!isMounted) return;

      if (error) {
        setMessage(`Session check failed: ${error.message}`);
        setIsAuthenticating(false);
        return;
      }

      if (!session?.user) {
        setLoginSession(null);
        setIsAuthenticating(false);
        router.replace("/login");
        return;
      }

      const nextSession = await loadProfileForUser(session.user.id, session.user.email ?? "");

      if (!isMounted) return;

      if (!nextSession) {
        setLoginSession(null);
        setIsAuthenticating(false);
        router.replace("/login");
        return;
      }

      setLoginSession(nextSession);
      setIsAuthenticating(false);
    }

    void bootstrapAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void (async () => {
        if (!isMounted) return;

        if (!session?.user) {
          setLoginSession(null);
          setIsAuthenticating(false);
          router.replace("/login");
          return;
        }

        const nextSession = await loadProfileForUser(session.user.id, session.user.email ?? "");

        if (!isMounted) return;

        if (!nextSession) {
          setLoginSession(null);
          setIsAuthenticating(false);
          router.replace("/login");
          return;
        }

        setLoginSession(nextSession);
        setIsAuthenticating(false);
      })();
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfileForUser, router]);

  useEffect(() => {
    if (!loginSession) return;
    void refreshPageData();
  }, [loginSession, refreshPageData]);

  useEffect(() => {
    if (!loginSession) return;

    const channel = supabase
      .channel(`results-live-${APP_ENV}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "season_fixture",
          filter: `environment=eq.${APP_ENV}`,
        },
        () => {
          void refreshPageData();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "app_settings",
          filter: `environment=eq.${APP_ENV}`,
        },
        () => {
          void refreshPageData();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "super8_match_results",
        },
        () => {
          void refreshPageData();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "round_submissions",
          filter: `environment=eq.${APP_ENV}`,
        },
        () => {
          void refreshPageData();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "afl_player_round_stats",
          filter: `environment=eq.${APP_ENV}`,
        },
        () => {
          void refreshPageData();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loginSession, refreshPageData]);

  const fixtureMatches = useMemo(() => buildFixtureMatches(fixtureRows), [fixtureRows]);

  const currentSuper8Round = useMemo(() => {
    if (!currentAflRound) return null;
    return fixtureMatches.find((match) => match.aflRound === currentAflRound)?.roundNumber ?? null;
  }, [currentAflRound, fixtureMatches]);

  const resultByRoundAndMatch = useMemo(() => {
    const map = new Map<string, MatchResultRow>();

    for (const result of results) {
      map.set(buildResultKey(result.round_number, result.matchup_index), result);
    }

    return map;
  }, [results]);

  const roundButtons = useMemo(() => {
    const roundSet = new Set<number>();

    for (const match of fixtureMatches) {
      roundSet.add(match.roundNumber);
    }

    for (const result of results) {
      roundSet.add(result.round_number);
    }

    return Array.from(roundSet).sort((a, b) => b - a);
  }, [fixtureMatches, results]);

  const selectedRoundFixtureMatches = useMemo(() => {
    return fixtureMatches.filter((match) => match.roundNumber === selectedRound);
  }, [fixtureMatches, selectedRound]);

  const selectedRoundResultOnlyMatches = useMemo(() => {
    const fixtureResultKeys = new Set(
      selectedRoundFixtureMatches.map((match) => buildResultKey(match.roundNumber, match.matchupIndex))
    );

    return results
      .filter((result) => result.round_number === selectedRound)
      .filter((result) => !fixtureResultKeys.has(buildResultKey(result.round_number, result.matchup_index)))
      .map((result) => ({
        key: `result-only-${result.id}`,
        roundNumber: result.round_number,
        aflRound: result.afl_round,
        matchupIndex: result.matchup_index,
        coach1Id: result.coach_1_id,
        coach1Name: result.coach_1_name,
        coach2Id: result.coach_2_id,
        coach2Name: result.coach_2_name,
      }));
  }, [results, selectedRound, selectedRoundFixtureMatches]);

  const selectedRoundMatches = useMemo(() => {
    return [...selectedRoundFixtureMatches, ...selectedRoundResultOnlyMatches].sort((a, b) => {
      if ((a.aflRound ?? 0) !== (b.aflRound ?? 0)) return (a.aflRound ?? 0) - (b.aflRound ?? 0);
      return a.matchupIndex - b.matchupIndex;
    });
  }, [selectedRoundFixtureMatches, selectedRoundResultOnlyMatches]);

  const selectedRoundAflRounds = useMemo(() => {
    const rounds = selectedRoundMatches
      .map((match) => match.aflRound)
      .filter((round): round is number => typeof round === "number" && Number.isFinite(round));

    return Array.from(new Set(rounds)).sort((a, b) => a - b);
  }, [selectedRoundMatches]);

  const submissionByRoundAndCoach = useMemo(() => {
    const map = new Map<string, RoundSubmissionRow>();
    const latestByCoach = new Map<number, RoundSubmissionRow>();

    for (const submission of roundSubmissions) {
      const exactKey = `${submission.round_number}-${submission.coach_id}`;
      if (!map.has(exactKey)) {
        map.set(exactKey, submission);
      }

      const latest = latestByCoach.get(submission.coach_id);
      if (!latest || new Date(submission.submitted_at).getTime() > new Date(latest.submitted_at).getTime()) {
        latestByCoach.set(submission.coach_id, submission);
      }
    }

    return { exact: map, latestByCoach };
  }, [roundSubmissions]);

  function getCoachSubmission(roundNumber: number, coachId: number): RoundSubmissionRow | null {
    return (
      submissionByRoundAndCoach.exact.get(`${roundNumber}-${coachId}`) ??
      submissionByRoundAndCoach.latestByCoach.get(coachId) ??
      null
    );
  }

  useEffect(() => {
    if (!loginSession || loginSession.role !== "admin") return;
    if (fixtureMatches.length === 0) return;
    if (roundSubmissions.length === 0) return;

    let isCancelled = false;

    async function autoSaveCompletedMatches() {
      const savedLabels: string[] = [];

      for (const match of fixtureMatches) {
        if (!match.aflRound) continue;

        const statsMap = buildStatsMapForRound(playerStats, match.aflRound);
        const importedClubCodes = buildImportedClubSetForRound(playerStats, match.aflRound);

        const coach1Submission =
          submissionByRoundAndCoach.exact.get(`${match.roundNumber}-${match.coach1Id}`) ??
          submissionByRoundAndCoach.latestByCoach.get(match.coach1Id) ??
          null;

        const coach2Submission =
          submissionByRoundAndCoach.exact.get(`${match.roundNumber}-${match.coach2Id}`) ??
          submissionByRoundAndCoach.latestByCoach.get(match.coach2Id) ??
          null;

        if (!coach1Submission || !coach2Submission) continue;

        const coach1Rows = buildCoachBreakdownRows(
          coach1Submission.team_data,
          statsMap,
          importedClubCodes,
          buildPlayerClubLookup({ coachId: match.coach1Id, coachName: match.coach1Name })
        );

        const coach2Rows = buildCoachBreakdownRows(
          coach2Submission.team_data,
          statsMap,
          importedClubCodes,
          buildPlayerClubLookup({ coachId: match.coach2Id, coachName: match.coach2Name })
        );

        const coach1PendingPlayers = coach1Rows.filter(
          (row) => row.selectedType === "X" && !row.played && !row.clubImported
        ).length;

        const coach2PendingPlayers = coach2Rows.filter(
          (row) => row.selectedType === "X" && !row.played && !row.clubImported
        ).length;

        if (coach1PendingPlayers > 0 || coach2PendingPlayers > 0) continue;

        const coach1Score = calculateTeamTotal(coach1Rows);
        const coach2Score = calculateTeamTotal(coach2Rows);
        const resultKey = buildResultKey(match.roundNumber, match.matchupIndex);
        const existingResult = resultByRoundAndMatch.get(resultKey) ?? null;

        const existingResultAlreadyMatches =
          existingResult &&
          existingResult.afl_round === match.aflRound &&
          existingResult.coach_1_id === match.coach1Id &&
          existingResult.coach_2_id === match.coach2Id &&
          toNumber(existingResult.coach_1_score) === coach1Score &&
          toNumber(existingResult.coach_2_score) === coach2Score;

        if (existingResultAlreadyMatches) continue;

        const payload = {
          round_number: match.roundNumber,
          afl_round: match.aflRound,
          matchup_index: match.matchupIndex,
          coach_1_id: match.coach1Id,
          coach_1_name: match.coach1Name,
          coach_1_score: coach1Score,
          coach_2_id: match.coach2Id,
          coach_2_name: match.coach2Name,
          coach_2_score: coach2Score,
          imported_at: new Date().toISOString(),
        };

        const { error } = await supabase
          .from("super8_match_results")
          .upsert(payload, { onConflict: "round_number,matchup_index" });

        if (error) {
          if (!isCancelled) {
            setAutoSaveMessage(`Auto-save failed for Super 8 Round ${match.roundNumber}, Match ${match.matchupIndex}: ${error.message}`);
          }
          return;
        }

        savedLabels.push(`S8 R${match.roundNumber} Match ${match.matchupIndex}`);
      }

      if (!isCancelled && savedLabels.length > 0) {
        setAutoSaveMessage(`Auto-saved final result${savedLabels.length === 1 ? "" : "s"}: ${savedLabels.join(", ")}.`);
        await refreshResults();
      }
    }

    void autoSaveCompletedMatches();

    return () => {
      isCancelled = true;
    };
  }, [
    fixtureMatches,
    loginSession,
    playerStats,
    refreshResults,
    resultByRoundAndMatch,
    roundSubmissions.length,
    submissionByRoundAndCoach,
  ]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (isAuthenticating) {
    return (
      <main className="min-h-screen bg-neutral-950 px-4 py-8 text-white">
        <div className="mx-auto max-w-6xl rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-lg font-semibold">Checking session...</div>
        </div>
      </main>
    );
  }

  if (!loginSession) {
    return null;
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold">Full Season Results</h1>
              <p className="mt-2 text-sm text-white/70">
                Signed in as {loginSession.coachName} • {loginSession.role}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void refreshPageData()}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
              >
                Refresh
              </button>

              <Link
                href="/dashboard"
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
              >
                Back to Dashboard
              </Link>

              <button
                type="button"
                onClick={() => void handleLogout()}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
              >
                Log Out
              </button>
            </div>
          </div>

          {message ? (
            <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              {message}
            </div>
          ) : null}

          {autoSaveMessage ? (
            <div className="mt-4 rounded-xl border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-100">
              {autoSaveMessage}
            </div>
          ) : null}
        </section>

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-violet-500/20 bg-violet-500/10 p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-violet-200/80">
              Current Super 8 Round
            </div>
            <div className="mt-2 text-3xl font-bold">{currentSuper8Round ?? "—"}</div>
            <div className="mt-1 text-sm text-white/70">
              Based on AFL Round {currentAflRound ?? "—"}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-white/50">
              Selected Round
            </div>
            <div className="mt-2 text-3xl font-bold">{selectedRound ?? "—"}</div>
            <div className="mt-1 text-sm text-white/70">
              {selectedRoundAflRounds.length > 0
                ? `AFL Round${selectedRoundAflRounds.length === 1 ? "" : "s"} ${selectedRoundAflRounds.join(", ")}`
                : "No AFL round linked yet"}
            </div>
          </div>

          <div className="rounded-2xl border border-green-500/20 bg-green-500/10 p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-green-200/80">
              Live Matchups
            </div>
            <div className="mt-2 text-3xl font-bold">
              {selectedRoundMatches.length}/{selectedRoundMatches.length}
            </div>
            <div className="mt-1 text-sm text-white/70">
              Matchups calculating for selected round
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-bold">Round Results</h2>
              <p className="mt-1 text-sm text-white/70">
                Results are calculated live from submitted teams, imported AFL stats, and emergency replacements.
              </p>
            </div>

            <div className="flex flex-wrap gap-2">
              {roundButtons.length > 0 ? (
                roundButtons.map((round) => (
                  <button
                    key={round}
                    type="button"
                    onClick={() => setSelectedRound(round)}
                    className={`rounded-lg border px-3 py-1.5 text-sm font-semibold ${
                      selectedRound === round
                        ? "border-violet-400 bg-violet-500 text-white"
                        : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                    }`}
                  >
                    S8 R{round}
                  </button>
                ))
              ) : (
                <div className="rounded-lg border border-dashed border-white/10 px-3 py-1.5 text-sm text-white/55">
                  No rounds found
                </div>
              )}
            </div>
          </div>

          <div className="mt-6">
            {isLoadingPageData ? (
              <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
                Loading results...
              </div>
            ) : selectedRound === null ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/70">
                No results found yet.
              </div>
            ) : selectedRoundMatches.length === 0 ? (
              <div className="rounded-xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/70">
                No fixture rows or results found for Super 8 Round {selectedRound}.
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {selectedRoundMatches.map((match) => {
                  const key = buildResultKey(match.roundNumber, match.matchupIndex);
                  const result = resultByRoundAndMatch.get(key) ?? null;
                  const isUserMatch = isUsersMatch(match, loginSession.coachId);
                  const statsMap = buildStatsMapForRound(playerStats, match.aflRound);
                  const importedClubCodes = buildImportedClubSetForRound(playerStats, match.aflRound);

                  const coachDetails: CoachAutoScoreDetails[] = [match.coach1Id, match.coach2Id].map((coachId) => {
                    const coachName = coachId === match.coach1Id ? match.coach1Name : match.coach2Name;
                    const submission = getCoachSubmission(match.roundNumber, coachId);
                    const playerLookup = buildPlayerClubLookup({ coachId, coachName });
                    const rows = buildCoachBreakdownRows(
                      submission?.team_data,
                      statsMap,
                      importedClubCodes,
                      playerLookup
                    );
                    const teamTotal = calculateTeamTotal(rows);
                    const countedPlayers = rows.filter((row) => row.countsToTotal).length;
                    const pendingPlayers = rows.filter(
                      (row) => row.selectedType === "X" && !row.played && !row.clubImported
                    ).length;

                    return {
                      coachId,
                      coachName,
                      submission,
                      rows,
                      teamTotal,
                      countedPlayers,
                      pendingPlayers,
                    };
                  });

                  const coach1Details = coachDetails[0];
                  const coach2Details = coachDetails[1];
                  const totalPendingPlayers =
                    (coach1Details?.pendingPlayers ?? 0) + (coach2Details?.pendingPlayers ?? 0);
                  const outcome = getAutoMatchOutcome({
                    coach1Name: match.coach1Name,
                    coach1Total: coach1Details?.teamTotal ?? 0,
                    coach1HasSubmission: Boolean(coach1Details?.submission),
                    coach2Name: match.coach2Name,
                    coach2Total: coach2Details?.teamTotal ?? 0,
                    coach2HasSubmission: Boolean(coach2Details?.submission),
                    pendingPlayers: totalPendingPlayers,
                  });

                  const savedResultMatchesLiveScore =
                    Boolean(result) &&
                    result?.afl_round === match.aflRound &&
                    result?.coach_1_id === match.coach1Id &&
                    result?.coach_2_id === match.coach2Id &&
                    toNumber(result?.coach_1_score) === (coach1Details?.teamTotal ?? 0) &&
                    toNumber(result?.coach_2_score) === (coach2Details?.teamTotal ?? 0);

                  return (
                    <div
                      key={match.key}
                      className={`rounded-2xl border p-5 ${
                        isUserMatch
                          ? "border-green-400/40 bg-green-500/10"
                          : "border-white/10 bg-black/20"
                      }`}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <div className="text-xs font-semibold uppercase tracking-wide text-white/45">
                            Super 8 Round {match.roundNumber} • AFL Round {match.aflRound ?? "—"} • Match {match.matchupIndex}
                          </div>
                          <div className="mt-2 text-lg font-bold text-white">
                            {match.coach1Name} vs {match.coach2Name}
                          </div>
                        </div>

                        <div className="flex flex-wrap gap-2">
                          {isUserMatch ? (
                            <span className="rounded-full border border-green-400/30 bg-green-500/15 px-3 py-1 text-xs font-bold text-green-200">
                              🔥 Your Match
                            </span>
                          ) : null}

                          <span
                            className={`rounded-full border px-3 py-1 text-xs font-bold ${
                              outcome.isReadyToScore
                                ? totalPendingPlayers > 0
                                  ? "border-amber-400/30 bg-amber-500/15 text-amber-100"
                                  : "border-green-400/30 bg-green-500/15 text-green-200"
                                : "border-white/10 bg-white/5 text-white/55"
                            }`}
                          >
                            {outcome.isReadyToScore
                              ? totalPendingPlayers > 0
                                ? "LIVE / pending"
                                : savedResultMatchesLiveScore
                                  ? "FINAL / saved"
                                  : loginSession.role === "admin"
                                    ? "FINAL / saving"
                                    : "FINAL / ready"
                              : "Waiting for teams"}
                          </span>
                        </div>
                      </div>

                      <div className="mt-4 rounded-xl border border-white/10 bg-neutral-950/60 p-4">
                        <div className="text-base font-semibold text-white">{outcome.label}</div>
                        {outcome.margin !== null && !outcome.isDraw ? (
                          <div className="mt-1 text-sm text-white/60">Margin: {formatScore(outcome.margin)}</div>
                        ) : null}
                        {result ? (
                          <div className="mt-2 text-xs text-white/45">
                            Saved database result: {result.coach_1_name} {formatScore(result.coach_1_score)} - {result.coach_2_name} {formatScore(result.coach_2_score)}
                            {" "}• saved {formatTimestamp(result.imported_at)}
                            {savedResultMatchesLiveScore ? " • matches live total" : " • live total has changed"}
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-4 grid gap-4 xl:grid-cols-2">
                        {coachDetails.map(({
                          coachId,
                          coachName,
                          submission,
                          rows,
                          teamTotal,
                          countedPlayers,
                          pendingPlayers,
                        }) => {
                          return (
                            <div
                              key={`${match.key}-${coachId}-breakdown`}
                              className="rounded-xl border border-white/10 bg-neutral-950/50 p-4"
                            >
                              <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                  <div className="text-lg font-bold text-white">{coachName}</div>
                                  <div className="mt-1 text-xs text-white/45">
                                    {submission
                                      ? `Team submitted: ${formatTimestamp(submission.submitted_at)}`
                                      : "No submitted team found"}
                                  </div>
                                </div>

                                <div className="rounded-xl border border-violet-400/25 bg-violet-500/15 px-4 py-2 text-right">
                                  <div className="text-xs font-semibold uppercase tracking-wide text-violet-100/70">
                                    Live Total
                                  </div>
                                  <div className="text-2xl font-bold text-white">{formatScore(teamTotal)}</div>
                                  <div className="text-xs text-white/50">{countedPlayers} counting players</div>
                                  {pendingPlayers > 0 ? (
                                    <div className="text-xs text-amber-100/70">{pendingPlayers} selected players pending</div>
                                  ) : null}
                                </div>
                              </div>

                              {rows.length === 0 ? (
                                <div className="mt-4 rounded-lg border border-dashed border-white/10 bg-black/20 p-3 text-sm text-white/55">
                                  Player breakdown will appear once a submitted team exists for this coach.
                                </div>
                              ) : (
                                <div className="mt-4 overflow-x-auto">
                                  <table className="min-w-[980px] w-full border-separate border-spacing-0 text-left text-xs">
                                    <thead>
                                      <tr className="text-white/50">
                                        <th className="border-b border-white/10 px-2 py-2 font-semibold">Pos</th>
                                        <th className="border-b border-white/10 px-2 py-2 font-semibold">Sel</th>
                                        <th className="border-b border-white/10 px-2 py-2 font-semibold">Player</th>
                                        <th className="border-b border-white/10 px-2 py-2 text-right font-semibold">Pts</th>
                                        <th className="border-b border-white/10 px-2 py-2 text-right font-semibold">D</th>
                                        <th className="border-b border-white/10 px-2 py-2 text-right font-semibold">M</th>
                                        <th className="border-b border-white/10 px-2 py-2 text-right font-semibold">G</th>
                                        <th className="border-b border-white/10 px-2 py-2 text-right font-semibold">B</th>
                                        <th className="border-b border-white/10 px-2 py-2 text-right font-semibold">T</th>
                                        <th className="border-b border-white/10 px-2 py-2 text-right font-semibold">HO</th>
                                        <th className="border-b border-white/10 px-2 py-2 text-right font-semibold">FF</th>
                                        <th className="border-b border-white/10 px-2 py-2 text-right font-semibold">FA</th>
                                        <th className="border-b border-white/10 px-2 py-2 font-semibold">Status</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {rows.map((row) => (
                                        <tr
                                          key={row.key}
                                          className={`${
                                            row.countsToTotal
                                              ? "bg-green-500/10 text-white"
                                              : row.played
                                                ? "text-white/70"
                                                : "text-white/35"
                                          }`}
                                        >
                                          <td className="border-b border-white/5 px-2 py-2 font-semibold">{row.position}</td>
                                          <td className="border-b border-white/5 px-2 py-2">
                                            <span
                                              className={`rounded-md border px-2 py-0.5 font-bold ${
                                                row.countsToTotal
                                                  ? "border-green-400/30 bg-green-500/15 text-green-100"
                                                  : "border-white/10 bg-white/5 text-white/55"
                                              }`}
                                            >
                                              {row.selectedType}
                                            </span>
                                          </td>
                                          <td className="border-b border-white/5 px-2 py-2">
                                            <div className="font-semibold">{row.playerName}</div>
                                            {row.playerClub ? (
                                              <div className="text-[11px] text-white/40">{row.playerClub}</div>
                                            ) : null}
                                          </td>
                                          <td className="border-b border-white/5 px-2 py-2 text-right font-bold">
                                            {row.points === null ? "—" : formatScore(row.points)}
                                          </td>
                                          <td className="border-b border-white/5 px-2 py-2 text-right">{getStatNumber(row.stat, "d")}</td>
                                          <td className="border-b border-white/5 px-2 py-2 text-right">{getStatNumber(row.stat, "m")}</td>
                                          <td className="border-b border-white/5 px-2 py-2 text-right">{getStatNumber(row.stat, "g")}</td>
                                          <td className="border-b border-white/5 px-2 py-2 text-right">{getStatNumber(row.stat, "b")}</td>
                                          <td className="border-b border-white/5 px-2 py-2 text-right">{getStatNumber(row.stat, "t")}</td>
                                          <td className="border-b border-white/5 px-2 py-2 text-right">{getStatNumber(row.stat, "ho")}</td>
                                          <td className="border-b border-white/5 px-2 py-2 text-right">{getStatNumber(row.stat, "ff")}</td>
                                          <td className="border-b border-white/5 px-2 py-2 text-right">{getStatNumber(row.stat, "fa")}</td>
                                          <td className="border-b border-white/5 px-2 py-2">
                                            <span className="text-[11px]">{getPlayingStatus(row)}</span>
                                          </td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      <div className="mt-4 rounded-xl border border-sky-400/20 bg-sky-500/10 p-4 text-sm text-sky-100/80">
                        Auto scoring is displayed live from imported player stats. When admin views this page, completed matches with no pending selected players are automatically saved to the results table.
                      </div>

                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}

