import { SupabaseClient } from "@supabase/supabase-js";

export type AflMatchRow = {
  id: number;
  environment: string;
  season_year: number;
  afl_round: number;
  afl_match_id: number;
  afl_match_provider_id: string;
  home_team_provider_id: string;
  away_team_provider_id: string;
  home_team_code: string | null;
  away_team_code: string | null;
  home_app_team_code: string | null;
  away_app_team_code: string | null;
  home_team_name: string | null;
  away_team_name: string | null;
  status?: string | null;
};

export type AflPlayerNameAliasRow = {
  afl_name: string;
  app_name: string;
};

export type AflPlayerStat = {
  teamId?: string;
  playerStats?: {
    stats?: Record<string, unknown>;
    player?: {
      playerName?: {
        givenName?: string;
        surname?: string;
      };
    };
  };
  player?: {
    player?: {
      player?: {
        playerName?: {
          givenName?: string;
          surname?: string;
        };
      };
    };
  };
};

export type AflPlayerStatsResponse = {
  homeTeamPlayerStats?: AflPlayerStat[];
  awayTeamPlayerStats?: AflPlayerStat[];
};

export type AflPlayerRoundStatUpsertRow = {
  environment: string;
  season_year: number;
  afl_round: number;
  afl_team_name: string | null;
  afl_team_code: string;
  player_name: string;
  k: number;
  hb: number;
  d: number;
  m: number;
  g: number;
  b: number;
  t: number;
  ho: number;
  ga: number;
  i50: number;
  cl: number;
  cg: number;
  r50: number;
  ff: number;
  fa: number;
  af: number;
  sc: number;
  imported_at: string;
};

export type MappedAflPlayerStatRow = {
  row: AflPlayerRoundStatUpsertRow;
  afl_player_name: string;
};

const AFL_TOKEN_URL = "https://api.afl.com.au/cfs/afl/WMCTok";
const AFL_PLAYER_STATS_URL = "https://api.afl.com.au/cfs/afl/playerStats/match";

export const FINAL_AFL_MATCH_STATUSES = new Set(["POST_GAME", "POSTGAME", "CONCLUDED", "COMPLETED"]);

export function toInt(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) return Math.trunc(value);

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return Math.trunc(parsed);
  }

  return 0;
}

function getNestedNumber(stats: Record<string, unknown>, keys: string[]): number {
  let current: unknown = stats;

  for (const key of keys) {
    if (!current || typeof current !== "object") return 0;
    current = (current as Record<string, unknown>)[key];
  }

  return toInt(current);
}

function getRawPlayerName(stat: AflPlayerStat): string {
  const directName = stat.playerStats?.player?.playerName;
  const nestedName = stat.player?.player?.player?.playerName;
  const name = directName ?? nestedName;

  return [name?.givenName, name?.surname].filter(Boolean).join(" ").trim();
}

function getTeamInfo(match: AflMatchRow, teamId: string | undefined): { code: string; name: string | null } | null {
  if (teamId === match.home_team_provider_id) {
    return {
      code: match.home_app_team_code ?? match.home_team_code ?? "",
      name: match.home_team_name,
    };
  }

  if (teamId === match.away_team_provider_id) {
    return {
      code: match.away_app_team_code ?? match.away_team_code ?? "",
      name: match.away_team_name,
    };
  }

  return null;
}

export async function fetchAflToken(): Promise<string> {
  const response = await fetch(AFL_TOKEN_URL, {
    method: "POST",
    headers: {
      "user-agent": "Mozilla/5.0",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`AFL token request failed: ${response.status}`);
  }

  const json = (await response.json()) as { token?: string };

  if (!json.token) {
    throw new Error("AFL token response did not include a token.");
  }

  return json.token;
}

export async function fetchAflPlayerStats(providerMatchId: string, token: string): Promise<AflPlayerStatsResponse> {
  const response = await fetch(`${AFL_PLAYER_STATS_URL}/${providerMatchId}`, {
    headers: {
      "user-agent": "Mozilla/5.0",
      "x-media-mis-token": token,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`AFL player stats request failed: ${response.status}`);
  }

  return (await response.json()) as AflPlayerStatsResponse;
}

export async function loadAflPlayerNameAliases(
  supabase: SupabaseClient,
  environment: string
): Promise<Map<string, string>> {
  const { data, error } = await supabase
    .from("afl_player_name_aliases")
    .select("afl_name, app_name")
    .eq("environment", environment);

  if (error) {
    throw new Error(`Alias load failed: ${error.message}`);
  }

  return new Map(((data ?? []) as AflPlayerNameAliasRow[]).map((row) => [row.afl_name, row.app_name]));
}

export function flattenAflPlayerStats(stats: AflPlayerStatsResponse): AflPlayerStat[] {
  return [...(stats.homeTeamPlayerStats ?? []), ...(stats.awayTeamPlayerStats ?? [])];
}

export function mapAflPlayerStat(
  match: AflMatchRow,
  stat: AflPlayerStat,
  importedAt: string,
  nameAliases: Map<string, string>
): MappedAflPlayerStatRow | null {
  const aflPlayerName = getRawPlayerName(stat);
  const playerName = nameAliases.get(aflPlayerName) ?? aflPlayerName;
  const teamInfo = getTeamInfo(match, stat.teamId);
  const stats = stat.playerStats?.stats ?? {};

  if (!playerName || !teamInfo?.code) return null;

  return {
    afl_player_name: aflPlayerName,
    row: {
      environment: match.environment,
      season_year: match.season_year,
      afl_round: match.afl_round,
      afl_team_name: teamInfo.name,
      afl_team_code: teamInfo.code,
      player_name: playerName,
      k: toInt(stats.kicks),
      hb: toInt(stats.handballs),
      d: toInt(stats.disposals),
      m: toInt(stats.marks),
      g: toInt(stats.goals),
      b: toInt(stats.behinds),
      t: toInt(stats.tackles),
      ho: toInt(stats.hitouts),
      ga: toInt(stats.goalAssists),
      i50: toInt(stats.inside50s),
      cl: getNestedNumber(stats, ["clearances", "totalClearances"]),
      cg: toInt(stats.clangers),
      r50: toInt(stats.rebound50s),
      ff: toInt(stats.freesFor),
      fa: toInt(stats.freesAgainst),
      af: toInt(stats.dreamTeamPoints),
      sc: 0,
      imported_at: importedAt,
    },
  };
}

export function mapAflPlayerStats(
  match: AflMatchRow,
  stats: AflPlayerStatsResponse,
  importedAt: string,
  nameAliases: Map<string, string>
): MappedAflPlayerStatRow[] {
  return flattenAflPlayerStats(stats)
    .map((stat) => mapAflPlayerStat(match, stat, importedAt, nameAliases))
    .filter((row): row is MappedAflPlayerStatRow => row !== null);
}
