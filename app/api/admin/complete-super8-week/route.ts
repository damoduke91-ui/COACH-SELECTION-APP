import { NextRequest, NextResponse } from "next/server";
import { APP_ENV, supabaseAdmin } from "../../../../lib/supabaseAdmin";

export const dynamic = "force-dynamic";

type ProfileRow = {
  id: string;
  role: "admin" | "coach" | string | null;
  environment?: string | null;
};

type AppSettingsRow = {
  environment: string;
  current_afl_round: number | null;
};

type FixtureRow = {
  competition_round: number | null;
  afl_round: number | null;
  matchup_index: number | null;
  coach_id?: number | null;
  coach_name?: string | null;
  opponent_coach_id?: number | null;
  opponent_coach_name?: string | null;
};

type MatchResultRow = {
  round_number: number | null;
  afl_round: number | null;
  matchup_index: number | null;
  coach_1_name: string | null;
  coach_1_score: number | null;
  coach_2_name: string | null;
  coach_2_score: number | null;
};

type LadderRow = {
  position: number;
  team: string;
  played: number;
  wins: number;
  losses: number;
  draws: number;
  points_for: number;
  points_against: number;
  percentage: number;
  ladder_points: number;
};

const EXPECTED_AFL_CLUB_COUNT = 18;

function jsonResponse(status: number, payload: Record<string, unknown>) {
  return NextResponse.json(payload, { status });
}

function getBearerToken(request: NextRequest): string | null {
  const header = request.headers.get("authorization") ?? "";
  const [scheme, token] = header.split(" ");

  if (scheme?.toLowerCase() !== "bearer" || !token) return null;
  return token;
}

