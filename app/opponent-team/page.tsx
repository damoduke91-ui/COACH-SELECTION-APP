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

const POSITION_ORDER = ["KD", "DEF", "MID", "FOR", "KF", "RUC"];
const EXPECTED_AFL_CLUB_COUNT = 18;

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

function getAflRoundCompletionLabel(importedClubCount: number): string {
  return importedClubCount >= EXPECTED_AFL_CLUB_COUNT ? "FINAL" : "LIVE";
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



type MatchView = {
  key: string;
  fixture: FixtureRow;
  roundNumber: number;
  aflRound: number;
  matchupIndex: number;
  selectedCoachId: number;
  selectedCoachName: string;
  opponentCoachId: number;
  opponentCoachName: string;
};

type CoachLivePanelProps = {
  coachId: number;
  coachName: string;
  submission: RoundSubmissionRow | null;
  rows: PlayerBreakdownRow[];
  total: number;
  pendingPlayers: number;
  countedPlayers: number;
  accentClass?: string;
};

function buildMatchViewForCoach(row: FixtureRow, selectedCoachId: number): MatchView | null {
  if (row.coach_id === selectedCoachId) {
    return {
      key: `${row.id}-${row.coach_id}-${row.opponent_coach_id}`,
      fixture: row,
      roundNumber: row.competition_round,
      aflRound: row.afl_round,
      matchupIndex: row.matchup_index,
      selectedCoachId: row.coach_id,
      selectedCoachName: row.coach_name,
      opponentCoachId: row.opponent_coach_id,
      opponentCoachName: row.opponent_coach_name,
    };
  }

  if (row.opponent_coach_id === selectedCoachId) {
    return {
      key: `${row.id}-${row.opponent_coach_id}-${row.coach_id}`,
      fixture: row,
      roundNumber: row.competition_round,
      aflRound: row.afl_round,
      matchupIndex: row.matchup_index,
      selectedCoachId: row.opponent_coach_id,
      selectedCoachName: row.opponent_coach_name,
      opponentCoachId: row.coach_id,
      opponentCoachName: row.coach_name,
    };
  }

  return null;
}

function getMarginLabel(teamAName: string, teamATotal: number, teamBName: string, teamBTotal: number): string {
  if (teamATotal === teamBTotal) {
    return `${teamAName} and ${teamBName} are tied on ${formatScore(teamATotal)}`;
  }

  const teamAIsLeading = teamATotal > teamBTotal;
  const leaderName = teamAIsLeading ? teamAName : teamBName;
  const trailerName = teamAIsLeading ? teamBName : teamAName;
  const margin = Math.abs(teamATotal - teamBTotal);

  return `${leaderName} leads ${trailerName} by ${formatScore(margin)}`;
}

function CompactStatLine({ label, value }: { label: string; value: string }) {
  return (
    <span className="rounded border border-white/10 bg-black/25 px-1.5 py-0.5 text-[10px] text-white/70">
      <span className="text-white/35">{label}</span> {value}
    </span>
  );
}

function getRowsTotal(rows: PlayerBreakdownRow[]): number {
  return rows.reduce((total, row) => {
    if (!row.countsToTotal || row.points === null) return total;
    return total + row.points;
  }, 0);
}

function PlayerBreakdownCard({
  row,
}: {
  row: PlayerBreakdownRow;
}) {
  return (
    <div
      className={`rounded-lg border px-2 py-1.5 text-[11px] ${
        row.countsToTotal
          ? "border-green-400/25 bg-green-500/10 text-white"
          : row.played
            ? "border-white/10 bg-white/[0.03] text-white/70"
            : "border-white/10 bg-black/15 text-white/40"
      }`}
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span
          className={`rounded-md border px-1.5 py-0.5 text-[10px] font-black ${
            row.countsToTotal
              ? "border-green-400/30 bg-green-500/15 text-green-100"
              : "border-white/10 bg-white/5 text-white/55"
          }`}
        >
          {row.selectedType}
        </span>

        <span className="min-w-[140px] flex-1 font-bold text-white">
          {row.playerName}
          {row.playerClub ? <span className="ml-1 font-normal text-white/40">({row.playerClub})</span> : null}
        </span>

        <span className="rounded-md border border-violet-400/25 bg-violet-500/10 px-2 py-0.5 text-[11px] font-black text-violet-100">
          {row.points === null ? "—" : formatScore(row.points)} pts
        </span>

        <CompactStatLine label="D" value={getStatNumber(row.stat, "d")} />
        <CompactStatLine label="M" value={getStatNumber(row.stat, "m")} />
        <CompactStatLine label="G" value={getStatNumber(row.stat, "g")} />
        <CompactStatLine label="B" value={getStatNumber(row.stat, "b")} />
        <CompactStatLine label="T" value={getStatNumber(row.stat, "t")} />
        <CompactStatLine label="HO" value={getStatNumber(row.stat, "ho")} />
        <CompactStatLine label="FF" value={getStatNumber(row.stat, "ff")} />
        <CompactStatLine label="FA" value={getStatNumber(row.stat, "fa")} />

        <span className="ml-auto rounded border border-white/10 bg-black/25 px-1.5 py-0.5 text-[10px] text-white/60">
          {getPlayingStatus(row)}
        </span>
      </div>
    </div>
  );
}

function PositionGroup({
  coachId,
  position,
  rows,
}: {
  coachId: number;
  position: string;
  rows: PlayerBreakdownRow[];
}) {
  const [showEmergencies, setShowEmergencies] = useState(false);
  const onFieldRows = rows.filter((row) => row.selectedType === "X" || row.countsToTotal);
  const emergencyRows = rows.filter((row) => row.selectedType !== "X" && !row.countsToTotal);
  const positionTotal = getRowsTotal(rows);

  return (
    <div className="overflow-hidden rounded-xl border border-white/10 bg-black/20">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-white/10 bg-neutral-950/95 px-2.5 py-1.5 backdrop-blur">
        <div className="text-xs font-black uppercase tracking-wide text-white/80">{position}</div>
        <div className="text-[10px] font-bold text-white/45">
          {formatScore(positionTotal)} pts • {onFieldRows.length} field
          {emergencyRows.length > 0 ? ` • ${emergencyRows.length} emergency` : ""}
        </div>
      </div>

      <div className="space-y-1 p-2">
        {onFieldRows.length > 0 ? (
          onFieldRows.map((row) => (
            <PlayerBreakdownCard
              key={`${coachId}-${row.key}`}
              row={row}
            />
          ))
        ) : (
          <div className="rounded-lg border border-dashed border-white/10 px-2 py-1.5 text-[11px] text-white/40">
            No on-field players.
          </div>
        )}

        {emergencyRows.length > 0 ? (
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowEmergencies((value) => !value)}
              className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-left text-[11px] font-bold text-white/60 hover:bg-white/[0.06]"
            >
              {showEmergencies ? "Hide" : "Show"} {position} emergencies ({emergencyRows.length})
            </button>

            {showEmergencies ? (
              <div className="mt-1 space-y-1">
                {emergencyRows.map((row) => (
                  <PlayerBreakdownCard
                    key={`${coachId}-${row.key}`}
                    row={row}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function CoachLivePanel({
  coachId,
  submission,
  rows,
  accentClass = "border-white/10",
}: CoachLivePanelProps) {
  const groupedRows = POSITION_ORDER.map((position) => ({
    position,
    rows: rows.filter((row) => row.position === position),
  })).filter((group) => group.rows.length > 0);

  return (
    <section className={`rounded-xl border bg-white/5 p-2 ${accentClass}`}>
      {!submission ? (
        <div className="mb-2 rounded-xl border border-amber-400/25 bg-amber-500/10 p-3 text-xs text-amber-100">
          No round submission snapshot was found for this coach. Once the team is submitted/snapshotted for the round, live stats will show here.
        </div>
      ) : null}

      <div className="space-y-2">
        {groupedRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/10 p-3 text-xs text-white/45">
            No selected players found.
          </div>
        ) : (
          groupedRows.map((group) => (
            <PositionGroup
              key={`${coachId}-${group.position}`}
              coachId={coachId}
              position={group.position}
              rows={group.rows}
            />
          ))
        )}
      </div>
    </section>
  );
}

export default function OpponentTeamPage() {
  const router = useRouter();

  const [loginSession, setLoginSession] = useState<LoginSession | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(true);
  const [message, setMessage] = useState("");
  const [selectedCoachId, setSelectedCoachId] = useState<number | null>(null);
  const [currentAflRound, setCurrentAflRound] = useState<number | null>(null);
  const [fixtureRows, setFixtureRows] = useState<FixtureRow[]>([]);
  const [roundSubmissions, setRoundSubmissions] = useState<RoundSubmissionRow[]>([]);
  const [playerStats, setPlayerStats] = useState<AflPlayerRoundStatRow[]>([]);
  const [isLoadingPageData, setIsLoadingPageData] = useState(false);

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

  const refreshFixtureRows = useCallback(async (aflRound: number | null) => {
    if (!aflRound) {
      setFixtureRows([]);
      return [];
    }

    const { data, error } = await supabase
      .from("season_fixture")
      .select(
        "id, environment, competition_round, afl_round, matchup_index, coach_id, coach_name, opponent_coach_id, opponent_coach_name"
      )
      .eq("environment", APP_ENV)
      .eq("afl_round", aflRound)
      .order("competition_round", { ascending: true })
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

  const refreshPlayerStats = useCallback(async (aflRound: number | null) => {
    if (!aflRound) {
      setPlayerStats([]);
      return [];
    }

    const pageSize = 1000;
    let from = 0;
    let allRows: Record<string, unknown>[] = [];

    while (true) {
      const to = from + pageSize - 1;

      const { data, error } = await supabase
        .from("afl_player_round_stats")
        .select(
          "id, afl_round, afl_team_name, afl_team_code, player_name, k, hb, d, m, g, b, t, ho, ga, i50, cl, cg, r50, ff, fa, af, sc, imported_at"
        )
        .eq("environment", APP_ENV)
        .eq("afl_round", aflRound)
        .order("player_name", { ascending: true })
        .range(from, to);

      if (error) {
        setMessage(`Player stats load failed: ${error.message}`);
        setPlayerStats([]);
        return [];
      }

      const pageRows = (data ?? []) as Record<string, unknown>[];
      allRows = [...allRows, ...pageRows];

      if (pageRows.length < pageSize) break;
      from += pageSize;
    }

    const rows: AflPlayerRoundStatRow[] = allRows.map((row) => ({
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

    const aflRound = await refreshCurrentRound();
    await Promise.all([
      refreshFixtureRows(aflRound),
      refreshRoundSubmissions(),
      refreshPlayerStats(aflRound),
    ]);

    setIsLoadingPageData(false);
  }, [refreshCurrentRound, refreshFixtureRows, refreshPlayerStats, refreshRoundSubmissions]);

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
      setSelectedCoachId(nextSession.role === "coach" ? nextSession.coachId : nextSession.coachId ?? null);
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
        setSelectedCoachId(nextSession.role === "coach" ? nextSession.coachId : nextSession.coachId ?? null);
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
      .channel(`opponent-live-${APP_ENV}`)
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

  const availableCoaches = useMemo(() => {
    const map = new Map<number, string>();

    for (const row of fixtureRows) {
      map.set(row.coach_id, row.coach_name);
      map.set(row.opponent_coach_id, row.opponent_coach_name);
    }

    for (const submission of roundSubmissions) {
      if (!map.has(submission.coach_id)) {
        map.set(submission.coach_id, submission.coach_name);
      }
    }

    return Array.from(map.entries())
      .map(([id, name]) => ({ id, name }))
      .sort((a, b) => a.id - b.id);
  }, [fixtureRows, roundSubmissions]);

  useEffect(() => {
    if (selectedCoachId || availableCoaches.length === 0) return;

    if (loginSession?.role === "coach" && loginSession.coachId) {
      setSelectedCoachId(loginSession.coachId);
      return;
    }

    setSelectedCoachId(availableCoaches[0].id);
  }, [availableCoaches, loginSession, selectedCoachId]);

  const selectedCoachName = useMemo(() => {
    if (!selectedCoachId) return "—";
    return availableCoaches.find((coach) => coach.id === selectedCoachId)?.name ?? `Coach ${selectedCoachId}`;
  }, [availableCoaches, selectedCoachId]);

  const selectedCoachMatchViews = useMemo(() => {
    if (!selectedCoachId) return [];

    const seen = new Set<string>();
    const matches: MatchView[] = [];

    for (const row of fixtureRows) {
      const view = buildMatchViewForCoach(row, selectedCoachId);
      if (!view) continue;

      const pairKey = `${view.roundNumber}-${view.aflRound}-${view.matchupIndex}-${[view.selectedCoachId, view.opponentCoachId].sort((a, b) => a - b).join("-")}`;
      if (seen.has(pairKey)) continue;

      seen.add(pairKey);
      matches.push(view);
    }

    return matches.sort((a, b) => {
      if (a.roundNumber !== b.roundNumber) return a.roundNumber - b.roundNumber;
      return a.matchupIndex - b.matchupIndex;
    });
  }, [fixtureRows, selectedCoachId]);


  const submissionByRoundAndCoach = useMemo(() => {
    const exact = new Map<string, RoundSubmissionRow>();
    const latestByCoach = new Map<number, RoundSubmissionRow>();

    for (const submission of roundSubmissions) {
      const exactKey = `${submission.round_number}-${submission.coach_id}`;
      if (!exact.has(exactKey)) {
        exact.set(exactKey, submission);
      }

      const latest = latestByCoach.get(submission.coach_id);
      if (!latest || new Date(submission.submitted_at).getTime() > new Date(latest.submitted_at).getTime()) {
        latestByCoach.set(submission.coach_id, submission);
      }
    }

    return { exact, latestByCoach };
  }, [roundSubmissions]);

  function getCoachSubmission(roundNumber: number, coachId: number): RoundSubmissionRow | null {
    return (
      submissionByRoundAndCoach.exact.get(`${roundNumber}-${coachId}`) ??
      submissionByRoundAndCoach.latestByCoach.get(coachId) ??
      null
    );
  }

  const currentImportedClubCodes = useMemo(
    () => buildImportedClubSetForRound(playerStats, currentAflRound),
    [currentAflRound, playerStats]
  );

  const currentRoundStatus = getAflRoundCompletionLabel(currentImportedClubCodes.size);
  const canChangeCoach = loginSession?.role === "admin";

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (isAuthenticating) {
    return (
      <main className="min-h-screen bg-neutral-950 px-4 py-8 text-white">
        <div className="mx-auto max-w-[1900px] rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-lg font-semibold">Checking session...</div>
        </div>
      </main>
    );
  }

  if (!loginSession) return null;

  return (
    <main className="min-h-screen bg-neutral-950 px-3 py-4 text-white sm:px-4">
      <div className="mx-auto max-w-[1900px] space-y-4">
        <section className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="grid gap-3 xl:grid-cols-[1fr_auto_1fr] xl:items-center">
            <div />

            <h1 className="text-center text-2xl font-black">Live Scores</h1>

            <div className="flex flex-wrap justify-center gap-2 xl:justify-end">
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
            <div className="mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
              {message}
            </div>
          ) : null}
        </section>

        {isLoadingPageData ? (
          <section className="rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-white/60">
            Loading live opponent data...
          </section>
        ) : null}

        {!isLoadingPageData && selectedCoachMatchViews.length === 0 ? (
          <section className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-5 text-sm text-white/60">
            No opponent rows were found for {selectedCoachName} in AFL Round {currentAflRound ?? "—"}.
          </section>
        ) : null}

        <div className="space-y-4">
          {selectedCoachMatchViews.map((match) => {
            const statsMap = buildStatsMapForRound(playerStats, match.aflRound);
            const importedClubCodes = buildImportedClubSetForRound(playerStats, match.aflRound);

            const selectedSubmission = getCoachSubmission(match.roundNumber, match.selectedCoachId);
            const opponentSubmission = getCoachSubmission(match.roundNumber, match.opponentCoachId);

            const selectedRows = buildCoachBreakdownRows(
              selectedSubmission?.team_data,
              statsMap,
              importedClubCodes,
              buildPlayerClubLookup({ coachId: match.selectedCoachId, coachName: match.selectedCoachName })
            );

            const opponentRows = buildCoachBreakdownRows(
              opponentSubmission?.team_data,
              statsMap,
              importedClubCodes,
              buildPlayerClubLookup({ coachId: match.opponentCoachId, coachName: match.opponentCoachName })
            );

            const selectedTotal = calculateTeamTotal(selectedRows);
            const opponentTotal = calculateTeamTotal(opponentRows);
            const selectedPending = selectedRows.filter((row) => row.selectedType === "X" && !row.played && !row.clubImported).length;
            const opponentPending = opponentRows.filter((row) => row.selectedType === "X" && !row.played && !row.clubImported).length;
            const selectedCounting = selectedRows.filter((row) => row.countsToTotal).length;
            const opponentCounting = opponentRows.filter((row) => row.countsToTotal).length;
            const selectedAverage = selectedCounting > 0 ? Math.round(selectedTotal / selectedCounting) : 0;
            const opponentAverage = opponentCounting > 0 ? Math.round(opponentTotal / opponentCounting) : 0;
            const scoreMargin = Math.abs(selectedTotal - opponentTotal);
            const selectedIsLeading = selectedTotal > opponentTotal;
            const opponentIsLeading = opponentTotal > selectedTotal;
            const isTied = selectedTotal === opponentTotal;
            const isRoundComplete = importedClubCodes.size >= EXPECTED_AFL_CLUB_COUNT;
            const winnerName = selectedIsLeading ? match.selectedCoachName : match.opponentCoachName;
            const loserName = selectedIsLeading ? match.opponentCoachName : match.selectedCoachName;
            const leaderSummary = isTied
              ? isRoundComplete
                ? `${match.selectedCoachName} drew with ${match.opponentCoachName}`
                : `${match.selectedCoachName} and ${match.opponentCoachName} are tied`
              : isRoundComplete
                ? `${winnerName} def. ${loserName} by ${formatScore(scoreMargin)}`
                : `${winnerName} leads ${loserName} by ${formatScore(scoreMargin)}`;
            const totalPointsInMatch = selectedTotal + opponentTotal;
            const selectedProgressPercent = totalPointsInMatch > 0
              ? Math.min(100, Math.max(0, (selectedTotal / totalPointsInMatch) * 100))
              : 50;
            const positionComparisons = POSITION_ORDER.map((position) => {
              const selectedPositionTotal = getRowsTotal(selectedRows.filter((row) => row.position === position));
              const opponentPositionTotal = getRowsTotal(opponentRows.filter((row) => row.position === position));

              return {
                position,
                selectedPositionTotal,
                opponentPositionTotal,
              };
            });

            return (
              <section key={match.key} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <div className="mb-3 rounded-xl border border-white/10 bg-black/30 p-3 text-center">
                  <div className="text-xs font-bold uppercase tracking-wide text-white/45">
                    Super 8 Round {match.roundNumber}
                  </div>

                  <div className="mt-2 flex flex-col items-center justify-center gap-2 md:flex-row md:gap-6">
                    <div className={`min-w-[180px] rounded-xl border p-3 text-center ${
                      selectedIsLeading
                        ? "border-green-400/30 bg-green-500/10"
                        : "border-white/10 bg-white/5"
                    }`}>
                      <div className="text-xs font-bold uppercase tracking-wide text-white/55">
                        {match.selectedCoachName}
                      </div>
                      <div className={`mt-1 text-4xl font-black leading-none ${selectedIsLeading ? "text-green-100" : "text-white"}`}>
                        {formatScore(selectedTotal)}
                      </div>
                      <div className="mt-1 text-xs font-semibold text-white/60">
                        {selectedCounting} player{selectedCounting === 1 ? "" : "s"} • Avg {selectedAverage}
                      </div>
                    </div>

                    <div className={`min-w-[180px] rounded-xl border p-3 text-center ${
                      opponentIsLeading
                        ? "border-green-400/30 bg-green-500/10"
                        : "border-white/10 bg-white/5"
                    }`}>
                      <div className="text-xs font-bold uppercase tracking-wide text-white/55">
                        {match.opponentCoachName}
                      </div>
                      <div className={`mt-1 text-4xl font-black leading-none ${opponentIsLeading ? "text-green-100" : "text-white"}`}>
                        {formatScore(opponentTotal)}
                      </div>
                      <div className="mt-1 text-xs font-semibold text-white/60">
                        {opponentCounting} player{opponentCounting === 1 ? "" : "s"} • Avg {opponentAverage}
                      </div>
                    </div>
                  </div>

                  <div className="mt-2 text-sm font-bold text-white/80">{leaderSummary}</div>

                  <div className="mt-3 overflow-hidden rounded-full border border-white/10 bg-white/5">
                    <div className="flex h-3 w-full">
                      <div
                        className={`h-full ${selectedIsLeading ? "bg-green-500/70" : "bg-white/25"}`}
                        style={{ width: `${selectedProgressPercent}%` }}
                      />
                      <div
                        className={`h-full ${opponentIsLeading ? "bg-green-500/70" : "bg-white/25"}`}
                        style={{ width: `${100 - selectedProgressPercent}%` }}
                      />
                    </div>
                  </div>

                  <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-white/50 md:grid-cols-6">
                    {positionComparisons.map((comparison) => (
                      <div key={comparison.position} className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1.5">
                        <div className="font-black text-white/70">{comparison.position}</div>
                        <div className="mt-0.5 flex items-center justify-between gap-2">
                          <span className={comparison.selectedPositionTotal >= comparison.opponentPositionTotal ? "font-bold text-green-100" : "text-white/55"}>
                            {formatScore(comparison.selectedPositionTotal)}
                          </span>
                          <span className="text-white/25">v</span>
                          <span className={comparison.opponentPositionTotal > comparison.selectedPositionTotal ? "font-bold text-green-100" : "text-white/55"}>
                            {formatScore(comparison.opponentPositionTotal)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-3 xl:grid-cols-2">
                  <CoachLivePanel
                    coachId={match.selectedCoachId}
                    coachName={match.selectedCoachName}
                    submission={selectedSubmission}
                    rows={selectedRows}
                    total={selectedTotal}
                    pendingPlayers={selectedPending}
                    countedPlayers={selectedCounting}
                    accentClass="border-violet-500/30"
                  />

                  <CoachLivePanel
                    coachId={match.opponentCoachId}
                    coachName={match.opponentCoachName}
                    submission={opponentSubmission}
                    rows={opponentRows}
                    total={opponentTotal}
                    pendingPlayers={opponentPending}
                    countedPlayers={opponentCounting}
                    accentClass="border-white/10"
                  />
                </div>
              </section>
            );
          })}
        </div>

        <section className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-3 text-xs text-white/55">
          This page uses round submission snapshots, so the matchup reflects the team locked/submitted for that Super 8 round. Live scores update when AFL stats rows are imported.
        </section>
      </div>
    </main>
  );
}
