import { SupabaseClient } from "@supabase/supabase-js";
import { getPlayersForCoach } from "./playersByCoach";

type AdminSupabaseClient = SupabaseClient;

type FinalisationRow = {
  expected_match_count: number | null;
  live_ready_at: string | null;
  live_finalised_at: string | null;
  csv_imported_at: string | null;
  active_source: "live_fallback" | "csv" | null;
};

type AflMatchCompletionRow = {
  status: string | null;
  final_imported_at: string | null;
};

type FixtureRow = {
  competition_round: number | null;
  afl_round: number | null;
  matchup_index: number | null;
  coach_id: number | null;
  coach_name: string | null;
  opponent_coach_id: number | null;
  opponent_coach_name: string | null;
};

type FixtureMatch = {
  roundNumber: number;
  aflRound: number;
  matchupIndex: number;
  coach1Id: number;
  coach1Name: string;
  coach2Id: number;
  coach2Name: string;
};

type TeamPositionData = {
  onField?: string[];
  emergencies?: string[];
};

type CoachTeamData = Record<string, TeamPositionData>;

type RoundSubmissionRow = {
  coach_id: number | null;
  round_number: number | null;
  team_data: unknown;
  submitted_at: string | null;
};

type PlayerStatRow = {
  afl_team_code: string | null;
  player_name: string | null;
  d: number | null;
  m: number | null;
  g: number | null;
  b: number | null;
  t: number | null;
  ho: number | null;
  ff: number | null;
  fa: number | null;
};

type PlayerClubInfo = {
  club: string;
};

type PlayerBreakdownRow = {
  selectedType: string;
  playerClub: string | null;
  stat: PlayerStatRow | null;
  points: number | null;
  played: boolean;
  clubImported: boolean;
  countsToTotal: boolean;
};

export type LiveFinalisationResult = {
  action: "not_ready" | "skipped" | "finalised" | "failed";
  reason: string;
  aflRound: number;
  expectedMatchCount: number;
  finalMatchCount: number;
  playerRowCount: number;
  clubCount: number;
  savedResultCount?: number;
};

const EXPECTED_AFL_MATCH_COUNT = 9;
const EXPECTED_AFL_CLUB_COUNT = 18;
const POSITION_ORDER = ["KD", "DEF", "MID", "FOR", "KF", "RUC"];
const FINAL_MATCH_STATUSES = new Set([
  "POST_GAME",
  "POSTGAME",
  "CONCLUDED",
  "COMPLETED",
  "FINAL",
  "FULL_TIME",
  "FULL TIME",
]);

function toNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toPositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalisePlayerName(value: string): string {
  return value.trim().toLowerCase();
}

function normaliseClubCode(value: string | null | undefined): string {
  const club = value?.trim().toUpperCase() ?? "";
  const aliases: Record<string, string> = {
    BRL: "BRI",
    NTH: "NM",
  };

  return aliases[club] ?? club;
}

function parseTeamData(value: unknown): CoachTeamData {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};

  const output: CoachTeamData = {};

  for (const [position, rawPositionData] of Object.entries(value as Record<string, unknown>)) {
    if (!rawPositionData || typeof rawPositionData !== "object" || Array.isArray(rawPositionData)) {
      output[position] = { onField: [], emergencies: [] };
      continue;
    }

    const positionData = rawPositionData as Record<string, unknown>;
    output[position] = {
      onField: Array.isArray(positionData.onField)
        ? positionData.onField.filter((player): player is string => typeof player === "string")
        : [],
      emergencies: Array.isArray(positionData.emergencies)
        ? positionData.emergencies.filter((player): player is string => typeof player === "string")
        : [],
    };
  }

  return output;
}

function calculatePlayerPoints(stat: PlayerStatRow | null): number | null {
  if (!stat) return null;

  return (
    toNumber(stat.d) * 3 +
    toNumber(stat.m) * 4 +
    toNumber(stat.g) * 6 +
    toNumber(stat.b) +
    toNumber(stat.t) * 4 +
    toNumber(stat.ho) +
    toNumber(stat.ff) -
    toNumber(stat.fa)
  );
}

function buildPlayerClubLookup(params: {
  coachId: number;
  coachName: string;
}): Map<string, PlayerClubInfo> {
  const pool = getPlayersForCoach(params);
  const lookup = new Map<string, PlayerClubInfo>();

  for (const players of Object.values(pool)) {
    for (const player of players) {
      lookup.set(normalisePlayerName(player.name), {
        club: normaliseClubCode(player.club),
      });
    }
  }

  return lookup;
}

