"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  buildFinalsBracket,
  displayFinalsTeam,
  FINALS_AFL_ROUNDS,
  FINALS_TEAM_NAMES,
  type FinalsMatch,
  type FinalsMatchCode,
  type FinalsResult,
  type RegularSeasonResult,
} from "../../lib/finals";
import {
  calculateFinalsLiveScore,
  type FinalsLiveStat,
} from "../../lib/finalsLiveScores";
import { APP_ENV, supabase } from "../../lib/supabase";
import { calculateFinalsReadiness } from "../../lib/finalsReadiness";
import { requireSeasonYear } from "../../lib/season";

function TeamLine({
  team,
  score,
  fallback,
  week,
  linkToScore = true,
}: {
  team: FinalsMatch["home"];
  score: number | null;
  fallback: string;
  week: number;
  linkToScore?: boolean;
}) {
  const aflRound = FINALS_AFL_ROUNDS[week - 1];
  const scoreHref =
    team && aflRound
      ? `/opponent-team?coachName=${encodeURIComponent(team.name)}&competitionRound=${14 + week}&aflRound=${aflRound}`
      : null;

  return (
    <div className="flex min-h-10 items-center justify-between gap-3 border-t border-yellow-950/20 bg-yellow-100 px-3 py-2 text-sm font-semibold text-neutral-950">
      <span>{displayFinalsTeam(team, fallback)}</span>
      {scoreHref && linkToScore ? (
        <Link
          href={scoreHref}
          aria-label={`View ${displayFinalsTeam(team, fallback)} score for finals week ${week}`}
          className="min-w-20 rounded px-1 py-0.5 text-right font-black underline decoration-yellow-700/50 underline-offset-2 hover:bg-yellow-300/50 hover:decoration-yellow-950"
        >
          {score ?? "—"}
        </Link>
      ) : (
        <span className="min-w-8 text-right font-black">{score ?? "—"}</span>
      )}
    </div>
  );
}

function MatchCard({ match }: { match: FinalsMatch }) {
  return (
    <article className="overflow-hidden rounded-md border-2 border-yellow-300 shadow-lg shadow-black/30">
      <h3 className="bg-yellow-300 px-3 py-2 text-center text-sm font-black italic text-neutral-950">
        {match.label}
      </h3>
      <TeamLine team={match.home} score={match.homeScore} fallback="To be decided" week={match.week} />
      <TeamLine team={match.away} score={match.awayScore} fallback="To be decided" week={match.week} />
    </article>
  );
}

