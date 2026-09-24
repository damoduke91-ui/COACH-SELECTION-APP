"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../../lib/supabase";
import type { LiveStatsHealthResponse } from "../../../lib/liveStatsHealth";

function timestamp(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : "Not recorded";
}

const panel = "rounded-2xl border border-white/10 bg-white/5 p-5";

export default function LiveStatsHealthPage() {
  const [data, setData] = useState<LiveStatsHealthResponse | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let stopped = false;
    let pending = false;
    const controller = new AbortController();
    async function load() {
      if (pending) return;
      pending = true;
      setLoading(true);
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        if (!sessionData.session) {
          if (!stopped) setData(null);
          throw new Error("Sign in with an admin account to view live stats health.");
        }
        const response = await fetch("/api/admin/live-stats-health", {
          headers: { Authorization: `Bearer ${sessionData.session.access_token}` },
          cache: "no-store", signal: controller.signal,
        });
        const body = await response.json();
        if (!response.ok) {
          if (!stopped && (response.status === 401 || response.status === 403)) setData(null);
          throw new Error(body.error ?? "Health data could not be loaded.");
        }
        if (!stopped) { setData(body); setError(""); }
      } catch (failure) {
        if (!stopped) setError(failure instanceof Error ? failure.message : "Health data could not be loaded.");
      } finally {
        pending = false;
        if (!stopped) setLoading(false);
      }
    }
    void load();
    const timer = setInterval(() => { if (!document.hidden) void load(); }, 30_000);
    return () => { stopped = true; controller.abort(); clearInterval(timer); };
  }, [refresh]);

  const matches = data?.matches ?? [];
  const latestImport = matches.map((match) => match.last_imported_at).filter((value): value is string => Boolean(value)).sort().at(-1);
  const latestPoll = matches.map((match) => match.last_polled_at).filter((value): value is string => Boolean(value)).sort().at(-1);
  const healthLabels: Record<string, string> = { unknown: "Unknown", stale: "Heartbeat overdue", attention: "Needs attention", running: "Run in progress", recent: "Recent cron activity" };

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className={`${panel} flex flex-wrap items-center justify-between gap-4`}>
          <div>
            <Link href="/dashboard" className="text-sm text-cyan-200 hover:underline">Back to dashboard</Link>
            <h1 className="mt-2 text-3xl font-bold">Live Stats Health</h1>
            <p className="mt-2 text-sm text-white/60">{data ? `${data.environment} · Season ${data.seasonYear} · AFL Round ${data.currentRound ?? "not set"}` : "Admin monitoring"}</p>
          </div>
          <button disabled={loading} onClick={() => setRefresh((value) => value + 1)} className="rounded-xl border border-white/20 px-4 py-2 disabled:opacity-50">{loading ? "Refreshing..." : "Refresh"}</button>
        </header>
        {error && <p role="alert" className="rounded-xl border border-red-400/30 bg-red-950/40 p-4">{error} {data ? "The data below is from the last successful refresh." : <Link href="/login" className="underline">Sign in</Link>}</p>}
        {data && <>
          {data.telemetryWarning && <p role="status" className="rounded-xl border border-amber-400/30 bg-amber-950/40 p-4">{data.telemetryWarning}</p>}
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Health summary">
            {[
              ["Cron / scheduler heartbeat", healthLabels[data.heartbeat] ?? data.heartbeat],
              ["Last cron call", timestamp(data.latestRun?.started_at)],
              ["Last recorded match poll", timestamp(latestPoll)],
              ["Last match import", timestamp(latestImport)],
              ["Matches monitored this round", String(matches.length)],
              ["In polling window", String(matches.filter((match) => match.eligible).length)],
              ["Final snapshots imported", String(matches.filter((match) => match.final_imported_at).length)],
              ["Latest outcomes · imported / skipped / failed", ["imported", "skipped", "failed"].map((action) => matches.filter((match) => match.latestOutcome?.action === action).length).join(" / ")],
            ].map(([label, value]) => <div key={label} className={panel}><div className="text-sm text-white/60">{label}</div><div className="mt-2 text-lg font-semibold">{value}</div></div>)}
          </section>
          <section className={panel}>
            <h2 className="text-xl font-bold">Cron activity</h2>
            <p className="mt-2 text-sm text-white/70">Expected interval: {data.intervalMinutes} minutes. A heartbeat is overdue after two intervals. This records calls to the cron endpoint; it cannot verify the external scheduler or distinguish manual calls.</p>
            <p className="mt-2 text-sm text-white/70">Latest run: {data.latestRun?.status ?? "not recorded"} · Round {data.latestRun?.afl_round ?? "unknown"} · Finished: {timestamp(data.latestRun?.finished_at)} · Candidates: {data.latestRun?.candidate_matches ?? "unknown"}</p>
            {data.latestRun?.error && <p className="mt-2 text-amber-200">{data.latestRun.error}</p>}
            <p className="mt-2 text-sm text-white/50">Match timestamps are for the current round. The existing importer records its poll timestamp only after a successful import. History covers the latest 100 cron runs; manual import and preview routes are not logged here.</p>
          </section>
          <section className={panel}>
            <h2 className="text-xl font-bold">Match imports</h2>
            {matches.length === 0 ? <p className="mt-4 text-white/60">No matches found for the current AFL round.</p> : <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="text-white/60"><tr>{["Match / status", "Latest cron outcome", "Raw / mapped / written", "Timestamps"].map((label) => <th scope="col" className="p-3" key={label}>{label}</th>)}</tr></thead>
                <tbody>{matches.map((match) => <tr key={match.afl_match_id} className="border-t border-white/10 align-top">
                  <td className="min-w-48 p-3"><div className="font-semibold">{match.home_team_name} v {match.away_team_name}</div><div className="mt-1 text-cyan-200">{match.status ?? "Unknown"}</div><div className="mt-1 text-white/60">{match.final_imported_at ? "Final snapshot saved" : match.eligible ? "In polling window" : "Outside polling window"}</div><div className="mt-1 text-white/50">Starts: {timestamp(match.utc_start_time)}</div></td>
                  <td className="min-w-56 p-3"><div className={match.latestOutcome?.action === "failed" ? "text-red-300" : "text-white"}>{match.latestOutcome?.action ?? "No outcome in recent history"}</div><div className="mt-1 text-white/70">{match.latestOutcome?.reason}</div><div className="mt-1 text-white/50">{timestamp(match.outcomeAt)}</div></td>
                  <td className="whitespace-nowrap p-3">{match.latestOutcome?.aflRawRows ?? "—"} / {match.latestOutcome?.mappedRows ?? "—"} / {match.latestOutcome?.wroteRows ?? "—"}</td>
                  <td className="min-w-56 p-3 text-white/70">Poll: {timestamp(match.last_polled_at)}<br />Import: {timestamp(match.last_imported_at)}<br />Final: {timestamp(match.final_imported_at)}</td>
                </tr>)}</tbody>
              </table>
            </div>}
            <p className="mt-3 text-xs text-white/50">Row counts describe the latest recorded attempt, not totals. A dash means the importer did not report a count.</p>
          </section>
          <section className={panel}>
            <h2 className="text-xl font-bold">Recent errors</h2>
            <p className="mt-1 text-sm text-white/60">Up to 30 errors from recent runs in this season, including failures before season settings could be loaded.</p>
            {data.errors.length === 0 ? <p className="mt-4 text-white/60">No errors in available history.</p> : <ul className="mt-4 space-y-3">{data.errors.map((item, index) => <li key={`${item.at}-${index}`} className="rounded-xl border border-red-400/20 bg-red-950/20 p-3"><div className="font-semibold">{item.label}</div><p className="break-words text-red-200">{item.reason}</p><div className="mt-1 text-xs text-white/50">{timestamp(item.at)}</div></li>)}</ul>}
          </section>
          <p className="text-sm text-white/50">Updated {timestamp(data.generatedAt)} · Refreshes every 30 seconds while visible · Times shown in your local timezone.</p>
        </>}
      </div>
    </main>
  );
}
