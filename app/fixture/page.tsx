"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { APP_ENV, supabase } from "../../lib/supabase";

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

type FixtureMatch = {
  key: string;
  matchLabel: string;
  home: string;
  away: string;
  homeCoachId: number;
  awayCoachId: number;
  competitionRound: number;
  aflRound: number;
  matchupIndex: number;
};

type FixtureRoundGroup = {
  key: string;
  competitionRound: number;
  aflRound: number;
  matches: FixtureMatch[];
};

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
    const key = `${row.competition_round}-${row.afl_round}-${row.matchup_index}`;

    if (!matchMap.has(key)) {
      matchMap.set(key, {
        key,
        matchLabel: `Match ${row.matchup_index}`,
        home: row.coach_name,
        away: row.opponent_coach_name,
        homeCoachId: row.coach_id,
        awayCoachId: row.opponent_coach_id,
        competitionRound: row.competition_round,
        aflRound: row.afl_round,
        matchupIndex: row.matchup_index,
      });
    }
  }

  return Array.from(matchMap.values()).sort((a, b) => {
    if (a.competitionRound !== b.competitionRound) {
      return a.competitionRound - b.competitionRound;
    }

    if (a.aflRound !== b.aflRound) {
      return a.aflRound - b.aflRound;
    }

    return a.matchupIndex - b.matchupIndex;
  });
}

function buildFixtureRoundGroups(rows: FixtureRow[]): FixtureRoundGroup[] {
  const matches = buildFixtureMatches(rows);
  const groupMap = new Map<string, FixtureRoundGroup>();

  for (const match of matches) {
    const key = `${match.competitionRound}-${match.aflRound}`;

    if (!groupMap.has(key)) {
      groupMap.set(key, {
        key,
        competitionRound: match.competitionRound,
        aflRound: match.aflRound,
        matches: [],
      });
    }

    groupMap.get(key)!.matches.push(match);
  }

  return Array.from(groupMap.values()).sort((a, b) => {
    if (a.competitionRound !== b.competitionRound) {
      return a.competitionRound - b.competitionRound;
    }

    return a.aflRound - b.aflRound;
  });
}

function isUsersMatch(match: FixtureMatch, coachId: number | null | undefined): boolean {
  if (!coachId) return false;

  return match.homeCoachId === coachId || match.awayCoachId === coachId;
}

