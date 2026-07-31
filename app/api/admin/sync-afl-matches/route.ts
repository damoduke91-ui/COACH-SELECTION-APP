import { NextRequest, NextResponse } from "next/server";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { getAflFixtureOverride } from "../../../../lib/aflFixtureOverrides";

export const dynamic = "force-dynamic";

type AdminSupabaseClient = SupabaseClient<any, "public", any>;

type TeamMapping = {
  aflCode: string;
  appCode: string;
};

type SyncMatchRow = {
  environment: string;
  afl_round: number;
  afl_match_id: number;
  afl_match_provider_id: string;
  home_team_provider_id: string;
  away_team_provider_id: string;
  home_team_code: string;
  away_team_code: string;
  home_app_team_code: string;
  away_app_team_code: string;
  home_team_name: string;
  away_team_name: string;
  utc_start_time: string | null;
  venue: string | null;
  status: string | null;
  updated_at: string;
};

const AFL_MATCHES_URL = "https://aflapi.afl.com.au/afl/v2/matches";

const TEAM_MAPPINGS_BY_AFL_CODE: Record<string, TeamMapping> = {
  ADEL: { aflCode: "ADEL", appCode: "ADE" },
  BL: { aflCode: "BL", appCode: "BRI" },
  CARL: { aflCode: "CARL", appCode: "CAR" },
  COLL: { aflCode: "COLL", appCode: "COL" },
  ESS: { aflCode: "ESS", appCode: "ESS" },
  FRE: { aflCode: "FRE", appCode: "FRE" },
  GCFC: { aflCode: "GCFC", appCode: "GCS" },
  GEEL: { aflCode: "GEEL", appCode: "GEE" },
  GWS: { aflCode: "GWS", appCode: "GWS" },
  HAW: { aflCode: "HAW", appCode: "HAW" },
  MELB: { aflCode: "MELB", appCode: "MEL" },
  NMFC: { aflCode: "NMFC", appCode: "NM" },
  PORT: { aflCode: "PORT", appCode: "PTA" },
  RICH: { aflCode: "RICH", appCode: "RIC" },
  STK: { aflCode: "STK", appCode: "STK" },
  SYD: { aflCode: "SYD", appCode: "SYD" },
  WB: { aflCode: "WB", appCode: "WBU" },
  WCE: { aflCode: "WCE", appCode: "WCE" },
};

const TEAM_MAPPINGS_BY_NAME: Record<string, TeamMapping> = {
  "adelaide crows": TEAM_MAPPINGS_BY_AFL_CODE.ADEL,
  "brisbane lions": TEAM_MAPPINGS_BY_AFL_CODE.BL,
  carlton: TEAM_MAPPINGS_BY_AFL_CODE.CARL,
  collingwood: TEAM_MAPPINGS_BY_AFL_CODE.COLL,
  essendon: TEAM_MAPPINGS_BY_AFL_CODE.ESS,
  fremantle: TEAM_MAPPINGS_BY_AFL_CODE.FRE,
  "gold coast suns": TEAM_MAPPINGS_BY_AFL_CODE.GCFC,
  "geelong cats": TEAM_MAPPINGS_BY_AFL_CODE.GEEL,
  "gws giants": TEAM_MAPPINGS_BY_AFL_CODE.GWS,
  hawthorn: TEAM_MAPPINGS_BY_AFL_CODE.HAW,
  melbourne: TEAM_MAPPINGS_BY_AFL_CODE.MELB,
  "north melbourne": TEAM_MAPPINGS_BY_AFL_CODE.NMFC,
  "port adelaide": TEAM_MAPPINGS_BY_AFL_CODE.PORT,
  richmond: TEAM_MAPPINGS_BY_AFL_CODE.RICH,
  "st kilda": TEAM_MAPPINGS_BY_AFL_CODE.STK,
  "sydney swans": TEAM_MAPPINGS_BY_AFL_CODE.SYD,
  "western bulldogs": TEAM_MAPPINGS_BY_AFL_CODE.WB,
  "west coast eagles": TEAM_MAPPINGS_BY_AFL_CODE.WCE,
};

