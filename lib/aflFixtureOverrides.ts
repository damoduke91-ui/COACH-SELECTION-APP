export type AflFixtureOverride = {
  round: number;
  homeTeamCode: string;
  awayTeamCode: string;
  utcStartTime: string;
  venue: string;
};

const AFL_2026_FIXTURE_OVERRIDES: AflFixtureOverride[] = [
  { round: 23, homeTeamCode: "ADE", awayTeamCode: "FRE", utcStartTime: "2026-08-14T10:10:00.000Z", venue: "OS" },
  { round: 23, homeTeamCode: "RIC", awayTeamCode: "STK", utcStartTime: "2026-08-15T02:35:00.000Z", venue: "MCG" },
  { round: 23, homeTeamCode: "NM", awayTeamCode: "GEE", utcStartTime: "2026-08-15T05:45:00.000Z", venue: "MRVL" },
  { round: 23, homeTeamCode: "BRI", awayTeamCode: "GCS", utcStartTime: "2026-08-15T06:15:00.000Z", venue: "G" },
  { round: 23, homeTeamCode: "HAW", awayTeamCode: "COL", utcStartTime: "2026-08-15T09:40:00.000Z", venue: "MCG" },
  { round: 23, homeTeamCode: "PTA", awayTeamCode: "MEL", utcStartTime: "2026-08-15T10:10:00.000Z", venue: "AO" },
  { round: 23, homeTeamCode: "GWS", awayTeamCode: "WCE", utcStartTime: "2026-08-16T03:40:00.000Z", venue: "ES" },
  { round: 23, homeTeamCode: "WBU", awayTeamCode: "CAR", utcStartTime: "2026-08-16T05:15:00.000Z", venue: "MRVL" },
  { round: 23, homeTeamCode: "ESS", awayTeamCode: "SYD", utcStartTime: "2026-08-16T06:40:00.000Z", venue: "MCG" },
  { round: 24, homeTeamCode: "STK", awayTeamCode: "GCS", utcStartTime: "2026-08-20T09:30:00.000Z", venue: "MRVL" },
  { round: 24, homeTeamCode: "COL", awayTeamCode: "BRI", utcStartTime: "2026-08-21T09:40:00.000Z", venue: "MCG" },
  { round: 24, homeTeamCode: "CAR", awayTeamCode: "FRE", utcStartTime: "2026-08-22T03:15:00.000Z", venue: "MRVL" },
  { round: 24, homeTeamCode: "MEL", awayTeamCode: "WBU", utcStartTime: "2026-08-22T06:15:00.000Z", venue: "MCG" },
  { round: 24, homeTeamCode: "GEE", awayTeamCode: "RIC", utcStartTime: "2026-08-22T09:45:00.000Z", venue: "GMHBA" },
  { round: 24, homeTeamCode: "ADE", awayTeamCode: "GWS", utcStartTime: "2026-08-22T10:10:00.000Z", venue: "AO" },
  { round: 24, homeTeamCode: "ESS", awayTeamCode: "PTA", utcStartTime: "2026-08-23T02:20:00.000Z", venue: "MRVL" },
  { round: 24, homeTeamCode: "SYD", awayTeamCode: "NM", utcStartTime: "2026-08-23T05:20:00.000Z", venue: "SCG" },
  { round: 24, homeTeamCode: "WCE", awayTeamCode: "HAW", utcStartTime: "2026-08-23T09:20:00.000Z", venue: "OS" },
];

const OVERRIDE_BY_MATCH = new Map(
  AFL_2026_FIXTURE_OVERRIDES.map((fixture) => [
    `${fixture.round}:${fixture.homeTeamCode}:${fixture.awayTeamCode}`,
    fixture,
  ])
);

export function getAflFixtureOverride(
  round: number,
  homeTeamCode: string,
  awayTeamCode: string
): AflFixtureOverride | null {
  return OVERRIDE_BY_MATCH.get(`${round}:${homeTeamCode}:${awayTeamCode}`) ?? null;
}
