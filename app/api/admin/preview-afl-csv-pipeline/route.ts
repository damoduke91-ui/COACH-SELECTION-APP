import { NextRequest, NextResponse } from "next/server";
import {
  type AflMatchRow,
  fetchAflPlayerStats,
  fetchAflToken,
  loadAflPlayerNameAliases,
  mapAflPlayerStats,
} from "../../../../lib/aflLiveStats";
import { APP_ENV, supabaseAdmin } from "../../../../lib/supabaseAdmin";
import { buildDeterministicPreviewStats } from "../../../../lib/previewAflStats";
import { requireSeasonYear } from "../../../../lib/season";
import { validatePreviewImportAccess, validatePreviewImportCoverage, validatePreviewImportRound } from "../../../../lib/previewImportGuards";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const EXPECTED_CLUB_COUNT = 18;
const WEEKLY_LIST_TEAM_ALIASES: Record<string, string> = {
  adelaide: "adelaide crows",
  brisbane: "brisbane lions",
  geelong: "geelong cats",
  "gold coast": "gold coast suns",
  sydney: "sydney swans",
  "west coast": "west coast eagles",
};

function response(status: number, payload: Record<string, unknown>) {
  return NextResponse.json(payload, { status });
}

function normaliseClub(value: string | null | undefined) {
  const club = value?.trim().toUpperCase() ?? "";
  return ({ BRL: "BRI", NTH: "NM" } as Record<string, string>)[club] ?? club;
}