function getRequiredEnv(name: string): string {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

function isAuthorized(request: NextRequest): boolean {
  const configuredSecret = process.env.LIVE_STATS_ADMIN_SECRET;
  const providedSecret = request.nextUrl.searchParams.get("secret");

  return Boolean(configuredSecret && providedSecret === configuredSecret);
}

function asObject(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

function asArray(value: unknown): any[] {
  return Array.isArray(value) ? value : [];
}

function toText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function firstText(...values: unknown[]): string {
  for (const value of values) {
    const text = toText(value);

    if (text) {
      return text;
    }
  }

  return "";
}

function getMatchesFromResponse(payload: unknown): any[] {
  if (Array.isArray(payload)) {
    return payload;
  }

  const root = asObject(payload);
  const data = asObject(root.data);

  return asArray(root.matches).length
    ? asArray(root.matches)
    : asArray(data.matches);
}

function getTeam(match: Record<string, any>, side: "home" | "away"): Record<string, any> {
  const sideObject = asObject(match[side]);
  const nestedTeam = asObject(sideObject.team);

  return Object.keys(nestedTeam).length ? nestedTeam : sideObject;
}

function getTeamName(team: Record<string, any>): string {
  return firstText(team.name, team.teamName, team.fullName, team.nickname);
}

function getTeamProviderId(team: Record<string, any>): string {
  return firstText(team.providerId, team.provider_id, team.id);
}

function getAflTeamCode(team: Record<string, any>, teamName: string): string {
  return firstText(
    team.abbreviation,
    team.abbrev,
    team.code,
    team.teamCode,
    team.providerCode
  ).toUpperCase() || TEAM_MAPPINGS_BY_NAME[teamName.toLowerCase()]?.aflCode || "";
}

function getTeamMapping(team: Record<string, any>, teamName: string): TeamMapping | null {
  const aflCode = getAflTeamCode(team, teamName);

  if (aflCode && TEAM_MAPPINGS_BY_AFL_CODE[aflCode]) {
    return TEAM_MAPPINGS_BY_AFL_CODE[aflCode];
  }

  return TEAM_MAPPINGS_BY_NAME[teamName.toLowerCase()] ?? null;
}

function getStartTime(match: Record<string, any>): string | null {
  const value = firstText(
    match.utcStartTime,
    match.startTime,
    match.date,
    match.matchDate
  );

  return value || null;
}

function getVenue(match: Record<string, any>): string | null {
  const venue = asObject(match.venue);
  const stadium = asObject(match.stadium);
  const ground = asObject(match.ground);
  const value = firstText(
    venue.name,
    venue.abbreviation,
    stadium.name,
    stadium.abbreviation,
    ground.name,
    ground.abbreviation,
    match.venueName,
    match.venue_name,
    match.stadiumName,
    match.groundName,
    typeof match.venue === "string" ? match.venue : ""
  );

  return value || null;
}

function mapMatchToRow(
  match: unknown,
  aflRound: number,
  environment: string,
  updatedAt: string
): { row: SyncMatchRow | null; reason?: string } {
  const matchObject = asObject(match);
  const aflMatchId = toNumber(matchObject.id ?? matchObject.matchId);
  const aflMatchProviderId = firstText(
    matchObject.providerId,
    matchObject.provider_id,
    matchObject.providerMatchId
  );

  const homeTeam = getTeam(matchObject, "home");
  const awayTeam = getTeam(matchObject, "away");
  const homeTeamName = getTeamName(homeTeam);
  const awayTeamName = getTeamName(awayTeam);
  const homeMapping = getTeamMapping(homeTeam, homeTeamName);
  const awayMapping = getTeamMapping(awayTeam, awayTeamName);

  if (!aflMatchId) {
    return { row: null, reason: "missing AFL match id" };
  }

  if (!aflMatchProviderId) {
    return { row: null, reason: `match ${aflMatchId} missing provider id` };
  }

  if (!homeTeamName || !awayTeamName) {
    return { row: null, reason: `match ${aflMatchId} missing team names` };
  }

  if (!homeMapping || !awayMapping) {
    return {
      row: null,
      reason: `match ${aflMatchId} has unmapped teams: ${homeTeamName} v ${awayTeamName}`,
    };
  }

  const fixtureOverride = getAflFixtureOverride(
    aflRound,
    homeMapping.appCode,
    awayMapping.appCode
  );

  return {
    row: {
      environment,
      afl_round: aflRound,
      afl_match_id: aflMatchId,
      afl_match_provider_id: aflMatchProviderId,
      home_team_provider_id: getTeamProviderId(homeTeam),
      away_team_provider_id: getTeamProviderId(awayTeam),
      home_team_code: homeMapping.aflCode,
      away_team_code: awayMapping.aflCode,
      home_app_team_code: homeMapping.appCode,
      away_app_team_code: awayMapping.appCode,
      home_team_name: homeTeamName,
      away_team_name: awayTeamName,
      utc_start_time: fixtureOverride?.utcStartTime ?? getStartTime(matchObject),
      venue: fixtureOverride?.venue ?? getVenue(matchObject),
      status: firstText(matchObject.status, matchObject.matchStatus) || null,
      updated_at: updatedAt,
    },
  };
}

function getRoundsToSync(request: NextRequest): number[] {
  const round = toNumber(request.nextUrl.searchParams.get("round"));

  if (round) {
    return [round];
  }

  const fromRound = toNumber(request.nextUrl.searchParams.get("fromRound")) ?? 1;
  const toRound = toNumber(request.nextUrl.searchParams.get("toRound")) ?? 24;
  const rounds: number[] = [];

  for (let currentRound = fromRound; currentRound <= toRound; currentRound += 1) {
    rounds.push(currentRound);
  }

  return rounds;
}

async function fetchRoundMatches(round: number): Promise<any[]> {
  const competitionId = process.env.AFL_COMPETITION_ID ?? "1";
  const compSeasonId = process.env.AFL_COMP_SEASON_ID ?? "85";
  const url = new URL(AFL_MATCHES_URL);

  url.searchParams.set("competitionId", competitionId);
  url.searchParams.set("compSeasonId", compSeasonId);
  url.searchParams.set("roundNumber", String(round));

  const response = await fetch(url, {
    headers: {
      accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`AFL fixture request failed for round ${round}: ${response.status}`);
  }

  return getMatchesFromResponse(await response.json());
}

async function upsertMatches(
  supabase: AdminSupabaseClient,
  rows: SyncMatchRow[]
): Promise<void> {
  if (!rows.length) {
    return;
  }

  const { error } = await supabase
    .from("afl_matches")
    .upsert(rows, {
      onConflict: "environment,afl_match_id",
    });

  if (error) {
    throw error;
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const dryRun = request.nextUrl.searchParams.get("dryRun") === "true";
  const environment = process.env.NEXT_PUBLIC_APP_ENV ?? "production";
  const supabaseUrl = getRequiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const serviceRoleKey = getRequiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  const supabase: AdminSupabaseClient = createClient(supabaseUrl, serviceRoleKey);
  const updatedAt = new Date().toISOString();
  const rounds = getRoundsToSync(request);

  const results = [];
  const rowsToWrite: SyncMatchRow[] = [];

  for (const round of rounds) {
    const rawMatches = await fetchRoundMatches(round);
    const mappedRows: SyncMatchRow[] = [];
    const skipped: string[] = [];

    for (const match of rawMatches) {
      const result = mapMatchToRow(match, round, environment, updatedAt);

      if (result.row) {
        mappedRows.push(result.row);
      } else if (result.reason) {
        skipped.push(result.reason);
      }
    }

    rowsToWrite.push(...mappedRows);

    results.push({
      round,
      rawMatches: rawMatches.length,
      mappedMatches: mappedRows.length,
      skipped,
      sample: mappedRows.slice(0, 3),
    });
  }

  if (!dryRun) {
    await upsertMatches(supabase, rowsToWrite);
  }

  return NextResponse.json({
    dryRun,
    syncedAt: updatedAt,
    environment,
    rounds,
    checkedRounds: rounds.length,
    mappedMatches: rowsToWrite.length,
    wroteRows: dryRun ? 0 : rowsToWrite.length,
    results,
  });
}
