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
  round_number: number;
  afl_round: number | null;
  matchup_index: number;
  coach_1_name: string;
  coach_1_score: number;
  coach_2_name: string;
  coach_2_score: number;
};

export default function ResultsPage() {
  const router = useRouter();

  const [loginSession, setLoginSession] = useState<LoginSession | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(true);
  const [message, setMessage] = useState("");

const [results, setResults] = useState<MatchResultRow[]>([]);
const [selectedRound, setSelectedRound] = useState<number | null>(null);

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

    useEffect(() => {
  if (!loginSession) return;

  async function loadResults() {
    const { data, error } = await supabase
      .from("super8_match_results")
      .select("*")
      .order("round_number", { ascending: false })
      .order("matchup_index", { ascending: true });

    if (error) {
      setMessage(`Results load failed: ${error.message}`);
      return;
    }

    const rows = (data ?? []) as MatchResultRow[];

    setResults(rows);

    if (rows.length > 0) {
      const latestRound = Math.max(...rows.map((r) => r.round_number));
      setSelectedRound(latestRound);
    }
  }

  void loadResults();
}, [loginSession]);

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

<section className="space-y-6">

  {/* Round Selector */}
  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
    <h2 className="text-xl font-bold mb-3">Select Round</h2>

    <div className="flex flex-wrap gap-2">
      {[...new Set(results.map(r => r.round_number))]
        .sort((a, b) => b - a)
        .map(round => (
          <button
            key={round}
            onClick={() => setSelectedRound(round)}
            className={`px-3 py-1 rounded-lg text-sm font-semibold border ${
              selectedRound === round
                ? "bg-violet-500 border-violet-400 text-white"
                : "bg-white/5 border-white/10 text-white/70 hover:bg-white/10"
            }`}
          >
            Round {round}
          </button>
        ))}
    </div>
  </div>

  {/* Results */}
  <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
    <h2 className="text-2xl font-bold mb-4">
      Round {selectedRound} Results
    </h2>

    <div className="space-y-4">
      {results
        .filter(r => r.round_number === selectedRound)
        .map(match => {
          const isDraw = match.coach_1_score === match.coach_2_score;
          const coach1Won = match.coach_1_score > match.coach_2_score;

          return (
            <div
              key={match.matchup_index}
              className="rounded-xl border border-white/10 bg-black/30 p-4 flex justify-between items-center"
            >
              <div className="flex flex-col">
                <span className={`font-semibold ${
                  coach1Won ? "text-green-400" : "text-white"
                }`}>
                  {match.coach_1_name} ({match.coach_1_score})
                </span>

                <span className="text-sm text-white/60">
                  {isDraw
                    ? "Draw"
                    : coach1Won
                    ? "Defeated"
                    : "Lost to"}
                </span>

                <span className={`font-semibold ${
                  !coach1Won && !isDraw ? "text-green-400" : "text-white"
                }`}>
                  {match.coach_2_name} ({match.coach_2_score})
                </span>
              </div>

              <div className="text-sm text-white/60">
                Match {match.matchup_index}
              </div>
            </div>
          );
        })}
    </div>
  </div>

</section>
      </div>
    </main>
  );
}