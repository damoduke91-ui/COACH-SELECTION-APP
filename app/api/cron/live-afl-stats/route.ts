import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import {
  AflMatchRow,
  FINAL_AFL_MATCH_STATUSES,
  fetchAflPlayerStats,
  fetchAflToken,
  flattenAflPlayerStats,
  loadAflPlayerNameAliases,
  mapAflPlayerStats,
} from "../../../../lib/aflLiveStats";
import { finaliseSuper8RoundFromLiveStats } from "../../../../lib/super8LiveFinalisation";

type AdminSupabaseClient = SupabaseClient;

type CronMatchRow = AflMatchRow & {
  utc_start_time: string | null;
  final_imported_at: string | null;
};

type MatchImportResult = {
  afl_match_id: number;
  label: string;
  status: string | null;
  action: "imported" | "skipped" | "failed";
  reason?: string;
  aflRawRows?: number;
  mappedRows?: number;
  wroteRows?: number;
  teamRowCounts?: Record<string, number>;
};

type MatchStatusRefreshResult = {
  round: number | null;
  rawMatches: number;
  updatedMatches: number;
  skippedMatches: number;
  error?: string;
};

const BEFORE_START_WINDOW_MS = 90 * 60 * 1000;
const AFTER_START_WINDOW_MS = 5 * 60 * 60 * 1000;
const MIN_FINAL_PLAYERS_PER_TEAM = 20;
const AFL_MATCHES_URL = "https://aflapi.afl.com.au/afl/v2/matches";

function getEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

function isCronAuthorized(request: NextRequest): boolean {
  const secret = process.env.LIVE_STATS_ADMIN_SECRET;
  const suppliedSecret = request.nextUrl.searchParams.get("secret") ?? request.headers.get("x-admin-secret");
  const userAgent = request.headers.get("user-agent") ?? "";

  if (secret && suppliedSecret === secret) return true;

  return userAgent.includes("vercel-cron");
}

function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = toText(value);
    if (text) return text;
  }

  return "";
}

function getMatchesFromResponse(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;

  const root = asObject(payload);
  const data = asObject(root.data);
  const rootMatches = asArray(root.matches);

  return rootMatches.length ? rootMatches : asArray(data.matches);
}

async function loadCurrentAflRound(
  supabase: AdminSupabaseClient,
  environment: string
): Promise<number | null> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("current_afl_round")
    .eq("environment", environment)
    .maybeSingle();

  if (error) {
    throw new Error(`Current AFL round load failed: ${error.message}`);
  }

  return toNumber((data as { current_afl_round?: unknown } | null)?.current_afl_round);
}

async function refreshMatchStatuses(params: {
  supabase: AdminSupabaseClient;
  environment: string;
  round: number | null;
  refreshedAt: string;
}): Promise<MatchStatusRefreshResult> {
  const { supabase, environment, round, refreshedAt } = params;

  if (!round) {
    return {
      round: null,
      rawMatches: 0,
      updatedMatches: 0,
      skippedMatches: 0,
      error: "Current AFL round is not set; match status refresh skipped.",
    };
  }

  try {
    const url = new URL(AFL_MATCHES_URL);
    url.searchParams.set("competitionId", process.env.AFL_COMPETITION_ID ?? "1");
    url.searchParams.set("compSeasonId", process.env.AFL_COMP_SEASON_ID ?? "85");
    url.searchParams.set("roundNumber", String(round));

    const response = await fetch(url, {
      headers: {
        accept: "application/json",
      },
      cache: "no-store",
    });

    if (!response.ok) {
      throw new Error(`AFL fixture request failed: ${response.status}`);
    }

    const rawMatches = getMatchesFromResponse(await response.json());
    let updatedMatches = 0;
    let skippedMatches = 0;

    for (const rawMatch of rawMatches) {
      const match = asObject(rawMatch);
      const aflMatchId = toNumber(match.id ?? match.matchId);
      const status = firstText(match.status, match.matchStatus);

      if (!aflMatchId || !status) {
        skippedMatches += 1;
        continue;
      }

      const { error } = await supabase
        .from("afl_matches")
        .update({
          status,
          updated_at: refreshedAt,
        })
        .eq("environment", environment)
        .eq("afl_match_id", aflMatchId);

      if (error) {
        throw new Error(`Match ${aflMatchId} status update failed: ${error.message}`);
      }

      updatedMatches += 1;
    }

    return {
      round,
      rawMatches: rawMatches.length,
      updatedMatches,
      skippedMatches,
    };
  } catch (error) {
    return {
      round,
      rawMatches: 0,
      updatedMatches: 0,
      skippedMatches: 0,
      error: error instanceof Error ? error.message : "Unknown match status refresh error",
    };
  }
}

