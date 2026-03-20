"use client";

import React, { useMemo, useState } from "react";
import * as coachConfigModule from "../../lib/coachConfig";
import { PLAYERS } from "../../lib/players";

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
  DEF: 5,
  MID: 7,
  FOR: 5,
  KF: 2,
  RUC: 1,
};

const DEFAULT_EMERGENCY_LIMITS: Record<PositionKey, number> = {
  KD: 3,
  DEF: 2,
  MID: 0,
  FOR: 2,
  KF: 3,
  RUC: 0,
};

const FALLBACK_COACH_CONFIGS: CoachConfigShape[] = [
  {
    id: 1,
    name: "Coach 1",
    slots: DEFAULT_ON_FIELD_SLOTS,
    emergencyLimits: DEFAULT_EMERGENCY_LIMITS,
  },
  {
    id: 2,
    name: "Coach 2",
    slots: DEFAULT_ON_FIELD_SLOTS,
    emergencyLimits: DEFAULT_EMERGENCY_LIMITS,
  },
  {
    id: 3,
    name: "Coach 3",
    slots: DEFAULT_ON_FIELD_SLOTS,
    emergencyLimits: DEFAULT_EMERGENCY_LIMITS,
  },
  {
    id: 4,
    name: "Coach 4",
    slots: DEFAULT_ON_FIELD_SLOTS,
    emergencyLimits: DEFAULT_EMERGENCY_LIMITS,
  },
  {
    id: 5,
    name: "Coach 5",
    slots: DEFAULT_ON_FIELD_SLOTS,
    emergencyLimits: DEFAULT_EMERGENCY_LIMITS,
  },
  {
    id: 6,
    name: "Coach 6",
    slots: DEFAULT_ON_FIELD_SLOTS,
    emergencyLimits: DEFAULT_EMERGENCY_LIMITS,
  },
  {
    id: 7,
    name: "Coach 7",
    slots: DEFAULT_ON_FIELD_SLOTS,
    emergencyLimits: DEFAULT_EMERGENCY_LIMITS,
  },
  {
    id: 8,
    name: "Coach 8",
    slots: DEFAULT_ON_FIELD_SLOTS,
    emergencyLimits: DEFAULT_EMERGENCY_LIMITS,
  },
];

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

function toNumber(value: unknown, fallback: number): number {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function buildCoachConfig(rawCoach: any, fallbackId: number): CoachConfigShape {
  const id = toNumber(rawCoach?.id ?? rawCoach?.coachId ?? fallbackId, fallbackId);
  const name = String(
    rawCoach?.name ?? rawCoach?.coachName ?? rawCoach?.label ?? `Coach ${id}`
  );

  const rawSlots =
    rawCoach?.slots ??
    rawCoach?.positionLimits ??
    rawCoach?.onFieldSlots ??
    rawCoach?.positions ??
    {};

  const rawEmergencyLimits =
    rawCoach?.emergencyLimits ??
    rawCoach?.emergencies ??
    rawCoach?.benchLimits ??
    rawCoach?.emergencySlots ??
    {};

  return {
    id,
    name,
    slots: {
      KD: toNumber(rawSlots?.KD, DEFAULT_ON_FIELD_SLOTS.KD),
      DEF: toNumber(rawSlots?.DEF, DEFAULT_ON_FIELD_SLOTS.DEF),
      MID: toNumber(rawSlots?.MID, DEFAULT_ON_FIELD_SLOTS.MID),
      FOR: toNumber(rawSlots?.FOR, DEFAULT_ON_FIELD_SLOTS.FOR),
      KF: toNumber(rawSlots?.KF, DEFAULT_ON_FIELD_SLOTS.KF),
      RUC: toNumber(rawSlots?.RUC, DEFAULT_ON_FIELD_SLOTS.RUC),
    },
    emergencyLimits: {
      KD: toNumber(rawEmergencyLimits?.KD, DEFAULT_EMERGENCY_LIMITS.KD),
      DEF: toNumber(rawEmergencyLimits?.DEF, DEFAULT_EMERGENCY_LIMITS.DEF),
      MID: toNumber(rawEmergencyLimits?.MID, DEFAULT_EMERGENCY_LIMITS.MID),
      FOR: toNumber(rawEmergencyLimits?.FOR, DEFAULT_EMERGENCY_LIMITS.FOR),
      KF: toNumber(rawEmergencyLimits?.KF, DEFAULT_EMERGENCY_LIMITS.KF),
      RUC: toNumber(rawEmergencyLimits?.RUC, DEFAULT_EMERGENCY_LIMITS.RUC),
    },
  };
}

function normaliseCoachConfigs(): CoachConfigShape[] {
  const mod = coachConfigModule as Record<string, unknown>;

  const arrayCandidate =
    mod.coachConfigs ??
    mod.COACH_CONFIGS ??
    mod.coaches ??
    mod.COACHES ??
    mod.default;

  if (Array.isArray(arrayCandidate) && arrayCandidate.length > 0) {
    return arrayCandidate.map((coach: any, index: number) =>
      buildCoachConfig(coach, index + 1)
    );
  }

  const objectCandidate =
    mod.coachConfig ??
    mod.COACH_CONFIG ??
    mod.defaultCoachConfig ??
    mod.default_coach_config;

  if (objectCandidate && typeof objectCandidate === "object") {
    const entries = Object.entries(objectCandidate as Record<string, any>);

    if (entries.length > 0) {
      return entries.map(([key, coach], index) =>
        buildCoachConfig(
          {
            id: coach?.id ?? coach?.coachId ?? key,
            ...coach,
          },
          index + 1
        )
      );
    }
  }

  return FALLBACK_COACH_CONFIGS;
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

function createTeamsByCoach(coaches: CoachConfigShape[]): Record<number, TeamState> {
  const initial: Record<number, TeamState> = {};

  for (const coach of coaches) {
    initial[coach.id] = emptyTeamState();
  }

  return initial;
}

export default function SelectTeamPage() {
  const coachConfigs = useMemo(() => normaliseCoachConfigs(), []);
  const [selectedCoachId, setSelectedCoachId] = useState<number>(
    coachConfigs[0]?.id ?? 1
  );
  const [teamsByCoach, setTeamsByCoach] = useState<Record<number, TeamState>>(() =>
    createTeamsByCoach(coachConfigs)
  );
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

    if (currentBucket.includes(playerName)) return;
    if (currentBucket.length >= limit) return;
    if (isPlayerAlreadySelected(teamState, playerName)) return;

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

    if (teamState[position][to].length >= limit) return;

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
    return PLAYERS[position]
      .map((player) => player.name)
      .filter((playerName) => !isPlayerAlreadySelected(teamState, playerName));
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
                <div>
                  On-field: {teamState[position].onField.length} /{" "}
                  {selectedCoach.slots[position]}
                </div>
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
                                onClick={() => handleRemovePlayer(position, "onField", player)}
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