function buildCoachBreakdownRows(params: {
  teamData: CoachTeamData;
  statsMap: Map<string, PlayerStatRow>;
  importedClubCodes: Set<string>;
  playerLookup: Map<string, PlayerClubInfo>;
}): PlayerBreakdownRow[] {
  const { teamData, statsMap, importedClubCodes, playerLookup } = params;
  const usedEmergencyNames = new Set<string>();
  const rows: PlayerBreakdownRow[] = [];
  const positionKeys = Array.from(new Set([...POSITION_ORDER, ...Object.keys(teamData)])).filter(
    (position) => Boolean(teamData[position])
  );

  const getPlayerClub = (playerName: string, stat: PlayerStatRow | null): string | null => {
    const fromLookup = playerLookup.get(normalisePlayerName(playerName))?.club ?? null;
    const fromStat = normaliseClubCode(stat?.afl_team_code) || null;
    return fromLookup || fromStat;
  };

  for (const position of positionKeys) {
    const positionData = teamData[position] ?? {};
    const onField = Array.isArray(positionData.onField) ? positionData.onField : [];
    const emergencies = Array.isArray(positionData.emergencies) ? positionData.emergencies : [];
    const emergencyStats = emergencies.map((playerName, index) => {
      const stat = statsMap.get(normalisePlayerName(playerName)) ?? null;
      const playerClub = getPlayerClub(playerName, stat);

      return {
        playerName,
        selectedType: `I${index + 1}`,
        stat,
        playerClub,
        played: Boolean(stat),
        clubImported: playerClub ? importedClubCodes.has(playerClub) : false,
      };
    });

    for (const playerName of onField) {
      const stat = statsMap.get(normalisePlayerName(playerName)) ?? null;
      const playerClub = getPlayerClub(playerName, stat);
      const clubImported = playerClub ? importedClubCodes.has(playerClub) : false;
      const played = Boolean(stat);

      rows.push({
        selectedType: "X",
        playerClub,
        stat,
        points: calculatePlayerPoints(stat),
        played,
        clubImported,
        countsToTotal: played,
      });

      if (played || !clubImported) continue;

      let replacement: (typeof emergencyStats)[number] | null = null;

      for (const emergency of emergencyStats) {
        if (usedEmergencyNames.has(normalisePlayerName(emergency.playerName))) continue;
        if (!emergency.clubImported) break;

        if (emergency.played && emergency.stat) {
          replacement = emergency;
          break;
        }
      }

      if (replacement?.stat) {
        usedEmergencyNames.add(normalisePlayerName(replacement.playerName));
        rows.push({
          selectedType: replacement.selectedType,
          playerClub: replacement.playerClub,
          stat: replacement.stat,
          points: calculatePlayerPoints(replacement.stat),
          played: true,
          clubImported: replacement.clubImported,
          countsToTotal: true,
        });
      }
    }

    for (const emergency of emergencyStats) {
      if (usedEmergencyNames.has(normalisePlayerName(emergency.playerName))) continue;

      rows.push({
        selectedType: emergency.selectedType,
        playerClub: emergency.playerClub,
        stat: emergency.stat,
        points: calculatePlayerPoints(emergency.stat),
        played: emergency.played,
        clubImported: emergency.clubImported,
        countsToTotal: false,
      });
    }
  }

  return rows;
}

function calculateTeamTotal(rows: PlayerBreakdownRow[]): number {
  return rows.reduce((total, row) => {
    if (!row.countsToTotal || row.points === null) return total;
    return total + row.points;
  }, 0);
}

function buildFixtureMatches(rows: FixtureRow[]): FixtureMatch[] {
  const matches = new Map<string, FixtureMatch>();

  for (const row of rows) {
    const roundNumber = toPositiveInteger(row.competition_round);
    const aflRound = toPositiveInteger(row.afl_round);
    const matchupIndex = toPositiveInteger(row.matchup_index);
    const coach1Id = toPositiveInteger(row.coach_id);
    const coach2Id = toPositiveInteger(row.opponent_coach_id);
    const coach1Name = row.coach_name?.trim() ?? "";
    const coach2Name = row.opponent_coach_name?.trim() ?? "";

    if (
      !roundNumber ||
      !aflRound ||
      !matchupIndex ||
      !coach1Id ||
      !coach2Id ||
      !coach1Name ||
      !coach2Name
    ) {
      continue;
    }

    const key = `${roundNumber}:${matchupIndex}`;

    if (!matches.has(key)) {
      matches.set(key, {
        roundNumber,
        aflRound,
        matchupIndex,
        coach1Id,
        coach1Name,
        coach2Id,
        coach2Name,
      });
    }
  }

  return Array.from(matches.values()).sort((a, b) => a.matchupIndex - b.matchupIndex);
}