function toNumber(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildMatchKey(roundNumber: number, matchupIndex: number): string {
  return `${roundNumber}:${matchupIndex}`;
}

function buildLadderRows(results: MatchResultRow[]): LadderRow[] {
  const map = new Map<string, Omit<LadderRow, "position" | "percentage">>();

  function getTeam(name: string) {
    if (!map.has(name)) {
      map.set(name, {
        team: name,
        played: 0,
        wins: 0,
        losses: 0,
        draws: 0,
        points_for: 0,
        points_against: 0,
        ladder_points: 0,
      });
    }

    return map.get(name)!;
  }

  for (const result of results) {
    if (
      !result.coach_1_name ||
      !result.coach_2_name ||
      result.coach_1_score === null ||
      result.coach_2_score === null
    ) {
      continue;
    }

    const team1 = getTeam(result.coach_1_name);
    const team2 = getTeam(result.coach_2_name);
    const score1 = Number(result.coach_1_score);
    const score2 = Number(result.coach_2_score);

    team1.played += 1;
    team2.played += 1;
    team1.points_for += score1;
    team1.points_against += score2;
    team2.points_for += score2;
    team2.points_against += score1;

    if (score1 > score2) {
      team1.wins += 1;
      team1.ladder_points += 4;
      team2.losses += 1;
    } else if (score2 > score1) {
      team2.wins += 1;
      team2.ladder_points += 4;
      team1.losses += 1;
    } else {
      team1.draws += 1;
      team2.draws += 1;
      team1.ladder_points += 2;
      team2.ladder_points += 2;
    }
  }

  return Array.from(map.values())
    .map((team) => ({
      ...team,
      percentage:
        team.points_against > 0
          ? (team.points_for / team.points_against) * 100
          : 0,
    }))
    .sort((a, b) => {
      if (b.ladder_points !== a.ladder_points) {
        return b.ladder_points - a.ladder_points;
      }

      return b.points_for - a.points_for;
    })
    .map((team, index) => ({
      position: index + 1,
      ...team,
    }));
}

async function getCurrentUserProfile(request: NextRequest): Promise<ProfileRow | null> {
  const token = getBearerToken(request);

  if (!token) return null;

  const { data: userData, error: userError } =
    await supabaseAdmin.auth.getUser(token);

  if (userError || !userData.user) return null;

  const { data: profile, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("id, role, environment")
    .eq("id", userData.user.id)
    .eq("environment", APP_ENV)
    .maybeSingle();

  if (profileError || !profile) return null;

  return profile as ProfileRow;
}

async function maybeSnapshotLadder(
  shouldSnapshot: boolean,
  roundNumber: number | null,
  aflRound: number,
  ladderRows: LadderRow[]
): Promise<{ attempted: boolean; saved: boolean; message: string }> {
  if (!shouldSnapshot) {
    return {
      attempted: false,
      saved: false,
      message: "Ladder snapshot skipped by request.",
    };
  }

  if (!roundNumber) {
    return {
      attempted: true,
      saved: false,
      message: "Ladder calculated, but no Super 8 round was available to snapshot.",
    };
  }

  const rowsToInsert = ladderRows.map((row) => ({
    environment: APP_ENV,
    round_number: roundNumber,
    afl_round: aflRound,
    position: row.position,
    team: row.team,
    played: row.played,
    wins: row.wins,
    losses: row.losses,
    draws: row.draws,
    points_for: row.points_for,
    points_against: row.points_against,
    percentage: row.percentage,
    ladder_points: row.ladder_points,
  }));

  const { error } = await supabaseAdmin
    .from("super8_ladder_snapshots")
    .upsert(rowsToInsert, {
      onConflict: "environment,round_number,team",
    });

  if (error) {
    return {
      attempted: true,
      saved: false,
      message:
        "Ladder snapshot table unavailable. Week completion still continued successfully.",
    };
  }

  return {
    attempted: true,
    saved: true,
    message: "Ladder snapshot saved.",
  };
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
      snapshotLadder?: boolean;
    };

    const { data: settingsData, error: settingsError } = await supabaseAdmin
      .from("app_settings")
      .select("environment, current_afl_round")
      .eq("environment", APP_ENV)
      .maybeSingle();

    if (settingsError) {
      return jsonResponse(500, {
        success: false,
        error: "Could not load app settings.",
        details: settingsError.message,
      });
    }

    const settings = settingsData as AppSettingsRow | null;
    const currentAflRound = toNumber(settings?.current_afl_round);

    if (!currentAflRound || currentAflRound < 1) {
      return jsonResponse(400, {
        success: false,
        error: "Current AFL round is not set.",
      });
    }

    const { data: statsData, error: statsError } = await supabaseAdmin
      .from("afl_player_round_stats")
      .select("afl_team_code")
      .eq("environment", APP_ENV)
      .eq("afl_round", currentAflRound);

    if (statsError) {
      return jsonResponse(500, {
        success: false,
        error: "Could not validate imported AFL clubs.",
        details: statsError.message,
      });
    }

    const importedClubCodes = new Set(
      (statsData ?? [])
        .map((row) =>
          String((row as { afl_team_code?: string | null }).afl_team_code ?? "")
            .trim()
            .toUpperCase()
        )
        .filter(Boolean)
    );

    if (importedClubCodes.size < EXPECTED_AFL_CLUB_COUNT) {
      return jsonResponse(400, {
        success: false,
        error: "Current AFL round is not complete yet.",
        importedClubCount: importedClubCodes.size,
        expectedClubCount: EXPECTED_AFL_CLUB_COUNT,
      });
    }

    const { data: fixtureData, error: fixtureError } = await supabaseAdmin
      .from("season_fixture")
      .select(
        "competition_round, afl_round, matchup_index, coach_id, coach_name, opponent_coach_id, opponent_coach_name"
      )
      .eq("environment", APP_ENV)
      .eq("afl_round", currentAflRound);

    if (fixtureError) {
      return jsonResponse(500, {
        success: false,
        error: "Could not load current fixture.",
        details: fixtureError.message,
      });
    }

    const fixtureRows = (fixtureData ?? []) as FixtureRow[];
    const uniqueFixtureMatches = new Map<string, FixtureRow>();

    for (const row of fixtureRows) {
      const roundNumber = toNumber(row.competition_round);
      const matchupIndex = toNumber(row.matchup_index);

      if (!roundNumber || !matchupIndex) continue;

      const key = buildMatchKey(roundNumber, matchupIndex);

      if (!uniqueFixtureMatches.has(key)) {
        uniqueFixtureMatches.set(key, row);
      }
    }

    if (uniqueFixtureMatches.size === 0) {
      return jsonResponse(400, {
        success: false,
        error: `No Super 8 fixture rows found for AFL Round ${currentAflRound}.`,
      });
    }

    const currentSuper8Round = toNumber(
      Array.from(uniqueFixtureMatches.values())[0]?.competition_round
    );

    const { data: matchResultsData, error: matchResultsError } =
      await supabaseAdmin
        .from("super8_match_results")
        .select(
          "round_number, afl_round, matchup_index, coach_1_name, coach_1_score, coach_2_name, coach_2_score"
        )
        .eq("afl_round", currentAflRound);

    if (matchResultsError) {
      return jsonResponse(500, {
        success: false,
        error: "Could not validate Super 8 match results.",
        details: matchResultsError.message,
      });
    }

    const matchResults = (matchResultsData ?? []) as MatchResultRow[];
    const resultByFixtureMatch = new Map<string, MatchResultRow>();

    for (const result of matchResults) {
      const roundNumber = toNumber(result.round_number);
      const matchupIndex = toNumber(result.matchup_index);

      if (!roundNumber || !matchupIndex) continue;

      resultByFixtureMatch.set(buildMatchKey(roundNumber, matchupIndex), result);
    }

    const missingResults: string[] = [];

    for (const [key, row] of uniqueFixtureMatches.entries()) {
      const result = resultByFixtureMatch.get(key);

      if (
        !result ||
        result.coach_1_score === null ||
        result.coach_2_score === null
      ) {
        missingResults.push(
          `Super 8 Round ${row.competition_round}, Match ${row.matchup_index}`
        );
      }
    }

    if (missingResults.length > 0) {
      return jsonResponse(400, {
        success: false,
        error: "Not all Super 8 match results exist yet.",
        missingResults,
      });
    }

    const { data: ladderResultsData, error: ladderResultsError } =
      await supabaseAdmin
        .from("super8_match_results")
        .select(
          "round_number, afl_round, matchup_index, coach_1_name, coach_1_score, coach_2_name, coach_2_score"
        )
        .lte("afl_round", currentAflRound);

    if (ladderResultsError) {
      return jsonResponse(500, {
        success: false,
        error: "Could not calculate ladder snapshot.",
        details: ladderResultsError.message,
      });
    }

    const ladderRows = buildLadderRows(
      (ladderResultsData ?? []) as MatchResultRow[]
    );

    const ladderSnapshot = await maybeSnapshotLadder(
      body.snapshotLadder === true,
      currentSuper8Round,
      currentAflRound,
      ladderRows
    );

    const { data: futureFixtureData, error: futureFixtureError } =
      await supabaseAdmin
        .from("season_fixture")
        .select("competition_round, afl_round, matchup_index")
        .eq("environment", APP_ENV)
        .gt("afl_round", currentAflRound)
        .order("afl_round", { ascending: true })
        .order("competition_round", { ascending: true })
        .order("matchup_index", { ascending: true });

    if (futureFixtureError) {
      return jsonResponse(500, {
        success: false,
        error: "Could not prepare next fixture state.",
        details: futureFixtureError.message,
      });
    }

    const futureFixtureRows = (futureFixtureData ?? []) as FixtureRow[];
    const nextAflRound = toNumber(futureFixtureRows[0]?.afl_round);

    if (!nextAflRound) {
      return jsonResponse(400, {
        success: false,
        error: `AFL Round ${currentAflRound} is complete, but no future fixture rows exist in season_fixture.`,
      });
    }

    const nextFixtureRows = futureFixtureRows.filter(
      (row) => toNumber(row.afl_round) === nextAflRound
    );

    const nextSuper8Rounds = Array.from(
      new Set(
        nextFixtureRows
          .map((row) => toNumber(row.competition_round))
          .filter((round): round is number => typeof round === "number")
      )
    ).sort((a, b) => a - b);

    const { error: updateError } = await supabaseAdmin
      .from("app_settings")
      .update({
        current_afl_round: nextAflRound,
      })
      .eq("environment", APP_ENV);

    if (updateError) {
      return jsonResponse(500, {
        success: false,
        error: "Could not advance AFL round.",
        details: updateError.message,
      });
    }

    return jsonResponse(200, {
      success: true,
      message: `Super 8 week completed successfully. AFL Round advanced from ${currentAflRound} to ${nextAflRound}.`,
      previousAflRound: currentAflRound,
      nextAflRound,
      previousSuper8Round: currentSuper8Round,
      nextSuper8Round: nextSuper8Rounds[0] ?? null,
      nextSuper8Rounds,
      ladderSnapshot,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Unknown server error.";

    return jsonResponse(500, {
      success: false,
      error: "Complete Super 8 Week failed unexpectedly.",
      details: message,
    });
  }
}