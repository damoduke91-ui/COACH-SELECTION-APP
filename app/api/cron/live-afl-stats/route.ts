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

type AdminSupabaseClient = SupabaseClient<any, "public", any>;

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
};

const BEFORE_START_WINDOW_MS = 90 * 60 * 1000;
const AFTER_START_WINDOW_MS = 5 * 60 * 60 * 1000;

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
      };
    }

    const { error: upsertError } = await supabase
      .from("afl_player_round_stats")
      .upsert(upsertRows, {
        onConflict: "environment,afl_round,afl_team_code,player_name",
      });

    if (upsertError) {
      throw new Error(`Stats upsert failed: ${upsertError.message}`);
    }

    const isFinal = FINAL_AFL_MATCH_STATUSES.has((match.status ?? "").toUpperCase());

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

    let query = supabase
      .from("afl_matches")
      .select(
        "id, environment, afl_round, afl_match_id, afl_match_provider_id, home_team_provider_id, away_team_provider_id, home_team_code, away_team_code, home_app_team_code, away_app_team_code, home_team_name, away_team_name, status, utc_start_time, final_imported_at"
      )
      .eq("environment", environment)
      .order("utc_start_time", { ascending: true });

    if (roundParam) {
      const round = Number(roundParam);
      if (!Number.isFinite(round)) {
        return NextResponse.json({ error: "Invalid round" }, { status: 400 });
      }

      query = query.eq("afl_round", round);
    }

    const { data, error } = await query;

    if (error) {
      throw new Error(`Match load failed: ${error.message}`);
    }

    const matches = ((data ?? []) as CronMatchRow[]).filter((match) => isInPollingWindow(match, nowMs));

    if (matches.length === 0) {
      return NextResponse.json({
        importedAt,
        environment,
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

    return NextResponse.json({
      importedAt,
      environment,
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