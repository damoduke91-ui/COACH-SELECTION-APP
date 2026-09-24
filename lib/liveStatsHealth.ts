export type MatchOutcome = {
  afl_match_id: number;
  label: string;
  status: string | null;
  action: "imported" | "skipped" | "failed";
  reason?: string;
  aflRawRows?: number;
  mappedRows?: number;
  wroteRows?: number;
};

export type HealthRun = {
  id: string;
  started_at: string;
  finished_at: string | null;
  season_year: number | null;
  afl_round: number | null;
  status: "running" | "completed" | "degraded" | "failed" | "skipped";
  error: string | null;
  checked_matches: number | null;
  candidate_matches: number | null;
  results: MatchOutcome[];
};

export type HealthMatch = {
  afl_match_id: number;
  home_team_name: string;
  away_team_name: string;
  status: string | null;
  utc_start_time: string | null;
  last_polled_at: string | null;
  last_imported_at: string | null;
  final_imported_at: string | null;
};

// Mirrors the existing cron polling window; final snapshots remain eligible.
export function isInLivePollingWindow(match: Pick<HealthMatch, "status" | "utc_start_time">, nowMs: number) {
  const status = (match.status ?? "").toUpperCase();
  if (["LIVE", "POST_GAME", "POSTGAME", "CONCLUDED", "COMPLETED"].includes(status)) return true;
  if (!match.utc_start_time) return false;
  const startMs = Date.parse(match.utc_start_time);
  return Number.isFinite(startMs) && nowMs >= startMs - 90 * 60_000 && nowMs <= startMs + 5 * 60 * 60_000;
}

export function expectedIntervalMinutes(value: string | undefined): number {
  const minutes = Number(value);
  return Number.isFinite(minutes) && minutes >= 1 ? minutes : 5;
}

export function heartbeatHealth(run: HealthRun | null, nowMs: number, intervalMinutes: number) {
  if (!run) return "unknown";
  const age = nowMs - Date.parse(run.started_at);
  if (!Number.isFinite(age) || age < -60_000) return "unknown";
  if (age > intervalMinutes * 2 * 60_000) return "stale";
  if (run.status === "failed" || run.status === "degraded") return "attention";
  return run.status === "running" ? "running" : "recent";
}

export function recentRunErrors(runs: HealthRun[]) {
  return runs.flatMap((run) => [
    ...(run.error && run.status !== "skipped" ? [{ at: run.started_at, label: "Cron run", reason: run.error }] : []),
    ...run.results.filter((result) => result.action === "failed").map((result) => ({
      at: run.started_at, label: result.label, reason: result.reason ?? "Import failed",
    })),
  ]).slice(0, 30);
}

export type LiveStatsHealthResponse = {
  environment: string;
  seasonYear: number;
  currentRound: number | null;
  generatedAt: string;
  intervalMinutes: number;
  heartbeat: string;
  latestRun: HealthRun | null;
  telemetryWarning: string | null;
  matches: (HealthMatch & { eligible: boolean; latestOutcome: MatchOutcome | null; outcomeAt: string | null })[];
  errors: ReturnType<typeof recentRunErrors>;
};
