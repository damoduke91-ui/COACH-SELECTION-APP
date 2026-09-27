export function isLiveStatsAuthorized(
  headers: Pick<Headers, "get">,
  params: URLSearchParams,
  secrets: { adminSecret?: string; cronSecret?: string },
): boolean {
  if (secrets.cronSecret && headers.get("authorization") === `Bearer ${secrets.cronSecret}`) return true;
  const supplied = params.get("secret") ?? headers.get("x-admin-secret");
  return Boolean(secrets.adminSecret && supplied === secrets.adminSecret);
}

export class AflSeasonConfigurationError extends Error {}

// 85 is verified as the 2026 AFL Premiership, not a rolling/current-season id.
export function resolveAflSeasonId(seasonYear: number, configured: string | undefined): string {
  const id = configured?.trim() || (seasonYear === 2026 ? "85" : "");
  if (!/^\d+$/.test(id) || Number(id) < 1) {
    throw new AflSeasonConfigurationError(`Configure AFL_COMP_SEASON_ID for season ${seasonYear} before syncing or importing AFL fixtures.`);
  }
  if (id === "85" && seasonYear !== 2026) {
    throw new AflSeasonConfigurationError(`AFL_COMP_SEASON_ID 85 belongs to 2026, but the controlled season is ${seasonYear}. No fixture or stats writes were attempted.`);
  }
  return id;
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

export function assertAflFixtureSeason(matches: unknown[], seasonYear: number): void {
  for (const raw of matches) {
    const match = object(raw);
    const season = object(match.compSeason);
    const years = [
      /^CD_S(\d{4})/.exec(String(season.providerId ?? ""))?.[1],
      /^CD_M(\d{4})/.exec(String(match.providerId ?? ""))?.[1],
      /\b(20\d{2})\b/.exec(String(season.name ?? ""))?.[1],
    ].filter((year): year is string => Boolean(year)).map(Number);
    if (years.length === 0 || years.some((year) => year !== seasonYear)) {
      throw new AflSeasonConfigurationError(`AFL fixture season could not be verified as ${seasonYear}. Check AFL_COMP_SEASON_ID; no fixture or stats writes were attempted.`);
    }
  }
}
