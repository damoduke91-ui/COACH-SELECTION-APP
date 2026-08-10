import { NextRequest, NextResponse } from "next/server";
import {
  buildPreviewFinalsPrerequisites,
  getPreviewFinalsScenario,
} from "../../../../lib/previewFinalsScenarios";
import { APP_ENV, supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const FINALS_AFL_ROUNDS = [21, 22, 23, 24];
const FINALS_SUPER8_ROUNDS = [15, 16, 17, 18];

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

    const seasonYear = new Date().getFullYear();
    const prerequisites = buildPreviewFinalsPrerequisites(week);
    const resetOperations = [
      supabaseAdmin.from("finals_results").delete().eq("environment", "preview").eq("season_year", seasonYear),
      supabaseAdmin.from("afl_player_round_stats").delete().eq("environment", "preview").in("afl_round", FINALS_AFL_ROUNDS),
      supabaseAdmin.from("afl_round_finalisation").delete().eq("environment", "preview").in("afl_round", FINALS_AFL_ROUNDS),
      supabaseAdmin.from("round_submissions").delete().eq("environment", "preview").in("round_number", FINALS_SUPER8_ROUNDS),
    ];

    for (const operation of resetOperations) {
      const { error } = await operation;
      if (error) {
        return response(500, { success: false, error: "Could not clear existing Preview Finals scenario data.", details: error.message });
      }
    }

    const now = new Date().toISOString();
    if (prerequisites.length > 0) {
      const { error } = await supabaseAdmin.from("finals_results").insert(
        prerequisites.map((result) => ({
          environment: "preview",
          season_year: seasonYear,
          ...result,
          completed_at: now,
          updated_at: now,
        })),
      );
      if (error) {
        return response(500, { success: false, error: "Could not create deterministic prerequisite Finals results.", details: error.message });
      }
    }

    const { error: unlockError } = await supabaseAdmin
      .from("coach_team_selections")
      .update({ is_submitted: false, submitted_at: null, updated_at: now })
      .eq("environment", "preview");
    if (unlockError) {
      return response(500, { success: false, error: "Scenario was staged, but Preview teams could not be unlocked.", details: unlockError.message });
    }

    const { error: settingsError } = await supabaseAdmin
      .from("app_settings")
      .update({ current_afl_round: scenario.aflRound, current_super8_round: scenario.super8Round, updated_at: now })
      .eq("environment", "preview");
    if (settingsError) {
      return response(500, { success: false, error: "Scenario was staged, but Preview Round Control could not be updated.", details: settingsError.message });
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
