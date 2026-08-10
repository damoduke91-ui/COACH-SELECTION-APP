export type GuardFailure = { status: number; error: string };

export function validatePreviewImportAccess(appEnv: string, admin: boolean): GuardFailure | null {
  if (appEnv !== "preview") return { status: 403, error: "Preview AFL import is disabled outside Preview." };
  if (!admin) return { status: 403, error: "Preview admin access required." };
  return null;
}

export function validatePreviewImportRound(confirmed: number, current: number | null): GuardFailure | null {
  if (!Number.isInteger(confirmed) || confirmed < 1) return { status: 400, error: "A valid AFL round is required." };
  if (confirmed !== current) return { status: 409, error: "The confirmed AFL round no longer matches Preview Round Control." };
  return null;
}

export function validatePreviewImportCoverage(aflRound: number, matches: number, clubs: number, players: number): GuardFailure | null {
  if (matches !== 9) return { status: 422, error: `AFL Round ${aflRound} has ${matches}/9 Preview matches. Sync the AFL fixture first.` };
  if (clubs !== 18 || players === 0) return { status: 422, error: `AFL Round ${aflRound} is incomplete: ${clubs}/18 clubs and ${players} player rows were returned.` };
  return null;
}
