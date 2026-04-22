"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
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

function toNumber(value: unknown): number | null {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
}

export default function ResultsPage() {
  const router = useRouter();

  const [loginSession, setLoginSession] = useState<LoginSession | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(true);
  const [message, setMessage] = useState("");
  const [results, setResults] = useState<MatchResultRow[]>([]);
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [isLoadingResults, setIsLoadingResults] = useState(false);

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

    async function loadResults() {
      setIsLoadingResults(true);

      const { data, error } = await supabase
        .from("super8_match_results")
        .select(
          "round_number, afl_round, matchup_index, coach_1_name, coach_1_score, coach_2_name, coach_2_score"
        )
        .order("round_number", { ascending: false })
        .order("matchup_index", { ascending: true });

      if (!isMounted) return;

      if (error) {
        setMessage(`Results load failed: ${error.message}`);
        setResults([]);
        setSelectedRound(null);
        setIsLoadingResults(false);
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

      const availableRounds = rows
        .map((row) => row.round_number)
        .filter((round): round is number => typeof round === "number");

      setSelectedRound(availableRounds.length > 0 ? Math.max(...availableRounds) : null);
      setIsLoadingResults(false);
    }

    void loadResults();

    return () => {
      isMounted = false;
    };
  }, [loginSession]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  if (isAuthenticating) {
    return (
      <main className="min-h-screen bg-neutral-950 px-4 py-8 text-white">
        <div className="mx-auto max-w-4xl rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="text-lg font-semibold">Checking session...</div>
        </div>
      </main>
    );
  }

  if (!loginSession) {
    return null;
  }

  const roundButtons = Array.from(
    new Set(
      results
        .map((row) => row.round_number)
        .filter((round): round is number => typeof round === "number")
    )
  ).sort((a, b) => b - a);

  const filteredResults = results.filter((row) => row.round_number === selectedRound);

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-4xl space-y-6">
        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-bold">Full Season Results</h1>
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
          <h2 className="mb-3 text-2xl font-bold">Results</h2>

          {isLoadingResults ? (
            <div className="text-sm text-white/70">Loading results...</div>
          ) : (
            <>
              <div className="mb-4 flex flex-wrap gap-2">
                {roundButtons.map((round) => (
                  <button
                    key={round}
                    type="button"
                    onClick={() => setSelectedRound(round)}
                    className={`rounded-lg border px-3 py-1 text-sm font-semibold ${
                      selectedRound === round
                        ? "border-violet-400 bg-violet-500 text-white"
                        : "border-white/10 bg-white/5 text-white/70 hover:bg-white/10"
                    }`}
                  >
                    Round {round}
                  </button>
                ))}
              </div>

              {selectedRound === null ? (
                <div className="text-sm text-white/70">No results found yet.</div>
              ) : (
                <div className="space-y-3">
                                    {filteredResults.map((match, index) => {
                    const coach1Score = match.coach_1_score ?? 0;
                    const coach2Score = match.coach_2_score ?? 0;
                    const coach1Name = match.coach_1_name ?? "Unknown Team";
                    const coach2Name = match.coach_2_name ?? "Unknown Team";
                    const isDraw = coach1Score === coach2Score;
                    const coach1Won = coach1Score > coach2Score;
                    const winnerName = coach1Won ? coach1Name : coach2Name;
                    const winnerScore = coach1Won ? coach1Score : coach2Score;
                    const loserName = coach1Won ? coach2Name : coach1Name;
                    const loserScore = coach1Won ? coach2Score : coach1Score;
                    const margin = Math.abs(coach1Score - coach2Score);

                    return (
                      <div
                        key={`${match.round_number ?? "x"}-${match.matchup_index ?? index}-${index}`}
                        className="rounded-xl border border-white/10 bg-black/20 p-4"
                      >
                        <div className="text-sm text-white/60">
                          Match {match.matchup_index ?? index + 1}
                        </div>

                        {isDraw ? (
                          <div className="mt-2 text-base font-semibold text-white">
                            {coach1Name} {coach1Score} drew with {coach2Name} {coach2Score}
                          </div>
                        ) : (
                          <>
                            <div className="mt-2 text-base font-semibold text-white">
                              <span className="text-green-400">{winnerName} {winnerScore}</span>{" "}
                              def. {loserName} {loserScore}
                            </div>
                            <div className="mt-1 text-sm text-white/60">
                              by {margin}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </section>
      </div>
    </main>
  );
}