"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import * as coachConfigModule from "../../lib/coachConfig";
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

type AppSettingsRow = {
  environment: "production" | "preview";
  current_afl_round: number | null;
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

  return {
    environment: APP_ENV,
    current_afl_round: Number.isFinite(parsedRound) ? parsedRound : null,
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

function getRoundStatus(importedClubCount: number): "LIVE" | "FINAL" {
  return importedClubCount >= EXPECTED_AFL_CLUB_COUNT ? "FINAL" : "LIVE";
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
  const [fixtureRows, setFixtureRows] = useState<FixtureRow[]>([]);
  const [nextFixtureRows, setNextFixtureRows] = useState<FixtureRow[]>([]);
  const [isLoadingFixture, setIsLoadingFixture] = useState(false);
const [roundInput, setRoundInput] = useState("1");
const [isSavingRound, setIsSavingRound] = useState(false);
const [isExportingTeams, setIsExportingTeams] = useState(false);

  const loadProfileForUser = useCallback(async (userId: string, email: string) => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, role, coach_id, coach_name, team_name")
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
      .select("environment, current_afl_round")
      .eq("environment", APP_ENV)
      .maybeSingle();

    if (error) {
      setMessage(`Current AFL round load failed: ${error.message}`);
      setCurrentAflRound(null);
      return null;
    }

    const settings = normaliseAppSettingsRow(data);
    setCurrentAflRound(settings.current_afl_round);
    setRoundInput(String(settings.current_afl_round ?? 1));

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

    const nextAflRound = aflRound + 1;

    const { data, error } = await supabase
      .from("season_fixture")
      .select(
        "id, environment, competition_round, afl_round, matchup_index, coach_id, coach_name, opponent_coach_id, opponent_coach_name"
      )
      .eq("environment", APP_ENV)
      .in("afl_round", [aflRound, nextAflRound]);

    if (error) {
      setMessage(`Fixture load failed: ${error.message}`);
      setFixtureRows([]);
      setNextFixtureRows([]);
      setIsLoadingFixture(false);
      return;
    }

    const rows = sortFixtureRows((data ?? []) as FixtureRow[]);
    setFixtureRows(rows.filter((row) => row.afl_round === aflRound));
    setNextFixtureRows(rows.filter((row) => row.afl_round === nextAflRound));
    setIsLoadingFixture(false);
  }, []);

  const refreshDashboardFixture = useCallback(async () => {
    const aflRound = await refreshCurrentRound();
    await refreshFixtureForRound(aflRound);
  }, [refreshCurrentRound, refreshFixtureForRound]);

  const refreshPlayerStats = useCallback(async () => {
    const { data, error } = await supabase
      .from("afl_player_round_stats")
      .select("afl_round, afl_team_code")
      .eq("environment", APP_ENV);

    if (error) {
      setMessage(`Player stats load failed: ${error.message}`);
      setPlayerStats([]);
      return;
    }

    const rows: AflPlayerRoundStatRow[] = ((data ?? []) as Record<string, unknown>[]).map((row) => ({
      afl_round: typeof row.afl_round === "number" ? row.afl_round : Number(row.afl_round),
      afl_team_code: typeof row.afl_team_code === "string" ? row.afl_team_code : null,
    }));

    setPlayerStats(rows);
  }, []);

  const saveCurrentRound = useCallback(async () => {
    if (loginSession?.role !== "admin") {
      return;
    }

    const parsedRound = Number(roundInput);

    if (!Number.isInteger(parsedRound) || parsedRound < 1) {
      setMessage("Please enter a valid AFL round number.");
      return;
    }

    setIsSavingRound(true);
    setMessage("");

    const payload = {
      environment: APP_ENV,
      current_afl_round: parsedRound,
    };

    const { error: updateError, data: updateData } = await supabase
      .from("app_settings")
      .update(payload)
      .eq("environment", APP_ENV)
      .select("environment, current_afl_round");

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
    setRoundInput(String(parsedRound));
    await refreshFixtureForRound(parsedRound);
    setMessage(`Current AFL round updated to ${parsedRound}.`);
    setIsSavingRound(false);
  }, [loginSession?.role, refreshFixtureForRound, roundInput]);

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

    const workbook = XLSX.utils.book_new();

    const summaryRows = coachConfigs.map((coach) => {
      const row = teamRowsByCoachId[coach.id];
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

    for (const coach of coachConfigs) {
      const coachTeam = sanitiseTeamState(teamRowsByCoachId[coach.id]?.team_data);
      const rows = buildExportRowsForCoach(coach.id, coachTeam, poolsByCoach);
      const worksheet = XLSX.utils.json_to_sheet(rows);

      XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName(coach.name));
    }

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

  const currentRoundStatus = getRoundStatus(currentRoundImportedClubCodes.size);

  const dashboardTitle = useMemo(() => {
    if (!loginSession) return "Dashboard";

    if (loginSession.role === "admin") {
      return "Admin Dashboard";
    }

    return `${loginSession.teamName || loginSession.coachName} Dashboard`;
  }, [loginSession]);

  const currentWeekFixture = useMemo(() => buildDashboardFixtureMatches(fixtureRows), [fixtureRows]);

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

  const opponentTeamCardDescription = useMemo(() => {
  const currentSuper8Round = currentWeekFixture[0]?.competitionRound ?? null;

  if (!currentSuper8Round) {
    return "View your opponent’s team";
  }

  if (loginSession?.role === "coach" && loginSession.coachId) {
    const opponentNames = Array.from(
      new Set(
        fixtureRows
          .filter((row) => row.coach_id === loginSession.coachId)
          .map((row) => row.opponent_coach_name)
          .filter((name) => name.trim().length > 0)
      )
    );

    if (opponentNames.length === 1) {
      return `Super 8 Round ${currentSuper8Round}: view ${opponentNames[0]}’s team`;
    }

    if (opponentNames.length > 1) {
      return `Super 8 Round ${currentSuper8Round}: view ${opponentNames.join(" and ")} teams`;
    }
  }

  if (currentWeekFixture.length > 0) {
    return `Super 8 Round ${currentSuper8Round}: view all opponent teams`;
  }

  return `Super 8 Round ${currentSuper8Round}: view your opponent’s team`;
}, [currentWeekFixture, fixtureRows, loginSession]);


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
            <div className="text-lg font-bold">See Opponent&apos;s Team / Live Scores</div>
            <div className="mt-2 text-sm text-white/75">
              {opponentTeamCardDescription}
            </div>
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
            href="/records"
            className="rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:bg-white/10"
          >
            <div className="text-lg font-bold">Records</div>
            <div className="mt-2 text-sm text-white/75">
              Placeholder page for season and historical records.
            </div>
          </Link>
        </section>

        {loginSession.role === "admin" && (
          <>
            <section className="rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-6">
              <h2 className="text-2xl font-bold">Round Control</h2>
              <p className="mt-1 text-sm text-white/70">
                Update the AFL round used by the opponent team screen.
              </p>

              <div className="mt-4 grid gap-4 lg:grid-cols-[220px_180px_1fr] lg:items-end">
                <div>
                  <div className="mb-2 text-sm font-medium text-white/80">Current AFL Round</div>
                  <input
                    type="number"
                    min={1}
                    step={1}
                    value={roundInput}
                    onChange={(e) => setRoundInput(e.target.value)}
                    className="w-full rounded-xl border border-white/10 bg-neutral-900 px-4 py-3 text-white outline-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={() => void saveCurrentRound()}
                  disabled={isSavingRound}
                  className="rounded-xl border border-yellow-400/30 bg-yellow-500/20 px-4 py-3 text-sm font-semibold text-yellow-100 transition hover:bg-yellow-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isSavingRound ? "Saving..." : "Save AFL Round"}
                </button>

                <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                  <div className="text-xs font-semibold uppercase tracking-wide text-white/50">
                    Current Round Status
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <span className="text-lg font-bold">
                      AFL Round {currentAflRound ?? "Not set"}
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
                    {currentRoundImportedClubCodes.size}/{EXPECTED_AFL_CLUB_COUNT} AFL clubs imported
                  </div>
                </div>
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

    <button
      type="button"
      onClick={() => void handleExportTeamsXlsx()}
      disabled={isExportingTeams}
      className="rounded-xl border border-green-400/30 bg-green-500/20 px-4 py-3 text-sm font-semibold text-green-100 transition hover:bg-green-500/30 disabled:cursor-not-allowed disabled:opacity-60"
    >
      {isExportingTeams ? "Exporting..." : "Export Teams (XLSX)"}
    </button>
  </div>

  <div className="mt-6 space-y-6">
                {coachConfigs.map((coach) => {
                  const row = teamRowsByCoachId[coach.id];

                  const teamData =
                    row?.team_data && typeof row.team_data === "object"
                      ? (row.team_data as Record<string, any>)
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
              Super 8 Round {currentWeekFixture[0]?.competitionRound ?? "—"} / AFL Round{" "}
              {currentAflRound ?? "—"} • {currentRoundStatus} ({currentRoundImportedClubCodes.size}/{EXPECTED_AFL_CLUB_COUNT} clubs)
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
              AFL Round {currentAflRound ? currentAflRound + 1 : "—"}
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