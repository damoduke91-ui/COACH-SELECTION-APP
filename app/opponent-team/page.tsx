"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as coachConfigModule from "../../lib/coachConfig";
import {
  type CoachPlayerPool,
  type PositionKey,
  getPlayersForCoach,
} from "../../lib/playersByCoach";
import { APP_ENV, supabase } from "../../lib/supabase";

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

type PositionState = {
  onField: string[];
  emergencies: string[];
};

type TeamState = Record<PositionKey, PositionState>;

type SavedTeamRow = {
  coach_id: number;
  coach_name: string;
  team_data: unknown;
  is_submitted: boolean;
  submitted_at: string | null;
  updated_at: string | null;
  environment: "production" | "preview";
};

type CoachConfigShape = {
  id: number;
  name: string;
  slots: Record<PositionKey, number>;
  emergencyLimits: Record<PositionKey, number>;
};

type PlayerLookupRow = {
  name: string;
  club: string;
  number: number;
  position: PositionKey;
};

type AppSettingsRow = {
  environment: "production" | "preview";
  current_afl_round: number | null;
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

type TeamPanelProps = {
  title: string;
  subtitle: string;
  team: TeamState;
  lookup: Map<string, PlayerLookupRow>;
  submitted: boolean;
  updatedAt: string | null | undefined;
  submittedAt?: string | null | undefined;
  accentClass?: string;
};

const POSITIONS: PositionKey[] = ["KD", "DEF", "MID", "FOR", "KF", "RUC"];

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

function countSelectedPlayers(teamData: TeamState): number {
  return POSITIONS.reduce((total, position) => {
    return total + teamData[position].onField.length + teamData[position].emergencies.length;
  }, 0);
}

function getCoachPool(selectedCoach: CoachConfigShape | undefined): CoachPlayerPool {
  return getPlayersForCoach({
    coachId: selectedCoach?.id,
    coachName: selectedCoach?.name,
  });
}

function buildPlayerLookup(pool: CoachPlayerPool): Map<string, PlayerLookupRow> {
  const lookup = new Map<string, PlayerLookupRow>();

  for (const position of POSITIONS) {
    for (const player of pool[position]) {
      lookup.set(player.name, {
        name: player.name,
        club: player.club,
        number: player.number,
        position,
      });
    }
  }

  return lookup;
}

function renderPlayerLine(playerName: string, lookup: Map<string, PlayerLookupRow>) {
  const player = lookup.get(playerName);

  if (!player) {
    return playerName;
  }

  return `${player.number}. ${player.name} (${player.club})`;
}

function normaliseAppSettingsRow(input: unknown): AppSettingsRow {
  const row = input && typeof input === "object" ? (input as Record<string, unknown>) : {};

  return {
    environment: APP_ENV,
    current_afl_round:
      typeof row.current_afl_round === "number"
        ? row.current_afl_round
        : typeof row.current_afl_round === "string"
          ? Number(row.current_afl_round)
          : null,
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

    return a.opponent_coach_id - b.opponent_coach_id;
  });
}

