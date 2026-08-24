"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useActiveSeason } from "../../lib/activeSeason";
import {
  buildFinalsBracket,
  displayFinalsTeam,
  type FinalsResult,
  type RegularSeasonResult,
} from "../../lib/finals";
import { buildLadderStandings } from "../../lib/ladder";
import { buildSeasonYearOptions, type SeasonStatus } from "../../lib/season";
import { APP_ENV, supabase } from "../../lib/supabase";

type CompetitionSeason = {
  season_year: number;
  status: SeasonStatus;
  premier_name: string | null;
  completed_at: string | null;
  archived_at: string | null;
  locked_at: string | null;
};

type MatchResult = RegularSeasonResult & {
  afl_round: number | null;
  matchup_index: number | null;
};

function score(value: number | null): string {
  return value === null ? "—" : String(value);
}

function statusStyle(status: SeasonStatus): string {
  if (status === "archived") return "border-violet-300/30 bg-violet-300/10 text-violet-100";
  if (status === "completed") return "border-blue-300/30 bg-blue-300/10 text-blue-100";
  if (status === "active") return "border-emerald-300/30 bg-emerald-300/10 text-emerald-100";
  return "border-white/15 bg-white/5 text-white/70";
}

export default function SeasonHistoryPage() {
  const router = useRouter();
  const { seasonYear: activeSeasonYear, isLoading: isLoadingSeason, error: seasonError } = useActiveSeason();
  const [isAuthenticating, setIsAuthenticating] = useState(true);
  const [seasons, setSeasons] = useState<CompetitionSeason[]>([]);
  const [selectedSeasonYear, setSelectedSeasonYear] = useState<number | null>(null);
  const [results, setResults] = useState<MatchResult[]>([]);
  const [finalsResults, setFinalsResults] = useState<FinalsResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let mounted = true;

    async function bootstrap() {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!mounted) return;
      if (!sessionData.session) {
        router.replace("/login");
        return;
      }
      setIsAuthenticating(false);

      const { data, error } = await supabase
        .from("competition_seasons")
        .select("season_year,status,premier_name,completed_at,archived_at,locked_at")
        .eq("environment", APP_ENV)
        .order("season_year", { ascending: false });
      if (!mounted) return;
      if (error) {
        setMessage(`Season history load failed: ${error.message}`);
        setIsLoading(false);
        return;
      }

      const loaded = (data ?? []) as CompetitionSeason[];
      setSeasons(loaded);
      if (activeSeasonYear !== null) {
        setSelectedSeasonYear((current) => current ?? activeSeasonYear);
      }
    }

    if (!isLoadingSeason) void bootstrap();
    return () => { mounted = false; };
  }, [activeSeasonYear, isLoadingSeason, router]);

  useEffect(() => {
    if (selectedSeasonYear === null) return;
    let mounted = true;

    async function loadSelectedSeason() {
      setIsLoading(true);
      setMessage("");
      const [regularResponse, finalsResponse] = await Promise.all([
        supabase
          .from("super8_match_results")
          .select("round_number,afl_round,matchup_index,coach_1_name,coach_1_score,coach_2_name,coach_2_score")
          .eq("environment", APP_ENV)
          .eq("season_year", selectedSeasonYear)
          .order("round_number", { ascending: true })
          .order("matchup_index", { ascending: true }),
        supabase
          .from("finals_results")
          .select("match_code,coach_1_score,coach_2_score")
          .eq("environment", APP_ENV)
          .eq("season_year", selectedSeasonYear),
      ]);
      if (!mounted) return;
      if (regularResponse.error || finalsResponse.error) {
        setResults([]);
        setFinalsResults([]);
        setMessage(
          `Season records load failed: ${regularResponse.error?.message ?? finalsResponse.error?.message}`,
        );
      } else {
        setResults((regularResponse.data ?? []) as MatchResult[]);
        setFinalsResults((finalsResponse.data ?? []) as FinalsResult[]);
      }
      setIsLoading(false);
    }

    void loadSelectedSeason();
    return () => { mounted = false; };
  }, [selectedSeasonYear]);

  const seasonOptions = useMemo(
    () => activeSeasonYear === null
      ? seasons.map((season) => season.season_year)
      : buildSeasonYearOptions(activeSeasonYear, seasons.map((season) => season.season_year)),
    [activeSeasonYear, seasons],
  );
  const selectedSeason = seasons.find((season) => season.season_year === selectedSeasonYear) ?? null;
  const regularResults = useMemo(
    () => results.filter((result) => {
      const round = result.round_number;
      return round !== null && round >= 1 && round <= 14;
    }),
    [results],
  );
  const ladder = useMemo(() => buildLadderStandings(regularResults), [regularResults]);
  const bracket = useMemo(
    () => buildFinalsBracket(regularResults, finalsResults),
    [finalsResults, regularResults],
  );
  const rounds = useMemo(() => {
    const grouped = new Map<number, MatchResult[]>();
    for (const result of regularResults) {
      const round = result.round_number;
      if (round === null) continue;
      grouped.set(round, [...(grouped.get(round) ?? []), result]);
    }
    return [...grouped.entries()].sort(([left], [right]) => left - right);
  }, [regularResults]);
  const premier = selectedSeason?.premier_name?.trim() || bracket.premier?.name || null;

  if (isAuthenticating || isLoadingSeason) {
    return <main className="min-h-screen bg-neutral-950 p-8 text-white">Loading season history…</main>;
  }
  if (seasonError || activeSeasonYear === null) {
    return (
      <main className="min-h-screen bg-neutral-950 p-8 text-white">
        <p className="rounded-xl border border-red-400/30 bg-red-950/40 p-4">
          Season settings load failed: {seasonError ?? "No active season is configured."}
        </p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.25em] text-violet-300">Read-only records</p>
              <h1 className="mt-2 text-3xl font-bold">Season History</h1>
              <p className="mt-2 text-sm text-white/65">Archived seasons are locked and cannot be changed from this page.</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <label className="flex items-center gap-2 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-sm">
                <span className="text-white/60">Season</span>
                <select
                  aria-label="History season"
                  value={selectedSeasonYear ?? ""}
                  onChange={(event) => setSelectedSeasonYear(Number(event.target.value))}
                  className="bg-transparent font-bold text-white outline-none"
                >
                  {seasonOptions.map((year) => (
                    <option key={year} value={year} className="bg-neutral-900">
                      {year}{year === activeSeasonYear ? " (active)" : ""}
                    </option>
                  ))}
                </select>
              </label>
              <Link href="/dashboard" className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm font-bold hover:bg-white/10">
                Back to Dashboard
              </Link>
            </div>
          </div>
          {selectedSeason ? (
            <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
              <span className={`rounded-full border px-3 py-1 font-bold uppercase ${statusStyle(selectedSeason.status)}`}>
                {selectedSeason.status}
              </span>
              {selectedSeason.locked_at ? <span className="text-white/60">Historical records locked</span> : null}
            </div>
          ) : null}
          {message ? <p className="mt-4 rounded-xl border border-amber-400/30 bg-amber-950/30 p-3 text-sm text-amber-100">{message}</p> : null}
        </section>

        {isLoading ? (
          <section className="rounded-2xl border border-white/10 bg-white/5 p-8 text-center text-white/60">Loading records…</section>
        ) : (
          <>
            <section className="overflow-hidden rounded-2xl border border-yellow-300/30 bg-yellow-100 text-neutral-950">
              <div className="bg-yellow-300 px-5 py-3 text-center text-2xl font-black italic">PREMIERS</div>
              <div className="px-5 py-6 text-center text-4xl font-black">{premier ?? "Not decided"}</div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <h2 className="text-2xl font-bold">Final Ladder</h2>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead className="text-left text-white/55"><tr><th className="p-2">#</th><th className="p-2">Team</th><th className="p-2">P</th><th className="p-2">W</th><th className="p-2">L</th><th className="p-2">D</th><th className="p-2">For</th><th className="p-2">Against</th><th className="p-2">%</th><th className="p-2">Pts</th></tr></thead>
                  <tbody>{ladder.map((standing, index) => <tr key={standing.team} className="border-t border-white/10"><td className="p-2 font-bold">{index + 1}</td><td className="p-2 font-bold">{standing.team}</td><td className="p-2">{standing.played}</td><td className="p-2">{standing.wins}</td><td className="p-2">{standing.losses}</td><td className="p-2">{standing.draws}</td><td className="p-2">{standing.pointsFor}</td><td className="p-2">{standing.pointsAgainst}</td><td className="p-2">{standing.percentage.toFixed(2)}</td><td className="p-2 font-bold">{standing.ladderPoints}</td></tr>)}</tbody>
                </table>
              </div>
            </section>

            <section className="rounded-2xl border border-yellow-300/20 bg-yellow-300/5 p-5">
              <h2 className="text-2xl font-bold text-yellow-200">Finals Series</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {bracket.matches.map((match) => (
                  <article key={match.code} className="overflow-hidden rounded-xl border border-yellow-300/30 bg-yellow-100 text-neutral-950">
                    <h3 className="bg-yellow-300 px-3 py-2 text-center font-black italic">{match.label}</h3>
                    <div className="divide-y divide-neutral-900/15">
                      <div className="flex justify-between gap-3 px-3 py-2"><span>{displayFinalsTeam(match.home, "To be decided")}</span><strong>{score(match.homeScore)}</strong></div>
                      <div className="flex justify-between gap-3 px-3 py-2"><span>{displayFinalsTeam(match.away, "To be decided")}</span><strong>{score(match.awayScore)}</strong></div>
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/5 p-5">
              <h2 className="text-2xl font-bold">Regular Season Results</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {rounds.map(([round, matches]) => (
                  <article key={round} className="rounded-xl border border-white/10 bg-black/20 p-4">
                    <h3 className="font-bold text-violet-200">Super 8 Round {round}</h3>
                    <div className="mt-3 space-y-3">{matches.map((match, index) => <div key={`${round}-${match.matchup_index ?? index}`} className="rounded-lg border border-white/10 p-3 text-sm"><div className="flex justify-between gap-2"><span>{match.coach_1_name ?? "Unknown"}</span><strong>{score(match.coach_1_score)}</strong></div><div className="mt-1 flex justify-between gap-2"><span>{match.coach_2_name ?? "Unknown"}</span><strong>{score(match.coach_2_score)}</strong></div></div>)}</div>
                  </article>
                ))}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}
