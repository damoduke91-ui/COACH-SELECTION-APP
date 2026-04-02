"use client";

import React, { useEffect, useMemo, useState } from "react";
import * as coachConfigModule from "../../lib/coachConfig";
import {
  type CoachPlayerPool,
  type PositionKey,
  getPlayersForCoach,
} from "../../lib/playersByCoach";
import { supabase } from "../../lib/supabase";
import {
  type LoginSession,
  getCoachAccessByPasscode,
  isAdminPasscode,
} from "../../lib/coachAccess";

type PositionState = {
  onField: string[];
  emergencies: string[];
};

type TeamState = Record<PositionKey, PositionState>;
type TeamsByCoach = Record<number, TeamState>;

type CoachConfigShape = {
  id: number;
  name: string;
  slots: Record<PositionKey, number>;
  emergencyLimits: Record<PositionKey, number>;
};

type SavedTeamRow = {
  coach_id: number;
  coach_name: string;
  team_data: unknown;
  is_submitted: boolean;
  submitted_at: string | null;
  updated_at: string;
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
  { id: 1, name: "Adrian Coach 1", slots: DEFAULT_ON_FIELD_SLOTS, emergencyLimits: DEFAULT_EMERGENCY_LIMITS },
  { id: 2, name: "Chris Coach 2", slots: DEFAULT_ON_FIELD_SLOTS, emergencyLimits: DEFAULT_EMERGENCY_LIMITS },
  { id: 3, name: "Damian Coach 3", slots: DEFAULT_ON_FIELD_SLOTS, emergencyLimits: DEFAULT_EMERGENCY_LIMITS },
  { id: 4, name: "Dane Coach 4", slots: DEFAULT_ON_FIELD_SLOTS, emergencyLimits: DEFAULT_EMERGENCY_LIMITS },
  { id: 5, name: "Josh Coach 5", slots: DEFAULT_ON_FIELD_SLOTS, emergencyLimits: DEFAULT_EMERGENCY_LIMITS },
  { id: 6, name: "Mark Coach 6", slots: DEFAULT_ON_FIELD_SLOTS, emergencyLimits: DEFAULT_EMERGENCY_LIMITS },
  { id: 7, name: "Rick Coach 7", slots: DEFAULT_ON_FIELD_SLOTS, emergencyLimits: DEFAULT_EMERGENCY_LIMITS },
  { id: 8, name: "Troy Coach 8", slots: DEFAULT_ON_FIELD_SLOTS, emergencyLimits: DEFAULT_EMERGENCY_LIMITS },
];

const SESSION_STORAGE_KEY = "coach-selection-app-login-v1";

/* ---------- helpers (unchanged) ---------- */

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
  const name = String(rawCoach?.name ?? rawCoach?.coachName ?? rawCoach?.label ?? `Coach ${id}`);

  const rawSlots = rawCoach?.slots ?? rawCoach?.positionLimits ?? {};
  const rawEmergencyLimits = rawCoach?.emergencyLimits ?? rawCoach?.emergencies ?? {};

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
  const arrayCandidate = mod.coachConfigs ?? mod.default;
  if (Array.isArray(arrayCandidate) && arrayCandidate.length > 0) {
    return arrayCandidate.map((coach: any, index: number) =>
      buildCoachConfig(coach, index + 1)
    );
  }
  return FALLBACK_COACH_CONFIGS;
}

function createTeamsByCoach(coaches: CoachConfigShape[]): TeamsByCoach {
  const initial: TeamsByCoach = {};
  for (const coach of coaches) {
    initial[coach.id] = emptyTeamState();
  }
  return initial;
}

/* ---------- component ---------- */

export default function SelectTeamPage() {
  const coachConfigs = useMemo(() => normaliseCoachConfigs(), []);
  const [loginSession, setLoginSession] = useState<LoginSession | null>(null);
  const [loginPasscode, setLoginPasscode] = useState("");
  const [loginError, setLoginError] = useState("");
  const [selectedCoachId, setSelectedCoachId] = useState<number>(coachConfigs[0]?.id ?? 1);
  const [teamsByCoach, setTeamsByCoach] = useState<TeamsByCoach>(() =>
    createTeamsByCoach(coachConfigs)
  );

  const isAdmin = loginSession?.role === "admin";

  useEffect(() => {
    if (!loginSession) return;
    if (loginSession.role === "coach" && loginSession.coachId) {
      setSelectedCoachId(loginSession.coachId);
    }
  }, [loginSession]);

  if (!loginSession) {
    return <div>Login screen unchanged...</div>;
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-7xl">

        {/* HEADER */}
        <div className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-6">

          {/* 🔥 UPDATED SECTION */}
          <div className="mt-5 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            
            {isAdmin && (
              <div>
                <label className="mb-2 block text-sm font-medium text-white/80">
                  Select coach
                </label>
                <select
                  value={selectedCoachId}
                  onChange={(e) => {
                    setSelectedCoachId(Number(e.target.value));
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
            )}

          </div>
        </div>
      </div>
    </main>
  );
}