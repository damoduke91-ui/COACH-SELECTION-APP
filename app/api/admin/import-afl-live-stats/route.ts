import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  AflMatchRow,
  FINAL_AFL_MATCH_STATUSES,
  fetchAflPlayerStats,
  fetchAflToken,
  flattenAflPlayerStats,
  loadAflPlayerNameAliases,
  mapAflPlayerStats,
} from "../../../../lib/aflLiveStats";
import { requireSeasonYear } from "../../../../lib/season";

function getEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
}

export async function GET(request: NextRequest) {
  try {
    const secret = getEnv("LIVE_STATS_ADMIN_SECRET");
    const suppliedSecret = request.nextUrl.searchParams.get("secret") ?? request.headers.get("x-admin-secret");

    if (suppliedSecret !== secret) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const matchId = Number(request.nextUrl.searchParams.get("matchId") ?? "");
    const dryRun = request.nextUrl.searchParams.get("dryRun") !== "false";

    if (!Number.isFinite(matchId)) {
      return NextResponse.json({ error: "Invalid matchId" }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
    const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY");
    const environment = process.env.APP_ENV ?? process.env.NEXT_PUBLIC_APP_ENV ?? "production";

    if (!supabaseUrl) {
      throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_URL.");
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
      },
    });

    const { data: settings, error: settingsError } = await supabase
      .from("app_settings")
      .select("season_year")
      .eq("environment", environment)
      .single();
    if (settingsError) throw new Error(`Season load failed: ${settingsError.message}`);
    const seasonYear = requireSeasonYear(settings?.season_year);

    const { data: match, error: matchError } = await supabase
      .from("afl_matches")
      .select(
        "id, environment, season_year, afl_round, afl_match_id, afl_match_provider_id, home_team_provider_id, away_team_provider_id, home_team_code, away_team_code, home_app_team_code, away_app_team_code, home_team_name, away_team_name, status"
      )
      .eq("environment", environment)
      .eq("season_year", seasonYear)
      .eq("afl_match_id", matchId)
      .single();

    if (matchError || !match) {
      return NextResponse.json(
        { error: `Match ${matchId} not found in afl_matches.`, details: matchError?.message },
        { status: 404 }
      );
    }

    const importedAt = new Date().toISOString();
    const nameAliases = await loadAflPlayerNameAliases(supabase, environment);
    const token = await fetchAflToken();
    const aflStats = await fetchAflPlayerStats(match.afl_match_provider_id, token);
    const allStats = flattenAflPlayerStats(aflStats);
    const mappedRows = mapAflPlayerStats(match as AflMatchRow, aflStats, importedAt, nameAliases);
    const upsertRows = mappedRows.map((mappedRow) => mappedRow.row);

    if (upsertRows.length === 0) {
      return NextResponse.json(
        {
          error: "No rows mapped from AFL player stats.",
          matchId,
          dryRun,
        },
        { status: 422 }
      );
    }

    if (!dryRun) {
      const { error: upsertError } = await supabase
        .from("afl_player_round_stats")
        .upsert(upsertRows, {
          onConflict: "environment,season_year,afl_round,afl_team_code,player_name",
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
    }

    return NextResponse.json({
      dryRun,
      match: {
        afl_match_id: match.afl_match_id,
        afl_match_provider_id: match.afl_match_provider_id,
        label: `${match.home_team_name} v ${match.away_team_name}`,
        afl_round: match.afl_round,
        status: match.status,
      },
      counts: {
        aflRawRows: allStats.length,
        mappedRows: upsertRows.length,
        aliasesLoaded: nameAliases.size,
      },
      sampleRows: upsertRows.slice(0, 5),
      wroteRows: dryRun ? 0 : upsertRows.length,
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
