export type TeamSelectionState = Record<
  string,
  { onField: string[]; emergencies: string[] }
>;

export type TeamRosterPool = Record<string, Array<{ name: string }>>;

export function sanitiseTeamSelection(params: {
  input: unknown;
  positions: readonly string[];
  roster?: TeamRosterPool;
}): TeamSelectionState {
  const clean: TeamSelectionState = Object.fromEntries(
    params.positions.map((position) => [position, { onField: [], emergencies: [] }])
  );

  if (!params.input || typeof params.input !== "object" || Array.isArray(params.input)) {
    return clean;
  }

  const savedTeam = params.input as Record<string, unknown>;

  for (const position of params.positions) {
    const savedPosition = savedTeam[position];
    if (!savedPosition || typeof savedPosition !== "object" || Array.isArray(savedPosition)) {
      continue;
    }

    const positionData = savedPosition as Record<string, unknown>;
    const allowedNames = params.roster
      ? new Set((params.roster[position] ?? []).map((player) => player.name))
      : null;
    const keepValidName = (value: unknown): value is string =>
      typeof value === "string" && (!allowedNames || allowedNames.has(value));

    clean[position] = {
      onField: Array.isArray(positionData.onField)
        ? positionData.onField.filter(keepValidName)
        : [],
      emergencies: Array.isArray(positionData.emergencies)
        ? positionData.emergencies.filter(keepValidName)
        : [],
    };
  }

  return clean;
}
