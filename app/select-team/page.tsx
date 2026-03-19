"use client";

import React, { useMemo, useState } from "react";
import * as coachConfigModule from "../../lib/coachConfig";

type PositionKey = "KD" | "DEF" | "MID" | "FOR" | "KF" | "RUC";

type PositionState = {
  onField: string[];
  emergencies: string[];
};

type TeamState = Record<PositionKey, PositionState>;

type CoachConfigShape = {
  id: number;
  name: string;
  slots: Record<PositionKey, number>;
  emergencyLimits: Record<PositionKey, number>;
};

const POSITIONS: PositionKey[] = ["KD", "DEF", "MID", "FOR", "KF", "RUC"];

const DEFAULT_ON_FIELD_SLOTS: Record<PositionKey, number> = {
  KD: 2,
  DEF: 4,
  MID: 5,
  FOR: 4,
  KF: 2,
  RUC: 1,
};

const PLACEHOLDER_PLAYERS: Record<PositionKey, string[]> = {
  KD: ["Key Defender 1", "Key Defender 2", "Key Defender 3", "Key Defender 4"],
  DEF: [
    "Defender 1",
    "Defender 2",
    "Defender 3",
    "Defender 4",
    "Defender 5",
    "Defender 6",
    "Defender 7",
  ],
  MID: [
    "Midfielder 1",
    "Midfielder 2",
    "Midfielder 3",
    "Midfielder 4",
    "Midfielder 5",
    "Midfielder 6",
    "Midfielder 7",
    "Midfielder 8",
  ],
  FOR: [
    "Forward 1",
    "Forward 2",
    "Forward 3",
    "Forward 4",
    "Forward 5",
    "Forward 6",
    "Forward 7",
  ],
  KF: ["Key Forward 1", "Key Forward 2", "Key Forward 3", "Key Forward 4"],
  RUC: ["Ruck 1", "Ruck 2", "Ruck 3"],
};

function emptyTeamState(): TeamState {
  return {
    KD: { onField: [], emergencies: [] },
    DEF: { onField: [], emergencies: [] },
    MID: { onField: [], emergencies: [] },
    FOR: { onField: [], emergencies: [] },
    KF: { onField: [], emergencies: [] },
    RUC: { onField: [], emergencies: [] },
  };
}

