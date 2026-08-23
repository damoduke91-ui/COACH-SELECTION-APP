import { NextRequest, NextResponse } from "next/server";
import {
  buildPreviewFinalsPrerequisites,
  getPreviewFinalsScenario,
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