export default function FinalsPage() {
  const router = useRouter();
  const [role, setRole] = useState<"admin" | "coach" | null>(null);
  const [regularResults, setRegularResults] = useState<RegularSeasonResult[]>([]);
  const [finalsResults, setFinalsResults] = useState<FinalsResult[]>([]);
  const [submissions, setSubmissions] = useState<Array<{
    coach_id: number;
    coach_name: string;
    round_number: number;
    team_data: Record<string, { onField?: string[]; emergencies?: string[] }>;
  }>>([]);
  const [liveStats, setLiveStats] = useState<FinalsLiveStat[]>([]);
  const [message, setMessage] = useState("");
  const [savingCode, setSavingCode] = useState<FinalsMatchCode | null>(null);
  const [completingWeek, setCompletingWeek] = useState(false);
  const [stagingWeek, setStagingWeek] = useState<number | null>(null);
  const [currentPreviewWeek, setCurrentPreviewWeek] = useState<number | null>(null);
  const [currentAflRound, setCurrentAflRound] = useState<number | null>(null);
  const [currentSuper8Round, setCurrentSuper8Round] = useState<number | null>(null);
  const [seasonYear, setSeasonYear] = useState<number | null>(null);
  const [resettingPreview, setResettingPreview] = useState(false);
  const [drafts, setDrafts] = useState<Partial<Record<FinalsMatchCode, [string, string]>>>({});

  const refresh = useCallback(async () => {
    const settings = await supabase
      .from("app_settings")
      .select("current_afl_round, current_super8_round, season_year")
      .eq("environment", APP_ENV)
      .maybeSingle();
    if (settings.error || !settings.data) {
      setMessage(`Season settings load failed: ${settings.error?.message ?? "No active settings."}`);
      return;
    }
    const activeSeasonYear = requireSeasonYear(settings.data.season_year);
    setSeasonYear(activeSeasonYear);

    const [regular, finals, submissionRows] = await Promise.all([
      supabase
        .from("super8_match_results")
        .select("round_number, coach_1_name, coach_1_score, coach_2_name, coach_2_score")
        .eq("environment", APP_ENV)
        .eq("season_year", activeSeasonYear)
        .lte("round_number", 14),
      supabase
        .from("finals_results")
        .select("match_code, coach_1_score, coach_2_score")
        .eq("environment", APP_ENV)
        .eq("season_year", activeSeasonYear),
      supabase
        .from("round_submissions")
        .select("coach_id, coach_name, round_number, team_data")
        .eq("environment", APP_ENV)
        .eq("season_year", activeSeasonYear)
        .eq("is_submitted", true)
        .gte("round_number", 15)
        .lte("round_number", 18),
    ]);
    const statQueries = await Promise.all(
      FINALS_AFL_ROUNDS.map((aflRound) =>
        supabase
          .from("afl_player_round_stats")
          .select("afl_round, afl_team_code, player_name, d, m, g, b, t, ho, ff, fa")
          .eq("environment", APP_ENV)
          .eq("season_year", activeSeasonYear)
          .eq("afl_round", aflRound),
      ),
    );
    if (regular.error) setMessage(`Finals ladder load failed: ${regular.error.message}`);
    else setRegularResults((regular.data ?? []) as RegularSeasonResult[]);
    if (finals.error) {
      setMessage(`Apply the finals migration before entering results: ${finals.error.message}`);
      setFinalsResults([]);
    } else {
      setFinalsResults((finals.data ?? []) as FinalsResult[]);
    }
    if (!submissionRows.error) setSubmissions((submissionRows.data ?? []) as typeof submissions);
    if (settings.data) {
      setCurrentAflRound(Number(settings.data.current_afl_round) || null);
      setCurrentSuper8Round(Number(settings.data.current_super8_round) || null);
      const aflWeek = FINALS_AFL_ROUNDS.indexOf(
        Number(settings.data.current_afl_round) as (typeof FINALS_AFL_ROUNDS)[number],
      ) + 1;
      const super8Week = Number(settings.data.current_super8_round) - 14;
      setCurrentPreviewWeek(aflWeek >= 1 && aflWeek <= 4 && aflWeek === super8Week ? aflWeek : null);
    }
    const statError = statQueries.find((query) => query.error)?.error;
    if (statError) {
      setMessage(`Finals live score load failed: ${statError.message}`);
    } else {
      setLiveStats(
        statQueries.flatMap((query) => query.data ?? []) as FinalsLiveStat[],
      );
    }
  }, []);

  useEffect(() => {
    let mounted = true;
    async function bootstrap() {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      if (!data.session?.user) return router.replace("/login");
      const { data: previewProfile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.session.user.id)
        .eq("environment", APP_ENV)
        .maybeSingle();
      let profile = previewProfile;
      if (!profile && APP_ENV === "preview") {
        const { data: productionProfile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", data.session.user.id)
          .eq("environment", "production")
          .maybeSingle();
        profile = productionProfile;
      }
      if (!mounted || !profile) return router.replace("/login");
      setRole(profile.role as "admin" | "coach");
      await refresh();
    }
    void bootstrap();
    return () => {
      mounted = false;
    };
  }, [refresh, router]);

  useEffect(() => {
    if (!role) return;
    const channel = supabase
      .channel(`finals-live-${APP_ENV}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "round_submissions" }, () => {
        void refresh();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "afl_player_round_stats" }, () => {
        void refresh();
      })
      .subscribe();
    const timer = window.setInterval(() => void refresh(), 30_000);
    return () => {
      window.clearInterval(timer);
      void supabase.removeChannel(channel);
    };
  }, [refresh, role]);

  const bracket = useMemo(
    () => buildFinalsBracket(regularResults, finalsResults),
    [finalsResults, regularResults],
  );
  const match = (code: FinalsMatchCode) =>
    bracket.matches.find((item) => item.code === code)!;
  const liveScores = useMemo(() => {
    const scores = new Map<string, number>();
    for (const [index, aflRound] of FINALS_AFL_ROUNDS.entries()) {
      const roundNumber = 15 + index;
      for (const submission of submissions.filter((row) => row.round_number === roundNumber)) {
        const teamName = FINALS_TEAM_NAMES[submission.coach_id] ?? submission.coach_name;
        scores.set(
          `${index + 1}:${teamName.trim().toLowerCase()}`,
          calculateFinalsLiveScore({
            coachId: submission.coach_id,
            coachName: submission.coach_name,
            teamData: submission.team_data,
            stats: liveStats,
            aflRound,
          }),
        );
      }
    }
    return scores;
  }, [liveStats, submissions]);

  const withLiveScores = (finalsMatch: FinalsMatch): FinalsMatch => ({
    ...finalsMatch,
    homeScore:
      (finalsMatch.home
        ? liveScores.get(`${finalsMatch.week}:${finalsMatch.home.name.trim().toLowerCase()}`)
        : undefined) ?? finalsMatch.homeScore,
    awayScore:
      (finalsMatch.away
        ? liveScores.get(`${finalsMatch.week}:${finalsMatch.away.name.trim().toLowerCase()}`)
        : undefined) ?? finalsMatch.awayScore,
  });

  const readiness = useMemo(
    () => calculateFinalsReadiness({
      week: currentPreviewWeek,
      aflRound: currentAflRound,
      super8Round: currentSuper8Round,
      matches: bracket.matches,
      submittedCoachIds: submissions
        .filter((row) => row.round_number === currentSuper8Round)
        .map((row) => row.coach_id),
      statRows: liveStats,
    }),
    [bracket.matches, currentAflRound, currentPreviewWeek, currentSuper8Round, liveStats, submissions],
  );

  async function saveResult(finalsMatch: FinalsMatch) {
    if (seasonYear === null) {
      setMessage("The active season is still loading.");
      return;
    }
    const draft = drafts[finalsMatch.code] ?? [
      finalsMatch.homeScore?.toString() ?? "",
      finalsMatch.awayScore?.toString() ?? "",
    ];
    const homeScore = Number(draft[0]);
    const awayScore = Number(draft[1]);
    if (!finalsMatch.home || !finalsMatch.away) {
      setMessage("Both finalists must be known before saving.");
      return;
    }
    if (!Number.isFinite(homeScore) || !Number.isFinite(awayScore) || homeScore === awayScore) {
      setMessage("Enter two valid, non-drawn scores.");
      return;
    }
    setSavingCode(finalsMatch.code);
    const { error } = await supabase.from("finals_results").upsert(
      {
        environment: APP_ENV,
        season_year: seasonYear,
        match_code: finalsMatch.code,
        coach_1_score: homeScore,
        coach_2_score: awayScore,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "environment,season_year,match_code" },
    );
    setSavingCode(null);
    if (error) setMessage(`Finals result save failed: ${error.message}`);
    else await refresh();
  }

  async function clearResult(finalsMatch: FinalsMatch) {
    if (seasonYear === null) {
      setMessage("The active season is still loading.");
      return;
    }
    setSavingCode(finalsMatch.code);
    const { error } = await supabase
      .from("finals_results")
      .update({
        coach_1_score: null,
        coach_2_score: null,
        completed_at: null,
        updated_at: new Date().toISOString(),
      })
      .eq("environment", APP_ENV)
      .eq("season_year", seasonYear)
      .eq("match_code", finalsMatch.code);
    setSavingCode(null);
    if (error) {
      setMessage(`Finals result clear failed: ${error.message}`);
      return;
    }
    setDrafts((current) => ({ ...current, [finalsMatch.code]: ["", ""] }));
    await refresh();
  }

  async function completeFinalsWeek() {
    if (
      !window.confirm(
        "Complete the current Finals week using the submitted teams and final AFL scores?",
      )
    ) {
      return;
    }

    setCompletingWeek(true);
    setMessage("");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setCompletingWeek(false);
      router.replace("/login");
      return;
    }

    try {
      const result = await fetch("/api/admin/complete-finals-week", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      });
      const payload = (await result.json()) as {
        success?: boolean;
        message?: string;
        error?: string;
      };
      setMessage(payload.message ?? payload.error ?? "Finals completion returned no message.");
      if (result.ok) await refresh();
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : "Could not complete the Finals week.",
      );
    } finally {
      setCompletingWeek(false);
    }
  }

  async function stagePreviewWeek(week: number) {
    if (
      !window.confirm(
        `Stage Preview Finals Week ${week}? This clears all Preview-only Finals results, submissions, stats and finalisation rows, then creates deterministic prerequisite results. Production is never changed.`,
      )
    ) return;

    setStagingWeek(week);
    setMessage("");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setStagingWeek(null);
      router.replace("/login");
      return;
    }

    try {
      const result = await fetch("/api/admin/stage-preview-finals", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ week }),
      });
      const payload = (await result.json()) as { message?: string; error?: string };
      setMessage(payload.message ?? payload.error ?? "Preview Finals staging returned no message.");
      if (result.ok) await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not stage the Preview Finals week.");
    } finally {
      setStagingWeek(null);
    }
  }

  async function resetPreviewFinals() {
    setResettingPreview(true);
    setMessage("");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      setResettingPreview(false);
      router.replace("/login");
      return;
    }
    try {
      const requestReset = async (body: Record<string, unknown>) => {
        const result = await fetch("/api/admin/reset-preview-finals", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
        const payload = await result.json() as {
          message?: string; error?: string; requiredConfirmation?: string;
          currentAflRound?: number; currentSuper8Round?: number;
          counts?: Record<string, number>;
        };
        if (!result.ok) throw new Error(payload.error ?? "Preview Finals reset failed.");
        return payload;
      };
      const inspection = await requestReset({ action: "inspect" });
      const counts = inspection.counts ?? {};
      const summary = Object.entries(counts).map(([key, count]) => `${key}: ${count}`).join("\n");
      const phrase = inspection.requiredConfirmation ?? "RESET PREVIEW FINALS";
      const entered = window.prompt(
        `Preview Finals reset inspection (no rows changed):\n\n${summary}\n\nType exactly: ${phrase}`,
      );
      if (entered === null) {
        setMessage("Preview Finals reset cancelled. No rows were changed.");
        return;
      }
      const result = await requestReset({
        action: "reset",
        confirmation: entered,
        confirmAflRound: inspection.currentAflRound,
        confirmSuper8Round: inspection.currentSuper8Round,
      });
      setMessage(result.message ?? "Preview Finals reset complete.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not reset Preview Finals.");
    } finally {
      setResettingPreview(false);
    }
  }

  if (!role) {
    return <main className="min-h-screen bg-neutral-950 p-8 text-white">Loading finals...</main>;
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="rounded-2xl border border-yellow-300/30 bg-gradient-to-r from-neutral-900 via-yellow-950/40 to-neutral-900 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.3em] text-yellow-300">Top Five Finals Series</p>
              <h1 className="mt-2 text-4xl font-black italic text-yellow-300 sm:text-5xl">Premiership Race</h1>
            </div>
            <Link href="/dashboard" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-semibold hover:bg-white/10">
              Back to Dashboard
            </Link>
          </div>
          {message ? <div className="mt-4 rounded-xl border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">{message}</div> : null}
        </header>

        <section className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03] p-6">
          <div className="grid min-w-[960px] grid-cols-4 gap-8">
            {["One", "Two", "Three", "Four"].map((week) => (
              <div key={week} className="rounded-md bg-yellow-300 px-4 py-2 text-center font-black text-neutral-950">Week {week}</div>
            ))}
            <div className="space-y-8">
              <article className="overflow-hidden rounded-md border-2 border-yellow-300">
                <h3 className="bg-yellow-300 px-3 py-2 text-center text-sm font-black italic text-neutral-950">Week Off</h3>
                <TeamLine team={bracket.bye} score={null} fallback="1st place" week={1} linkToScore={false} />
              </article>
              <MatchCard match={withLiveScores(match("QF"))} />
              <MatchCard match={withLiveScores(match("EF"))} />
            </div>
            <div className="space-y-16 pt-10"><MatchCard match={withLiveScores(match("SF1"))} /><MatchCard match={withLiveScores(match("SF2"))} /></div>
            <div className="pt-28"><MatchCard match={withLiveScores(match("PF"))} /></div>
            <div className="pt-28"><MatchCard match={withLiveScores(match("GF"))} /></div>
          </div>
        </section>

        <section className="overflow-hidden rounded-lg border-2 border-yellow-300 text-center text-neutral-950">
          <div className="bg-yellow-300 px-4 py-3 text-3xl font-black italic">PREMIERS</div>
          <div className="bg-yellow-100 px-4 py-6 text-5xl font-black">{bracket.premier?.name ?? "To be decided"}</div>
        </section>

        {role === "admin" ? (
          <>
          {APP_ENV === "preview" ? (
            <section className="rounded-2xl border border-sky-300/30 bg-sky-300/10 p-5">
              <h2 className="text-xl font-bold text-sky-200">Preview Finals Scenarios</h2>
              <p className="mt-1 text-sm text-white/70">
                Start any Finals week from a clean, repeatable Preview-only state. Earlier
                matchups receive fixed results so the bracket is ready for the selected week.
              </p>
              <div className="mt-4 grid gap-2 sm:grid-cols-4">
                {[1, 2, 3, 4].map((week) => (
                  <button
                    key={week}
                    type="button"
                    onClick={() => void stagePreviewWeek(week)}
                    disabled={stagingWeek !== null}
                    aria-pressed={currentPreviewWeek === week}
                    className={`rounded-xl px-4 py-3 font-black disabled:opacity-50 ${
                      currentPreviewWeek === week
                        ? "bg-sky-200 text-neutral-950 ring-2 ring-white"
                        : "border border-sky-200/30 bg-sky-950/40 text-sky-100 hover:bg-sky-900/60"
                    }`}
                  >
                    {stagingWeek === week ? "Staging..." : `Stage Week ${week}`}
                  </button>
                ))}
              </div>
              <p className="mt-3 text-xs text-sky-100/70">
                Current matching Round Control: {currentPreviewWeek ? `Finals Week ${currentPreviewWeek}` : "not set to Finals"}.
              </p>
              <button
                type="button"
                onClick={() => void resetPreviewFinals()}
                disabled={resettingPreview || stagingWeek !== null}
                className="mt-4 rounded-xl border border-red-300/40 bg-red-950/50 px-4 py-3 text-sm font-bold text-red-100 disabled:opacity-50"
              >
                {resettingPreview ? "Inspecting Preview Reset..." : "Reset Preview Finals"}
              </button>
            </section>
          ) : null}
          <section className="rounded-2xl border border-emerald-300/30 bg-emerald-300/10 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-xl font-bold text-emerald-200">Finals Week Readiness</h2>
              <span className={`rounded-full px-3 py-1 text-xs font-black ${readiness.canComplete ? "bg-emerald-300 text-neutral-950" : "bg-amber-300 text-neutral-950"}`}>
                {readiness.canComplete ? "READY TO COMPLETE" : "NOT READY"}
              </span>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Round alignment", readiness.roundAligned ? "Aligned" : "Mismatch"],
                ["Bracket", readiness.bracketReady ? "Matchups ready" : "Waiting"],
                ["Team submissions", `${readiness.submittedTeamCount}/${readiness.requiredTeamCount}`],
                ["AFL stats", `${readiness.importedClubCount}/18 clubs • ${readiness.playerRowCount} players`],
              ].map(([label, value]) => (
                <div key={label} className="rounded-xl border border-white/10 bg-black/20 p-3">
                  <div className="text-xs uppercase tracking-wide text-white/50">{label}</div>
                  <div className="mt-1 font-bold text-white">{value}</div>
                </div>
              ))}
            </div>
          </section>
          <section className="rounded-2xl border border-yellow-300/30 bg-yellow-300/10 p-5">
            <h2 className="text-xl font-bold text-yellow-300">Complete Finals Week</h2>
            <p className="mt-1 text-sm text-white/70">
              This verifies both teams submitted, all 18 AFL clubs are imported, saves the
              live totals, advances the bracket, and moves Round Control to the next week.
              Drawn or previously completed matchups are blocked.
            </p>
            <button
              type="button"
              onClick={() => void completeFinalsWeek()}
              disabled={completingWeek || !readiness.canComplete}
              className="mt-4 rounded-xl bg-yellow-300 px-5 py-3 font-black text-neutral-950 disabled:opacity-50"
            >
              {completingWeek ? "Checking and completing..." : "Complete Current Finals Week"}
            </button>
          </section>
          <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
            <h2 className="text-xl font-bold">Admin Finals Results</h2>
            <p className="mt-1 text-sm text-white/60">Saving a result automatically advances its winner and loser.</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">
              {bracket.matches.map((item) => {
                const draft = drafts[item.code] ?? [item.homeScore?.toString() ?? "", item.awayScore?.toString() ?? ""];
                return (
                  <div key={item.code} className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <div className="font-bold">{item.label}</div>
                    {([item.home, item.away] as const).map((team, index) => (
                      <div key={index} className="mt-2 grid grid-cols-[1fr_80px] gap-2">
                        <label className="self-center text-sm">{displayFinalsTeam(team, "TBD")}</label>
                        <input
                          type="number"
                          min="0"
                          value={draft[index]}
                          disabled={!item.home || !item.away}
                          onChange={(event) => {
                            const next: [string, string] = [...draft];
                            next[index] = event.target.value;
                            setDrafts((current) => ({ ...current, [item.code]: next }));
                          }}
                          className="rounded-lg border border-white/10 bg-neutral-900 px-2 py-1 text-right"
                        />
                      </div>
                    ))}
                    <div className="mt-3 grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => void saveResult(item)} disabled={!item.home || !item.away || savingCode !== null} className="rounded-lg bg-yellow-300 px-3 py-2 text-sm font-black text-neutral-950 disabled:opacity-40">
                        {savingCode === item.code ? "Saving..." : "Save Result"}
                      </button>
                      <button type="button" onClick={() => void clearResult(item)} disabled={!item.complete || savingCode !== null} className="rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-sm font-bold text-white disabled:opacity-40">
                        Clear Result
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
          </>
        ) : null}
      </div>
    </main>
  );
}
