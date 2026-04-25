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

type ResultFormState = {
  coach1Score: string;
  coach2Score: string;
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

export default function ResultsPage() {
  const router = useRouter();

  const [loginSession, setLoginSession] = useState<LoginSession | null>(null);
  const [isAuthenticating, setIsAuthenticating] = useState(true);
  const [message, setMessage] = useState("");
  const [currentAflRound, setCurrentAflRound] = useState<number | null>(null);
  const [fixtureRows, setFixtureRows] = useState<FixtureRow[]>([]);
  const [results, setResults] = useState<MatchResultRow[]>([]);
  const [selectedRound, setSelectedRound] = useState<number | null>(null);
  const [scoreForms, setScoreForms] = useState<Record<string, ResultFormState>>({});
  const [isLoadingPageData, setIsLoadingPageData] = useState(false);
  const [savingKey, setSavingKey] = useState<string | null>(null);

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

  const refreshPageData = useCallback(async () => {
    setIsLoadingPageData(true);
    setMessage("");

    const [aflRound, fixtureData, resultData] = await Promise.all([
      refreshCurrentRound(),
      refreshFixtureRows(),
      refreshResults(),
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
  }, [refreshCurrentRound, refreshFixtureRows, refreshResults]);

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

  const selectedRoundCompletedCount = selectedRoundMatches.filter((match) =>
    resultByRoundAndMatch.has(buildResultKey(match.roundNumber, match.matchupIndex))
  ).length;

  function getScoreForm(match: FixtureMatch, result: MatchResultRow | null): ResultFormState {
    const key = buildResultKey(match.roundNumber, match.matchupIndex);
    const existingForm = scoreForms[key];

    if (existingForm) {
      return existingForm;
    }

    return {
      coach1Score: result ? String(result.coach_1_score) : "",
      coach2Score: result ? String(result.coach_2_score) : "",
    };
  }

  function updateScoreForm(match: FixtureMatch, field: keyof ResultFormState, value: string) {
    const key = buildResultKey(match.roundNumber, match.matchupIndex);

    setScoreForms((previous) => ({
      ...previous,
      [key]: {
        coach1Score: previous[key]?.coach1Score ?? "",
        coach2Score: previous[key]?.coach2Score ?? "",
        [field]: value,
      },
    }));
  }

  async function handleSaveResult(match: FixtureMatch, result: MatchResultRow | null) {
    if (loginSession?.role !== "admin") {
      setMessage("Only admin can save results.");
      return;
    }

    const key = buildResultKey(match.roundNumber, match.matchupIndex);
    const form = getScoreForm(match, result);
    const coach1Score = Number(form.coach1Score);
    const coach2Score = Number(form.coach2Score);

    if (!Number.isFinite(coach1Score) || !Number.isFinite(coach2Score)) {
      setMessage("Please enter valid scores for both teams.");
      return;
    }

    setSavingKey(key);
    setMessage("");

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

    if (result?.id) {
      const { error } = await supabase
        .from("super8_match_results")
        .update(payload)
        .eq("id", result.id);

      if (error) {
        setMessage(`Result update failed: ${error.message}`);
        setSavingKey(null);
        return;
      }
    } else {
      const { error } = await supabase.from("super8_match_results").insert(payload);

      if (error) {
        setMessage(`Result save failed: ${error.message}`);
        setSavingKey(null);
        return;
      }
    }

    await refreshResults();
    setMessage(`Saved result for Super 8 Round ${match.roundNumber}, Match ${match.matchupIndex}.`);
    setSavingKey(null);
  }

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
              Results Entered
            </div>
            <div className="mt-2 text-3xl font-bold">
              {selectedRoundCompletedCount}/{selectedRoundMatches.length}
            </div>
            <div className="mt-1 text-sm text-white/70">
              Matchups completed for selected round
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h2 className="text-2xl font-bold">Round Results</h2>
              <p className="mt-1 text-sm text-white/70">
                Results are grouped by Super 8 round. Admin can enter or update scores.
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
                  const outcome = getResultOutcome(result);
                  const isUserMatch = isUsersMatch(match, loginSession.coachId);
                  const form = getScoreForm(match, result);
                  const isSaving = savingKey === key;

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
                              result
                                ? "border-green-400/30 bg-green-500/15 text-green-200"
                                : "border-white/10 bg-white/5 text-white/55"
                            }`}
                          >
                            {result ? "Result entered" : "Awaiting result"}
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
                            Last saved: {formatTimestamp(result.imported_at)}
                          </div>
                        ) : null}
                      </div>

                      {loginSession.role === "admin" ? (
                        <div className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                          <label className="block">
                            <div className="mb-1 text-xs font-semibold text-white/60">
                              {match.coach1Name} score
                            </div>
                            <input
                              type="number"
                              value={form.coach1Score}
                              onChange={(event) =>
                                updateScoreForm(match, "coach1Score", event.target.value)
                              }
                              className="w-full rounded-xl border border-white/10 bg-neutral-900 px-3 py-2 text-white outline-none"
                              placeholder="0"
                            />
                          </label>

                          <label className="block">
                            <div className="mb-1 text-xs font-semibold text-white/60">
                              {match.coach2Name} score
                            </div>
                            <input
                              type="number"
                              value={form.coach2Score}
                              onChange={(event) =>
                                updateScoreForm(match, "coach2Score", event.target.value)
                              }
                              className="w-full rounded-xl border border-white/10 bg-neutral-900 px-3 py-2 text-white outline-none"
                              placeholder="0"
                            />
                          </label>

                          <button
                            type="button"
                            onClick={() => void handleSaveResult(match, result)}
                            disabled={isSaving}
                            className="rounded-xl border border-violet-400/30 bg-violet-500/20 px-4 py-2 text-sm font-semibold text-violet-100 transition hover:bg-violet-500/30 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isSaving ? "Saving..." : result ? "Update" : "Save"}
                          </button>
                        </div>
                      ) : null}
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