function normaliseCoachConfigs(): CoachConfigShape[] {
  const mod = coachConfigModule as Record<string, unknown>;

  const candidate =
    mod.coachConfigs ??
    mod.COACH_CONFIGS ??
    mod.coachConfig ??
    mod.default ??
    [];

  if (Array.isArray(candidate)) {
    return candidate.map((coach: any, index: number) => {
      const id = Number(coach?.id ?? coach?.coachId ?? index + 1);
      const name = String(coach?.name ?? coach?.coachName ?? `Coach ${id}`);

      const rawSlots =
        coach?.slots ??
        coach?.positionLimits ??
        coach?.onFieldSlots ??
        DEFAULT_ON_FIELD_SLOTS;

      const rawEmergencyLimits =
        coach?.emergencyLimits ??
        coach?.emergencies ??
        coach?.benchLimits ??
        {};

      const slots: Record<PositionKey, number> = {
        KD: Number(rawSlots?.KD ?? DEFAULT_ON_FIELD_SLOTS.KD),
        DEF: Number(rawSlots?.DEF ?? DEFAULT_ON_FIELD_SLOTS.DEF),
        MID: Number(rawSlots?.MID ?? DEFAULT_ON_FIELD_SLOTS.MID),
        FOR: Number(rawSlots?.FOR ?? DEFAULT_ON_FIELD_SLOTS.FOR),
        KF: Number(rawSlots?.KF ?? DEFAULT_ON_FIELD_SLOTS.KF),
        RUC: Number(rawSlots?.RUC ?? DEFAULT_ON_FIELD_SLOTS.RUC),
      };

      const emergencyLimits: Record<PositionKey, number> = {
        KD: Number(rawEmergencyLimits?.KD ?? 0),
        DEF: Number(rawEmergencyLimits?.DEF ?? 0),
        MID: Number(rawEmergencyLimits?.MID ?? 0),
        FOR: Number(rawEmergencyLimits?.FOR ?? 0),
        KF: Number(rawEmergencyLimits?.KF ?? 0),
        RUC: Number(rawEmergencyLimits?.RUC ?? 0),
      };

      return { id, name, slots, emergencyLimits };
    });
  }

  if (candidate && typeof candidate === "object") {
    const entries = Object.entries(candidate as Record<string, any>);

    return entries.map(([key, coach], index) => {
      const id = Number(coach?.id ?? coach?.coachId ?? key ?? index + 1);
      const name = String(coach?.name ?? coach?.coachName ?? `Coach ${id}`);

      const rawSlots =
        coach?.slots ??
        coach?.positionLimits ??
        coach?.onFieldSlots ??
        DEFAULT_ON_FIELD_SLOTS;

      const rawEmergencyLimits =
        coach?.emergencyLimits ??
        coach?.emergencies ??
        coach?.benchLimits ??
        {};

      const slots: Record<PositionKey, number> = {
        KD: Number(rawSlots?.KD ?? DEFAULT_ON_FIELD_SLOTS.KD),
        DEF: Number(rawSlots?.DEF ?? DEFAULT_ON_FIELD_SLOTS.DEF),
        MID: Number(rawSlots?.MID ?? DEFAULT_ON_FIELD_SLOTS.MID),
        FOR: Number(rawSlots?.FOR ?? DEFAULT_ON_FIELD_SLOTS.FOR),
        KF: Number(rawSlots?.KF ?? DEFAULT_ON_FIELD_SLOTS.KF),
        RUC: Number(rawSlots?.RUC ?? DEFAULT_ON_FIELD_SLOTS.RUC),
      };

      const emergencyLimits: Record<PositionKey, number> = {
        KD: Number(rawEmergencyLimits?.KD ?? 0),
        DEF: Number(rawEmergencyLimits?.DEF ?? 0),
        MID: Number(rawEmergencyLimits?.MID ?? 0),
        FOR: Number(rawEmergencyLimits?.FOR ?? 0),
        KF: Number(rawEmergencyLimits?.KF ?? 0),
        RUC: Number(rawEmergencyLimits?.RUC ?? 0),
      };

      return { id, name, slots, emergencyLimits };
    });
  }

  return [
    {
      id: 1,
      name: "Coach 1",
      slots: DEFAULT_ON_FIELD_SLOTS,
      emergencyLimits: {
        KD: 0,
        DEF: 0,
        MID: 0,
        FOR: 0,
        KF: 0,
        RUC: 0,
      },
    },
  ];
}

function getAllSelectedPlayers(teamState: TeamState): string[] {
  return POSITIONS.flatMap((position) => [
    ...teamState[position].onField,
    ...teamState[position].emergencies,
  ]);
}

function isPlayerAlreadySelected(teamState: TeamState, playerName: string): boolean {
  return getAllSelectedPlayers(teamState).includes(playerName);
}

function removePlayerFromAllSlots(teamState: TeamState, playerName: string): TeamState {
  const nextState = structuredClone(teamState) as TeamState;

  for (const position of POSITIONS) {
    nextState[position].onField = nextState[position].onField.filter(
      (name) => name !== playerName
    );
    nextState[position].emergencies = nextState[position].emergencies.filter(
      (name) => name !== playerName
    );
  }

  return nextState;
}

