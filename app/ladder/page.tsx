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
};

type UserProfileRow = {
  id: string;
  role: "admin" | "coach";
  coach_id: number | null;
  coach_name: string | null;
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

function toNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export default function LadderPage() {
  const router = useRouter();

  const [loginSession, setLoginSession] = useState<LoginSession | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(true);
  const [message, setMessage] = useState("");
  const [results, setResults] = useState<MatchResultRow[]>([]);
  const [isLoadingLadder, setIsLoadingLadder] = useState(false);

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

    let isMounted = true;

    async function loadLadderResults() {
      setIsLoadingLadder(true);

      const { data, error } = await supabase
        .from("super8_match_results")
        .select(
          "round_number, afl_round, matchup_index, coach_1_name, coach_1_score, coach_2_name, coach_2_score"
        )
        .order("round_number", { ascending: true })
        .order("matchup_index", { ascending: true });

      if (!isMounted) return;

      if (error) {
        setMessage(`Ladder load failed: ${error.message}`);
        setResults([]);
        setIsLoadingLadder(false);
        return;
      }

      const rows: MatchResultRow[] = Array.isArray(data)
        ? data.map((row) => ({
            round_number: toNumber(row.round_number),
            afl_round: toNumber(row.afl_round),
            matchup_index: toNumber(row.matchup_index),
            coach_1_name:
              typeof row.coach_1_name === "string" ? row.coach_1_name : "Unknown Team",
            coach_1_score: toNumber(row.coach_1_score),
            coach_2_name:
              typeof row.coach_2_name === "string" ? row.coach_2_name : "Unknown Team",
            coach_2_score: toNumber(row.coach_2_score),
          }))
        : [];

      setResults(rows);
      setIsLoadingLadder(false);
    }

    void loadLadderResults();

    return () => {
      isMounted = false;
    };
  }, [loginSession]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  const ladder = useMemo(() => {
    const ladderMap = new Map<string, LadderRow>();

    function getOrCreateTeam(teamName: string): LadderRow {
      const existing = ladderMap.get(teamName);

      if (existing) {
        return existing;
      }

      const created: LadderRow = {
        team: teamName,
        played: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        pointsFor: 0,
        pointsAgainst: 0,
        percentage: 0,
        ladderPoints: 0,
      };

      ladderMap.set(teamName, created);
      return created;
    }

    for (const match of results) {
      const coach1Name = match.coach_1_name?.trim() || "Unknown Team";
      const coach2Name = match.coach_2_name?.trim() || "Unknown Team";
      const coach1Score = match.coach_1_score;
      const coach2Score = match.coach_2_score;

      if (
        coach1Name === "Unknown Team" ||
        coach2Name === "Unknown Team" ||
        coach1Score === null ||
        coach2Score === null
      ) {
        continue;
      }

      const team1 = getOrCreateTeam(coach1Name);
      const team2 = getOrCreateTeam(coach2Name);

      team1.played += 1;
      team2.played += 1;

      team1.pointsFor += coach1Score;
      team1.pointsAgainst += coach2Score;

      team2.pointsFor += coach2Score;
      team2.pointsAgainst += coach1Score;

      if (coach1Score > coach2Score) {
        team1.wins += 1;
        team1.ladderPoints += 4;
        team2.losses += 1;
      } else if (coach2Score > coach1Score) {
        team2.wins += 1;
        team2.ladderPoints += 4;
        team1.losses += 1;
      } else {
        team1.draws += 1;
        team2.draws += 1;
        team1.ladderPoints += 2;
        team2.ladderPoints += 2;
      }
    }

    const rows = Array.from(ladderMap.values()).map((team) => ({
      ...team,
      percentage:
        team.pointsAgainst > 0 ? (team.pointsFor / team.pointsAgainst) * 100 : 0,
    }));

    rows.sort((a, b) => {
      if (b.ladderPoints !== a.ladderPoints) {
        return b.ladderPoints - a.ladderPoints;
      }

      if (b.pointsFor !== a.pointsFor) {
        return b.pointsFor - a.pointsFor;
      }

      return a.team.localeCompare(b.team);
    });

    return rows;
  }, [results]);

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
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-bold">2026 Ladder</h1>
              <p className="mt-2 text-sm text-white/70">
                Signed in as {loginSession.coachName} • {loginSession.role}
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
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

        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <h2 className="mb-4 text-2xl font-bold">Season Ladder</h2>

          {isLoadingLadder ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
              Loading ladder...
            </div>
          ) : ladder.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/70">
              No completed match results found yet. The ladder will populate after completed results are saved from the Results page.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-0 text-sm">
                <thead>
                  <tr>
                    <th className="border-b border-white/10 px-4 py-3 text-left font-semibold text-white/70">
                      Team
                    </th>
                    <th className="border-b border-white/10 px-4 py-3 text-center font-semibold text-white/70">
                      P
                    </th>
                    <th className="border-b border-white/10 px-4 py-3 text-center font-semibold text-white/70">
                      W
                    </th>
                    <th className="border-b border-white/10 px-4 py-3 text-center font-semibold text-white/70">
                      L
                    </th>
                    <th className="border-b border-white/10 px-4 py-3 text-center font-semibold text-white/70">
                      D
                    </th>
                    <th className="border-b border-white/10 px-4 py-3 text-center font-semibold text-white/70">
                      For
                    </th>
                    <th className="border-b border-white/10 px-4 py-3 text-center font-semibold text-white/70">
                      Agst
                    </th>
                    <th className="border-b border-white/10 px-4 py-3 text-center font-semibold text-white/70">
                      %
                    </th>
                    <th className="border-b border-white/10 px-4 py-3 text-center font-semibold text-white/70">
                      Pts
                    </th>
                  </tr>
                </thead>

                <tbody>
                  {ladder.map((team, index) => {
                    const isTopFiveDivider = index === 5;

                    return (
                      <tr
                        key={team.team}
                        className={isTopFiveDivider ? "border-t-4 border-white/50" : ""}
                      >
                        <td
                          className={`px-4 py-3 font-semibold text-white ${
                            isTopFiveDivider ? "border-t-2 border-dashed border-white/40" : "border-t border-white/10"
                          }`}
                        >
                          {team.team}
                        </td>
                        <td
                          className={`px-4 py-3 text-center ${
                            isTopFiveDivider ? "border-t-2 border-dashed border-white/40" : "border-t border-white/10"
                          }`}
                        >
                          {team.played}
                        </td>
                        <td
                          className={`px-4 py-3 text-center ${
                            isTopFiveDivider ? "border-t-2 border-dashed border-white/40" : "border-t border-white/10"
                          }`}
                        >
                          {team.wins}
                        </td>
                        <td
                          className={`px-4 py-3 text-center ${
                            isTopFiveDivider ? "border-t-2 border-dashed border-white/40" : "border-t border-white/10"
                          }`}
                        >
                          {team.losses}
                        </td>
                        <td
                          className={`px-4 py-3 text-center ${
                            isTopFiveDivider ? "border-t-2 border-dashed border-white/40" : "border-t border-white/10"
                          }`}
                        >
                          {team.draws}
                        </td>
                        <td
                          className={`px-4 py-3 text-center ${
                            isTopFiveDivider ? "border-t-2 border-dashed border-white/40" : "border-t border-white/10"
                          }`}
                        >
                          {team.pointsFor}
                        </td>
                        <td
                          className={`px-4 py-3 text-center ${
                            isTopFiveDivider ? "border-t-2 border-dashed border-white/40" : "border-t border-white/10"
                          }`}
                        >
                          {team.pointsAgainst}
                        </td>
                        <td
                          className={`px-4 py-3 text-center font-semibold ${
                            isTopFiveDivider ? "border-t-2 border-dashed border-white/40" : "border-t border-white/10"
                          }`}
                        >
                          {team.percentage.toFixed(2)}%
                        </td>
                        <td
                          className={`px-4 py-3 text-center font-semibold ${
                            isTopFiveDivider ? "border-t-2 border-dashed border-white/40" : "border-t border-white/10"
                          }`}
                        >
                          {team.ladderPoints}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}