async function updateFinalisationProgress(params: {
  supabase: AdminSupabaseClient;
  environment: string;
  seasonYear: number;
  aflRound: number;
  expectedMatchCount: number;
  finalMatchCount: number;
  playerRowCount: number;
  clubCount: number;
  updatedAt: string;
  liveReadyAt?: string;
  liveFinalisedAt?: string;
  activeSource?: "live_fallback" | "csv";
}): Promise<void> {
  const payload: Record<string, unknown> = {
    environment: params.environment,
    season_year: params.seasonYear,
    afl_round: params.aflRound,
    expected_match_count: params.expectedMatchCount,
    final_match_count: params.finalMatchCount,
    player_row_count: params.playerRowCount,
    club_count: params.clubCount,
    updated_at: params.updatedAt,
  };

  if (params.liveReadyAt) payload.live_ready_at = params.liveReadyAt;
  if (params.liveFinalisedAt) payload.live_finalised_at = params.liveFinalisedAt;
  if (params.activeSource) payload.active_source = params.activeSource;

  const { error } = await params.supabase.from("afl_round_finalisation").upsert(payload, {
    onConflict: "environment,season_year,afl_round",
  });

  if (error) throw new Error(`Finalisation progress update failed: ${error.message}`);
}

export async function finaliseSuper8RoundFromLiveStats(params: {
  supabase: AdminSupabaseClient;
  environment: string;
  seasonYear: number;
  aflRound: number;
  finalisedAt: string;
}): Promise<LiveFinalisationResult> {
  const { supabase, environment, seasonYear, aflRound, finalisedAt } = params;

  try {
    const { data: finalisationData, error: finalisationError } = await supabase
      .from("afl_round_finalisation")
      .select("expected_match_count, live_ready_at, live_finalised_at, csv_imported_at, active_source")
      .eq("environment", environment)
      .eq("season_year", seasonYear)
      .eq("afl_round", aflRound)
      .maybeSingle();

    if (finalisationError) {
      throw new Error(`Finalisation state load failed: ${finalisationError.message}`);
    }

    const finalisation = finalisationData as FinalisationRow | null;
    const expectedMatchCount = toPositiveInteger(finalisation?.expected_match_count) ?? EXPECTED_AFL_MATCH_COUNT;

    const [{ data: matchData, error: matchError }, { data: statsData, error: statsError }] =
      await Promise.all([
        supabase
          .from("afl_matches")
          .select("status, final_imported_at")
          .eq("environment", environment)
          .eq("season_year", seasonYear)
          .eq("afl_round", aflRound),
        supabase
          .from("afl_player_round_stats")
          .select("afl_team_code, player_name, d, m, g, b, t, ho, ff, fa")
          .eq("environment", environment)
          .eq("season_year", seasonYear)
          .eq("afl_round", aflRound),
      ]);

    if (matchError) throw new Error(`AFL match completion load failed: ${matchError.message}`);
    if (statsError) throw new Error(`AFL player stats load failed: ${statsError.message}`);

    const matches = (matchData ?? []) as AflMatchCompletionRow[];
    const stats = (statsData ?? []) as PlayerStatRow[];
    const finalMatchCount = matches.filter(
      (match) =>
        FINAL_MATCH_STATUSES.has((match.status ?? "").trim().toUpperCase()) &&
        Boolean(match.final_imported_at)
    ).length;
    const importedClubCodes = new Set(
      stats.map((row) => normaliseClubCode(row.afl_team_code)).filter(Boolean)
    );
    const playerRowCount = stats.length;
    const clubCount = importedClubCodes.size;
    const isLiveReady =
      matches.length >= expectedMatchCount &&
      finalMatchCount >= expectedMatchCount &&
      clubCount >= EXPECTED_AFL_CLUB_COUNT;

    await updateFinalisationProgress({
      supabase,
      environment,
      seasonYear,
      aflRound,
      expectedMatchCount,
      finalMatchCount,
      playerRowCount,
      clubCount,
      updatedAt: finalisedAt,
      liveReadyAt: isLiveReady ? finalisation?.live_ready_at ?? finalisedAt : undefined,
    });

    const baseResult = {
      aflRound,
      expectedMatchCount,
      finalMatchCount,
      playerRowCount,
      clubCount,
    };

    if (!isLiveReady) {
      return {
        ...baseResult,
        action: "not_ready",
        reason: "Waiting for all AFL matches and all 18 clubs to have complete final player stats.",
      };
    }

    if (finalisation?.csv_imported_at || finalisation?.active_source === "csv") {
      return {
        ...baseResult,
        action: "skipped",
        reason: "CSV is already the active final-score source for this round.",
      };
    }

    if (finalisation?.live_finalised_at) {
      return {
        ...baseResult,
        action: "skipped",
        reason: "Live fallback results were already finalised for this round.",
      };
    }

    const { data: fixtureData, error: fixtureError } = await supabase
      .from("season_fixture")
      .select(
        "competition_round, afl_round, matchup_index, coach_id, coach_name, opponent_coach_id, opponent_coach_name"
      )
      .eq("environment", environment)
      .eq("season_year", seasonYear)
      .eq("afl_round", aflRound);

    if (fixtureError) throw new Error(`Super 8 fixture load failed: ${fixtureError.message}`);

    const fixtureMatches = buildFixtureMatches((fixtureData ?? []) as FixtureRow[]);

    if (fixtureMatches.length === 0) {
      throw new Error(`No Super 8 fixture matches were found for AFL Round ${aflRound}.`);
    }

    const super8Rounds = Array.from(new Set(fixtureMatches.map((match) => match.roundNumber)));
    const { data: submissionData, error: submissionError } = await supabase
      .from("round_submissions")
      .select("coach_id, round_number, team_data, submitted_at")
      .eq("environment", environment)
      .eq("season_year", seasonYear)
      .eq("is_submitted", true)
      .in("round_number", super8Rounds)
      .order("submitted_at", { ascending: false });

    if (submissionError) throw new Error(`Submitted team load failed: ${submissionError.message}`);

    const submissions = (submissionData ?? []) as RoundSubmissionRow[];
    const submissionMap = new Map<string, RoundSubmissionRow>();

    for (const submission of submissions) {
      const roundNumber = toPositiveInteger(submission.round_number);
      const coachId = toPositiveInteger(submission.coach_id);
      if (!roundNumber || !coachId) continue;

      const key = `${roundNumber}:${coachId}`;
      if (!submissionMap.has(key)) submissionMap.set(key, submission);
    }

    const statsMap = new Map<string, PlayerStatRow>();
    for (const stat of stats) {
      const playerName = stat.player_name?.trim() ?? "";
      if (playerName) statsMap.set(normalisePlayerName(playerName), stat);
    }

    const resultRows: Record<string, unknown>[] = [];

    for (const match of fixtureMatches) {
      const coach1Submission = submissionMap.get(`${match.roundNumber}:${match.coach1Id}`);
      const coach2Submission = submissionMap.get(`${match.roundNumber}:${match.coach2Id}`);

      if (!coach1Submission || !coach2Submission) {
        throw new Error(
          `Submitted teams are missing for Super 8 Round ${match.roundNumber}, Match ${match.matchupIndex}.`
        );
      }

      const coach1Rows = buildCoachBreakdownRows({
        teamData: parseTeamData(coach1Submission.team_data),
        statsMap,
        importedClubCodes,
        playerLookup: buildPlayerClubLookup({ coachId: match.coach1Id, coachName: match.coach1Name }),
      });
      const coach2Rows = buildCoachBreakdownRows({
        teamData: parseTeamData(coach2Submission.team_data),
        statsMap,
        importedClubCodes,
        playerLookup: buildPlayerClubLookup({ coachId: match.coach2Id, coachName: match.coach2Name }),
      });
      const pendingSelectedPlayers = [...coach1Rows, ...coach2Rows].filter(
        (row) => row.selectedType === "X" && !row.played && !row.clubImported
      ).length;

      if (pendingSelectedPlayers > 0) {
        throw new Error(
          `Player club mapping is incomplete for Super 8 Round ${match.roundNumber}, Match ${match.matchupIndex}.`
        );
      }

      resultRows.push({
        environment,
        season_year: seasonYear,
        round_number: match.roundNumber,
        afl_round: match.aflRound,
        matchup_index: match.matchupIndex,
        coach_1_id: match.coach1Id,
        coach_1_name: match.coach1Name,
        coach_1_score: calculateTeamTotal(coach1Rows),
        coach_2_id: match.coach2Id,
        coach_2_name: match.coach2Name,
        coach_2_score: calculateTeamTotal(coach2Rows),
        imported_at: finalisedAt,
        score_source: "live_fallback",
        source_updated_at: finalisedAt,
      });
    }

    const { error: resultError } = await supabase.from("super8_match_results").upsert(resultRows, {
      onConflict: "environment,season_year,round_number,matchup_index",
    });

    if (resultError) throw new Error(`Live fallback result save failed: ${resultError.message}`);

    await updateFinalisationProgress({
      supabase,
      environment,
      seasonYear,
      aflRound,
      expectedMatchCount,
      finalMatchCount,
      playerRowCount,
      clubCount,
      updatedAt: finalisedAt,
      liveReadyAt: finalisation?.live_ready_at ?? finalisedAt,
      liveFinalisedAt: finalisedAt,
      activeSource: "live_fallback",
    });

    return {
      ...baseResult,
      action: "finalised",
      reason: "Super 8 results were saved automatically from complete live AFL stats.",
      savedResultCount: resultRows.length,
    };
  } catch (error) {
    return {
      action: "failed",
      reason: error instanceof Error ? error.message : "Unknown live finalisation error",
      aflRound,
      expectedMatchCount: EXPECTED_AFL_MATCH_COUNT,
      finalMatchCount: 0,
      playerRowCount: 0,
      clubCount: 0,
    };
  }
}
