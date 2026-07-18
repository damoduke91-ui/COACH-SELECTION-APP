import { NextRequest, NextResponse } from "next/server";
import { APP_ENV, supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type ProfileRow = {
  id: string;
  role: "admin" | "coach" | string | null;
};

type AppSettingsRow = {
  current_afl_round: number | null;
};

type FinalisationRow = {
  expected_match_count: number | null;
  csv_imported_at: string | null;
  active_source: "live_fallback" | "csv" | null;
};

type AflMatchRow = {
  final_imported_at: string | null;
};

const DEFAULT_EXPECTED_MATCH_COUNT = 9;

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return NextResponse.json(payload, { status });
}

function getBearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

function toPositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

async function getCurrentUserProfile(request: NextRequest): Promise<ProfileRow | null> {
  const token = getBearerToken(request);
  if (!token) return null;

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) return null;

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("id", userData.user.id)
    .eq("environment", APP_ENV)
    .maybeSingle();

  if (profileError || !profile) return null;
  return profile as ProfileRow;
}

export async function POST(request: NextRequest) {
  try {
    const profile = await getCurrentUserProfile(request);

    if (!profile || profile.role !== "admin") {
      return jsonResponse(403, {
        success: false,
        error: "Admin access required.",
      });
    }

    const body = (await request.json().catch(() => ({}))) as {
      confirmRound?: unknown;
    };

    const { data: settingsData, error: settingsError } = await supabaseAdmin
      .from("app_settings")
      .select("current_afl_round")
      .eq("environment", APP_ENV)
      .maybeSingle();

    if (settingsError) {
      return jsonResponse(500, {
        success: false,
        error: "Could not load the current AFL round.",
        details: settingsError.message,
      });
    }

    const currentAflRound = toPositiveInteger(
      (settingsData as AppSettingsRow | null)?.current_afl_round
    );

    if (!currentAflRound) {
      return jsonResponse(400, {
        success: false,
        error: "Current AFL round is not set.",
      });
    }

    if (toPositiveInteger(body.confirmRound) !== currentAflRound) {
      return jsonResponse(400, {
        success: false,
        error: `Confirmation must match AFL Round ${currentAflRound}.`,
      });
    }

    const { data: finalisationData, error: finalisationError } = await supabaseAdmin
      .from("afl_round_finalisation")
      .select("expected_match_count, csv_imported_at, active_source")
      .eq("environment", APP_ENV)
      .eq("afl_round", currentAflRound)
      .maybeSingle();

    if (finalisationError) {
      return jsonResponse(500, {
        success: false,
        error: "Could not load round finalisation state.",
        details: finalisationError.message,
      });
    }

    const finalisation = finalisationData as FinalisationRow | null;

    if (finalisation?.csv_imported_at || finalisation?.active_source === "csv") {
      return jsonResponse(409, {
        success: false,
        error: "CSV data is already active for this round, so cleanup was blocked.",
      });
    }

    const expectedMatchCount =
      toPositiveInteger(finalisation?.expected_match_count) ?? DEFAULT_EXPECTED_MATCH_COUNT;

    const { data: matchData, error: matchError } = await supabaseAdmin
      .from("afl_matches")
      .select("final_imported_at")
      .eq("environment", APP_ENV)
      .eq("afl_round", currentAflRound);

    if (matchError) {
      return jsonResponse(500, {
        success: false,
        error: "Could not validate AFL match completion.",
        details: matchError.message,
      });
    }

    const matches = (matchData ?? []) as AflMatchRow[];
    const finalMatchCount = matches.filter((match) => Boolean(match.final_imported_at)).length;

    if (matches.length < expectedMatchCount || finalMatchCount < expectedMatchCount) {
      return jsonResponse(409, {
        success: false,
        error: "Live scores can only be cleared after the complete AFL round has finished.",
        expectedMatchCount,
        finalMatchCount,
      });
    }

    const clearedAt = new Date().toISOString();

    const { data: deletedStats, error: statsDeleteError } = await supabaseAdmin
      .from("afl_player_round_stats")
      .delete()
      .eq("environment", APP_ENV)
      .eq("afl_round", currentAflRound)
      .select("id");

    if (statsDeleteError) {
      return jsonResponse(500, {
        success: false,
        error: "Could not clear current-round player statistics.",
        details: statsDeleteError.message,
      });
    }

    const { data: deletedResults, error: resultsDeleteError } = await supabaseAdmin
      .from("super8_match_results")
      .delete()
      .eq("afl_round", currentAflRound)
      .eq("score_source", "live_fallback")
      .select("id");

    if (resultsDeleteError) {
      return jsonResponse(500, {
        success: false,
        error: "Player statistics were cleared, but live fallback match results could not be cleared.",
        details: resultsDeleteError.message,
        deletedPlayerStatCount: deletedStats?.length ?? 0,
      });
    }

    const { error: finalisationUpdateError } = await supabaseAdmin
      .from("afl_round_finalisation")
      .upsert(
        {
          environment: APP_ENV,
          afl_round: currentAflRound,
          expected_match_count: expectedMatchCount,
          final_match_count: finalMatchCount,
          player_row_count: 0,
          club_count: 0,
          active_source: null,
          live_cleared_at: clearedAt,
          updated_at: clearedAt,
        },
        {
          onConflict: "environment,afl_round",
        }
      );

    if (finalisationUpdateError) {
      return jsonResponse(500, {
        success: false,
        error: "Live data was cleared, but the finalisation tracker could not be updated.",
        details: finalisationUpdateError.message,
        deletedPlayerStatCount: deletedStats?.length ?? 0,
        deletedFallbackResultCount: deletedResults?.length ?? 0,
      });
    }

    return jsonResponse(200, {
      success: true,
      message: `Live scores cleared for AFL Round ${currentAflRound}. You can now upload the CSV files.`,
      aflRound: currentAflRound,
      deletedPlayerStatCount: deletedStats?.length ?? 0,
      deletedFallbackResultCount: deletedResults?.length ?? 0,
      clearedAt,
    });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: "Clear Live Scores failed unexpectedly.",
      details: error instanceof Error ? error.message : "Unknown server error.",
    });
  }
}