export default function FixturePage() {
  const router = useRouter();

  const [loginSession, setLoginSession] = useState<LoginSession | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(true);
  const [isLoadingFixture, setIsLoadingFixture] = useState(true);
  const [message, setMessage] = useState("");
  const [currentAflRound, setCurrentAflRound] = useState<number | null>(null);
  const [fixtureRows, setFixtureRows] = useState<FixtureRow[]>([]);

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
        (profile.role === "admin" ? "Admin" : `Coach ${profile.coach_id ?? ""}`.trim()),
      teamName: profile.team_name?.trim() || "",
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

  const refreshFixture = useCallback(async () => {
    setIsLoadingFixture(true);

    await refreshCurrentRound();

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
      setIsAuthenticating(false);
      await refreshFixture();
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
        await refreshFixture();
      })();
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfileForUser, refreshFixture, router]);

  useEffect(() => {
    if (!loginSession) return;

    const channel = supabase
      .channel(`fixture-page-live-${APP_ENV}`)
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
          void refreshCurrentRound();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [loginSession, refreshCurrentRound, refreshFixture]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const fixtureGroups = useMemo(() => buildFixtureRoundGroups(fixtureRows), [fixtureRows]);

  const currentFixtureGroup = useMemo(() => {
    if (!currentAflRound) return null;
    return fixtureGroups.find((group) => group.aflRound === currentAflRound) ?? null;
  }, [currentAflRound, fixtureGroups]);

  const nextFixtureGroup = useMemo(() => {
    if (!currentAflRound) return null;
    return fixtureGroups.find((group) => group.aflRound === currentAflRound + 1) ?? null;
  }, [currentAflRound, fixtureGroups]);

  const usersCurrentMatches = useMemo(() => {
    if (!loginSession?.coachId || !currentFixtureGroup) return [];

    return currentFixtureGroup.matches.filter((match) =>
      isUsersMatch(match, loginSession.coachId)
    );
  }, [currentFixtureGroup, loginSession?.coachId]);

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
              <h1 className="text-3xl font-bold">Full Season Fixture</h1>
              <p className="mt-2 text-sm text-white/70">
                Full Super 8 fixture using the live season fixture table.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void refreshFixture()}
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

        <section className="grid gap-4 md:grid-cols-3">
          <div className="rounded-2xl border border-violet-500/20 bg-violet-500/10 p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-violet-200/70">
              Current Setting
            </div>
            <div className="mt-2 text-2xl font-bold">
              AFL Round {currentAflRound ?? "—"}
            </div>
            <div className="mt-1 text-sm text-white/70">
              Controlled from the admin dashboard round control.
            </div>
          </div>

          <div className="rounded-2xl border border-green-500/20 bg-green-500/10 p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-green-200/70">
              Current Super 8 Round
            </div>
            <div className="mt-2 text-2xl font-bold">
              {currentFixtureGroup ? `Round ${currentFixtureGroup.competitionRound}` : "—"}
            </div>
            <div className="mt-1 text-sm text-white/70">
              {currentFixtureGroup
                ? `${currentFixtureGroup.matches.length} matchup${
                    currentFixtureGroup.matches.length === 1 ? "" : "s"
                  } this round.`
                : "No fixture rows found for the current AFL round."}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="text-xs font-semibold uppercase tracking-wide text-white/50">
              Your Current Match
            </div>
            <div className="mt-2 text-lg font-bold">
              {usersCurrentMatches.length > 0
                ? usersCurrentMatches
                    .map((match) => `${match.home} vs ${match.away}`)
                    .join(" • ")
                : loginSession.role === "admin"
                  ? "Admin view"
                  : "No match found"}
            </div>
            <div className="mt-2">
              <Link
                href="/opponent-team"
                className="inline-flex rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
              >
                View Opponent Team
              </Link>
            </div>
          </div>
        </section>

        {currentFixtureGroup ? (
          <section className="rounded-2xl border border-green-500/20 bg-green-500/10 p-5">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-2xl font-bold">Current Round</h2>
                <p className="mt-1 text-sm text-white/70">
                  Super 8 Round {currentFixtureGroup.competitionRound} / AFL Round {currentFixtureGroup.aflRound}
                </p>
              </div>

              <div className="text-sm text-white/60">
                {currentFixtureGroup.matches.length} matchup{currentFixtureGroup.matches.length === 1 ? "" : "s"}
              </div>
            </div>

            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {currentFixtureGroup.matches.map((match) => {
                const isUserMatch = isUsersMatch(match, loginSession.coachId);

                return (
                  <Link key={match.key} href="/opponent-team">
                    <div
                      className={`rounded-xl border p-4 transition ${
                        isUserMatch
                          ? "border-green-300/50 bg-green-500/15 hover:bg-green-500/25"
                          : "border-white/10 bg-black/20 hover:bg-white/10"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="text-xs font-semibold uppercase tracking-wide text-white/45">
                          {match.matchLabel}
                        </div>

                        {isUserMatch ? (
                          <div className="shrink-0 text-[10px] font-bold text-green-300">
                            🔥 Your Match
                          </div>
                        ) : null}
                      </div>

                      <div className="mt-2 text-sm font-semibold text-white">
                        {match.home} vs {match.away}
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        ) : null}

        {nextFixtureGroup ? (
          <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
              <div>
                <h2 className="text-xl font-bold">Next Round Preview</h2>
                <p className="mt-1 text-sm text-white/70">
                  Super 8 Round {nextFixtureGroup.competitionRound} / AFL Round {nextFixtureGroup.aflRound}
                </p>
              </div>

              <div className="text-sm text-white/60">
                {nextFixtureGroup.matches.length} matchup{nextFixtureGroup.matches.length === 1 ? "" : "s"}
              </div>
            </div>

            <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
              {nextFixtureGroup.matches.map((match) => (
                <div
                  key={match.key}
                  className="rounded-lg border border-white/10 bg-black/20 p-3"
                >
                  <div className="text-[11px] font-semibold uppercase tracking-wide text-white/40">
                    {match.matchLabel}
                  </div>
                  <div className="mt-1 text-xs font-semibold leading-snug text-white">
                    {match.home} vs {match.away}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-2xl font-bold">All Fixture Rounds</h2>
              <p className="mt-1 text-sm text-white/70">
                Round-by-round fixture from season_fixture.
              </p>
            </div>

            <div className="text-sm text-white/60">
              {fixtureGroups.length} round group{fixtureGroups.length === 1 ? "" : "s"}
            </div>
          </div>

          <div className="mt-5 space-y-4">
            {isLoadingFixture ? (
              <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/60">
                Loading fixture...
              </div>
            ) : fixtureGroups.length > 0 ? (
              fixtureGroups.map((group) => {
                const isCurrentRound = currentAflRound === group.aflRound;

                return (
                  <div
                    key={group.key}
                    className={`rounded-xl border p-4 ${
                      isCurrentRound
                        ? "border-green-400/35 bg-green-500/10"
                        : "border-white/10 bg-black/20"
                    }`}
                  >
                    <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <h3 className="text-lg font-bold">
                          Super 8 Round {group.competitionRound} / AFL Round {group.aflRound}
                        </h3>
                        <p className="mt-1 text-xs text-white/55">
                          {group.matches.length} matchup{group.matches.length === 1 ? "" : "s"}
                        </p>
                      </div>

                      {isCurrentRound ? (
                        <div className="rounded-full border border-green-400/30 bg-green-500/15 px-3 py-1 text-xs font-bold text-green-200">
                          Current Round
                        </div>
                      ) : null}
                    </div>

                    <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
                      {group.matches.map((match) => {
                        const isUserMatch = isUsersMatch(match, loginSession.coachId);

                        return (
                          <div
                            key={match.key}
                            className={`rounded-lg border p-3 ${
                              isUserMatch
                                ? "border-green-300/40 bg-green-500/15"
                                : "border-white/10 bg-neutral-950/50"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-2">
                              <div className="text-[11px] font-semibold uppercase tracking-wide text-white/40">
                                {match.matchLabel}
                              </div>

                              {isUserMatch ? (
                                <div className="shrink-0 text-[10px] font-bold text-green-300">
                                  Your Match
                                </div>
                              ) : null}
                            </div>

                            <div className="mt-1 text-sm font-semibold leading-snug text-white">
                              {match.home} vs {match.away}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="rounded-xl border border-dashed border-white/10 bg-black/20 p-4 text-sm text-white/60">
                No fixture rows found. Check the season_fixture table for {APP_ENV} rows.
              </div>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
