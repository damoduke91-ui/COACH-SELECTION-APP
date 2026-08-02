import { NextRequest, NextResponse } from "next/server";
import { APP_ENV, supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const FINALS_AFL_ROUNDS = [21, 22, 23, 24];
const FINALS_SUPER8_ROUNDS = [15, 16, 17, 18];
const RESET_AFL_ROUND = 21;
const RESET_SUPER8_ROUND = 15;
const CONFIRMATION_PHRASE = "RESET PREVIEW FINALS";

type AppSettingsRow = {
  current_afl_round: number | null;
  current_super8_round: number | null;
};

function response(status: number, payload: Record<string, unknown>) {
  return NextResponse.json(payload, { status });
}

function bearerToken(request: NextRequest): string | null {
  const [scheme, token] = (request.headers.get("authorization") ?? "").split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

async function isAdmin(request: NextRequest): Promise<boolean> {
  const token = bearerToken(request);
  if (!token) return false;

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) return false;

  const findAdmin = async (environment: string) =>
    supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", userData.user.id)
      .eq("environment", environment)
      .eq("role", "admin")
      .maybeSingle();

  const previewAdmin = await findAdmin("preview");
  if (!previewAdmin.error && previewAdmin.data) return true;

  const productionAdmin = await findAdmin("production");
  return !productionAdmin.error && Boolean(productionAdmin.data);
}

async function countRows(
  table: "finals_results" | "afl_player_round_stats" | "afl_round_finalisation" | "round_submissions",
  configure: (query: any) => any,
): Promise<number> {
  const query = supabaseAdmin.from(table).select("id", { count: "exact", head: true });
  const { count, error } = await configure(query);
  if (error) throw new Error(`${table}: ${error.message}`);
  return count ?? 0;
}

async function inspectPreviewFinals() {
  const seasonYear = new Date().getFullYear();
  const [finalsResults, playerStats, finalisationRows, submissions, lockedTeams] = await Promise.all([
    countRows("finals_results", (query) =>
      query.eq("environment", "preview").eq("season_year", seasonYear),
    ),
    countRows("afl_player_round_stats", (query) =>
      query.eq("environment", "preview").in("afl_round", FINALS_AFL_ROUNDS),
    ),
    countRows("afl_round_finalisation", (query) =>
      query.eq("environment", "preview").in("afl_round", FINALS_AFL_ROUNDS),
    ),
    countRows("round_submissions", (query) =>
      query.eq("environment", "preview").in("round_number", FINALS_SUPER8_ROUNDS),
    ),
    (async () => {
      const { count, error } = await supabaseAdmin
        .from("coach_team_selections")
        .select("coach_id", { count: "exact", head: true })
        .eq("environment", "preview")
        .eq("is_submitted", true);
      if (error) throw new Error(`coach_team_selections: ${error.message}`);
      return count ?? 0;
    })(),
  ]);

  return { finalsResults, playerStats, finalisationRows, submissions, lockedTeams };
}

export async function POST(request: NextRequest) {
  if (APP_ENV !== "preview") {
    return response(403, {
      success: false,
      error: "Preview finals reset is permanently disabled outside Preview.",
    });
  }

  try {
    if (!(await isAdmin(request))) {
      return response(403, { success: false, error: "Admin access required." });
    }

    const body = (await request.json().catch(() => ({}))) as {
      action?: unknown;
      confirmation?: unknown;
      confirmAflRound?: unknown;
      confirmSuper8Round?: unknown;
    };

    const { data: settingsData, error: settingsError } = await supabaseAdmin
      .from("app_settings")
      .select("current_afl_round, current_super8_round")
      .eq("environment", "preview")
      .maybeSingle();

    if (settingsError || !settingsData) {
      return response(500, {
        success: false,
        error: "Could not load Preview Round Control settings.",
        details: settingsError?.message,
      });
    }

    const settings = settingsData as AppSettingsRow;
    const currentAflRound = Number(settings.current_afl_round);
    const currentSuper8Round = Number(settings.current_super8_round);
    const aflIndex = FINALS_AFL_ROUNDS.indexOf(currentAflRound);
    const super8Index = FINALS_SUPER8_ROUNDS.indexOf(currentSuper8Round);

    if (aflIndex < 0 || aflIndex !== super8Index) {
      return response(400, {
        success: false,
        error: "Preview Round Control is not set to a matching Finals week.",
      });
    }

    const counts = await inspectPreviewFinals();

    if (body.action === "inspect") {
      return response(200, {
        success: true,
        dryRun: true,
        environment: "preview",
        currentAflRound,
        currentSuper8Round,
        counts,
        requiredConfirmation: CONFIRMATION_PHRASE,
        message: "Preview finals reset inspected. No rows were changed.",
      });
    }

    if (body.action !== "reset") {
      return response(400, { success: false, error: "A valid reset action is required." });
    }

    if (
      Number(body.confirmAflRound) !== currentAflRound ||
      Number(body.confirmSuper8Round) !== currentSuper8Round
    ) {
      return response(409, {
        success: false,
        error: "Round Control changed after inspection. Inspect the reset again.",
      });
    }

    if (String(body.confirmation ?? "") !== CONFIRMATION_PHRASE) {
      return response(400, {
        success: false,
        error: "The reset confirmation phrase did not match exactly.",
      });
    }

    const seasonYear = new Date().getFullYear();
    const operations = [
      supabaseAdmin
        .from("finals_results")
        .delete()
        .eq("environment", "preview")
        .eq("season_year", seasonYear),
      supabaseAdmin
        .from("afl_player_round_stats")
        .delete()
        .eq("environment", "preview")
        .in("afl_round", FINALS_AFL_ROUNDS),
      supabaseAdmin
        .from("afl_round_finalisation")
        .delete()
        .eq("environment", "preview")
        .in("afl_round", FINALS_AFL_ROUNDS),
      supabaseAdmin
        .from("round_submissions")
        .delete()
        .eq("environment", "preview")
        .in("round_number", FINALS_SUPER8_ROUNDS),
    ];

    for (const operation of operations) {
      const { error } = await operation;
      if (error) {
        return response(500, {
          success: false,
          error: "Preview finals reset stopped after a database operation failed.",
          details: error.message,
        });
      }
    }

    const resetAt = new Date().toISOString();
    const { error: unlockError } = await supabaseAdmin
      .from("coach_team_selections")
      .update({ is_submitted: false, submitted_at: null, updated_at: resetAt })
      .eq("environment", "preview");

    if (unlockError) {
      return response(500, {
        success: false,
        error: "Preview finals data was cleared, but teams could not be unlocked.",
        details: unlockError.message,
      });
    }

    const { error: roundError } = await supabaseAdmin
      .from("app_settings")
      .update({
        current_afl_round: RESET_AFL_ROUND,
        current_super8_round: RESET_SUPER8_ROUND,
        updated_at: resetAt,
      })
      .eq("environment", "preview");

    if (roundError) {
      return response(500, {
        success: false,
        error: "Preview finals data was cleared, but Round Control could not be reset.",
        details: roundError.message,
      });
    }

    const remaining = await inspectPreviewFinals();
    if (Object.values(remaining).some((count) => count !== 0)) {
      return response(500, {
        success: false,
        error: "Preview reset finished but verification found remaining finals test data.",
        remaining,
      });
    }

    return response(200, {
      success: true,
      environment: "preview",
      previousCounts: counts,
      remaining,
      currentAflRound: RESET_AFL_ROUND,
      currentSuper8Round: RESET_SUPER8_ROUND,
      message:
        "Preview Finals reset complete. Round Control returned to Finals Week 1, all Preview teams were unlocked, and Production was not changed.",
    });
  } catch (error) {
    return response(500, {
      success: false,
      error: "Preview finals reset failed unexpectedly.",
      details: error instanceof Error ? error.message : "Unknown reset error.",
    });
  }
}
