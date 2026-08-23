import type { AflPlayerRoundStatUpsertRow } from "./aflLiveStats";

export type PreviewTeamListPlayer = { player_name: string; afl_team: string };

function stableHash(value: string): number {
  let hash = 2166136261;
  for (const character of value) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function buildDeterministicPreviewStats(params: {
  seasonYear: number;
  aflRound: number;
  players: PreviewTeamListPlayer[];
  teamCodeByName: Map<string, string>;
  importedAt: string;
}): AflPlayerRoundStatUpsertRow[] {
  return params.players.flatMap((player) => {
    const teamCode = params.teamCodeByName.get(player.afl_team.trim().toLowerCase());
    if (!teamCode || !player.player_name.trim()) return [];
    const hash = stableHash(`${params.aflRound}:${teamCode}:${player.player_name}`);
    const kicks = 5 + (hash % 16);
    const handballs = 3 + (Math.floor(hash / 17) % 14);
    const goals = Math.floor(hash / 31) % 5;
    const behinds = Math.floor(hash / 43) % 4;
    const marks = 1 + (Math.floor(hash / 59) % 10);
    const tackles = Math.floor(hash / 71) % 11;
    const hitouts = Math.floor(hash / 89) % 24;
    const freesFor = Math.floor(hash / 101) % 4;
    const freesAgainst = Math.floor(hash / 127) % 4;

    return [{
      environment: "preview",
      season_year: params.seasonYear,
      afl_round: params.aflRound,
      afl_team_name: player.afl_team,
      afl_team_code: teamCode,
      player_name: player.player_name.trim(),
      k: kicks,
      hb: handballs,
      d: kicks + handballs,
      m: marks,
      g: goals,
      b: behinds,
      t: tackles,
      ho: hitouts,
      ga: Math.floor(hash / 149) % 4,
      i50: Math.floor(hash / 163) % 9,
      cl: Math.floor(hash / 181) % 10,
      cg: Math.floor(hash / 197) % 7,
      r50: Math.floor(hash / 211) % 8,
      ff: freesFor,
      fa: freesAgainst,
      af: (kicks + handballs) * 3 + marks * 3 + goals * 6 + tackles * 4 + hitouts,
      sc: 0,
      imported_at: params.importedAt,
    }];
  });
}
