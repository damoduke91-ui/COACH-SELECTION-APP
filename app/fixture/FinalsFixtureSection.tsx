"use client";

import { useEffect, useMemo, useState } from "react";
import {
  buildFinalsBracket,
  displayFinalsTeam,
  FINALS_AFL_ROUNDS,
  type FinalsResult,
  type RegularSeasonResult,
} from "../../lib/finals";
import { APP_ENV, supabase } from "../../lib/supabase";

export default function FinalsFixtureSection() {
  const [regularResults, setRegularResults] = useState<RegularSeasonResult[]>([]);
  const [finalsResults, setFinalsResults] = useState<FinalsResult[]>([]);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const [regular, finals] = await Promise.all([
        supabase
          .from("super8_match_results")
          .select("round_number, coach_1_name, coach_1_score, coach_2_name, coach_2_score")
          .lte("round_number", 14),
        supabase
          .from("finals_results")
          .select("match_code, coach_1_score, coach_2_score")
          .eq("environment", APP_ENV)
          .eq("season_year", new Date().getFullYear()),
      ]);
      if (!mounted) return;
      setRegularResults((regular.data ?? []) as RegularSeasonResult[]);
      if (!finals.error) setFinalsResults((finals.data ?? []) as FinalsResult[]);
    }
    void load();
    return () => {
      mounted = false;
    };
  }, []);

  const bracket = useMemo(
    () => buildFinalsBracket(regularResults, finalsResults),
    [finalsResults, regularResults],
  );
  const weeks = [1, 2, 3, 4].map((week) => ({
    week,
    round: week + 14,
    aflRound: FINALS_AFL_ROUNDS[week - 1],
    matches: bracket.matches.filter((match) => match.week === week),
  }));

  return (
    <section className="rounded-2xl border border-yellow-300/25 bg-yellow-300/5 p-5">
      <h2 className="text-2xl font-bold text-yellow-200">Finals Fixture</h2>
      <p className="mt-1 text-sm text-white/70">
        Finals Weeks 1–4 are derived from the final regular-season ladder and completed finals.
      </p>
      <div className="mt-5 space-y-4">
        {weeks.map((group) => (
          <div key={group.week} className="rounded-xl border border-yellow-300/20 bg-black/20 p-4">
            <h3 className="font-bold text-yellow-100">
              Finals Week {group.week} / Competition Round {group.round} / AFL Round{" "}
              {group.aflRound}
            </h3>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              {group.week === 1 && bracket.bye ? (
                <div className="rounded-lg border border-yellow-300/20 bg-yellow-300/10 p-3">
                  <div className="text-xs font-bold uppercase text-yellow-200/70">Week Off</div>
                  <div className="mt-1 font-semibold">{displayFinalsTeam(bracket.bye, "1st place")}</div>
                </div>
              ) : null}
              {group.matches.map((match) => (
                <div key={match.code} className="rounded-lg border border-white/10 bg-neutral-950/60 p-3">
                  <div className="text-xs font-bold uppercase text-white/45">{match.label}</div>
                  <div className="mt-1 font-semibold">
                    {displayFinalsTeam(match.home, "TBD")} vs{" "}
                    {displayFinalsTeam(match.away, "TBD")}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
