import { NextRequest, NextResponse } from "next/server";
import {
  buildPreviewFinalsPrerequisites,
  getPreviewFinalsScenario,
  PREVIEW_FINALS_REGULAR_RESULTS,
} from "../../../../lib/previewFinalsScenarios";
import { APP_ENV, supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { requireSeasonYear } from "../../../../lib/season";

export const dynamic = "force-dynamic";

function response(status: number, payload: Record<string, unknown>) {
  return NextResponse.json(payload, { status });
}

async function isAdmin(request: NextRequest): Promise<boolean> {
  const [scheme, token] = (request.headers.get("authorization") ?? "").split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) return false;
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) return false;

  for (const environment of ["preview", "production"]) {
    const profile = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", data.user.id)
      .eq("environment", environment)
      .eq("role", "admin")
      .maybeSingle();
    if (!profile.error && profile.data) return true;
  }
  return false;
}

export async function POST(request: NextRequest) {
  if (APP_ENV !== "preview") {
    return response(403, {
      success: false,
      error: "Preview Finals staging is permanently disabled outside Preview.",
    });
  }

  try {
    if (!(await isAdmin(request))) {
      return response(403, { success: false, error: "Admin access required." });
    }

    const body = (await request.json().catch(() => ({}))) as { week?: unknown };
    const week = Number(body.week);
    const scenario = getPreviewFinalsScenario(week);
    if (!scenario) {
      return response(400, { success: false, error: "Finals week must be an integer from 1 to 4." });
    }

    const { data: settings, error: settingsError } = await supabaseAdmin
      .from("app_settings")
      .select("season_year")
      .eq("environment", "preview")
      .single();
    if (settingsError) throw new Error(`Season load failed: ${settingsError.message}`);
    const seasonYear = requireSeasonYear(settings?.season_year);
    const prerequisites = buildPreviewFinalsPrerequisites(week);
    const now = new Date().toISOString();

    const { count: regularResultCount, error: regularResultCountError } = await supabaseAdmin
      .from("super8_match_results")
      .select("id", { count: "exact", head: true })
      .eq("environment", "preview")
      .eq("season_year", seasonYear)
      .lte("round_number", 14);
    if (regularResultCountError) {
      throw new Error(`Preview regular-season result check failed: ${regularResultCountError.message}`);
    }

    if (regularResultCount === 0) {
      const { error: seedError } = await supabaseAdmin.from("super8_match_results").upsert(
        PREVIEW_FINALS_REGULAR_RESULTS.map((result) => ({
          environment: "preview",
          season_year: seasonYear,
          round_number: 1,
          afl_round: 1,
          matchup_index: result.matchupIndex,
          coach_1_id: result.coach1Id,
          coach_1_name: result.coach1Name,
          coach_1_score: result.coach1Score,
          coach_2_id: result.coach2Id,
          coach_2_name: result.coach2Name,
          coach_2_score: result.coach2Score,
          imported_at: now,
          source_updated_at: now,
          score_source: "csv",
        })),
        { onConflict: "environment,season_year,round_number,matchup_index" },
      );
      if (seedError) {
        throw new Error(`Preview regular-season seed failed: ${seedError.message}`);
      }
    }

    const { error: stagingError } = await supabaseAdmin.rpc("stage_preview_finals_scenario", {
      p_week: scenario.week,
      p_season_year: seasonYear,
      p_prerequisites: prerequisites,
      p_now: now,
    });
    if (stagingError) {
      return response(500, {
        success: false,
        error: "Could not atomically stage the Preview Finals scenario.",
        details: stagingError.message,
      });
    }

    return response(200, {
      success: true,
      environment: "preview",
      week: scenario.week,
      currentAflRound: scenario.aflRound,
      currentSuper8Round: scenario.super8Round,
      prerequisiteMatches: scenario.prerequisiteMatches,
      message: `Preview Finals Week ${scenario.week} staged deterministically. Production was not changed.`,
    });
  } catch (error) {
    return response(500, { success: false, error: "Preview Finals staging failed unexpectedly.", details: error instanceof Error ? error.message : "Unknown staging error." });
  }
}
