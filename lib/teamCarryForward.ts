export function getExactPreviousRound(currentRound: unknown): number | null {
  if (!Number.isInteger(currentRound) || Number(currentRound) <= 1) {
    return null;
  }

  return Number(currentRound) - 1;
}