export default function SelectTeamPage() {
  const coachConfigs = useMemo(() => normaliseCoachConfigs(), []);
  const [selectedCoachId, setSelectedCoachId] = useState<number>(coachConfigs[0]?.id ?? 1);

  const [teamsByCoach, setTeamsByCoach] = useState<Record<number, TeamState>>(() => {
    const initial: Record<number, TeamState> = {};
    for (const coach of coachConfigs) {
      initial[coach.id] = emptyTeamState();
    }
    return initial;
  });

  const [submitMessage, setSubmitMessage] = useState<string>("");

  const selectedCoach =
    coachConfigs.find((coach) => coach.id === selectedCoachId) ?? coachConfigs[0];

  const teamState = teamsByCoach[selectedCoachId] ?? emptyTeamState();

  function updateCoachTeamState(nextTeamState: TeamState) {
    setTeamsByCoach((prev) => ({
      ...prev,
      [selectedCoachId]: nextTeamState,
    }));
  }

  function handleAddPlayer(
    position: PositionKey,
    bucket: "onField" | "emergencies",
    playerName: string
  ) {
    if (!selectedCoach) return;
    if (!playerName) return;

    const limit =
      bucket === "onField"
        ? selectedCoach.slots[position]
        : selectedCoach.emergencyLimits[position];

    if (limit <= 0) return;

    const currentBucket = teamState[position][bucket];

    if (currentBucket.includes(playerName)) {
      return;
    }

    if (currentBucket.length >= limit) {
      return;
    }

    if (isPlayerAlreadySelected(teamState, playerName)) {
      return;
    }

    const nextState = structuredClone(teamState) as TeamState;
    nextState[position][bucket].push(playerName);
    updateCoachTeamState(nextState);
    setSubmitMessage("");
  }

  function handleRemovePlayer(
    position: PositionKey,
    bucket: "onField" | "emergencies",
    playerName: string
  ) {
    const nextState = structuredClone(teamState) as TeamState;
    nextState[position][bucket] = nextState[position][bucket].filter(
      (name) => name !== playerName
    );
    updateCoachTeamState(nextState);
    setSubmitMessage("");
  }

  function handleMovePlayer(
    position: PositionKey,
    from: "onField" | "emergencies",
    to: "onField" | "emergencies",
    playerName: string
  ) {
    if (!selectedCoach) return;
    if (from === to) return;

    const limit =
      to === "onField"
        ? selectedCoach.slots[position]
        : selectedCoach.emergencyLimits[position];

    if (teamState[position][to].length >= limit) {
      return;
    }

    const nextState = removePlayerFromAllSlots(teamState, playerName);

    nextState[position][to].push(playerName);
    updateCoachTeamState(nextState);
    setSubmitMessage("");
  }

  function handleResetCoachTeam() {
    updateCoachTeamState(emptyTeamState());
    setSubmitMessage("");
  }

  function validateTeam(): { valid: boolean; errors: string[] } {
    if (!selectedCoach) {
      return { valid: false, errors: ["No coach selected."] };
    }

    const errors: string[] = [];

    for (const position of POSITIONS) {
      const onFieldRequired = selectedCoach.slots[position];
      const emergenciesAllowed = selectedCoach.emergencyLimits[position];

      const onFieldCount = teamState[position].onField.length;
      const emergencyCount = teamState[position].emergencies.length;

      if (onFieldCount !== onFieldRequired) {
        errors.push(
          `${position}: on-field requires ${onFieldRequired}, currently ${onFieldCount}.`
        );
      }

      if (emergencyCount > emergenciesAllowed) {
        errors.push(
          `${position}: emergencies allow ${emergenciesAllowed}, currently ${emergencyCount}.`
        );
      }
    }

    const allPlayers = getAllSelectedPlayers(teamState);
    const uniquePlayers = new Set(allPlayers);

    if (allPlayers.length !== uniquePlayers.size) {
      errors.push("Duplicate player detected across team selections.");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  function handleSubmitTeam() {
    const result = validateTeam();

    if (!result.valid) {
      setSubmitMessage(`Team not ready: ${result.errors.join(" ")}`);
      return;
    }

    setSubmitMessage(`Team submitted for ${selectedCoach?.name}.`);
  }

  function availablePlayersForPosition(position: PositionKey): string[] {
    return PLACEHOLDER_PLAYERS[position].filter(
      (player) => !isPlayerAlreadySelected(teamState, player)
    );
  }

  if (!selectedCoach) {
    return (
      <main className="min-h-screen bg-neutral-950 px-4 py-8 text-white">
        <div className="mx-auto max-w-5xl rounded-2xl border border-white/10 bg-white/5 p-6">
          <h1 className="text-2xl font-bold">Select Team</h1>
          <p className="mt-4 text-sm text-white/70">
            No coach configuration found. Check <code>lib/coachConfig.ts</code>.
          </p>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-7xl">
        <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-6">
          <h1 className="text-3xl font-bold">Coach Team Selection</h1>
          <p className="mt-2 text-sm text-white/70">
            Build each coach’s on-field team and emergencies by position.
          </p>

          <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <label className="mb-2 block text-sm font-medium text-white/80">
                Select coach
              </label>
              <select
                value={selectedCoachId}
                onChange={(e) => {
                  setSelectedCoachId(Number(e.target.value));
                  setSubmitMessage("");
                }}
                className="w-full min-w-[240px] rounded-xl border border-white/10 bg-neutral-900 px-4 py-3 text-white outline-none"
              >
                {coachConfigs.map((coach) => (
                  <option key={coach.id} value={coach.id}>
                    {coach.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex gap-3">
              <button
                type="button"
                onClick={handleResetCoachTeam}
                className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold hover:bg-white/10"
              >
                Reset Coach Team
              </button>
              <button
                type="button"
                onClick={handleSubmitTeam}
                className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black hover:opacity-90"
              >
                Submit Team
              </button>
            </div>
          </div>

          {submitMessage ? (
            <div className="mt-4 rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-sm text-white/85">
              {submitMessage}
            </div>
          ) : null}
        </div>

        <div className="mb-6 grid gap-4 md:grid-cols-3 xl:grid-cols-6">
          {POSITIONS.map((position) => (
            <div
              key={position}
              className="rounded-2xl border border-white/10 bg-white/5 p-4"
            >
              <div className="text-lg font-bold">{position}</div>
              <div className="mt-2 space-y-1 text-sm text-white/70">
                <div>On-field: {teamState[position].onField.length} / {selectedCoach.slots[position]}</div>
                <div>
                  Emergencies: {teamState[position].emergencies.length} /{" "}
                  {selectedCoach.emergencyLimits[position]}
                </div>
              </div>
            </div>
          ))}
        </div>

        <div className="grid gap-6">
          {POSITIONS.map((position) => {
            const availablePlayers = availablePlayersForPosition(position);

            return (
              <section
                key={position}
                className="rounded-2xl border border-white/10 bg-white/5 p-5"
              >
                <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                  <div>
                    <h2 className="text-2xl font-bold">{position}</h2>
                    <p className="text-sm text-white/70">
                      On-field limit: {selectedCoach.slots[position]} | Emergency limit:{" "}
                      {selectedCoach.emergencyLimits[position]}
                    </p>
                  </div>
                </div>

                <div className="grid gap-5 xl:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <h3 className="mb-3 text-lg font-semibold">Available Players</h3>

                    <div className="space-y-2">
                      {availablePlayers.length === 0 ? (
                        <div className="text-sm text-white/50">No available players left.</div>
                      ) : (
                        availablePlayers.map((player) => (
                          <div
                            key={player}
                            className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/5 p-3"
                          >
                            <div className="text-sm font-medium">{player}</div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => handleAddPlayer(position, "onField", player)}
                                disabled={
                                  teamState[position].onField.length >=
                                  selectedCoach.slots[position]
                                }
                                className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-black disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                Add On-Field
                              </button>

                              <button
                                type="button"
                                onClick={() => handleAddPlayer(position, "emergencies", player)}
                                disabled={
                                  selectedCoach.emergencyLimits[position] <= 0 ||
                                  teamState[position].emergencies.length >=
                                    selectedCoach.emergencyLimits[position]
                                }
                                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                Add Emergency
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <h3 className="mb-3 text-lg font-semibold">On-Field</h3>

                    <div className="space-y-2">
                      {teamState[position].onField.length === 0 ? (
                        <div className="text-sm text-white/50">No on-field players selected.</div>
                      ) : (
                        teamState[position].onField.map((player) => (
                          <div
                            key={player}
                            className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3"
                          >
                            <div className="text-sm font-medium">{player}</div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  handleMovePlayer(position, "onField", "emergencies", player)
                                }
                                disabled={
                                  selectedCoach.emergencyLimits[position] <= 0 ||
                                  teamState[position].emergencies.length >=
                                    selectedCoach.emergencyLimits[position]
                                }
                                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                Move to Emergency
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleRemovePlayer(position, "onField", player)
                                }
                                className="rounded-lg bg-red-500/90 px-3 py-2 text-xs font-semibold text-white"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <h3 className="mb-3 text-lg font-semibold">Emergencies</h3>

                    <div className="space-y-2">
                      {teamState[position].emergencies.length === 0 ? (
                        <div className="text-sm text-white/50">No emergencies selected.</div>
                      ) : (
                        teamState[position].emergencies.map((player) => (
                          <div
                            key={player}
                            className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/5 p-3"
                          >
                            <div className="text-sm font-medium">{player}</div>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  handleMovePlayer(position, "emergencies", "onField", player)
                                }
                                disabled={
                                  teamState[position].onField.length >=
                                  selectedCoach.slots[position]
                                }
                                className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                Move to On-Field
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  handleRemovePlayer(position, "emergencies", player)
                                }
                                className="rounded-lg bg-red-500/90 px-3 py-2 text-xs font-semibold text-white"
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </main>
  );
}