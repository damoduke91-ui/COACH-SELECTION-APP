"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import * as coachConfigModule from "../../lib/coachConfig";
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
};

type UserProfileRow = {
  id: string;
  role: "admin" | "coach";
  coach_id: number | null;
  coach_name: string | null;
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

function countSelectedPlayers(teamData: unknown): number {
  if (!teamData || typeof teamData !== "object") return 0;

  const obj = teamData as Record<string, unknown>;
  let total = 0;

  for (const position of POSITIONS) {
    const entry = obj[position];

    if (!entry || typeof entry !== "object") continue;

    const record = entry as Record<string, unknown>;
    const onField = Array.isArray(record.onField) ? record.onField.length : 0;
    const emergencies = Array.isArray(record.emergencies) ? record.emergencies.length : 0;

    total += onField + emergencies;
  }

  return total;
}

function getOpponentCoachId(coachId: number | null): number | null {
  if (!coachId) return null;

  const matchupMap: Record<number, number> = {
    1: 2,
    2: 1,
    3: 4,
    4: 3,
    5: 6,
    6: 5,
    7: 8,
    8: 7,
  };

  return matchupMap[coachId] ?? null;
}

function buildPlaceholderLadder(coaches: CoachConfigShape[]) {
  return coaches.map((coach, index) => ({
    position: index + 1,
    coachName: coach.name,
    wins: 0,
    losses: 0,
    draws: 0,
    pointsFor: 0,
    pointsAgainst: 0,
  }));
}

function buildCurrentWeekFixture(coaches: CoachConfigShape[]) {
  return [
    {
      matchLabel: "Match 1",
      home: coaches.find((coach) => coach.id === 1)?.name ?? "Coach 1",
      away: coaches.find((coach) => coach.id === 2)?.name ?? "Coach 2",
      score: "0.0 (0) vs 0.0 (0)",
      status: "Coming soon",
    },
    {
      matchLabel: "Match 2",
      home: coaches.find((coach) => coach.id === 3)?.name ?? "Coach 3",
      away: coaches.find((coach) => coach.id === 4)?.name ?? "Coach 4",
      score: "0.0 (0) vs 0.0 (0)",
      status: "Coming soon",
    },
    {
      matchLabel: "Match 3",
      home: coaches.find((coach) => coach.id === 5)?.name ?? "Coach 5",
      away: coaches.find((coach) => coach.id === 6)?.name ?? "Coach 6",
      score: "0.0 (0) vs 0.0 (0)",
      status: "Coming soon",
    },
    {
      matchLabel: "Match 4",
      home: coaches.find((coach) => coach.id === 7)?.name ?? "Coach 7",
      away: coaches.find((coach) => coach.id === 8)?.name ?? "Coach 8",
      score: "0.0 (0) vs 0.0 (0)",
      status: "Coming soon",
    },
  ];
}

function buildNextWeekFixture(coaches: CoachConfigShape[]) {
  return [
    {
      matchLabel: "Next Match 1",
      home: coaches.find((coach) => coach.id === 1)?.name ?? "Coach 1",
      away: coaches.find((coach) => coach.id === 3)?.name ?? "Coach 3",
    },
    {
      matchLabel: "Next Match 2",
      home: coaches.find((coach) => coach.id === 2)?.name ?? "Coach 4",
      away: coaches.find((coach) => coach.id === 4)?.name ?? "Coach 2",
    },
    {
      matchLabel: "Next Match 3",
      home: coaches.find((coach) => coach.id === 5)?.name ?? "Coach 5",
      away: coaches.find((coach) => coach.id === 7)?.name ?? "Coach 7",
    },
    {
      matchLabel: "Next Match 4",
      home: coaches.find((coach) => coach.id === 6)?.name ?? "Coach 6",
      away: coaches.find((coach) => coach.id === 8)?.name ?? "Coach 8",
    },
  ];
}

export default function DashboardPage() {
  const router = useRouter();
  const coachConfigs = useMemo(() => normaliseCoachConfigs(), []);

  const [loginSession, setLoginSession] = useState<LoginSession | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(true);
  const [message, setMessage] = useState("");
  const [teamRowsByCoachId, setTeamRowsByCoachId] = useState<Record<number, SavedTeamRow>>({});
  const [isLoadingDashboard, setIsLoadingDashboard] = useState(true);

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
        (profile.role === "admin"
          ? "Admin"
          : `Coach ${profile.coach_id ?? ""}`.trim()),
    } satisfies LoginSession;
  }, []);

  const refreshDashboardData = useCallback(async () => {
    setIsLoadingDashboard(true);

    const { data, error } = await supabase
      .from("coach_team_selections")
      .select("coach_id, coach_name, team_data, is_submitted, submitted_at, updated_at, environment")
      .eq("environment", APP_ENV);

    if (error) {
      setMessage(`Dashboard load failed: ${error.message}`);
      setIsLoadingDashboard(false);
      return;
    }

    const nextMap: Record<number, SavedTeamRow> = {};

    for (const row of (data ?? []) as SavedTeamRow[]) {
      nextMap[row.coach_id] = row;
    }

    setTeamRowsByCoachId(nextMap);
    setIsLoadingDashboard(false);
  }, []);

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
      await refreshDashboardData();
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
        await refreshDashboardData();
      })();
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfileForUser, refreshDashboardData, router]);

  useEffect(() => {
    if (!loginSession) return;

    const channel = supabase
      .channel(`dashboard-team-selections-${APP_ENV}`)
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
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loginSession, refreshDashboardData]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const currentCoach = useMemo(() => {
    if (!loginSession) return null;

    if (loginSession.role === "coach" && loginSession.coachId) {
      return coachConfigs.find((coach) => coach.id === loginSession.coachId) ?? null;
    }

    return null;
  }, [coachConfigs, loginSession]);

  const opponentCoach = useMemo(() => {
    if (!currentCoach) return null;

    const opponentCoachId = getOpponentCoachId(currentCoach.id);
    if (!opponentCoachId) return null;

    return coachConfigs.find((coach) => coach.id === opponentCoachId) ?? null;
  }, [coachConfigs, currentCoach]);

  const currentCoachTeamRow = currentCoach ? teamRowsByCoachId[currentCoach.id] ?? null : null;
  const opponentCoachTeamRow = opponentCoach ? teamRowsByCoachId[opponentCoach.id] ?? null : null;

  const ladderRows = useMemo(() => buildPlaceholderLadder(coachConfigs), [coachConfigs]);
  const currentWeekFixture = useMemo(() => buildCurrentWeekFixture(coachConfigs), [coachConfigs]);
  const nextWeekFixture = useMemo(() => buildNextWeekFixture(coachConfigs), [coachConfigs]);

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
              <h1 className="text-3xl font-bold">Coach Dashboard</h1>
              <p className="mt-2 text-sm text-white/70">
                Welcome {loginSession.coachName}. This is your landing page for team selection,
                fixtures, results, and records.
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-white/60">
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                  Role: {loginSession.role}
                </span>
                <span className="rounded-full border border-white/10 bg-black/20 px-3 py-1">
                  Environment: {APP_ENV}
                </span>
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void refreshDashboardData()}
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

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
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
            <div className="text-lg font-bold">See Opponent&apos;s Team</div>
            <div className="mt-2 text-sm text-white/75">
              Placeholder page for opposition team viewing.
            </div>
          </Link>

          <Link
            href="/fixture"
            className="rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:bg-white/10"
          >
            <div className="text-lg font-bold">Full Season Fixture</div>
            <div className="mt-2 text-sm text-white/75">
              Placeholder page for full season fixtures.
            </div>
          </Link>

          <Link
            href="/results"
            className="rounded-2xl border border-white/10 bg-white/5 p-5 transition hover:bg-white/10"
          >
            <div className="text-lg font-bold">Full Season Results</div>
            <div className="mt-2 text-sm text-white/75">
              Placeholder page for full season results.
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

        <section className="grid gap-6 xl:grid-cols-3">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 xl:col-span-1">
            <h2 className="text-2xl font-bold">This Week Matchup</h2>
            <p className="mt-1 text-sm text-white/70">
              Coach team versus opposition team summary.
            </p>

            <div className="mt-4 space-y-4">
              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-white/50">
                  Your Team
                </div>
                <div className="mt-2 text-lg font-bold">
                  {currentCoach?.name ?? "Admin view"}
                </div>
                <div className="mt-2 text-sm text-white/70">
                  Players selected: {countSelectedPlayers(currentCoachTeamRow?.team_data ?? null)}
                </div>
                <div className="mt-1 text-sm text-white/70">
                  Submitted: {currentCoachTeamRow?.is_submitted ? "Yes" : "No"}
                </div>
                <div className="mt-1 text-xs text-white/50">
                  Last updated: {formatTimestamp(currentCoachTeamRow?.updated_at)}
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="text-xs font-semibold uppercase tracking-wide text-white/50">
                  Opponent
                </div>
                <div className="mt-2 text-lg font-bold">
                  {opponentCoach?.name ?? "Not assigned yet"}
                </div>
                <div className="mt-2 text-sm text-white/70">
                  Players selected: {countSelectedPlayers(opponentCoachTeamRow?.team_data ?? null)}
                </div>
                <div className="mt-1 text-sm text-white/70">
                  Submitted: {opponentCoachTeamRow?.is_submitted ? "Yes" : "No"}
                </div>
                <div className="mt-1 text-xs text-white/50">
                  Last updated: {formatTimestamp(opponentCoachTeamRow?.updated_at)}
                </div>
              </div>

              <div className="rounded-xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/60">
                Later this section can become a proper player-by-player matchup card.
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 xl:col-span-2">
            <h2 className="text-2xl font-bold">Ladder</h2>
            <p className="mt-1 text-sm text-white/70">
              Placeholder ladder for now. This can be wired to real standings later.
            </p>

            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="text-white/50">
                  <tr className="border-b border-white/10">
                    <th className="px-3 py-2">Pos</th>
                    <th className="px-3 py-2">Coach</th>
                    <th className="px-3 py-2">W</th>
                    <th className="px-3 py-2">L</th>
                    <th className="px-3 py-2">D</th>
                    <th className="px-3 py-2">PF</th>
                    <th className="px-3 py-2">PA</th>
                  </tr>
                </thead>
                <tbody>
                  {ladderRows.map((row) => (
                    <tr key={row.coachName} className="border-b border-white/5">
                      <td className="px-3 py-2">{row.position}</td>
                      <td className="px-3 py-2">{row.coachName}</td>
                      <td className="px-3 py-2">{row.wins}</td>
                      <td className="px-3 py-2">{row.losses}</td>
                      <td className="px-3 py-2">{row.draws}</td>
                      <td className="px-3 py-2">{row.pointsFor}</td>
                      <td className="px-3 py-2">{row.pointsAgainst}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-2xl font-bold">Current Week Fixture</h2>
            <p className="mt-1 text-sm text-white/70">
              Progressive scores can be added here later.
            </p>

            <div className="mt-4 space-y-3">
              {currentWeekFixture.map((match) => (
                <div
                  key={match.matchLabel}
                  className="rounded-xl border border-white/10 bg-black/20 p-4"
                >
                  <div className="text-xs font-semibold uppercase tracking-wide text-white/50">
                    {match.matchLabel}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-white">
                    {match.home} vs {match.away}
                  </div>
                  <div className="mt-1 text-sm text-white/70">{match.score}</div>
                  <div className="mt-1 text-xs text-white/50">{match.status}</div>
                </div>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
            <h2 className="text-2xl font-bold">Next Week Fixture</h2>
            <p className="mt-1 text-sm text-white/70">
              Placeholder for next week&apos;s matchups.
            </p>

            <div className="mt-4 space-y-3">
              {nextWeekFixture.map((match) => (
                <div
                  key={match.matchLabel}
                  className="rounded-xl border border-white/10 bg-black/20 p-4"
                >
                  <div className="text-xs font-semibold uppercase tracking-wide text-white/50">
                    {match.matchLabel}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-white">
                    {match.home} vs {match.away}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-dashed border-white/10 bg-white/5 p-6 text-sm text-white/60">
          {isLoadingDashboard
            ? "Loading dashboard data..."
            : "Dashboard is live. The navigation is in place, Coach Selection is usable, and the other pages are ready to be built next."}
        </section>
      </div>
    </main>
  );
}