function isInPollingWindow(match: CronMatchRow, nowMs: number): boolean {
  const status = (match.status ?? "").toUpperCase();

  if (status === "LIVE") return true;
  if (FINAL_AFL_MATCH_STATUSES.has(status)) return true;

  if (!match.utc_start_time) return false;

  const startMs = new Date(match.utc_start_time).getTime();

  if (!Number.isFinite(startMs)) return false;

  return nowMs >= startMs - BEFORE_START_WINDOW_MS && nowMs <= startMs + AFTER_START_WINDOW_MS;
}

async function importMatch(params: {
  supabase: AdminSupabaseClient;
  match: CronMatchRow;
  token: string;
  nameAliases: Map<string, string>;
  importedAt: string;
}): Promise<MatchImportResult> {
  const { supabase, match, token, nameAliases, importedAt } = params;
  const label = `${match.home_team_name} v ${match.away_team_name}`;

  try {
    if (match.final_imported_at) {
      return {
        afl_match_id: match.afl_match_id,
        label,
        status: match.status ?? null,
        action: "skipped",
        reason: "final already imported",
      };
    }

    const aflStats = await fetchAflPlayerStats(match.afl_match_provider_id, token);
    const allStats = flattenAflPlayerStats(aflStats);
    const mappedRows = mapAflPlayerStats(match, aflStats, importedAt, nameAliases);
    const upsertRows = mappedRows.map((mappedRow) => mappedRow.row);
    const teamRowCounts = upsertRows.reduce<Record<string, number>>((counts, row) => {
      counts[row.afl_team_code] = (counts[row.afl_team_code] ?? 0) + 1;
      return counts;
    }, {});

    if (upsertRows.length === 0) {
      return {
        afl_match_id: match.afl_match_id,
        label,
        status: match.status ?? null,
        action: "failed",
        reason: "no mapped rows",
        aflRawRows: allStats.length,
        mappedRows: 0,
        wroteRows: 0,
        teamRowCounts,
      };
    }

    const isFinal = FINAL_AFL_MATCH_STATUSES.has((match.status ?? "").toUpperCase());

    if (isFinal) {
      const expectedTeamCodes = [
        match.home_app_team_code ?? match.home_team_code,
        match.away_app_team_code ?? match.away_team_code,
      ].filter((code): code is string => Boolean(code));

      const incompleteTeamCodes = expectedTeamCodes.filter(
        (teamCode) => (teamRowCounts[teamCode] ?? 0) < MIN_FINAL_PLAYERS_PER_TEAM
      );

      if (expectedTeamCodes.length !== 2 || incompleteTeamCodes.length > 0) {
        return {
          afl_match_id: match.afl_match_id,
          label,
          status: match.status ?? null,
          action: "failed",
          reason:
            expectedTeamCodes.length !== 2
              ? "final snapshot is missing expected team codes"
              : `final snapshot is incomplete for: ${incompleteTeamCodes.join(", ")}`,
          aflRawRows: allStats.length,
          mappedRows: upsertRows.length,
          wroteRows: 0,
          teamRowCounts,
        };
      }
    }

    const { error: upsertError } = await supabase
      .from("afl_player_round_stats")
      .upsert(upsertRows, {
        onConflict: "environment,afl_round,afl_team_code,player_name",
      });

    if (upsertError) {
      throw new Error(`Stats upsert failed: ${upsertError.message}`);
    }

    const matchUpdatePayload: Record<string, string> = {
      last_polled_at: importedAt,
      last_imported_at: importedAt,
      updated_at: importedAt,
    };

    if (isFinal) {
      matchUpdatePayload.final_imported_at = importedAt;
    }

    const { error: matchUpdateError } = await supabase
      .from("afl_matches")
      .update(matchUpdatePayload)
      .eq("id", match.id);

    if (matchUpdateError) {
      throw new Error(`Match update failed: ${matchUpdateError.message}`);
    }

    return {
      afl_match_id: match.afl_match_id,
      label,
      status: match.status ?? null,
      action: "imported",
      aflRawRows: allStats.length,
      mappedRows: upsertRows.length,
      wroteRows: upsertRows.length,
      teamRowCounts,
    };
  } catch (error) {
    return {
      afl_match_id: match.afl_match_id,
      label,
      status: match.status ?? null,
      action: "failed",
      reason: error instanceof Error ? error.message : "Unknown error",
    };
  }
}

