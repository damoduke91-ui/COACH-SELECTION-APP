import { NextRequest, NextResponse } from "next/server";
import {
  buildFinalsBracket,
  FINALS_AFL_ROUNDS,
  FINALS_TEAM_NAMES,
  getFinalsWeekForAflRound,
  getFinalsWeekForCompetitionRound,
  type FinalsMatchCode,
  type FinalsResult,
  type RegularSeasonResult,
} from "../../../../lib/finals";
import {
  calculateFinalsLiveScore,
  type FinalsLiveStat,
} from "../../../../lib/finalsLiveScores";
import { APP_ENV, supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

const EXPECTED_AFL_CLUB_COUNT = 18;
const MATCHES_BY_WEEK: Record<number, FinalsMatchCode[]> = {
  1: ["QF", "EF"],
  2: ["SF1", "SF2"],
  3: ["PF"],
  4: ["GF"],
};

type ProfileRow = {
  role: string | null;
};

type AppSettingsRow = {
  current_afl_round: number | null;
  current_super8_round: number | null;
};

type SubmissionRow = {
  coach_id: number;
  coach_name: string;
  team_data: Record<string, { onField?: string[]; emergencies?: string[] }>;
  is_submitted: boolean;
};

function response(status: number, payload: Record<string, unknown>) {
  return NextResponse.json(payload, { status });
}

function bearerToken(request: NextRequest): string | null {
  const [scheme, token] = (request.headers.get("authorization") ?? "").split(" ");
  return scheme?.toLowerCase() === "bearer" && token ? token : null;
}

function normaliseClub(value: string | null | undefined): string {
  const club = value?.trim().toUpperCase() ?? "";
  return ({ BRL: "BRI", NTH: "NM" } as Record<string, string>)[club] ?? club;
}

async function getAdminProfile(request: NextRequest): Promise<ProfileRow | null> {
  const token = bearerToken(request);
  if (!token) return null;

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData.user) return null;

  const findProfile = async (environment: string) =>
    supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", userData.user.id)
      .eq("environment", environment)
      .maybeSingle();

  const current = await findProfile(APP_ENV);
  if (!current.error && current.data) return current.data as ProfileRow;

  if (APP_ENV === "preview") {
    const fallback = await findProfile("production");
    if (!fallback.error && fallback.data) return fallback.data as ProfileRow;
  }

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const profile = await getAdminProfile(request);
    if (!profile || profile.role !== "admin") {
      return response(403, { success: false, error: "Admin access required." });
    }

    const { data: settingsData, error: settingsError } = await supabaseAdmin
      .from("app_settings")
      .select("current_afl_round, current_super8_round")
      .eq("environment", APP_ENV)
      .maybeSingle();

    if (settingsError || !settingsData) {
      return response(500, {
        success: false,
        error: "Could not load Round Control settings.",
        details: settingsError?.message,
      });
    }

    const settings = settingsData as AppSettingsRow;
    const aflRound = Number(settings.current_afl_round);
    const super8Round = Number(settings.current_super8_round);
    const weekFromAfl = getFinalsWeekForAflRound(aflRound);
    const weekFromSuper8 = getFinalsWeekForCompetitionRound(super8Round);

    if (!weekFromAfl || !weekFromSuper8 || weekFromAfl !== weekFromSuper8) {
      return response(400, {
        success: false,
        error:
          "Round Control is not set to a matching Finals week. Finals Week 1 starts at Super 8 Round 15 and AFL Round 21.",
      });
    }

    const finalsWeek = weekFromAfl;
    const matchCodes = MATCHES_BY_WEEK[finalsWeek];
    const seasonYear = new Date().getFullYear();

    const [regularQuery, finalsQuery, statsQuery, submissionsQuery] = await Promise.all([
      supabaseAdmin
        .from("super8_match_results")
        .select("round_number, coach_1_name, coach_1_score, coach_2_name, coach_2_score")
        .lte("round_number", 14),
      supabaseAdmin
        .from("finals_results")
        .select("match_code, coach_1_score, coach_2_score")
        .eq("environment", APP_ENV)
        .eq("season_year", seasonYear),
      supabaseAdmin
        .from("afl_player_round_stats")
        .select("afl_round, afl_team_code, player_name, d, m, g, b, t, ho, ff, fa")
        .eq("environment", APP_ENV)
        .eq("afl_round", aflRound),
      supabaseAdmin
        .from("round_submissions")
        .select("coach_id, coach_name, team_data, is_submitted")
        .eq("environment", APP_ENV)
        .eq("round_number", super8Round)
        .eq("is_submitted", true),
    ]);

    const failedQuery = [regularQuery, finalsQuery, statsQuery, submissionsQuery].find(
      (query) => query.error,
    );
    if (failedQuery?.error) {
      return response(500, {
        success: false,
        error: "Could not load the data required to complete this Finals week.",
        details: failedQuery.error.message,
      });
    }

    const finalsResults = (finalsQuery.data ?? []) as FinalsResult[];
    const alreadyCompleted = finalsResults.filter(
      (result) =>
        matchCodes.includes(result.match_code) &&
        result.coach_1_score !== null &&
        result.coach_2_score !== null,
    );
    if (alreadyCompleted.length > 0) {
      return response(409, {
        success: false,
        error: `Finals Week ${finalsWeek} has already been completed.`,
      });
    }

    const bracket = buildFinalsBracket(
      (regularQuery.data ?? []) as RegularSeasonResult[],
      finalsResults,
    );
    const matches = matchCodes.map((code) =>
      bracket.matches.find((match) => match.code === code),
    );
    if (matches.some((match) => !match?.home || !match.away)) {
      return response(400, {
        success: false,
        error: "The finalists for this week have not all been determined yet.",
      });
    }

    const submissions = (submissionsQuery.data ?? []) as SubmissionRow[];
    const coachIdByTeam = new Map(
      Object.entries(FINALS_TEAM_NAMES).map(([coachId, teamName]) => [
        teamName.trim().toLowerCase(),
        Number(coachId),
      ]),
    );
    const submissionByCoach = new Map(
      submissions.map((submission) => [submission.coach_id, submission]),
    );

    const missingSubmissions: string[] = [];
    for (const match of matches) {
      if (!match?.home || !match.away) continue;
      const homeCoachId = coachIdByTeam.get(match.home.name.trim().toLowerCase());
      const awayCoachId = coachIdByTeam.get(match.away.name.trim().toLowerCase());
      if (!homeCoachId || !submissionByCoach.has(homeCoachId)) {
        missingSubmissions.push(match.home.name);
      }
      if (!awayCoachId || !submissionByCoach.has(awayCoachId)) {
        missingSubmissions.push(match.away.name);
      }
    }

    if (missingSubmissions.length > 0) {
      return response(400, {
        success: false,
        error: `Both teams in every matchup must submit first. Missing: ${[
          ...new Set(missingSubmissions),
        ].join(", ")}.`,
        missingSubmissions: [...new Set(missingSubmissions)],
      });
    }

    const stats = (statsQuery.data ?? []) as FinalsLiveStat[];
    const importedClubs = new Set(
      stats.map((stat) => normaliseClub(stat.afl_team_code)).filter(Boolean),
    );
    if (importedClubs.size < EXPECTED_AFL_CLUB_COUNT) {
      return response(400, {
        success: false,
        error: `AFL Round ${aflRound} is not complete. ${importedClubs.size}/18 AFL clubs have been imported.`,
        importedClubCount: importedClubs.size,
      });
    }

    const resultRows: Array<{
      environment: string;
      season_year: number;
      match_code: FinalsMatchCode;
      coach_1_score: number;
      coach_2_score: number;
      completed_at: string;
      updated_at: string;
    }> = [];

    for (const match of matches) {
      if (!match?.home || !match.away) continue;
      const homeCoachId = coachIdByTeam.get(match.home.name.trim().toLowerCase());
      const awayCoachId = coachIdByTeam.get(match.away.name.trim().toLowerCase());
      const homeSubmission = homeCoachId ? submissionByCoach.get(homeCoachId) : undefined;
      const awaySubmission = awayCoachId ? submissionByCoach.get(awayCoachId) : undefined;

      if (!homeSubmission || !awaySubmission || !homeCoachId || !awayCoachId) continue;

      const homeScore = calculateFinalsLiveScore({
        coachId: homeCoachId,
        coachName: homeSubmission.coach_name,
        teamData: homeSubmission.team_data,
        stats,
        aflRound,
      });
      const awayScore = calculateFinalsLiveScore({
        coachId: awayCoachId,
        coachName: awaySubmission.coach_name,
        teamData: awaySubmission.team_data,
        stats,
        aflRound,
      });

      if (homeScore === awayScore) {
        return response(400, {
          success: false,
          error: `${match.label} is drawn at ${homeScore}-${awayScore}. Resolve the draw before completing the week.`,
        });
      }

      const now = new Date().toISOString();
      resultRows.push({
        environment: APP_ENV,
        season_year: seasonYear,
        match_code: match.code,
        coach_1_score: homeScore,
        coach_2_score: awayScore,
        completed_at: now,
        updated_at: now,
      });
    }

    if (resultRows.length !== matchCodes.length) {
      return response(400, {
        success: false,
        error: "Could not calculate every Finals matchup for this week.",
      });
    }

    const { error: saveError } = await supabaseAdmin
      .from("finals_results")
      .upsert(resultRows, { onConflict: "environment,season_year,match_code" });
    if (saveError) {
      return response(500, {
        success: false,
        error: "Could not save the Finals results.",
        details: saveError.message,
      });
    }

    let nextSuper8Round: number | null = null;
    let nextAflRound: number | null = null;
    if (finalsWeek < 4) {
      nextSuper8Round = super8Round + 1;
      nextAflRound = FINALS_AFL_ROUNDS[finalsWeek];
      const { data: updatedSettings, error: advanceError } = await supabaseAdmin
        .from("app_settings")
        .update({
          current_super8_round: nextSuper8Round,
          current_afl_round: nextAflRound,
          updated_at: new Date().toISOString(),
        })
        .eq("environment", APP_ENV)
        .eq("current_super8_round", super8Round)
        .eq("current_afl_round", aflRound)
        .select("environment")
        .maybeSingle();

      if (advanceError || !updatedSettings) {
        return response(409, {
          success: false,
          error:
            "Finals scores were saved, but Round Control changed before it could advance. Refresh before taking any further action.",
          details: advanceError?.message,
        });
      }
    }

    const completedBracket = buildFinalsBracket(
      (regularQuery.data ?? []) as RegularSeasonResult[],
      [...finalsResults.filter((row) => !matchCodes.includes(row.match_code)), ...resultRows],
    );

    return response(200, {
      success: true,
      message:
        finalsWeek < 4
          ? `Finals Week ${finalsWeek} completed. Round Control advanced to Finals Week ${finalsWeek + 1}, Super 8 Round ${nextSuper8Round}, AFL Round ${nextAflRound}.`
          : `Grand Final completed. ${completedBracket.premier?.name ?? "The winner"} are Premiers.`,
      finalsWeek,
      results: resultRows.map((row) => ({
        matchCode: row.match_code,
        coach1Score: row.coach_1_score,
        coach2Score: row.coach_2_score,
      })),
      nextSuper8Round,
      nextAflRound,
      premier: completedBracket.premier?.name ?? null,
    });
  } catch (error) {
    return response(500, {
      success: false,
      error: error instanceof Error ? error.message : "Unexpected Finals completion error.",
    });
  }
}