function TeamPanel({
  title,
  subtitle,
  team,
  lookup,
  submitted,
  updatedAt,
  submittedAt,
  accentClass = "border-white/10",
}: TeamPanelProps) {
  return (
    <section className={`rounded-2xl border bg-white/5 p-4 ${accentClass}`}>
      <div className="border-b border-white/10 pb-3">
        <h2 className="text-xl font-bold">{title}</h2>
        <p className="mt-1 text-xs text-white/65">{subtitle}</p>
        <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-white/65">
          <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
            Players: {countSelectedPlayers(team)}
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
            Submitted: {submitted ? "Yes" : "No"}
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
            Updated: {formatTimestamp(updatedAt)}
          </div>
          <div className="rounded-lg border border-white/10 bg-black/20 px-3 py-2">
            Submitted At: {formatTimestamp(submittedAt)}
          </div>
        </div>
      </div>

      <div className="mt-4 space-y-3">
        {POSITIONS.map((position) => (
          <div key={position} className="rounded-xl border border-white/10 bg-black/20 p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-bold">{position}</div>
              <div className="text-[11px] text-white/50">
                On {team[position].onField.length} • Emg {team[position].emergencies.length}
              </div>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-white/45">
                  On Ground
                </div>
                <div className="space-y-1.5">
                  {team[position].onField.length > 0 ? (
                    team[position].onField.map((playerName) => (
                      <div
                        key={`${position}-on-${playerName}`}
                        className="rounded-md border border-white/10 bg-neutral-900 px-2.5 py-1.5 text-xs text-white"
                      >
                        {renderPlayerLine(playerName, lookup)}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-md border border-dashed border-white/10 px-2.5 py-1.5 text-xs text-white/45">
                      None selected
                    </div>
                  )}
                </div>
              </div>

              <div>
                <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-white/45">
                  Emergencies
                </div>
                <div className="space-y-1.5">
                  {team[position].emergencies.length > 0 ? (
                    team[position].emergencies.map((playerName) => (
                      <div
                        key={`${position}-emg-${playerName}`}
                        className="rounded-md border border-white/10 bg-neutral-900 px-2.5 py-1.5 text-xs text-white"
                      >
                        {renderPlayerLine(playerName, lookup)}
                      </div>
                    ))
                  ) : (
                    <div className="rounded-md border border-dashed border-white/10 px-2.5 py-1.5 text-xs text-white/45">
                      None selected
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function OpponentTeamPage() {
  const router = useRouter();
  const coachConfigs = useMemo(() => normaliseCoachConfigs(), []);

  const [loginSession, setLoginSession] = useState<LoginSession | null>(null);
  const [selectedCoachId, setSelectedCoachId] = useState<number>(coachConfigs[0]?.id ?? 1);
  const [teamRowsByCoachId, setTeamRowsByCoachId] = useState<Record<number, SavedTeamRow>>({});
  const [fixtureRows, setFixtureRows] = useState<FixtureRow[]>([]);
  const [currentAflRound, setCurrentAflRound] = useState<number | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(true);
  const [isLoadingTeams, setIsLoadingTeams] = useState(true);
  const [isLoadingFixture, setIsLoadingFixture] = useState(true);
  const [message, setMessage] = useState("");

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

    return settings.current_afl_round;
  }, []);

  const refreshTeams = useCallback(async () => {
    setIsLoadingTeams(true);

    const { data, error } = await supabase
      .from("coach_team_selections")
      .select("coach_id, coach_name, team_data, is_submitted, submitted_at, updated_at, environment")
      .eq("environment", APP_ENV);

    if (error) {
      setMessage(`Team load failed: ${error.message}`);
      setIsLoadingTeams(false);
      return;
    }

    const nextMap: Record<number, SavedTeamRow> = {};

    for (const row of (data ?? []) as SavedTeamRow[]) {
      nextMap[row.coach_id] = row;
    }

    setTeamRowsByCoachId(nextMap);
    setIsLoadingTeams(false);
  }, []);

  const refreshFixture = useCallback(async () => {
    setIsLoadingFixture(true);

    const aflRound = await refreshCurrentRound();

    if (!aflRound || !Number.isFinite(aflRound)) {
      setFixtureRows([]);
      setIsLoadingFixture(false);
      return;
    }

    const { data, error } = await supabase
      .from("season_fixture")
      .select(
        "id, environment, competition_round, afl_round, matchup_index, coach_id, coach_name, opponent_coach_id, opponent_coach_name"
      )
      .eq("environment", APP_ENV)
      .eq("afl_round", aflRound);

    if (error) {
      setMessage(`Fixture load failed: ${error.message}`);
      setFixtureRows([]);
      setIsLoadingFixture(false);
      return;
    }

    setFixtureRows(sortFixtureRows((data ?? []) as FixtureRow[]));
    setIsLoadingFixture(false);
  }, [refreshCurrentRound]);

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

      if (nextSession.role === "coach" && nextSession.coachId) {
        setSelectedCoachId(nextSession.coachId);
      }

      setIsAuthenticating(false);
      await Promise.all([refreshTeams(), refreshFixture()]);
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

        if (nextSession.role === "coach" && nextSession.coachId) {
          setSelectedCoachId(nextSession.coachId);
        }

        setIsAuthenticating(false);
        await Promise.all([refreshTeams(), refreshFixture()]);
      })();
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfileForUser, refreshFixture, refreshTeams, router]);

  useEffect(() => {
    if (!loginSession) return;

    const teamChannel = supabase
      .channel(`opponent-team-selections-${APP_ENV}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "coach_team_selections",
          filter: `environment=eq.${APP_ENV}`,
        },
        () => {
          void refreshTeams();
        }
      )
      .subscribe();

    const fixtureChannel = supabase
      .channel(`opponent-fixture-${APP_ENV}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "season_fixture",
          filter: `environment=eq.${APP_ENV}`,
        },
        () => {
          void refreshFixture();
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
          void refreshFixture();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(teamChannel);
      void supabase.removeChannel(fixtureChannel);
    };
  }, [loginSession, refreshFixture, refreshTeams]);

  useEffect(() => {
    if (!loginSession) return;

    if (loginSession.role === "coach" && loginSession.coachId) {
      setSelectedCoachId(loginSession.coachId);
    }
  }, [loginSession]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const selectedCoach =
    coachConfigs.find((coach) => coach.id === selectedCoachId) ?? coachConfigs[0] ?? null;

  const canChangeCoach = loginSession?.role === "admin";

  const selectedCoachPool = useMemo(
    () => getCoachPool(selectedCoach ?? undefined),
    [selectedCoach]
  );

  const selectedCoachLookup = useMemo(
    () => buildPlayerLookup(selectedCoachPool),
    [selectedCoachPool]
  );

  const selectedCoachRow = selectedCoach ? teamRowsByCoachId[selectedCoach.id] ?? null : null;
  const selectedCoachTeam = useMemo(
    () => sanitiseTeamState(selectedCoachRow?.team_data),
    [selectedCoachRow]
  );

  const selectedCoachFixtureRows = useMemo(() => {
    if (!selectedCoach) return [];
    return sortFixtureRows(fixtureRows.filter((row) => row.coach_id === selectedCoach.id));
  }, [fixtureRows, selectedCoach]);

  const opponentPanels = useMemo(() => {
    return selectedCoachFixtureRows.map((fixtureRow) => {
      const opponentCoach = coachConfigs.find(
        (coach) => coach.id === fixtureRow.opponent_coach_id
      );
      const opponentCoachRow = teamRowsByCoachId[fixtureRow.opponent_coach_id] ?? null;
      const opponentCoachTeam = sanitiseTeamState(opponentCoachRow?.team_data);
      const opponentCoachPool = getCoachPool(opponentCoach);
      const opponentCoachLookup = buildPlayerLookup(opponentCoachPool);

      return {
        fixtureRow,
        opponentCoachRow,
        opponentCoachTeam,
        opponentCoachLookup,
      };
    });
  }, [coachConfigs, selectedCoachFixtureRows, teamRowsByCoachId]);

  const isLoadingPage = isLoadingTeams || isLoadingFixture;
  const comparisonGridClass =
    opponentPanels.length >= 2
      ? "grid gap-4 xl:grid-cols-3"
      : "grid gap-4 xl:grid-cols-2";

  if (isAuthenticating) {
    return (
      <main className="min-h-screen bg-neutral-950 px-4 py-8 text-white">
        <div className="mx-auto max-w-[1800px] rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-lg font-semibold">Checking session...</div>
        </div>
      </main>
    );
  }

  if (!loginSession) {
    return null;
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-6 text-white">
      <div className="mx-auto max-w-[1800px] space-y-5">
        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h1 className="text-3xl font-bold">Opponent Team</h1>
              <p className="mt-1 text-sm text-white/70">
                Compact side-by-side matchup view for the current AFL week.
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/60">
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                  Signed in as {loginSession.coachName}
                </span>
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                  Role: {loginSession.role}
                </span>
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                  Environment: {APP_ENV}
                </span>
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                  Current AFL Round: {currentAflRound ?? "Not set"}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => {
                  void Promise.all([refreshTeams(), refreshFixture()]);
                }}
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
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="grid gap-4 lg:grid-cols-3">
            <div>
              <div className="mb-2 text-sm font-medium text-white/80">Coach</div>
              {canChangeCoach ? (
                <select
                  value={selectedCoachId}
                  onChange={(e) => setSelectedCoachId(Number(e.target.value))}
                  className="w-full rounded-xl border border-white/10 bg-neutral-900 px-4 py-3 text-white outline-none"
                >
                  {coachConfigs.map((coach) => (
                    <option key={coach.id} value={coach.id}>
                      {coach.name}
                    </option>
                  ))}
                </select>
              ) : (
                <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-white">
                  {selectedCoach?.name ?? "—"}
                </div>
              )}
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-white/50">
                Selected Coach
              </div>
              <div className="mt-2 text-lg font-bold">{selectedCoach?.name ?? "—"}</div>
              <div className="mt-1 text-sm text-white/70">
                Players selected: {countSelectedPlayers(selectedCoachTeam)}
              </div>
              <div className="mt-1 text-sm text-white/70">
                Submitted: {selectedCoachRow?.is_submitted ? "Yes" : "No"}
              </div>
              <div className="mt-1 text-xs text-white/50">
                Last updated: {formatTimestamp(selectedCoachRow?.updated_at)}
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-white/50">
                Weekly Opponents
              </div>
              <div className="mt-2 text-lg font-bold">
                {selectedCoachFixtureRows.length > 0
                  ? `${selectedCoachFixtureRows.length} matchup${
                      selectedCoachFixtureRows.length === 1 ? "" : "s"
                    }`
                  : "No matchup found"}
              </div>
              <div className="mt-1 text-sm text-white/70">
                {selectedCoachFixtureRows.length > 0
                  ? selectedCoachFixtureRows
                      .map((row) => `R${row.competition_round} vs ${row.opponent_coach_name}`)
                      .join(" • ")
                  : "Check current_afl_round and season_fixture"}
              </div>
            </div>
          </div>
        </section>

        {selectedCoachFixtureRows.length === 0 && !isLoadingPage ? (
          <section className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-5 text-sm text-white/60">
            No opponent rows were found for this coach in AFL Round {currentAflRound ?? "—"}.
          </section>
        ) : null}

        <section className={comparisonGridClass}>
          <TeamPanel
            title={selectedCoach?.name ?? "Selected Coach"}
            subtitle="Your team for the current AFL week."
            team={selectedCoachTeam}
            lookup={selectedCoachLookup}
            submitted={Boolean(selectedCoachRow?.is_submitted)}
            updatedAt={selectedCoachRow?.updated_at}
            submittedAt={selectedCoachRow?.submitted_at}
            accentClass="border-violet-500/30"
          />

          {opponentPanels.map((panel) => (
            <TeamPanel
              key={panel.fixtureRow.id}
              title={panel.fixtureRow.opponent_coach_name}
              subtitle={`Competition Round ${panel.fixtureRow.competition_round} • AFL Round ${panel.fixtureRow.afl_round}`}
              team={panel.opponentCoachTeam}
              lookup={panel.opponentCoachLookup}
              submitted={Boolean(panel.opponentCoachRow?.is_submitted)}
              updatedAt={panel.opponentCoachRow?.updated_at}
              submittedAt={panel.opponentCoachRow?.submitted_at}
              accentClass="border-white/10"
            />
          ))}
        </section>

        <section className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-5 text-sm text-white/60">
          {isLoadingPage
            ? "Loading team selections and fixture..."
            : opponentPanels.length > 1
              ? "Double round detected automatically. Teams are shown side by side in a compact layout."
              : "Opponent team page is now using a compact side-by-side layout with on-ground and emergency players shown separately for each position."}
        </section>
      </div>
    </main>
  );
}