export async function GET(request: NextRequest) {
  try {
    if (!isCronAuthorized(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const environment = process.env.APP_ENV ?? process.env.NEXT_PUBLIC_APP_ENV ?? "production";
    const roundParam = request.nextUrl.searchParams.get("round");
    const nowMs = Date.now();
    const importedAt = new Date(nowMs).toISOString();

    if (!supabaseUrl) {
      throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL.");
    }

    const supabase: AdminSupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
      },
    });

    let targetRound: number | null = null;

    if (roundParam) {
      targetRound = Number(roundParam);

      if (!Number.isInteger(targetRound) || targetRound < 1) {
        return NextResponse.json({ error: "Invalid round" }, { status: 400 });
      }
    } else {
      targetRound = await loadCurrentAflRound(supabase, environment);
    }

    const statusRefresh = await refreshMatchStatuses({
      supabase,
      environment,
      round: targetRound,
      refreshedAt: importedAt,
    });

    let query = supabase
      .from("afl_matches")
      .select(
        "id, environment, afl_round, afl_match_id, afl_match_provider_id, home_team_provider_id, away_team_provider_id, home_team_code, away_team_code, home_app_team_code, away_app_team_code, home_team_name, away_team_name, status, utc_start_time, final_imported_at"
      )
      .eq("environment", environment)
      .order("utc_start_time", { ascending: true });

    if (targetRound) {
      query = query.eq("afl_round", targetRound);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Match load failed: ${error.message}`);
    }

    const matches = ((data ?? []) as CronMatchRow[]).filter((match) => isInPollingWindow(match, nowMs));

    if (matches.length === 0) {
      const finalisation = targetRound
        ? await finaliseSuper8RoundFromLiveStats({
            supabase,
            environment,
            aflRound: targetRound,
            finalisedAt: importedAt,
          })
        : null;

      return NextResponse.json({
        importedAt,
        environment,
        targetRound,
        statusRefresh,
        finalisation,
        checkedMatches: data?.length ?? 0,
        candidateMatches: 0,
        results: [],
      });
    }

    const nameAliases = await loadAflPlayerNameAliases(supabase, environment);
    const token = await fetchAflToken();
    const results: MatchImportResult[] = [];

    for (const match of matches) {
      results.push(
        await importMatch({
          supabase,
          match,
          token,
          nameAliases,
          importedAt,
        })
      );
    }

    const finalisation = targetRound
      ? await finaliseSuper8RoundFromLiveStats({
          supabase,
          environment,
          aflRound: targetRound,
          finalisedAt: importedAt,
        })
      : null;

    return NextResponse.json({
      importedAt,
      environment,
      targetRound,
      statusRefresh,
      finalisation,
      checkedMatches: data?.length ?? 0,
      candidateMatches: matches.length,
      aliasesLoaded: nameAliases.size,
      results,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