async function isAdmin(request: NextRequest) {
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
  const environmentFailure = validatePreviewImportAccess(APP_ENV, true);
  if (environmentFailure) {
    return response(environmentFailure.status, { success: false, error: environmentFailure.error });
  }

  try {
    const accessFailure = validatePreviewImportAccess(APP_ENV, await isAdmin(request));
    if (accessFailure) return response(accessFailure.status, { success: false, error: accessFailure.error });

    const body = (await request.json().catch(() => ({}))) as {
      confirmRound?: unknown;
      dryRun?: unknown;
    };
    const confirmedRound = Number(body.confirmRound);
    const dryRun = body.dryRun !== false;
    const { data: settings, error: settingsError } = await supabaseAdmin
      .from("app_settings")
      .select("current_afl_round, season_year")
      .eq("environment", "preview")
      .maybeSingle();
    if (settingsError) throw new Error(`Round Control load failed: ${settingsError.message}`);
    const seasonYear = requireSeasonYear(settings?.season_year);
    const roundFailure = validatePreviewImportRound(confirmedRound, Number(settings?.current_afl_round) || null);
    if (roundFailure) return response(roundFailure.status, { success: false, error: roundFailure.error });

    const { data: matchData, error: matchError } = await supabaseAdmin
      .from("afl_matches")
      .select("id,environment,season_year,afl_round,afl_match_id,afl_match_provider_id,home_team_provider_id,away_team_provider_id,home_team_code,away_team_code,home_app_team_code,away_app_team_code,home_team_name,away_team_name,status")
      .eq("environment", "preview")
      .eq("season_year", seasonYear)
      .eq("afl_round", confirmedRound)
      .order("afl_match_id");
    if (matchError) throw new Error(`AFL fixture load failed: ${matchError.message}`);

    const matches = (matchData ?? []) as AflMatchRow[];
    const matchFailure = validatePreviewImportCoverage(confirmedRound, matches.length, EXPECTED_CLUB_COUNT, 1);
    if (matchFailure) return response(matchFailure.status, { success: false, error: matchFailure.error });

    const importedAt = new Date().toISOString();
    const fixtureOnly = matches.every((match) => match.status === "FIXTURE_ONLY");
    let sourceTeamListRound: number | null = null;
    const rows = fixtureOnly
      ? await (async () => {
          const { data: latestList, error: latestListError } = await supabaseAdmin
            .from("weekly_team_lists")
            .select("round")
            .eq("environment", "preview")
            .eq("season_year", seasonYear)
            .lte("round", confirmedRound)
            .order("round", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (latestListError) throw new Error(`Team-list round lookup failed: ${latestListError.message}`);
          sourceTeamListRound = Number(latestList?.round) || null;
          if (!sourceTeamListRound) throw new Error(`No team-list snapshot is available at or before AFL Round ${confirmedRound}.`);
          const { data: players, error: playersError } = await supabaseAdmin
            .from("weekly_team_lists")
            .select("player_name,afl_team")
            .eq("environment", "preview")
            .eq("season_year", seasonYear)
            .eq("round", sourceTeamListRound);
          if (playersError) throw new Error(`Round team-list load failed: ${playersError.message}`);
          const teamCodeByName = new Map<string, string>();
          for (const match of matches) {
            if (match.home_team_name && (match.home_app_team_code ?? match.home_team_code)) {
              teamCodeByName.set(
                match.home_team_name.trim().toLowerCase(),
                normaliseClub(match.home_app_team_code ?? match.home_team_code),
              );
            }
            if (match.away_team_name && (match.away_app_team_code ?? match.away_team_code)) {
              teamCodeByName.set(
                match.away_team_name.trim().toLowerCase(),
                normaliseClub(match.away_app_team_code ?? match.away_team_code),
              );
            }
          }
          for (const [weeklyListName, fixtureName] of Object.entries(WEEKLY_LIST_TEAM_ALIASES)) {
            const code = teamCodeByName.get(fixtureName);
            if (code) teamCodeByName.set(weeklyListName, code);
          }
          return buildDeterministicPreviewStats({
            seasonYear,
            aflRound: confirmedRound,
            players: (players ?? []) as Array<{ player_name: string; afl_team: string }>,
            teamCodeByName,
            importedAt,
          });
        })()
      : await (async () => {
          if (matches.some((match) => match.status === "FIXTURE_ONLY")) {
            throw new Error("Preview round mixes fixture-only and provider-backed matches.");
          }
          const aliases = await loadAflPlayerNameAliases(supabaseAdmin, "preview");
          const token = await fetchAflToken();
          const mappedGroups = await Promise.all(
            matches.map(async (match) =>
              mapAflPlayerStats(match, await fetchAflPlayerStats(match.afl_match_provider_id, token), importedAt, aliases),
            ),
          );
          return mappedGroups.flat().map((mapped) => mapped.row);
        })();
    const clubs = new Set(rows.map((row) => normaliseClub(row.afl_team_code)).filter(Boolean));

    const coverageFailure = validatePreviewImportCoverage(confirmedRound, matches.length, clubs.size, rows.length);
    if (coverageFailure) {
      return response(422, {
        success: false,
        error: coverageFailure.error,
        clubCount: clubs.size,
        playerCount: rows.length,
        sourceTeamListRound,
        source: fixtureOnly ? "deterministic-fixture" : "afl-api",
      });
    }

    if (dryRun) {
      return response(200, {
        success: true,
        dryRun: true,
        environment: "preview",
        aflRound: confirmedRound,
        matchCount: matches.length,
        clubCount: clubs.size,
        playerCount: rows.length,
        plannedSteps: [
          `Upsert ${rows.length} mapped player rows into Preview only.`,
          "Leave Production unchanged.",
        ],
        message: `Preview AFL Round ${confirmedRound} import check passed. No rows were changed.`,
      });
    }

    const { error: upsertError } = await supabaseAdmin
      .from("afl_player_round_stats")
      .upsert(rows, {
        onConflict: "environment,season_year,afl_round,afl_team_code,player_name",
      });
    if (upsertError) throw new Error(`Stats upsert failed: ${upsertError.message}`);

    return response(200, {
      success: true,
      dryRun: false,
      environment: "preview",
      aflRound: confirmedRound,
      matchCount: matches.length,
      clubCount: clubs.size,
      playerCount: rows.length,
      source: fixtureOnly ? "deterministic-fixture" : "afl-api",
      sourceTeamListRound,
      message: `Imported ${rows.length} player rows for all ${clubs.size} clubs into Preview AFL Round ${confirmedRound}. Production was not changed.`,
    });
  } catch (error) {
    return response(500, {
      success: false,
      error: "Preview AFL import failed.",
      details: error instanceof Error ? error.message : "Unknown Preview import error.",
    });
  }
}
