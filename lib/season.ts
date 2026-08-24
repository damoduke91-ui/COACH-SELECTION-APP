export type SeasonStatus = "draft" | "active" | "completed" | "archived";

export type ActiveSeasonSettings = {
  environment: "production" | "preview";
  season_year: number | null;
};

export function isSeasonYear(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 2000 && Number(value) <= 2100;
}

export function requireSeasonYear(value: unknown): number {
  if (!isSeasonYear(value)) {
    throw new Error("A controlled season year between 2000 and 2100 is required.");
  }
  return Number(value);
}

export function canWriteSeason(status: SeasonStatus): boolean {
  return status === "draft" || status === "active";
}

export function nextSeasonYear(currentSeasonYear: number): number {
  return requireSeasonYear(currentSeasonYear) + 1;
}

export function buildSeasonYearOptions(
  activeSeasonYear: number,
  availableSeasonYears: unknown[],
): number[] {
  return [...new Set([requireSeasonYear(activeSeasonYear), ...availableSeasonYears.filter(isSeasonYear)])]
    .sort((left, right) => right - left);
}
