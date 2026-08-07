"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import * as coachConfigModule from "../../lib/coachConfig";
import {
  FINALS_AFL_ROUNDS,
  getFinalsWeekForAflRound,
  getFinalsWeekForCompetitionRound,
} from "../../lib/finals";
import { getPlayersForCoach } from "../../lib/playersByCoach";
import { APP_ENV, supabase } from "../../lib/supabase";

type PositionKey = "KD" | "DEF" | "MID" | "FOR" | "KF" | "RUC";

type CoachConfigShape = {
  id: number;
  name: string;
  slots: Record<PositionKey, number>;
  emergencyLimits: Record<PositionKey, number>;
};

type LoginSession = {
  userId: string;
  email: string;
  role: "admin" | "coach";
  coachId: number | null;
  coachName: string;
  teamName: string;
};

type UserProfileRow = {
  id: string;
  role: "admin" | "coach";
  coach_id: number | null;
  coach_name: string | null;
  team_name: string | null;
};

type SavedTeamRow = {
  coach_id: number;
  coach_name: string;
  team_data: unknown;
  is_submitted: boolean;
  submitted_at: string | null;
  updated_at: string | null;
  environment: "production" | "preview";
};

type PositionState = {
  onField: string[];
  emergencies: string[];
};

type TeamState = Record<PositionKey, PositionState>;

type ExportPlayerRow = {
  "Player No.": number | string;
  Position: string;
  Club: string;
  "Player Name": string;
  Selected: string;
  "Selection Order": number | string;
};

type AllCoachExportRow = {
  Coach: string;
  "No.": number | string;
  Pos_2: string;
  Club: string;
  Player_Name: string;
  Selected: string;
};

type AppSettingsRow = {
  environment: "production" | "preview";
  current_afl_round: number | null;
  current_super8_round: number | null;
  latest_team_list_round: number | null;
  team_list_sync_status: string | null;
  team_list_sync_at: string | null;
  team_list_sync_round: number | null;
  team_list_sync_player_count: number | null;
  team_list_sync_team_count: number | null;
  team_list_sync_message: string | null;
};

type AflRoundFinalisationRow = {
  afl_round: number;
  expected_match_count: number;
  final_match_count: number;
  live_cleared_at: string | null;
};

type MatchResultRow = {
  round_number: number | null;
  afl_round: number | null;
  matchup_index: number | null;
  coach_1_name: string | null;
  coach_1_score: number | null;
  coach_2_name: string | null;
  coach_2_score: number | null;
};

