export type LiveCountRow = {
  selectedType: string;
  countsToTotal: boolean;
};

export type LivePlayerCounts = {
  countingPlayers: number;
  pendingPlayers: number;
  selectedScoringSlots: number;
};

/**
 * A submitted team always has one scoring place per on-field (X) selection.
 * An interchange player only fills that place after the substitution rules
 * promote them, so a played-but-unused interchange player must not reduce the
 * number of unresolved scoring places.
 */
export function calculateLivePlayerCounts(rows: LiveCountRow[]): LivePlayerCounts {
  const selectedScoringSlots = rows.filter((row) => row.selectedType === "X").length;
  const countingPlayers = rows.filter((row) => row.countsToTotal).length;

  return {
    countingPlayers,
    pendingPlayers: Math.max(0, selectedScoringSlots - countingPlayers),
    selectedScoringSlots,
  };
}
