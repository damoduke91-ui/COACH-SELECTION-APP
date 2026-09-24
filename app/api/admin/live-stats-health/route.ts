import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { requireSeasonYear } from "../../../../lib/season";
import { expectedIntervalMinutes, heartbeatHealth, isInLivePollingWindow, recentRunErrors,
  type HealthMatch, type HealthRun, type LiveStatsHealthResponse } from "../../../../lib/liveStatsHealth";

export const dynamic = "force-dynamic";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export async function GET(request: NextRequest) {
  const [scheme, token] = (request.headers.get("authorization") ?? "").split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return json({ error: "Admin sign-in required." }, 401);
  try {
    const environment = process.env.APP_ENV ?? process.env.NEXT_PUBLIC_APP_ENV ?? "production";
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "",
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? "",
      { auth: { persistSession: false } },
    );
    const { data: user, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user.user) return json({ error: "Admin sign-in required." }, 401);
    // Match the existing Preview fallback to a Production admin profile.
    let authorized = false;
    for (const profileEnvironment of environment === "preview" ? ["preview", "production"] : [environment]) {
      const { data, error } = await supabase.from("profiles").select("id")
        .eq("id", user.user.id).eq("environment", profileEnvironment).eq("role", "admin").maybeSingle();
      if (error) throw new Error("Could not verify admin access.");
      if (data) { authorized = true; break; }
    }
    if (!authorized) return json({ error: "Admin access required." }, 403);

    const { data: settings, error: settingsError } = await supabase.from("app_settings")
      .select("season_year, current_afl_round").eq("environment", environment).single();
    if (settingsError) throw new Error(`Settings load failed: ${settingsError.message}`);
    const seasonYear = requireSeasonYear(settings.season_year);
    const currentRound = settings.current_afl_round == null ? null : Number(settings.current_afl_round);
    const matchesQuery = supabase.from("afl_matches")
      .select("afl_match_id, home_team_name, away_team_name, status, utc_start_time, last_polled_at, last_imported_at, final_imported_at")
      .eq("environment", environment).eq("season_year", seasonYear)
      .eq("afl_round", currentRound ?? -1).order("utc_start_time", { ascending: true });
    const [matchResult, historyResult] = await Promise.all([
      matchesQuery,
      supabase.from("afl_live_stats_runs").select("*").eq("environment", environment)
        .order("started_at", { ascending: false }).limit(100),
    ]);
    if (matchResult.error) throw new Error(`Matches load failed: ${matchResult.error.message}`);
    const runs = (historyResult.data ?? []) as HealthRun[];
    const scopedRuns = runs.filter((run) => run.season_year === seasonYear && run.afl_round === currentRound);
    const latestRun = runs[0] ?? null;
    const now = Date.now();
    const intervalMinutes = expectedIntervalMinutes(process.env.LIVE_STATS_EXPECTED_INTERVAL_MINUTES);
    const body: LiveStatsHealthResponse = {
      environment, seasonYear, currentRound, generatedAt: new Date(now).toISOString(), intervalMinutes,
      heartbeat: heartbeatHealth(latestRun, now, intervalMinutes), latestRun,
      telemetryWarning: historyResult.error
        ? "Cron history is unavailable. Apply the Live Stats Health migration and check database access. Match timestamps remain available."
        : runs.length === 0 ? "No cron history yet. The first authorized cron call after installation will appear here." : null,
      matches: ((matchResult.data ?? []) as HealthMatch[]).map((match) => {
        const run = scopedRuns.find((run) => run.results.some((result) => result.afl_match_id === match.afl_match_id));
        return { ...match, eligible: isInLivePollingWindow(match, now),
          latestOutcome: run?.results.find((result) => result.afl_match_id === match.afl_match_id) ?? null,
          outcomeAt: run?.started_at ?? null };
      }),
      errors: recentRunErrors(runs.filter((run) => run.season_year === seasonYear || run.season_year === null)),
    };
    return json(body);
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Health data could not be loaded." }, 500);
  }
}
