import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  AflMatchRow,
  fetchAflPlayerStats,
  fetchAflToken,
  flattenAflPlayerStats,
  loadAflPlayerNameAliases,
  mapAflPlayerStats,
} from "../../../../lib/aflLiveStats";

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

    const matchId = Number(request.nextUrl.searchParams.get("matchId") ?? "8178");

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

    const { data: match, error: matchError } = await supabase
      .from("afl_matches")
      .select(
        "id, environment, afl_round, afl_match_id, afl_match_provider_id, home_team_provider_id, away_team_provider_id, home_team_code, away_team_code, home_app_team_code, away_app_team_code, home_team_name, away_team_name"
      )
      .eq("environment", environment)
      .eq("afl_match_id", matchId)
      .single();

    if (matchError || !match) {
      return NextResponse.json(
        { error: `Match ${matchId} not found in afl_matches.`, details: matchError?.message },
        { status: 404 }
      );
    }

    const nameAliases = await loadAflPlayerNameAliases(supabase, environment);
    const token = await fetchAflToken();
    const aflStats = await fetchAflPlayerStats(match.afl_match_provider_id, token);
    const importedAt = new Date().toISOString();

    const allStats = flattenAflPlayerStats(aflStats);
    const mappedRows = mapAflPlayerStats(match as AflMatchRow, aflStats, importedAt, nameAliases)
      .sort((a, b) => {
        if (a.row.afl_team_code !== b.row.afl_team_code) {
          return a.row.afl_team_code.localeCompare(b.row.afl_team_code);
        }

        return a.row.player_name.localeCompare(b.row.player_name);
      });

    const teamCodes = [
      match.home_app_team_code ?? match.home_team_code,
      match.away_app_team_code ?? match.away_team_code,
    ].filter((code): code is string => Boolean(code));

    const { data: existingRows, error: existingError } = await supabase
      .from("afl_player_round_stats")
      .select("afl_team_code, player_name")
      .eq("environment", environment)
      .eq("afl_round", match.afl_round)
      .in("afl_team_code", teamCodes);

    if (existingError) {
      throw new Error(existingError.message);
    }

    const existingNames = new Set((existingRows ?? []).map((row) => `${row.afl_team_code}:${row.player_name}`));
    const previewNames = new Set(mappedRows.map((row) => `${row.row.afl_team_code}:${row.row.player_name}`));

    const missingFromPreview = Array.from(existingNames)
      .filter((name) => !previewNames.has(name))
      .sort();

    const newInPreview = Array.from(previewNames)
      .filter((name) => !existingNames.has(name))
      .sort();

    const aliasUsage = mappedRows
      .filter((row) => row.afl_player_name !== row.row.player_name)
      .map((row) => ({
        afl_team_code: row.row.afl_team_code,
        afl_player_name: row.afl_player_name,
        player_name: row.row.player_name,
      }));

    return NextResponse.json({
      match: {
        afl_match_id: match.afl_match_id,
        afl_match_provider_id: match.afl_match_provider_id,
        label: `${match.home_team_name} v ${match.away_team_name}`,
        afl_round: match.afl_round,
      },
      counts: {
        aflRawRows: allStats.length,
        mappedRows: mappedRows.length,
        existingRows: existingRows?.length ?? 0,
        aliasesLoaded: nameAliases.size,
        aliasesUsed: aliasUsage.length,
        missingFromPreview: missingFromPreview.length,
        newInPreview: newInPreview.length,
      },
      sampleRows: mappedRows.slice(0, 10).map((row) => row.row),
      aliasUsage,
      missingFromPreview: missingFromPreview.slice(0, 20),
      newInPreview: newInPreview.slice(0, 20),
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