type AflPlayerRoundStatRow = {
  afl_round: number | null;
  afl_team_code: string | null;
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

type DashboardFixtureMatch = {
  key: string;
  matchLabel: string;
  home: string;
  away: string;
  competitionRound: number;
  aflRound: number;
};

type LadderRow = {
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

const POSITIONS: PositionKey[] = ["KD", "DEF", "MID", "FOR", "KF", "RUC"];
const EXPECTED_AFL_CLUB_COUNT = 18;

const DEFAULT_ON_FIELD_SLOTS: Record<PositionKey, number> = {
  KD: 2,
  DEF: 4,
  MID: 5,
  FOR: 4,
  KF: 2,
  RUC: 1,
};

const DEFAULT_EMERGENCY_LIMITS: Record<PositionKey, number> = {
  KD: 3,
  DEF: 2,
  MID: 0,
  FOR: 2,
  KF: 3,
  RUC: 0,
};

const FALLBACK_COACH_CONFIGS: CoachConfigShape[] = [
  {
    id: 1,
    name: "Adrian Coach 1",
    slots: DEFAULT_ON_FIELD_SLOTS,
    emergencyLimits: DEFAULT_EMERGENCY_LIMITS,
  },
  {
    id: 2,
    name: "Chris Coach 2",
    slots: DEFAULT_ON_FIELD_SLOTS,
    emergencyLimits: DEFAULT_EMERGENCY_LIMITS,
  },
  {
    id: 3,
    name: "Damian Coach 3",
    slots: DEFAULT_ON_FIELD_SLOTS,
    emergencyLimits: DEFAULT_EMERGENCY_LIMITS,
  },
  {
    id: 4,
    name: "Dane Coach 4",
    slots: DEFAULT_ON_FIELD_SLOTS,
    emergencyLimits: DEFAULT_EMERGENCY_LIMITS,
  },
  {
    id: 5,
    name: "Josh Coach 5",
    slots: DEFAULT_ON_FIELD_SLOTS,
    emergencyLimits: DEFAULT_EMERGENCY_LIMITS,
  },
  {
    id: 6,
    name: "Mark Coach 6",
    slots: DEFAULT_ON_FIELD_SLOTS,
    emergencyLimits: DEFAULT_EMERGENCY_LIMITS,
  },
  {
    id: 7,
    name: "Rick Coach 7",
    slots: DEFAULT_ON_FIELD_SLOTS,
    emergencyLimits: DEFAULT_EMERGENCY_LIMITS,
  },
  {
    id: 8,
    name: "Troy Coach 8",
    slots: DEFAULT_ON_FIELD_SLOTS,
    emergencyLimits: DEFAULT_EMERGENCY_LIMITS,
  },
];

function toNumber(value: unknown, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function buildCoachConfig(rawCoach: unknown, fallbackId: number): CoachConfigShape {
  const coach = rawCoach && typeof rawCoach === "object" ? rawCoach : {};
  const coachRecord = coach as Record<string, unknown>;
  const id = toNumber(coachRecord.id ?? coachRecord.coachId ?? fallbackId, fallbackId);
  const name = String(
    coachRecord.name ?? coachRecord.coachName ?? coachRecord.label ?? `Coach ${id}`
  );

  const rawSlots =
    coachRecord.slots ??
    coachRecord.positionLimits ??
    coachRecord.onFieldSlots ??
    coachRecord.positions ??
    {};

  const rawEmergencyLimits =
    coachRecord.emergencyLimits ??
    coachRecord.emergencies ??
    coachRecord.benchLimits ??
    coachRecord.emergencySlots ??
    {};

  const slotsRecord =
    rawSlots && typeof rawSlots === "object" ? (rawSlots as Record<string, unknown>) : {};
  const emergencyLimitsRecord =
    rawEmergencyLimits && typeof rawEmergencyLimits === "object"
      ? (rawEmergencyLimits as Record<string, unknown>)
      : {};

  return {
    id,
    name,
    slots: {
      KD: toNumber(slotsRecord.KD, DEFAULT_ON_FIELD_SLOTS.KD),
      DEF: toNumber(slotsRecord.DEF, DEFAULT_ON_FIELD_SLOTS.DEF),
      MID: toNumber(slotsRecord.MID, DEFAULT_ON_FIELD_SLOTS.MID),
      FOR: toNumber(slotsRecord.FOR, DEFAULT_ON_FIELD_SLOTS.FOR),
      KF: toNumber(slotsRecord.KF, DEFAULT_ON_FIELD_SLOTS.KF),
      RUC: toNumber(slotsRecord.RUC, DEFAULT_ON_FIELD_SLOTS.RUC),
    },
    emergencyLimits: {
      KD: toNumber(emergencyLimitsRecord.KD, DEFAULT_EMERGENCY_LIMITS.KD),
      DEF: toNumber(emergencyLimitsRecord.DEF, DEFAULT_EMERGENCY_LIMITS.DEF),
      MID: toNumber(emergencyLimitsRecord.MID, DEFAULT_EMERGENCY_LIMITS.MID),
      FOR: toNumber(emergencyLimitsRecord.FOR, DEFAULT_EMERGENCY_LIMITS.FOR),
      KF: toNumber(emergencyLimitsRecord.KF, DEFAULT_EMERGENCY_LIMITS.KF),
      RUC: toNumber(emergencyLimitsRecord.RUC, DEFAULT_EMERGENCY_LIMITS.RUC),
    },
  };
}

function normaliseCoachConfigs(): CoachConfigShape[] {
  const mod = coachConfigModule as Record<string, unknown>;

  const arrayCandidate =
    mod.coachConfigs ??
    mod.COACH_CONFIGS ??
    mod.coaches ??
    mod.COACHES ??
    mod.default;

  if (Array.isArray(arrayCandidate) && arrayCandidate.length > 0) {
    return arrayCandidate.map((coach, index: number) => buildCoachConfig(coach, index + 1));
  }

  const objectCandidate =
    mod.coachConfig ??
    mod.COACH_CONFIG ??
    mod.defaultCoachConfig ??
    mod.default_coach_config;

  if (objectCandidate && typeof objectCandidate === "object") {
    const entries = Object.entries(objectCandidate as Record<string, unknown>);

    if (entries.length > 0) {
      return entries.map(([key, coach], index) => {
        const coachRecord =
          coach && typeof coach === "object" ? (coach as Record<string, unknown>) : {};

        return buildCoachConfig(
          {
            id: coachRecord.id ?? coachRecord.coachId ?? key,
            ...coachRecord,
          },
          index + 1
        );
      });
    }
  }

  return FALLBACK_COACH_CONFIGS;
}

function normaliseAppSettingsRow(input: unknown): AppSettingsRow {
  const row = input && typeof input === "object" ? (input as Record<string, unknown>) : {};

  const parsedRound =
    typeof row.current_afl_round === "number"
      ? row.current_afl_round
      : typeof row.current_afl_round === "string"
        ? Number(row.current_afl_round)
        : null;
  const parsedSuper8Round =
    typeof row.current_super8_round === "number"
      ? row.current_super8_round
      : typeof row.current_super8_round === "string"
        ? Number(row.current_super8_round)
        : null;
  const parsedTeamListRound =
    typeof row.latest_team_list_round === "number"
      ? row.latest_team_list_round
      : typeof row.latest_team_list_round === "string"
        ? Number(row.latest_team_list_round)
        : null;
  const parsedSyncRound =
    typeof row.team_list_sync_round === "number"
      ? row.team_list_sync_round
      : typeof row.team_list_sync_round === "string"
        ? Number(row.team_list_sync_round)
        : null;
  const parsedPlayerCount =
    typeof row.team_list_sync_player_count === "number"
      ? row.team_list_sync_player_count
      : typeof row.team_list_sync_player_count === "string"
        ? Number(row.team_list_sync_player_count)
        : null;
  const parsedTeamCount =
    typeof row.team_list_sync_team_count === "number"
      ? row.team_list_sync_team_count
      : typeof row.team_list_sync_team_count === "string"
        ? Number(row.team_list_sync_team_count)
        : null;

  return {
    environment: APP_ENV,
    current_afl_round: Number.isFinite(parsedRound) ? parsedRound : null,
    current_super8_round: Number.isFinite(parsedSuper8Round) ? parsedSuper8Round : null,
    latest_team_list_round: Number.isFinite(parsedTeamListRound) ? parsedTeamListRound : null,
    team_list_sync_status:
      typeof row.team_list_sync_status === "string" ? row.team_list_sync_status : null,
    team_list_sync_at:
      typeof row.team_list_sync_at === "string" ? row.team_list_sync_at : null,
    team_list_sync_round: Number.isFinite(parsedSyncRound) ? parsedSyncRound : null,
    team_list_sync_player_count: Number.isFinite(parsedPlayerCount) ? parsedPlayerCount : null,
    team_list_sync_team_count: Number.isFinite(parsedTeamCount) ? parsedTeamCount : null,
    team_list_sync_message:
      typeof row.team_list_sync_message === "string" ? row.team_list_sync_message : null,
  };
}

function sortFixtureRows(rows: FixtureRow[]): FixtureRow[] {
  return [...rows].sort((a, b) => {
    if (a.competition_round !== b.competition_round) {
      return a.competition_round - b.competition_round;
    }

    if (a.matchup_index !== b.matchup_index) {
      return a.matchup_index - b.matchup_index;
    }

    return a.coach_id - b.coach_id;
  });
}

function buildDashboardFixtureMatches(rows: FixtureRow[]): DashboardFixtureMatch[] {
  const matchMap = new Map<string, DashboardFixtureMatch>();

  for (const row of sortFixtureRows(rows)) {
    const key = `${row.competition_round}-${row.matchup_index}`;

    if (!matchMap.has(key)) {
      matchMap.set(key, {
        key,
        matchLabel: `Match ${row.matchup_index}`,
        home: row.coach_name,
        away: row.opponent_coach_name,
        competitionRound: row.competition_round,
        aflRound: row.afl_round,
      });
    }
  }

  return Array.from(matchMap.values());
}

function isUsersMatch(
  match: DashboardFixtureMatch,
  coachName: string | null | undefined
): boolean {
  if (!coachName) return false;

  return (
    match.home.toLowerCase() === coachName.toLowerCase() ||
    match.away.toLowerCase() === coachName.toLowerCase()
  );
}

function formatResultForMatch(result: MatchResultRow | undefined): {
  text: string;
  margin: number | null;
} | null {
  if (!result) return null;

  const coach1Score = Number(result.coach_1_score ?? 0);
  const coach2Score = Number(result.coach_2_score ?? 0);
  const coach1Name = result.coach_1_name ?? "Unknown Team";
  const coach2Name = result.coach_2_name ?? "Unknown Team";

  if (coach1Score === coach2Score) {
    return {
      text: `${coach1Name} ${coach1Score} drew with ${coach2Name} ${coach2Score}`,
      margin: 0,
    };
  }

  if (coach1Score > coach2Score) {
    return {
      text: `${coach1Name} ${coach1Score} def. ${coach2Name} ${coach2Score}`,
      margin: coach1Score - coach2Score,
    };
  }

  return {
    text: `${coach2Name} ${coach2Score} def. ${coach1Name} ${coach1Score}`,
    margin: coach2Score - coach1Score,
  };
}

function getImportedClubCodesForRound(
  statsRows: AflPlayerRoundStatRow[],
  aflRound: number | null
): Set<string> {
  const clubs = new Set<string>();

  if (!aflRound) return clubs;

  for (const row of statsRows) {
    if (row.afl_round !== aflRound) continue;

    const club = row.afl_team_code?.trim().toUpperCase() ?? "";
    if (club) clubs.add(club);
  }

  return clubs;
}

function getRoundStatus(finalMatchCount: number, expectedMatchCount: number): "LIVE" | "FINAL" {
  return expectedMatchCount > 0 && finalMatchCount >= expectedMatchCount ? "FINAL" : "LIVE";
}

function emptyTeamState(): TeamState {
  return {
    KD: { onField: [], emergencies: [] },
    DEF: { onField: [], emergencies: [] },
    MID: { onField: [], emergencies: [] },
    FOR: { onField: [], emergencies: [] },
    KF: { onField: [], emergencies: [] },
    RUC: { onField: [], emergencies: [] },
  };
}

function sanitiseTeamState(input: unknown): TeamState {
  const clean = emptyTeamState();

  if (!input || typeof input !== "object") {
    return clean;
  }

  const obj = input as Record<string, unknown>;

  for (const position of POSITIONS) {
    const savedPosition = obj[position];

    if (!savedPosition || typeof savedPosition !== "object") {
      continue;
    }

    const positionObj = savedPosition as Record<string, unknown>;

    clean[position] = {
      onField: Array.isArray(positionObj.onField)
        ? positionObj.onField.filter((value): value is string => typeof value === "string")
        : [],
      emergencies: Array.isArray(positionObj.emergencies)
        ? positionObj.emergencies.filter((value): value is string => typeof value === "string")
        : [],
    };
  }

  return clean;
}

function getAllSelectedPlayers(teamState: TeamState): string[] {
  return POSITIONS.flatMap((position) => [
    ...teamState[position].onField,
    ...teamState[position].emergencies,
  ]);
}

function safeSheetName(input: string): string {
  return input.replace(/[\\/?*[\]:]/g, "").slice(0, 31) || "Coach";
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

function buildExportRowsForCoach(
  coachId: number,
  team: TeamState,
  poolsByCoach: Record<number, ReturnType<typeof getPlayersForCoach>>
): ExportPlayerRow[] {
  const rows: ExportPlayerRow[] = [];
  const coachPoolForLookup = poolsByCoach[coachId];
  const selectionOrder: string[] = [];

// On-field first
for (const position of POSITIONS) {
  selectionOrder.push(...team[position].onField);
}

// Then emergencies
for (const position of POSITIONS) {
  selectionOrder.push(...team[position].emergencies);
}

const orderLookup = new Map<string, number>();
selectionOrder.forEach((playerName, index) => {
  if (!orderLookup.has(playerName)) {
    orderLookup.set(playerName, index + 1);
  }
});

// Emergency numbering resets inside each position
const emergencyLookup = new Map<string, string>();

for (const position of POSITIONS) {
  team[position].emergencies.forEach((playerName, index) => {
    if (!emergencyLookup.has(playerName)) {
      emergencyLookup.set(playerName, `I${index + 1}`);
    }
  });
}

  const groupedPlayers = POSITIONS.flatMap((position) =>
    coachPoolForLookup[position].map((player) => ({
      position,
      player,
    }))
  );

  for (const { position, player } of groupedPlayers) {
const isOnField = team[position].onField.includes(player.name);
const isEmergency = team[position].emergencies.includes(player.name);

let selectedValue = "Z";

if (isOnField) {
  selectedValue = "X";
} else if (isEmergency) {
  selectedValue = emergencyLookup.get(player.name) ?? "I";
}

rows.push({
  "Player No.": player.number,
  Position: position,
  Club: player.club,
  "Player Name": player.name,
  Selected: selectedValue,
  "Selection Order":
    selectedValue !== "Z" ? orderLookup.get(player.name) ?? "" : "",
});
  }

  return rows;
}

export default function DashboardPage() {
  const router = useRouter();
  const coachConfigs = useMemo(() => normaliseCoachConfigs(), []);

  const [loginSession, setLoginSession] = useState<LoginSession | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(true);
  const [results, setResults] = useState<MatchResultRow[]>([]);
  const [playerStats, setPlayerStats] = useState<AflPlayerRoundStatRow[]>([]);
  const [message, setMessage] = useState("");
  const [teamRowsByCoachId, setTeamRowsByCoachId] = useState<Record<number, SavedTeamRow>>({});
  const [currentAflRound, setCurrentAflRound] = useState<number | null>(null);
  const [currentSuper8RoundSetting, setCurrentSuper8RoundSetting] = useState<number | null>(null);
  const [teamListSyncHealth, setTeamListSyncHealth] = useState<AppSettingsRow | null>(null);
  const [fixtureRows, setFixtureRows] = useState<FixtureRow[]>([]);
  const [nextFixtureRows, setNextFixtureRows] = useState<FixtureRow[]>([]);
  const [isLoadingFixture, setIsLoadingFixture] = useState(false);
  const [currentRoundFinalisation, setCurrentRoundFinalisation] =
    useState<AflRoundFinalisationRow | null>(null);
const [roundInput, setRoundInput] = useState("1");
const [roundStageInput, setRoundStageInput] = useState("manual");
const [isSavingRound, setIsSavingRound] = useState(false);
const [isCompletingWeek, setIsCompletingWeek] = useState(false);
const [isClearingLiveScores, setIsClearingLiveScores] = useState(false);
const [isCheckingPreviewPipeline, setIsCheckingPreviewPipeline] = useState(false);
const [isFetchingPreviewCsv, setIsFetchingPreviewCsv] = useState(false);
const [isCheckingPreviewImport, setIsCheckingPreviewImport] = useState(false);
const [isImportingPreviewCsv, setIsImportingPreviewCsv] = useState(false);
const [isDeletingPreviewStats, setIsDeletingPreviewStats] = useState(false);
const [isDeletingProductionCsv, setIsDeletingProductionCsv] = useState(false);
const [isExportingTeams, setIsExportingTeams] = useState(false);
const [snapshotRoundInput, setSnapshotRoundInput] = useState("8");
const [isExportingSnapshot, setIsExportingSnapshot] = useState(false);

  const loadProfileForUser = useCallback(async (userId: string, email: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, role, coach_id, coach_name, team_name")
      .eq("id", userId)
      .eq("environment", APP_ENV)
      .maybeSingle();

    if (error) {
      setMessage(`Profile load failed: ${error.message}`);
      return null;
    }

    let profile = data as UserProfileRow | null;

    if (!profile && APP_ENV === "preview") {
      const { data: productionData, error: productionError } = await supabase
        .from("profiles")
        .select("id, role, coach_id, coach_name, team_name")
        .eq("id", userId)
        .eq("environment", "production")
        .eq("role", "admin")
        .maybeSingle();

      if (productionError) {
        setMessage(`Preview admin verification failed: ${productionError.message}`);
        return null;
      }

      profile = productionData as UserProfileRow | null;
    }

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
        (profile.role === "admin"
          ? "Admin"
          : `Coach ${profile.coach_id ?? ""}`.trim()),
      teamName: profile.team_name?.trim() || "",
    } satisfies LoginSession;
  }, []);

  const refreshDashboardData = useCallback(async () => {
    const { data, error } = await supabase
      .from("coach_team_selections")
      .select("coach_id, coach_name, team_data, is_submitted, submitted_at, updated_at, environment")
      .eq("environment", APP_ENV);

    if (error) {
      setMessage(`Dashboard load failed: ${error.message}`);
      return;
    }

    const nextMap: Record<number, SavedTeamRow> = {};

    for (const row of (data ?? []) as SavedTeamRow[]) {
      nextMap[row.coach_id] = row;
    }

    setTeamRowsByCoachId(nextMap);
  }, []);

  const refreshCurrentRound = useCallback(async () => {
    const { data, error } = await supabase
      .from("app_settings")
      .select(
        "environment, current_afl_round, current_super8_round, latest_team_list_round, team_list_sync_status, team_list_sync_at, team_list_sync_round, team_list_sync_player_count, team_list_sync_team_count, team_list_sync_message"
      )
      .eq("environment", APP_ENV)
      .maybeSingle();

    if (error) {
      setMessage(`Current AFL round load failed: ${error.message}`);
      setCurrentAflRound(null);
      return null;
    }

    const settings = normaliseAppSettingsRow(data);
    setCurrentAflRound(settings.current_afl_round);
    setCurrentSuper8RoundSetting(settings.current_super8_round);
    setTeamListSyncHealth(settings);
    setRoundInput(String(settings.current_afl_round ?? 1));
    const finalsWeek =
      getFinalsWeekForCompetitionRound(settings.current_super8_round) ??
      getFinalsWeekForAflRound(settings.current_afl_round);
    setRoundStageInput(finalsWeek ? `finals-${finalsWeek}` : "manual");

    return settings.current_afl_round;
  }, []);

  const refreshFixtureForRound = useCallback(async (aflRound: number | null) => {
    setIsLoadingFixture(true);

    if (!aflRound || !Number.isFinite(aflRound)) {
      setFixtureRows([]);
      setNextFixtureRows([]);
      setIsLoadingFixture(false);
      return;
    }

    const { data: nextRoundRows, error: nextRoundError } = await supabase
      .from("season_fixture")
      .select("afl_round")
      .eq("environment", APP_ENV)
      .gt("afl_round", aflRound)
      .order("afl_round", { ascending: true })
      .limit(1);

    if (nextRoundError) {
      setMessage(`Next fixture round load failed: ${nextRoundError.message}`);
      setFixtureRows([]);
      setNextFixtureRows([]);
      setIsLoadingFixture(false);
      return;
    }

    const nextAflRound =
      nextRoundRows && nextRoundRows.length > 0
        ? Number(nextRoundRows[0].afl_round)
        : null;

    const fixtureRoundNumbers = nextAflRound
      ? [aflRound, nextAflRound]
      : [aflRound];

    const { data, error } = await supabase
      .from("season_fixture")
      .select(
        "id, environment, competition_round, afl_round, matchup_index, coach_id, coach_name, opponent_coach_id, opponent_coach_name"
      )
      .eq("environment", APP_ENV)
      .in("afl_round", fixtureRoundNumbers);

    if (error) {
      setMessage(`Fixture load failed: ${error.message}`);
      setFixtureRows([]);
      setNextFixtureRows([]);
      setIsLoadingFixture(false);
      return;
    }

    const rows = sortFixtureRows((data ?? []) as FixtureRow[]);
    setFixtureRows(rows.filter((row) => row.afl_round === aflRound));
    setNextFixtureRows(
      nextAflRound
        ? rows.filter((row) => row.afl_round === nextAflRound)
        : []
    );
    setIsLoadingFixture(false);
  }, []);

  const refreshRoundFinalisation = useCallback(async (aflRound: number | null) => {
    if (!aflRound || !Number.isFinite(aflRound)) {
      setCurrentRoundFinalisation(null);
      return;
    }

    const { data, error } = await supabase
      .from("afl_round_finalisation")
      .select("afl_round, expected_match_count, final_match_count, live_cleared_at")
      .eq("environment", APP_ENV)
      .eq("afl_round", aflRound)
      .maybeSingle();

    if (error) {
      console.error("Round finalisation load failed:", error.message);
      setCurrentRoundFinalisation(null);
      return;
    }

    if (!data) {
      setCurrentRoundFinalisation({
        afl_round: aflRound,
        expected_match_count: 9,
        final_match_count: 0,
        live_cleared_at: null,
      });
      return;
    }

    setCurrentRoundFinalisation({
      afl_round: Number(data.afl_round),
      expected_match_count: Number(data.expected_match_count) || 9,
      final_match_count: Number(data.final_match_count) || 0,
      live_cleared_at:
        typeof data.live_cleared_at === "string" ? data.live_cleared_at : null,
    });
  }, []);

  const refreshDashboardFixture = useCallback(async () => {
    const aflRound = await refreshCurrentRound();
    await Promise.all([
      refreshFixtureForRound(aflRound),
      refreshRoundFinalisation(aflRound),
    ]);
  }, [refreshCurrentRound, refreshFixtureForRound, refreshRoundFinalisation]);

const refreshPlayerStats = useCallback(async () => {
  const pageSize = 1000;
  let from = 0;
  let allRows: Record<string, unknown>[] = [];

  while (true) {
    const to = from + pageSize - 1;

    const { data, error } = await supabase
      .from("afl_player_round_stats")
      .select("afl_round, afl_team_code")
      .eq("environment", APP_ENV)
      .order("afl_round", { ascending: true })
      .range(from, to);

    if (error) {
      setMessage(`Player stats load failed: ${error.message}`);
      setPlayerStats([]);
      return;
    }

    const pageRows = (data ?? []) as Record<string, unknown>[];

    allRows = [...allRows, ...pageRows];

    if (pageRows.length < pageSize) {
      break;
    }

    from += pageSize;
  }

  const rows: AflPlayerRoundStatRow[] = allRows.map((row) => ({
    afl_round:
      typeof row.afl_round === "number"
        ? row.afl_round
        : Number(row.afl_round),

    afl_team_code:
      typeof row.afl_team_code === "string"
        ? row.afl_team_code
        : null,
  }));

  setPlayerStats(rows);
}, []);

  const saveCurrentRound = useCallback(async () => {
    if (loginSession?.role !== "admin") {
      return;
    }

    const finalsWeekMatch = /^finals-([1-4])$/.exec(roundStageInput);
    const finalsWeek = finalsWeekMatch ? Number(finalsWeekMatch[1]) : null;
    const parsedRound = finalsWeek
      ? FINALS_AFL_ROUNDS[finalsWeek - 1]
      : Number(roundInput);

    if (!Number.isInteger(parsedRound) || parsedRound < 1) {
      setMessage("Please enter a valid AFL round number.");
      return;
    }

    setIsSavingRound(true);
    setMessage("");

    let nextSuper8Round = finalsWeek ? 14 + finalsWeek : currentSuper8RoundSetting;

    if (!finalsWeek) {
      const { data: fixtureData, error: fixtureError } = await supabase
        .from("season_fixture")
        .select("competition_round")
        .eq("environment", APP_ENV)
        .eq("afl_round", parsedRound)
        .order("competition_round", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (fixtureError) {
        setMessage(`Round mapping load failed: ${fixtureError.message}`);
        setIsSavingRound(false);
        return;
      }

      if (fixtureData?.competition_round) {
        nextSuper8Round = Number(fixtureData.competition_round);
      }
    }

    const payload = {
      environment: APP_ENV,
      current_afl_round: parsedRound,
      current_super8_round: nextSuper8Round,
    };

    const { error: updateError, data: updateData } = await supabase
      .from("app_settings")
      .update(payload)
      .eq("environment", APP_ENV)
      .select("environment, current_afl_round, current_super8_round");

    if (updateError) {
      setMessage(`AFL round save failed: ${updateError.message}`);
      setIsSavingRound(false);
      return;
    }

    if (!updateData || updateData.length === 0) {
      const { error: insertError } = await supabase
        .from("app_settings")
        .insert(payload);

      if (insertError) {
        setMessage(`AFL round save failed: ${insertError.message}`);
        setIsSavingRound(false);
        return;
      }
    }

    setCurrentAflRound(parsedRound);
    setCurrentSuper8RoundSetting(nextSuper8Round);
    setRoundInput(String(parsedRound));
    await Promise.all([
      refreshFixtureForRound(parsedRound),
      refreshRoundFinalisation(parsedRound),
    ]);
    setMessage(
      finalsWeek
        ? `Round Control updated to Finals Week ${finalsWeek} (Super 8 Round ${nextSuper8Round}, AFL Round ${parsedRound}).`
        : `Current round updated to Super 8 Round ${nextSuper8Round ?? "not mapped"}, AFL Round ${parsedRound}.`,
    );
    setIsSavingRound(false);
  }, [
    currentSuper8RoundSetting,
    loginSession?.role,
    refreshFixtureForRound,
    refreshRoundFinalisation,
    roundInput,
    roundStageInput,
  ]);



  const completeSuper8Week = useCallback(async () => {
    if (loginSession?.role !== "admin") {
      setMessage("Only admin can complete a Super 8 week.");
      return;
    }

    setIsCompletingWeek(true);
    setMessage("Completing Super 8 week...");

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) {
        throw new Error(sessionError.message);
      }

      const accessToken = session?.access_token;

      if (!accessToken) {
        throw new Error("No active session found. Please log in again.");
      }

      const response = await fetch("/api/admin/complete-super8-week", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ snapshotLadder: true }),
      });

      const payload = (await response.json().catch(() => null)) as {
        success?: boolean;
        message?: string;
        error?: string;
        details?: string;
        previousAflRound?: number;
        nextAflRound?: number;
        previousSuper8Round?: number | null;
        nextSuper8Round?: number | null;
      } | null;

      if (!response.ok || !payload?.success) {
        const errorMessage = payload?.error ?? payload?.message ?? "Complete Super 8 Week failed.";
        const details = payload?.details ? ` ${payload.details}` : "";
        throw new Error(`${errorMessage}${details}`);
      }

      await Promise.all([
        refreshDashboardData(),
        refreshDashboardFixture(),
        refreshPlayerStats(),
      ]);

      setMessage(
        payload.message ??
          `Super 8 week completed. AFL Round advanced from ${payload.previousAflRound ?? "?"} to ${payload.nextAflRound ?? "?"}.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Complete Super 8 Week error.";
      setMessage(`Complete Super 8 Week failed: ${message}`);
    } finally {
      setIsCompletingWeek(false);
    }
  }, [loginSession?.role, refreshDashboardData, refreshDashboardFixture, refreshPlayerStats]);

  const clearCurrentRoundLiveScores = useCallback(async () => {
    if (loginSession?.role !== "admin") {
      setMessage("Only admin can clear live scores.");
      return;
    }

    if (!currentAflRound) {
      setMessage("Current AFL round is not set.");
      return;
    }

    const confirmed = window.confirm(
      APP_ENV === "preview"
        ? `Start the private development live-to-CSV pipeline for AFL Round ${currentAflRound}?\n\nYour private Windows runner will fetch FootyWire CSV files and safely import only missing matches into local Supabase. Protected CSV rows will not be overwritten.`
        : `Start the protected live-to-CSV pipeline for AFL Round ${currentAflRound}?\n\nThe runner will fetch and validate FootyWire CSV files before replacing matching live rows. Existing protected CSV rows will not be overwritten. This can be run mid-round.`
    );

    if (!confirmed) return;

    setIsClearingLiveScores(true);
    setMessage(
      APP_ENV === "preview"
        ? `Requesting the private development pipeline for AFL Round ${currentAflRound}...`
        : `Requesting the protected production pipeline for AFL Round ${currentAflRound}...`
    );

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw new Error(sessionError.message);

      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("No active session found. Please log in again.");

      const response = await fetch(
        APP_ENV === "preview"
          ? "/api/admin/dispatch-preview-github-pipeline"
          : "/api/admin/dispatch-production-github-pipeline",
        {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirmRound: currentAflRound }),
        }
      );

      const payload = (await response.json().catch(() => null)) as {
        success?: boolean;
        message?: string;
        error?: string;
        details?: string;
        aflRound?: number;
        deletedPlayerStatCount?: number;
        deletedFallbackResultCount?: number;
        clearedAt?: string;
        workflowRunId?: number | null;
        workflowRunUrl?: string | null;
        workflowStatus?: string;
      } | null;

      if (!response.ok || !payload?.success) {
        const errorMessage = payload?.error ?? payload?.message ?? "Clear Live Scores failed.";
        const details = payload?.details ? ` ${payload.details}` : "";
        throw new Error(`${errorMessage}${details}`);
      }

      const workflowRunId = payload.workflowRunId;
        const initialRunUrl = payload.workflowRunUrl ?? "";
        const statusEndpoint =
          APP_ENV === "preview"
            ? "/api/admin/dispatch-preview-github-pipeline"
            : "/api/admin/dispatch-production-github-pipeline";
        const pipelineLabel =
          APP_ENV === "preview" ? "Private development pipeline" : "Protected production pipeline";
        setMessage(payload.message ?? `${pipelineLabel} started for AFL Round ${currentAflRound}.`);

        if (!workflowRunId) return;

        for (let attempt = 1; attempt <= 100; attempt += 1) {
          await new Promise((resolve) => setTimeout(resolve, 3_000));
          const statusResponse = await fetch(
            `${statusEndpoint}?runId=${workflowRunId}`,
            {
              method: "GET",
              headers: { Authorization: `Bearer ${accessToken}` },
              cache: "no-store",
            }
          );
          const statusPayload = (await statusResponse.json().catch(() => null)) as {
            success?: boolean;
            error?: string;
            details?: string;
            workflowStatus?: string;
            workflowConclusion?: string | null;
            workflowRunUrl?: string | null;
          } | null;

          if (!statusResponse.ok || !statusPayload?.success) {
            const reason = statusPayload?.error ?? "Pipeline status check failed.";
            const details = statusPayload?.details ? ` ${statusPayload.details}` : "";
            throw new Error(`${reason}${details}`);
          }

          const runUrl = statusPayload.workflowRunUrl ?? initialRunUrl;
          if (statusPayload.workflowStatus !== "completed") {
            setMessage(
              `${pipelineLabel} is ${statusPayload.workflowStatus ?? "running"} for AFL Round ${currentAflRound}.${runUrl ? ` ${runUrl}` : ""}`
            );
            continue;
          }

          if (statusPayload.workflowConclusion !== "success") {
            throw new Error(
              `${pipelineLabel} finished with ${statusPayload.workflowConclusion ?? "an unknown result"}.${runUrl ? ` ${runUrl}` : ""}`
            );
          }

          await Promise.all([
            refreshPlayerStats(),
            refreshRoundFinalisation(currentAflRound),
          ]);
          setMessage(
            `${pipelineLabel} completed successfully for AFL Round ${currentAflRound}. Existing protected CSV rows were retained.${runUrl ? ` ${runUrl}` : ""}`
          );
          return;
        }

      throw new Error(
        `${pipelineLabel} did not finish within five minutes.${initialRunUrl ? ` ${initialRunUrl}` : ""}`
      );

    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Clear Live Scores error.";
      setMessage(
        APP_ENV === "preview"
          ? `Private pipeline failed: ${message}`
          : `Protected production pipeline failed: ${message}`
      );
    } finally {
      setIsClearingLiveScores(false);
    }
  }, [currentAflRound, loginSession?.role, refreshPlayerStats, refreshRoundFinalisation]);

  const checkPreviewAflCsvPipeline = useCallback(async () => {
    if (APP_ENV !== "preview") {
      setMessage("The AFL CSV development pipeline is only available in preview.");
      return;
    }

    if (loginSession?.role !== "admin") {
      setMessage("Only a preview admin can check the AFL CSV pipeline.");
      return;
    }

    if (!currentAflRound) {
      setMessage("Current AFL round is not set for preview.");
      return;
    }

    setIsCheckingPreviewPipeline(true);
    setMessage(`Checking the preview AFL CSV pipeline for Round ${currentAflRound}...`);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw new Error(sessionError.message);

      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("No active session found. Please log in again.");

      const response = await fetch("/api/admin/preview-afl-csv-pipeline", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirmRound: currentAflRound }),
      });

      const payload = (await response.json().catch(() => null)) as {
        success?: boolean;
        dryRun?: boolean;
        message?: string;
        error?: string;
        details?: string;
        plannedSteps?: string[];
      } | null;

      if (!response.ok || !payload?.success || !payload.dryRun) {
        const errorMessage = payload?.error ?? payload?.message ?? "Preview pipeline check failed.";
        const details = payload?.details ? ` ${payload.details}` : "";
        throw new Error(`${errorMessage}${details}`);
      }

      const steps = payload.plannedSteps?.length
        ? ` Planned steps: ${payload.plannedSteps.join(" ")}`
        : "";
      setMessage(`${payload.message ?? "Preview pipeline safety check passed."}${steps}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown preview pipeline error.";
      setMessage(`Preview pipeline check failed: ${message}`);
    } finally {
      setIsCheckingPreviewPipeline(false);
    }
  }, [currentAflRound, loginSession?.role]);

  const generatePreviewAflCsvFiles = useCallback(async () => {
    if (APP_ENV !== "preview" || loginSession?.role !== "admin" || !currentAflRound) {
      setMessage("Preview admin access and a current AFL round are required.");
      return;
    }

    const confirmed = window.confirm(
      `Fetch completed FootyWire matches and generate local preview CSV files for AFL Round ${currentAflRound}?\n\nThis will not clear scores or upload anything to Supabase.`
    );
    if (!confirmed) return;

    setIsFetchingPreviewCsv(true);
    setMessage(`Generating local preview CSV files for AFL Round ${currentAflRound}...`);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();

      if (sessionError) throw new Error(sessionError.message);
      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("No active session found. Please log in again.");

      const response = await fetch("/api/admin/run-preview-afl-fetcher", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirmRound: currentAflRound }),
      });

      const payload = (await response.json().catch(() => null)) as {
        success?: boolean;
        message?: string;
        error?: string;
        details?: string;
        matchCount?: number;
        playerCount?: number;
        roundCsv?: string | null;
        perGameFiles?: string[];
      } | null;

      if (!response.ok || !payload?.success) {
        const errorMessage = payload?.error ?? payload?.message ?? "Preview CSV generation failed.";
        const details = payload?.details ? ` ${payload.details}` : "";
        throw new Error(`${errorMessage}${details}`);
      }

      const fileCount = payload.perGameFiles?.length ?? 0;
      setMessage(
        `${payload.message ?? "Preview CSV generation completed."} ` +
          `${payload.matchCount ?? 0} matches, ${payload.playerCount ?? 0} players, ` +
          `${fileCount} match CSV files${payload.roundCsv ? ` plus ${payload.roundCsv}` : ""}.`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown preview fetcher error.";
      setMessage(`Preview CSV generation failed: ${message}`);
    } finally {
      setIsFetchingPreviewCsv(false);
    }
  }, [currentAflRound, loginSession?.role]);

  const checkPreviewCsvImport = useCallback(async () => {
    if (APP_ENV !== "preview" || loginSession?.role !== "admin" || !currentAflRound) {
      setMessage("Preview admin access and a current AFL round are required.");
      return;
    }

    setIsCheckingPreviewImport(true);
    setMessage(`Checking protected CSV imports for Preview Round ${currentAflRound}...`);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      if (sessionError) throw new Error(sessionError.message);

      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("No active session found. Please log in again.");

      const response = await fetch("/api/admin/check-preview-csv-import", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirmRound: currentAflRound }),
      });

      const payload = (await response.json().catch(() => null)) as {
        success?: boolean;
        dryRun?: boolean;
        message?: string;
        error?: string;
        details?: string;
      } | null;

      if (!response.ok || !payload?.success || !payload.dryRun) {
        const errorMessage = payload?.error ?? payload?.message ?? "Protected import check failed.";
        const details = payload?.details ? ` ${payload.details}` : "";
        throw new Error(`${errorMessage}${details}`);
      }

      setMessage(payload.message ?? "Protected preview import check completed. No rows were changed.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown import-check error.";
      setMessage(`Protected preview import check failed: ${message}`);
    } finally {
      setIsCheckingPreviewImport(false);
    }
  }, [currentAflRound, loginSession?.role]);

  const importPreviewCsvFiles = useCallback(async () => {
    if (APP_ENV !== "preview" || loginSession?.role !== "admin" || !currentAflRound) {
      setMessage("Preview admin access and a current AFL round are required.");
      return;
    }

    const confirmed = window.confirm(
      `Insert new player rows from the generated match CSVs into Preview Round ${currentAflRound}?\n\nExisting rows will be skipped and protected. Production will not be changed.`
    );
    if (!confirmed) return;

    setIsImportingPreviewCsv(true);
    setMessage(`Importing protected CSV rows into Preview Round ${currentAflRound}...`);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      if (sessionError) throw new Error(sessionError.message);

      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("No active session found. Please log in again.");

      const response = await fetch("/api/admin/import-preview-csv-files", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ confirmRound: currentAflRound }),
      });

      const payload = (await response.json().catch(() => null)) as {
        success?: boolean;
        message?: string;
        error?: string;
        details?: string;
      } | null;

      if (!response.ok || !payload?.success) {
        const errorMessage = payload?.error ?? payload?.message ?? "Protected import failed.";
        const details = payload?.details ? ` ${payload.details}` : "";
        throw new Error(`${errorMessage}${details}`);
      }

      await refreshPlayerStats();
      setMessage(payload.message ?? "Protected Preview CSV import completed.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Preview import error.";
      setMessage(`Protected Preview CSV import failed: ${message}`);
    } finally {
      setIsImportingPreviewCsv(false);
    }
  }, [currentAflRound, loginSession?.role, refreshPlayerStats]);

  const deletePreviewRoundStats = useCallback(async () => {
    if (APP_ENV !== "preview" || loginSession?.role !== "admin" || !currentAflRound) {
      setMessage("Preview admin access and a current AFL round are required.");
      return;
    }

    setIsDeletingPreviewStats(true);
    setMessage(`Inspecting Preview Round ${currentAflRound} deletion...`);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      if (sessionError) throw new Error(sessionError.message);

      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("No active session found. Please log in again.");

      const requestDeletion = async (body: Record<string, unknown>) => {
        const response = await fetch("/api/admin/delete-preview-round-stats", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        const payload = (await response.json().catch(() => null)) as {
          success?: boolean;
          message?: string;
          error?: string;
          details?: string;
          affectedRowCount?: number;
          requiredConfirmation?: string;
        } | null;
        if (!response.ok || !payload?.success) {
          const errorMessage = payload?.error ?? payload?.message ?? "Preview deletion failed.";
          const details = payload?.details ? ` ${payload.details}` : "";
          throw new Error(`${errorMessage}${details}`);
        }
        return payload;
      };

      const inspection = await requestDeletion({
        action: "inspect",
        confirmRound: currentAflRound,
      });
      const requiredConfirmation = inspection.requiredConfirmation;
      if (!requiredConfirmation) throw new Error("The server did not provide a confirmation phrase.");

      const enteredConfirmation = window.prompt(
        `${inspection.affectedRowCount ?? 0} Preview player-stat rows will be permanently deleted for AFL Round ${currentAflRound}.\n\nProduction will not be changed.\n\nType this exact phrase to continue:\n${requiredConfirmation}`
      );

      if (enteredConfirmation === null) {
        setMessage("Preview deletion cancelled. No rows were changed.");
        return;
      }

      const result = await requestDeletion({
        action: "delete",
        confirmRound: currentAflRound,
        confirmation: enteredConfirmation,
      });
      await refreshPlayerStats();
      setMessage(result.message ?? "Preview round rows were deleted.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Preview deletion error.";
      setMessage(`Preview deletion failed: ${message}`);
    } finally {
      setIsDeletingPreviewStats(false);
    }
  }, [currentAflRound, loginSession?.role, refreshPlayerStats]);

  const deleteProductionRoundCsv = useCallback(async () => {
    if (APP_ENV !== "production" || loginSession?.role !== "admin" || !currentAflRound) {
      setMessage("Production admin access and a current AFL round are required.");
      return;
    }

    setIsDeletingProductionCsv(true);
    setMessage(`Inspecting protected production CSV rows for AFL Round ${currentAflRound}...`);

    try {
      const {
        data: { session },
        error: sessionError,
      } = await supabase.auth.getSession();
      if (sessionError) throw new Error(sessionError.message);

      const accessToken = session?.access_token;
      if (!accessToken) throw new Error("No active session found. Please log in again.");

      const requestDeletion = async (body: Record<string, unknown>) => {
        const response = await fetch("/api/admin/delete-production-round-csv", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(body),
        });
        const payload = (await response.json().catch(() => null)) as {
          success?: boolean;
          message?: string;
          error?: string;
          details?: string;
          affectedRowCount?: number;
          requiredConfirmation?: string;
        } | null;
        if (!response.ok || !payload?.success) {
          const errorMessage =
            payload?.error ?? payload?.message ?? "Production CSV deletion failed.";
          const details = payload?.details ? ` ${payload.details}` : "";
          throw new Error(`${errorMessage}${details}`);
        }
        return payload;
      };

      const inspection = await requestDeletion({
        action: "inspect",
        confirmRound: currentAflRound,
      });
      const requiredConfirmation = inspection.requiredConfirmation;
      if (!requiredConfirmation) {
        throw new Error("The server did not provide a confirmation phrase.");
      }

      const enteredConfirmation = window.prompt(
        `${inspection.affectedRowCount ?? 0} protected production CSV rows will be permanently deleted for AFL Round ${currentAflRound}.\n\nLive rows will not be deleted. This is for exceptional recovery only.\n\nType this exact phrase to continue:\n${requiredConfirmation}`
      );

      if (enteredConfirmation === null) {
        setMessage("Production CSV deletion cancelled. No rows were changed.");
        return;
      }

      const result = await requestDeletion({
        action: "delete",
        confirmRound: currentAflRound,
        confirmation: enteredConfirmation,
      });
      await refreshPlayerStats();
      setMessage(result.message ?? "Protected production CSV rows were deleted.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unknown production CSV deletion error.";
      setMessage(`Production CSV deletion failed: ${message}`);
    } finally {
      setIsDeletingProductionCsv(false);
    }
  }, [currentAflRound, loginSession?.role, refreshPlayerStats]);

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
      await Promise.all([refreshDashboardData(), refreshDashboardFixture(), refreshPlayerStats()]);
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
        await Promise.all([refreshDashboardData(), refreshDashboardFixture(), refreshPlayerStats()]);
      })();
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfileForUser, refreshDashboardData, refreshDashboardFixture, refreshPlayerStats, router]);

  useEffect(() => {
  async function loadResults() {
    const { data, error } = await supabase
      .from("super8_match_results")
      .select(
        "round_number, afl_round, matchup_index, coach_1_name, coach_1_score, coach_2_name, coach_2_score"
      );

    if (error) {
      console.error(error);
      return;
    }

    setResults((data ?? []) as MatchResultRow[]);
  }

  loadResults();
}, []);

  useEffect(() => {
    if (!loginSession) return;

    const channel = supabase
      .channel(`dashboard-live-${APP_ENV}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "coach_team_selections",
          filter: `environment=eq.${APP_ENV}`,
        },
        () => {
          void refreshDashboardData();
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
          void refreshDashboardFixture();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "season_fixture",
          filter: `environment=eq.${APP_ENV}`,
        },
        () => {
          void refreshDashboardFixture();
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
          void refreshPlayerStats();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loginSession, refreshDashboardData, refreshDashboardFixture, refreshPlayerStats]);

  useEffect(() => {
    if (!loginSession || !currentAflRound) return;

    const intervalId = window.setInterval(() => {
      void refreshRoundFinalisation(currentAflRound);
    }, 60_000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [currentAflRound, loginSession, refreshRoundFinalisation]);

  const ladder = useMemo(() => {
  const map = new Map<string, LadderRow>();

  function getTeam(name: string): LadderRow {
    if (!map.has(name)) {
      map.set(name, {
        team: name,
        played: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        percentage: 0,
        ladderPoints: 0,
      });
    }
    return map.get(name)!;
  }

  results.forEach((match) => {
    if (
      match.coach_1_score === null ||
      match.coach_2_score === null ||
      !match.coach_1_name ||
      !match.coach_2_name
    ) {
      return;
    }

    const t1 = getTeam(match.coach_1_name);
    const t2 = getTeam(match.coach_2_name);

    const s1 = match.coach_1_score;
    const s2 = match.coach_2_score;

    t1.played++;
    t2.played++;

    t1.pointsFor += s1;
    t1.pointsAgainst += s2;

    t2.pointsFor += s2;
    t2.pointsAgainst += s1;

    if (s1 > s2) {
      t1.wins++;
      t1.ladderPoints += 4;
      t2.losses++;
    } else if (s2 > s1) {
      t2.wins++;
      t2.ladderPoints += 4;
      t1.losses++;
    } else {
      t1.draws++;
      t2.draws++;
      t1.ladderPoints += 2;
      t2.ladderPoints += 2;
    }
  });

  const rows = Array.from(map.values()).map((t) => ({
    ...t,
    percentage:
      t.pointsAgainst > 0 ? (t.pointsFor / t.pointsAgainst) * 100 : 0,
  }));

  rows.sort((a, b) => {
    if (b.ladderPoints !== a.ladderPoints) return b.ladderPoints - a.ladderPoints;
    return b.pointsFor - a.pointsFor;
  });

  return rows;
}, [results]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  function buildTeamsExportWorkbook(
    rowsByCoachId: Record<number, SavedTeamRow>,
    poolsByCoach: Record<number, ReturnType<typeof getPlayersForCoach>>
  ) {
    const workbook = XLSX.utils.book_new();

    const summaryRows = coachConfigs.map((coach) => {
      const row = rowsByCoachId[coach.id];
      const teamData = sanitiseTeamState(row?.team_data);
      const selectedCount = getAllSelectedPlayers(teamData).length;

      return {
        Coach: coach.name,
        "Coach ID": coach.id,
        Submitted: row?.is_submitted ? "Yes" : "No",
        "Last Updated": formatTimestamp(row?.updated_at ?? null),
        "Submitted At": formatTimestamp(row?.submitted_at ?? null),
        "Players Selected": selectedCount,
      };
    });

    const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
    XLSX.utils.book_append_sheet(workbook, summarySheet, "Summary");

    const allCoachRows: AllCoachExportRow[] = [];

    for (const coach of coachConfigs) {
      const coachTeam = sanitiseTeamState(rowsByCoachId[coach.id]?.team_data);

      const rows = buildExportRowsForCoach(
        coach.id,
        coachTeam,
        poolsByCoach
      );

      const worksheet = XLSX.utils.json_to_sheet(rows);

      XLSX.utils.book_append_sheet(
        workbook,
        worksheet,
        safeSheetName(coach.name)
      );

      if (allCoachRows.length > 0) {
        allCoachRows.push({
          Coach: coach.name,
          "No.": "No.",
          Pos_2: "Pos_2",
          Club: "Club",
          Player_Name: "Player_Name",
          Selected: "Selected",
        });
      }

      rows.forEach((row) => {
        allCoachRows.push({
          Coach: coach.name,
          "No.": row["Player No."],
          Pos_2: row.Position,
          Club: row.Club,
          Player_Name: row["Player Name"],
          Selected: row.Selected,
        });
      });
    }

    const allCoachesSheet = XLSX.utils.json_to_sheet(allCoachRows);

    XLSX.utils.book_append_sheet(
      workbook,
      allCoachesSheet,
      "ALL_Coaches"
    );

    return workbook;
  }

  
async function handleExportSnapshotRoundXlsx() {
  if (loginSession?.role !== "admin") {
    setMessage("Only admin can export snapshot rounds.");
    return;
  }

  const parsedRound = Number(snapshotRoundInput);

  if (!Number.isInteger(parsedRound) || parsedRound < 1) {
    setMessage("Please enter a valid Super 8 round.");
    return;
  }

  setIsExportingSnapshot(true);
  setMessage(`Preparing round ${parsedRound} teams export...`);

  try {
    const { data, error } = await supabase
      .from("round_submissions")
      .select("coach_id, coach_name, team_data")
      .eq("environment", APP_ENV)
      .eq("round_number", parsedRound);

    if (error) {
      throw new Error(error.message);
    }

    const snapshotRows = data ?? [];

    if (snapshotRows.length === 0) {
      throw new Error(
        `No saved coach snapshots found for round ${parsedRound}.`
      );
    }

    const snapshotRowsByCoachId: Record<number, SavedTeamRow> = {};

    for (const row of snapshotRows) {
      snapshotRowsByCoachId[row.coach_id] = {
        coach_id: row.coach_id,
        coach_name: row.coach_name,
        team_data: row.team_data,
        is_submitted: true,
        submitted_at: null,
        updated_at: null,
        environment: APP_ENV as "production" | "preview",
      };
    }

    const poolsByCoach: Record<number, ReturnType<typeof getPlayersForCoach>> = {};

    for (const coach of coachConfigs) {
      poolsByCoach[coach.id] = getPlayersForCoach({
        coachId: coach.id,
        coachName: coach.name,
      });
    }

    const workbook = buildTeamsExportWorkbook(
      snapshotRowsByCoachId,
      poolsByCoach
    );

    const now = new Date();

    const fileName = `coach-team-selections-round-${parsedRound}-${APP_ENV}-${now
      .toISOString()
      .replace(/[:.]/g, "-")}.xlsx`;

    XLSX.writeFile(workbook, fileName);

    setMessage(
      `Snapshot export created: ${fileName}. Found ${snapshotRows.length} saved coach snapshots for round ${parsedRound}.`
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown snapshot export error.";

    setMessage(`Snapshot export failed: ${message}`);
  } finally {
    setIsExportingSnapshot(false);
  }
}


async function handleExportTeamsXlsx() {
  if (loginSession?.role !== "admin") {
    setMessage("Only admin can export teams.");
    return;
  }

  setIsExportingTeams(true);
  setMessage("Preparing XLSX export...");

  try {
    const poolsByCoach: Record<number, ReturnType<typeof getPlayersForCoach>> = {};

    for (const coach of coachConfigs) {
      poolsByCoach[coach.id] = getPlayersForCoach({
        coachId: coach.id,
        coachName: coach.name,
      });
    }

    const workbook = buildTeamsExportWorkbook(teamRowsByCoachId, poolsByCoach);

    const now = new Date();
    const fileName = `coach-team-selections-${APP_ENV}-${now
      .toISOString()
      .replace(/[:.]/g, "-")}.xlsx`;

    XLSX.writeFile(workbook, fileName);
    setMessage(`XLSX export created: ${fileName}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown export error.";
    setMessage(`XLSX export failed: ${message}`);
  } finally {
    setIsExportingTeams(false);
  }
}

  const currentRoundImportedClubCodes = useMemo(() => {
    return getImportedClubCodesForRound(playerStats, currentAflRound);
  }, [currentAflRound, playerStats]);

  const currentRoundExpectedMatchCount = currentRoundFinalisation?.expected_match_count ?? 9;
  const currentRoundFinalMatchCount = currentRoundFinalisation?.final_match_count ?? 0;
  const currentRoundStatus = getRoundStatus(
    currentRoundFinalMatchCount,
    currentRoundExpectedMatchCount
  );
  const isCurrentRoundCsvReady =
    currentRoundImportedClubCodes.size >= EXPECTED_AFL_CLUB_COUNT;
  const currentWeekFixture = useMemo(() => buildDashboardFixtureMatches(fixtureRows), [fixtureRows]);
  const currentFinalsWeek =
    getFinalsWeekForCompetitionRound(currentSuper8RoundSetting) ??
    getFinalsWeekForAflRound(currentAflRound);
  const nextWeekAflRound =
    nextFixtureRows[0]?.afl_round ??
    (currentFinalsWeek && currentAflRound && currentAflRound < FINALS_AFL_ROUNDS.at(-1)!
      ? currentAflRound + 1
      : null);
  const currentFixtureRoundLabel = currentFinalsWeek
    ? `AFL Round ${currentAflRound ?? "—"}, S8 Finals Week ${currentFinalsWeek}`
    : `Super 8 Round ${currentWeekFixture[0]?.competitionRound ?? "—"} / AFL Round ${currentAflRound ?? "—"}`;
  const nextFinalsWeek = getFinalsWeekForAflRound(nextWeekAflRound);
  const nextFixtureRoundLabel = nextFinalsWeek
    ? `AFL Round ${nextWeekAflRound}, S8 Finals Week ${nextFinalsWeek}`
    : `AFL Round ${nextWeekAflRound ?? "—"}`;

  const dashboardTitle = useMemo(() => {
    if (!loginSession) return "Dashboard";

    if (loginSession.role === "admin") {
      return "Admin Dashboard";
    }

    return `${loginSession.teamName || loginSession.coachName} Dashboard`;
  }, [loginSession]);

  const currentRoundResultByMatch = useMemo(() => {
    const map = new Map<number, MatchResultRow>();
    const currentSuper8Round = currentWeekFixture[0]?.competitionRound ?? null;

    for (const result of results) {
      if (result.round_number === currentSuper8Round && result.matchup_index !== null) {
        map.set(Number(result.matchup_index), result);
      }
    }

    return map;
  }, [currentWeekFixture, results]);

  const sortedCurrentWeekFixture = useMemo(() => {
  return [...currentWeekFixture].sort((a, b) => {
    const aIsUserMatch = isUsersMatch(a, loginSession?.coachName);
    const bIsUserMatch = isUsersMatch(b, loginSession?.coachName);

    if (aIsUserMatch && !bIsUserMatch) return -1;
    if (!aIsUserMatch && bIsUserMatch) return 1;

    return a.matchLabel.localeCompare(b.matchLabel);
  });
}, [currentWeekFixture, loginSession?.coachName]);
  const nextWeekFixture = useMemo(() => buildDashboardFixtureMatches(nextFixtureRows), [nextFixtureRows]);

  const opponentCardData = useMemo(() => {
    if (!loginSession?.coachId || fixtureRows.length === 0) {
      return {
        opponentName: "Opponent",
        score: null as string | null,
        isLive: false,
      };
    }

    const match = fixtureRows.find((row) => row.coach_id === loginSession.coachId);

    if (!match) {
      return {
        opponentName: "Opponent",
        score: null as string | null,
        isLive: false,
      };
    }

    const result = results.find(
      (row) =>
        row.round_number === match.competition_round &&
        row.matchup_index === match.matchup_index
    );

    let score: string | null = null;

    if (
      result &&
      result.coach_1_score !== null &&
      result.coach_2_score !== null
    ) {
      score = `${result.coach_1_score}–${result.coach_2_score}`;
    }

    const importedClubs = currentRoundImportedClubCodes.size;
    const isLive = importedClubs > 0 && importedClubs < EXPECTED_AFL_CLUB_COUNT;

    return {
      opponentName: match.opponent_coach_name,
      score,
      isLive,
    };
  }, [fixtureRows, loginSession?.coachId, results, currentRoundImportedClubCodes]);
  const fixtureCardDescription = useMemo(() => {
  const currentSuper8Round = currentWeekFixture[0]?.competitionRound ?? null;

  if (!currentSuper8Round) {
    return "See the full season fixture";
  }

  const matchupCount = currentWeekFixture.length;

  if (matchupCount === 0) {
    return `Super 8 Round ${currentSuper8Round}`;
  }

  if (matchupCount === 1) {
    return `Super 8 Round ${currentSuper8Round} has 1 matchup`;
  }

  return `Super 8 Round ${currentSuper8Round} has ${matchupCount} matchups`;
}, [currentWeekFixture]);

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
              <h1 className="text-3xl font-bold">{dashboardTitle}</h1>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void Promise.all([refreshDashboardData(), refreshDashboardFixture()])}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold text-white hover:bg-white/10"
              >
                Refresh
              </button>

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
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-6">
          <Link
            href="/select-team"
            className="rounded-2xl border border-violet-500/20 bg-violet-500/10 p-5 transition hover:bg-violet-500/20"
          >
            <div className="text-lg font-bold">Coach Selection</div>
            <div className="mt-2 text-sm text-white/75">
              Open the current team selection page.
            </div>
          </Link>

          <Link
            href="/opponent-team"
            className="rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:bg-white/10"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="text-lg font-bold leading-snug">
                View {opponentCardData.opponentName} Team / Live Scores
              </div>

              {opponentCardData.isLive ? (
                <span className="shrink-0 rounded-full border border-green-400/30 bg-green-500/15 px-2 py-0.5 text-[10px] font-bold text-green-300">
                  LIVE
                </span>
              ) : null}
            </div>

            {opponentCardData.score ? (
              <div className="mt-2 text-sm font-semibold text-white/70">
                {opponentCardData.score}
              </div>
            ) : null}
          </Link>

          <Link
            href="/fixture"
            className="rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:bg-white/10"
          >
            <div className="text-lg font-bold">Full Season Fixture</div>
            <div className="mt-2 text-sm text-white/75">
              {fixtureCardDescription}
            </div>
          </Link>

          <Link
            href="/results"
            className="rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:bg-white/10"
          >
            <div className="text-lg font-bold">Full Season Results</div>
            <div className="mt-2 text-sm text-white/75">
              View completed round results and history.
            </div>
          </Link>

          <Link
            href="/ladder"
            className="rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:bg-white/10"
          >
            <div className="text-lg font-bold">Ladder</div>
            <div className="mt-2 text-sm text-white/75">
              View the current ladder standings.
            </div>
          </Link>

          <Link
            href="/finals"
            className="rounded-2xl border border-yellow-300/25 bg-yellow-300/10 p-5 transition hover:bg-yellow-300/20"
          >
            <div className="text-lg font-bold text-yellow-200">Finals</div>
            <div className="mt-2 text-sm text-yellow-100/75">
              Follow the top-five premiership race.
            </div>
          </Link>
        </section>

        {loginSession.role === "admin" && (
          <>
            <section className="rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-6">
              <h2 className="text-2xl font-bold">Round Control</h2>
              <p className="mt-1 text-sm text-white/70">
                Update the competition stage and AFL round used by team selection and live scores.
              </p>

              <div className="mt-4 grid gap-4 lg:grid-cols-[220px_180px_1fr] lg:items-end">
                <div className="space-y-3">
                  <div>
                    <label className="mb-2 block text-sm font-medium text-white/80" htmlFor="round-stage">
                      Competition Stage
                    </label>
                    <select
                      id="round-stage"
                      value={roundStageInput}
                      onChange={(event) => {
                        const value = event.target.value;
                        setRoundStageInput(value);
                        const match = /^finals-([1-4])$/.exec(value);
                        if (match) {
                          const finalsWeek = Number(match[1]);
                          setRoundInput(String(FINALS_AFL_ROUNDS[finalsWeek - 1]));
                        }
                      }}
                      className="w-full rounded-xl border border-white/10 bg-neutral-900 px-4 py-3 text-white outline-none"
                    >
                      <option value="manual">Regular Season / Manual</option>
                      <option value="finals-1">Finals Week 1 — AFL Round 21</option>
                      <option value="finals-2">Finals Week 2 — AFL Round 22</option>
                      <option value="finals-3">Finals Week 3 — AFL Round 23</option>
                      <option value="finals-4">Finals Week 4 — AFL Round 24</option>
                    </select>
                  </div>
                  <div className="mb-2 text-sm font-medium text-white/80">Current AFL Round</div>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={roundInput}
                    onChange={(e) => {
                      setRoundInput(e.target.value);
                      setRoundStageInput("manual");
                    }}
                    readOnly={roundStageInput !== "manual"}
                    className="w-full rounded-xl border border-white/10 bg-neutral-900 px-4 py-3 text-white outline-none"
                  />
                </div>

                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => void saveCurrentRound()}
                    disabled={
                      isSavingRound ||
                      isCompletingWeek ||
                      isClearingLiveScores ||
                      isCheckingPreviewPipeline ||
                      isFetchingPreviewCsv ||
                      isCheckingPreviewImport ||
                      isImportingPreviewCsv ||
                      isDeletingPreviewStats ||
                      isDeletingProductionCsv
                    }
                    className="rounded-xl border border-yellow-400/30 bg-yellow-500/20 px-4 py-3 text-sm font-semibold text-yellow-100 transition hover:bg-yellow-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isSavingRound ? "Saving..." : "Save Round Settings"}
                  </button>

                  {APP_ENV === "preview" && (
                    <>
                      <button
                        type="button"
                        onClick={() => void checkPreviewAflCsvPipeline()}
                        disabled={
                          isCheckingPreviewPipeline ||
                          isFetchingPreviewCsv ||
                          isCheckingPreviewImport ||
                          isImportingPreviewCsv ||
                          isDeletingPreviewStats ||
                          isClearingLiveScores ||
                          isCompletingWeek ||
                          isSavingRound ||
                          !currentAflRound
                        }
                        className="rounded-xl border border-sky-400/30 bg-sky-500/20 px-4 py-3 text-sm font-semibold text-sky-100 transition hover:bg-sky-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isCheckingPreviewPipeline
                          ? "Checking Preview Pipeline..."
                          : "Check AFL CSV Pipeline (Dry Run)"}
                      </button>

                      <button
                        type="button"
                        onClick={() => void generatePreviewAflCsvFiles()}
                        disabled={
                          isFetchingPreviewCsv ||
                          isCheckingPreviewPipeline ||
                          isCheckingPreviewImport ||
                          isImportingPreviewCsv ||
                          isDeletingPreviewStats ||
                          isClearingLiveScores ||
                          isCompletingWeek ||
                          isSavingRound ||
                          !currentAflRound
                        }
                        className="rounded-xl border border-violet-400/30 bg-violet-500/20 px-4 py-3 text-sm font-semibold text-violet-100 transition hover:bg-violet-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isFetchingPreviewCsv
                          ? "Generating Preview CSVs..."
                          : "Generate Preview CSVs"}
                      </button>

                      <button
                        type="button"
                        onClick={() => void checkPreviewCsvImport()}
                        disabled={
                          isCheckingPreviewImport ||
                          isImportingPreviewCsv ||
                          isDeletingPreviewStats ||
                          isFetchingPreviewCsv ||
                          isCheckingPreviewPipeline ||
                          isClearingLiveScores ||
                          isCompletingWeek ||
                          isSavingRound ||
                          !currentAflRound
                        }
                        className="rounded-xl border border-cyan-400/30 bg-cyan-500/20 px-4 py-3 text-sm font-semibold text-cyan-100 transition hover:bg-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isCheckingPreviewImport
                          ? "Checking Protected Import..."
                          : "Check Protected CSV Import"}
                      </button>

                      <button
                        type="button"
                        onClick={() => void importPreviewCsvFiles()}
                        disabled={
                          isImportingPreviewCsv ||
                          isDeletingPreviewStats ||
                          isCheckingPreviewImport ||
                          isFetchingPreviewCsv ||
                          isCheckingPreviewPipeline ||
                          isClearingLiveScores ||
                          isCompletingWeek ||
                          isSavingRound ||
                          !currentAflRound
                        }
                        className="rounded-xl border border-emerald-400/30 bg-emerald-500/20 px-4 py-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isImportingPreviewCsv
                          ? "Importing Preview CSVs..."
                          : "Import Protected Preview CSVs"}
                      </button>

                      <button
                        type="button"
                        onClick={() => void deletePreviewRoundStats()}
                        disabled={
                          isDeletingPreviewStats ||
                          isImportingPreviewCsv ||
                          isCheckingPreviewImport ||
                          isFetchingPreviewCsv ||
                          isCheckingPreviewPipeline ||
                          isClearingLiveScores ||
                          isCompletingWeek ||
                          isSavingRound ||
                          !currentAflRound
                        }
                        className="rounded-xl border border-red-500/50 bg-red-950/40 px-4 py-3 text-sm font-semibold text-red-200 transition hover:bg-red-900/50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {isDeletingPreviewStats
                          ? "Processing Preview Deletion..."
                          : "Exception Only: Delete Preview Round Stats"}
                      </button>
                    </>
                  )}

                  {APP_ENV === "production" && (
                    <button
                      type="button"
                      onClick={() => void deleteProductionRoundCsv()}
                      disabled={
                        isDeletingProductionCsv ||
                        isClearingLiveScores ||
                        isCompletingWeek ||
                        isSavingRound ||
                        !currentAflRound
                      }
                      className="rounded-xl border border-red-600/60 bg-red-950/60 px-4 py-3 text-sm font-semibold text-red-100 transition hover:bg-red-900/60 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {isDeletingProductionCsv
                        ? "Inspecting Production CSV Rows..."
                        : "Exception Only: Delete Production Round CSVs"}
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => void clearCurrentRoundLiveScores()}
                    disabled={
                      isClearingLiveScores ||
                      isCompletingWeek ||
                      isSavingRound ||
                      isCheckingPreviewPipeline ||
                      isFetchingPreviewCsv ||
                      isCheckingPreviewImport ||
                      isImportingPreviewCsv ||
                      isDeletingPreviewStats ||
                      isDeletingProductionCsv
                    }
                    className="rounded-xl border border-red-400/30 bg-red-500/20 px-4 py-3 text-sm font-semibold text-red-100 transition hover:bg-red-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isClearingLiveScores
                      ? APP_ENV === "preview"
                        ? "Starting Private Pipeline..."
                        : "Starting Protected Pipeline..."
                      : "Run Live → CSV Pipeline"}
                  </button>

                  <button
                    type="button"
                    onClick={() => void completeSuper8Week()}
                    disabled={
                      isCompletingWeek ||
                      isSavingRound ||
                      isClearingLiveScores ||
                      isCheckingPreviewPipeline ||
                      isFetchingPreviewCsv ||
                      isCheckingPreviewImport ||
                      isImportingPreviewCsv ||
                      isDeletingPreviewStats ||
                      isDeletingProductionCsv ||
                      currentFinalsWeek !== null ||
                      currentRoundStatus !== "FINAL" ||
                      !isCurrentRoundCsvReady
                    }
                    className="rounded-xl border border-emerald-400/30 bg-emerald-500/20 px-4 py-3 text-sm font-semibold text-emerald-100 transition hover:bg-emerald-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isCompletingWeek ? "Completing..." : "Complete Super 8 Week"}
                  </button>
                </div>

                <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-white/50">
                    Current Round Status
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <span className="text-lg font-bold">
                      {currentFinalsWeek
                        ? `Finals Week ${currentFinalsWeek} • AFL Round ${currentAflRound ?? "Not set"}`
                        : `AFL Round ${currentAflRound ?? "Not set"}`}
                    </span>
                    <span
                      className={`rounded-full border px-3 py-1 text-xs font-bold ${
                        currentRoundStatus === "FINAL"
                          ? "border-green-400/30 bg-green-500/15 text-green-200"
                          : "border-amber-400/30 bg-amber-500/15 text-amber-100"
                      }`}
                    >
                      {currentRoundStatus}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-white/70">
                    Super 8 Round {currentSuper8RoundSetting ?? "Not set"}
                  </div>
                  <div className="mt-1 text-sm text-white/70">
                    {currentRoundFinalMatchCount}/{currentRoundExpectedMatchCount} AFL matches final
                  </div>
                  {currentFinalsWeek ? (
                    <div className="mt-2 text-xs font-semibold text-yellow-200">
                      Finals progression is controlled from the Finals page. Regular-season completion is disabled.
                    </div>
                  ) : null}
                  <div className="mt-1 text-sm text-white/70">
                    {currentRoundImportedClubCodes.size}/{EXPECTED_AFL_CLUB_COUNT} AFL clubs imported
                  </div>
                </div>
              </div>
            </section>

            <section className="border-y border-cyan-400/20 bg-cyan-500/5 px-6 py-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="text-xl font-bold">AFL Team-List Sync</h2>
                  <p className="mt-1 text-sm text-white/65">
                    Latest player-status data available to the team-selection page.
                  </p>
                </div>
                <span
                  className={`w-fit rounded-full border px-3 py-1 text-xs font-bold uppercase ${
                    teamListSyncHealth?.team_list_sync_status === "success"
                      ? "border-green-400/30 bg-green-500/15 text-green-200"
                      : teamListSyncHealth?.team_list_sync_status === "failed"
                        ? "border-red-400/30 bg-red-500/15 text-red-200"
                        : "border-amber-400/30 bg-amber-500/15 text-amber-100"
                  }`}
                >
                  {teamListSyncHealth?.team_list_sync_status ?? "Not recorded"}
                </span>
              </div>

              <dl className="mt-5 grid gap-x-6 gap-y-4 sm:grid-cols-2 xl:grid-cols-4">
                <div>
                  <dt className="text-xs font-semibold uppercase text-white/45">Team-list round</dt>
                  <dd className="mt-1 text-lg font-bold">
                    {teamListSyncHealth?.latest_team_list_round ?? "Not set"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase text-white/45">Players</dt>
                  <dd className="mt-1 text-lg font-bold">
                    {teamListSyncHealth?.team_list_sync_player_count ?? "-"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase text-white/45">Teams</dt>
                  <dd className="mt-1 text-lg font-bold">
                    {teamListSyncHealth?.team_list_sync_team_count ?? "-"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs font-semibold uppercase text-white/45">Last update</dt>
                  <dd className="mt-1 text-sm font-semibold">
                    {formatTimestamp(teamListSyncHealth?.team_list_sync_at)}
                  </dd>
                </div>
              </dl>

              <div className="mt-4 text-sm text-white/70">
                {teamListSyncHealth?.team_list_sync_message ??
                  "Run the AFL team-list sync once to populate health details."}
              </div>
            </section>

            <section className="rounded-2xl border border-green-500/20 bg-green-500/10 p-6">
  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
    <div>
      <h2 className="text-2xl font-bold">Coach Teams (Admin View)</h2>
      <p className="mt-1 text-sm text-white/70">
        View submission status and full team selections for all coaches.
      </p>
    </div>

    <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
      <button
        type="button"
        onClick={() => void handleExportTeamsXlsx()}
        disabled={isExportingTeams}
        className="rounded-xl border border-green-400/30 bg-green-500/20 px-4 py-3 text-sm font-semibold text-green-100 transition hover:bg-green-500/30 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {isExportingTeams ? "Exporting..." : "Export Teams (XLSX)"}
      </button>

      <div className="flex items-center gap-2">
        <input
          type="number"
          min={1}
          step={1}
          value={snapshotRoundInput}
          onChange={(e) => setSnapshotRoundInput(e.target.value)}
          className="w-24 rounded-xl border border-white/10 bg-neutral-900 px-3 py-3 text-sm text-white outline-none"
        />

        <button
          type="button"
          onClick={() => void handleExportSnapshotRoundXlsx()}
          disabled={isExportingSnapshot}
          className="rounded-xl border border-blue-400/30 bg-blue-500/20 px-4 py-3 text-sm font-semibold text-blue-100 transition hover:bg-blue-500/30 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {isExportingSnapshot
            ? "Exporting..."
            : "Export Teams for Round"}
        </button>
      </div>
    </div>
  </div>

  <div className="mt-6 space-y-6">
                {coachConfigs.map((coach) => {
                  const row = teamRowsByCoachId[coach.id];

                  const teamData =
                    row?.team_data && typeof row.team_data === "object"
                      ? (row.team_data as Partial<Record<PositionKey, Partial<PositionState>>>)
                      : {};

                  return (
                    <div
                      key={coach.id}
                      className="rounded-xl border border-white/10 bg-black/30 p-5"
                    >
                      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                        <div className="text-lg font-semibold">
                          {coach.name}
                        </div>

                        <div className="text-sm">
                          {row?.is_submitted ? (
                            <span className="text-green-400 font-semibold">Submitted</span>
                          ) : (
                            <span className="text-red-400 font-semibold">Not Submitted</span>
                          )}
                        </div>
                      </div>

                      <div className="mt-2 text-xs text-white/50">
                        Last updated: {row?.updated_at ?? "-"}
                      </div>

                      <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {POSITIONS.map((pos) => {
                          const posData = teamData?.[pos] ?? {};
                          const onField = posData?.onField ?? [];
                          const emergencies = posData?.emergencies ?? [];

                          return (
                            <div
                              key={pos}
                              className="rounded-lg border border-white/10 bg-white/5 p-3"
                            >
                              <div className="text-sm font-bold mb-2">{pos}</div>

                              <div className="text-xs text-white/60">On Field</div>
                              <div className="text-sm">
                                {onField.length > 0 ? onField.join(", ") : "-"}
                              </div>

                              <div className="mt-2 text-xs text-white/60">Emergencies</div>
                              <div className="text-sm">
                                {emergencies.length > 0 ? emergencies.join(", ") : "-"}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}

        <section className="grid gap-4 xl:grid-cols-[1.05fr_1fr_0.7fr]">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h2 className="text-xl font-bold">Ladder</h2>
                <p className="mt-1 text-xs text-white/60">Quick preview.</p>
              </div>

              <Link
                href="/ladder"
                className="rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
              >
                Open
              </Link>
            </div>

            <div className="mt-3 overflow-x-auto">
              <table className="min-w-full text-left text-xs">
                <thead className="text-white/50">
                  <tr className="border-b border-white/10">
                    <th className="px-2 py-1.5">#</th>
                    <th className="px-2 py-1.5">Coach</th>
                    <th className="px-2 py-1.5 text-center">W</th>
                    <th className="px-2 py-1.5 text-center">L</th>
                    <th className="px-2 py-1.5 text-center">D</th>
                  </tr>
                </thead>
                <tbody>
                  {ladder.map((team, index) => {
                    const divider = index === 5;

                    return (
                      <tr
                        key={team.team}
                        className={`${divider ? "border-t-2 border-dashed border-white/40" : "border-b border-white/5"}`}
                      >
                        <td className="px-2 py-1.5">{index + 1}</td>
                        <td className="px-2 py-1.5 font-medium text-white/90">{team.team}</td>
                        <td className="px-2 py-1.5 text-center">{team.wins}</td>
                        <td className="px-2 py-1.5 text-center">{team.losses}</td>
                        <td className="px-2 py-1.5 text-center">{team.draws}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
            <h2 className="text-xl font-bold">Current Week Fixture</h2>
            <p className="mt-1 text-xs text-white/60">
              {currentFixtureRoundLabel} • {currentRoundStatus} ({currentRoundFinalMatchCount}/{currentRoundExpectedMatchCount} matches final, {currentRoundImportedClubCodes.size}/{EXPECTED_AFL_CLUB_COUNT} clubs)
            </p>

            <div className="mt-3 space-y-2">
              {isLoadingFixture ? (
                <div className="rounded-lg border border-white/10 bg-black/20 p-3 text-xs text-white/60">
                  Loading current fixture...
                </div>
              ) : currentWeekFixture.length > 0 ? (
                sortedCurrentWeekFixture.map((match) => {
                  const isUserMatch = isUsersMatch(match, loginSession?.coachName);
                  const result = currentRoundResultByMatch.get(
                    Number(match.matchLabel.replace("Match ", ""))
                  );
                  const resultData = formatResultForMatch(result);

                  return (
                    <Link key={match.key} href="/opponent-team">
                      <div
                        className={`rounded-lg border cursor-pointer transition ${
                          isUserMatch
                            ? "p-4 border-green-400/50 bg-green-500/15 hover:bg-green-500/25 scale-[1.02]"
                            : "p-3 border-white/10 bg-black/20 hover:bg-white/10"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-[11px] font-semibold uppercase tracking-wide text-white/45">
                            Current Round • {match.matchLabel}
                          </div>

                          {isUserMatch ? (
                            <div className="shrink-0 text-[11px] font-bold text-green-300">
                              🔥 Your Match
                            </div>
                          ) : null}
                        </div>

                        <div
                          className={`mt-1 font-semibold ${
                            isUserMatch ? "text-base text-white" : "text-sm text-white"
                          }`}
                        >
                          {resultData ? resultData.text : `${match.home} vs ${match.away}`}
                        </div>

                        {resultData && resultData.margin !== null && resultData.margin > 0 ? (
                          <div className="mt-1 text-[12px] font-semibold text-green-300">
                            won by {resultData.margin}
                          </div>
                        ) : null}
                      </div>
                    </Link>
                  );
                })
              ) : (
                <div className="rounded-lg border border-dashed border-white/10 bg-black/20 p-3 text-xs text-white/60">
                  No fixture rows found for AFL Round {currentAflRound ?? "—"}.
                </div>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
            <h2 className="text-base font-bold">Next Week</h2>
            <p className="mt-0.5 text-[11px] text-white/50">
              {nextFixtureRoundLabel}
            </p>

            <div className="mt-2 space-y-1.5">
              {isLoadingFixture ? (
                <div className="rounded-md border border-white/10 bg-black/20 px-2 py-2 text-[11px] text-white/55">
                  Loading...
                </div>
              ) : nextWeekFixture.length > 0 ? (
                nextWeekFixture.map((match) => (
                  <div
                    key={match.key}
                    className="rounded-md border border-white/10 bg-black/20 px-2 py-2"
                  >
                    <div className="text-[10px] font-semibold uppercase tracking-wide text-white/40">
                      {match.matchLabel}
                    </div>
                    <div className="mt-0.5 text-xs font-semibold leading-snug text-white">
                      {match.home} vs {match.away}
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-md border border-dashed border-white/10 bg-black/20 px-2 py-2 text-[11px] text-white/55">
                  No next fixture found.
                </div>
              )}
            </div>
          </div>
        </section>

      </div>
    </main>
  );
}
