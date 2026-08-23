import { NextRequest, NextResponse } from "next/server";
import { APP_ENV, supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { requireSeasonYear } from "../../../../lib/season";

export const dynamic = "force-dynamic";

type AppSettingsRow = { current_afl_round: number | null; season_year: number | null };
type DeleteResult = {
  status?: string;
  deleted_rows?: number;
  environment?: string;
  afl_round?: number;
};

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return NextResponse.json(payload, { status });
}

function getBearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

function toPositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function confirmationPhrase(round: number): string {
  return `DELETE PRODUCTION ROUND ${round} CSV DATA`;
}

function isProductionDeletionEnabled(): boolean {
  return process.env.PRODUCTION_CSV_DELETE_ENABLED === "true";
}

async function isProductionAdmin(request: NextRequest): Promise<boolean> {
  const token = getBearerToken(request);
  if (!token) return false;

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) return false;

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("id", userData.user.id)
    .eq("environment", "production")
    .eq("role", "admin")
    .maybeSingle();

  return !profileError && Boolean(profile);
}

export async function POST(request: NextRequest) {
  if (APP_ENV !== "production" || !isProductionDeletionEnabled()) {
    return jsonResponse(403, {
      success: false,
      error: "Production CSV deletion is locked.",
    });
  }

  try {
    if (!(await isProductionAdmin(request))) {
      return jsonResponse(403, { success: false, error: "Production admin access required." });
    }

    const body = (await request.json().catch(() => ({}))) as {
      action?: unknown;
      confirmRound?: unknown;
      confirmation?: unknown;
    };

    const { data: settingsData, error: settingsError } = await supabaseAdmin
      .from("app_settings")
      .select("current_afl_round, season_year")
      .eq("environment", "production")
      .maybeSingle();

    if (settingsError) {
      return jsonResponse(500, {
        success: false,
        error: "Could not load production round settings.",
        details: settingsError.message,
      });
    }

    const currentRound = toPositiveInteger(
      (settingsData as AppSettingsRow | null)?.current_afl_round
    );
    const requestedRound = toPositiveInteger(body.confirmRound);
    const seasonYear = requireSeasonYear((settingsData as AppSettingsRow | null)?.season_year);
    if (!currentRound || requestedRound !== currentRound) {
      return jsonResponse(400, {
        success: false,
        error: "Round confirmation does not match the current production round.",
      });
    }

    const { count, error: countError } = await supabaseAdmin
      .from("afl_player_round_stats")
      .select("id", { count: "exact", head: true })
      .eq("environment", "production")
      .eq("season_year", seasonYear)
      .eq("afl_round", currentRound)
      .eq("score_source", "csv");

    if (countError) {
      return jsonResponse(500, {
        success: false,
        error: "Could not count protected production CSV rows.",
        details: countError.message,
      });
    }

    const affectedRowCount = count ?? 0;
    if (body.action === "inspect") {
      return jsonResponse(200, {
        success: true,
        dryRun: true,
        environment: "production",
        aflRound: currentRound,
        affectedRowCount,
        requiredConfirmation: confirmationPhrase(currentRound),
        message: `${affectedRowCount} protected production CSV rows would be deleted for AFL Round ${currentRound}. No rows were changed.`,
      });
    }

    if (body.action !== "delete") {
      return jsonResponse(400, { success: false, error: "A valid deletion action is required." });
    }

    if (String(body.confirmation ?? "") !== confirmationPhrase(currentRound)) {
      return jsonResponse(400, {
        success: false,
        error: "The production deletion confirmation phrase did not match exactly.",
      });
    }

    const { data, error: deleteError } = await supabaseAdmin.rpc(
      "delete_protected_round_csv",
      { p_environment: "production", p_season_year: seasonYear, p_afl_round: currentRound }
    );

    if (deleteError) {
      return jsonResponse(500, {
        success: false,
        error: "Protected production CSV rows could not be deleted.",
        details: deleteError.message,
      });
    }

    const result = data as DeleteResult | null;
    if (
      result?.status !== "deleted" ||
      result.environment !== "production" ||
      result.afl_round !== currentRound ||
      result.deleted_rows !== affectedRowCount
    ) {
      return jsonResponse(500, {
        success: false,
        error: "Production deletion returned an invalid audit result.",
      });
    }

    return jsonResponse(200, {
      success: true,
      environment: "production",
      aflRound: currentRound,
      deletedRowCount: result.deleted_rows,
      message: `Deleted ${result.deleted_rows} protected production CSV rows for AFL Round ${currentRound}. Live rows were not deleted.`,
    });
  } catch (error) {
    return jsonResponse(500, {
      success: false,
      error: "Production CSV deletion failed unexpectedly.",
      details: error instanceof Error ? error.message : "Unknown deletion error.",
    });
  }
}
