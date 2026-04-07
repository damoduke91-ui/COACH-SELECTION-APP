// test preview deployment
"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import * as XLSX from "xlsx";
import * as coachConfigModule from "../../lib/coachConfig";
import {
  type CoachPlayerPool,
  type PositionKey,
  getPlayersForCoach,
} from "../../lib/playersByCoach";
import { supabase } from "../../lib/supabase";

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

type CoachMeta = {
  updatedAt: string | null;
  submittedAt: string | null;
};

type SaveIndicatorState = "unsaved" | "saving" | "saved";

type SaveTeamOptions = {
  coach: CoachConfigShape;
  team: TeamState;
  isSubmitting: boolean;
  skipIncompleteWarning?: boolean;
  source?: "manual" | "auto";
};

type ExportPlayerRow = {
  "Player No.": number | string;
  Position: string;
  Club: string;
  "Player Name": string;
  Selected: string;
  "Selection Order": number | string;
};

type LoginSession = {
  userId: string;
  email: string;
  role: "admin" | "coach";
  coachId: number | null;
  coachName: string;
};

type UserProfileRow = {
  id: string;
  role: "admin" | "coach";
  coach_id: number | null;
  coach_name: string | null;
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
    name: "Adrian Coach 1",
    slots: DEFAULT_ON_FIELD_SLOTS,
    emergencyLimits: DEFAULT_EMERGENCY_LIMITS,
  },
  {
    id: 2,
    name: "Chris Coach 2",
    slots: DEFAULT_ON_FIELD_SLOTS,
    emergencyLimits: DEFAULT_EMERGENCY_LIMITS,
  },
  {
    id: 3,
    name: "Damian Coach 3",
    slots: DEFAULT_ON_FIELD_SLOTS,
    emergencyLimits: DEFAULT_EMERGENCY_LIMITS,
  },
  {
    id: 4,
    name: "Dane Coach 4",
    slots: DEFAULT_ON_FIELD_SLOTS,
    emergencyLimits: DEFAULT_EMERGENCY_LIMITS,
  },
  {
    id: 5,
    name: "Josh Coach 5",
    slots: DEFAULT_ON_FIELD_SLOTS,
    emergencyLimits: DEFAULT_EMERGENCY_LIMITS,
  },
  {
    id: 6,
    name: "Mark Coach 6",
    slots: DEFAULT_ON_FIELD_SLOTS,
    emergencyLimits: DEFAULT_EMERGENCY_LIMITS,
  },
  {
    id: 7,
    name: "Rick Coach 7",
    slots: DEFAULT_ON_FIELD_SLOTS,
    emergencyLimits: DEFAULT_EMERGENCY_LIMITS,
  },
  {
    id: 8,
    name: "Troy Coach 8",
    slots: DEFAULT_ON_FIELD_SLOTS,
    emergencyLimits: DEFAULT_EMERGENCY_LIMITS,
  },
];

const AUTO_SAVE_DEBOUNCE_MS = 10000;

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

function buildCoachConfig(rawCoach: unknown, fallbackId: number): CoachConfigShape {
  const coach = rawCoach && typeof rawCoach === "object" ? rawCoach : {};
  const coachRecord = coach as Record<string, unknown>;
  const id = toNumber(coachRecord.id ?? coachRecord.coachId ?? fallbackId, fallbackId);
  const name = String(
    coachRecord.name ?? coachRecord.coachName ?? coachRecord.label ?? `Coach ${id}`
  );

  const rawSlots =
    coachRecord.slots ??
    coachRecord.positionLimits ??
    coachRecord.onFieldSlots ??
    coachRecord.positions ??
    {};

  const rawEmergencyLimits =
    coachRecord.emergencyLimits ??
    coachRecord.emergencies ??
    coachRecord.benchLimits ??
    coachRecord.emergencySlots ??
    {};

  const slotsRecord =
    rawSlots && typeof rawSlots === "object" ? (rawSlots as Record<string, unknown>) : {};
  const emergencyLimitsRecord =
    rawEmergencyLimits && typeof rawEmergencyLimits === "object"
      ? (rawEmergencyLimits as Record<string, unknown>)
      : {};

  return {
    id,
    name,
    slots: {
      KD: toNumber(slotsRecord.KD, DEFAULT_ON_FIELD_SLOTS.KD),
      DEF: toNumber(slotsRecord.DEF, DEFAULT_ON_FIELD_SLOTS.DEF),
      MID: toNumber(slotsRecord.MID, DEFAULT_ON_FIELD_SLOTS.MID),
      FOR: toNumber(slotsRecord.FOR, DEFAULT_ON_FIELD_SLOTS.FOR),
      KF: toNumber(slotsRecord.KF, DEFAULT_ON_FIELD_SLOTS.KF),
      RUC: toNumber(slotsRecord.RUC, DEFAULT_ON_FIELD_SLOTS.RUC),
    },
    emergencyLimits: {
      KD: toNumber(emergencyLimitsRecord.KD, DEFAULT_EMERGENCY_LIMITS.KD),
      DEF: toNumber(emergencyLimitsRecord.DEF, DEFAULT_EMERGENCY_LIMITS.DEF),
      MID: toNumber(emergencyLimitsRecord.MID, DEFAULT_EMERGENCY_LIMITS.MID),
      FOR: toNumber(emergencyLimitsRecord.FOR, DEFAULT_EMERGENCY_LIMITS.FOR),
      KF: toNumber(emergencyLimitsRecord.KF, DEFAULT_EMERGENCY_LIMITS.KF),
      RUC: toNumber(emergencyLimitsRecord.RUC, DEFAULT_EMERGENCY_LIMITS.RUC),
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
    return arrayCandidate.map((coach, index: number) => buildCoachConfig(coach, index + 1));
  }

  const objectCandidate =
    mod.coachConfig ??
    mod.COACH_CONFIG ??
    mod.defaultCoachConfig ??
    mod.default_coach_config;

  if (objectCandidate && typeof objectCandidate === "object") {
    const entries = Object.entries(objectCandidate as Record<string, unknown>);

    if (entries.length > 0) {
      return entries.map(([key, coach], index) => {
        const coachRecord =
          coach && typeof coach === "object" ? (coach as Record<string, unknown>) : {};

        return buildCoachConfig(
          {
            id: coachRecord.id ?? coachRecord.coachId ?? key,
            ...coachRecord,
          },
          index + 1
        );
      });
    }
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

function sanitiseTeamState(input: unknown): TeamState {
  const clean = emptyTeamState();

  if (!input || typeof input !== "object") {
    return clean;
  }

  const obj = input as Record<string, unknown>;

  for (const position of POSITIONS) {
    const savedPosition = obj[position];

    if (!savedPosition || typeof savedPosition !== "object") {
      continue;
    }

    const positionObj = savedPosition as Record<string, unknown>;

    clean[position] = {
      onField: Array.isArray(positionObj.onField)
        ? positionObj.onField.filter((value): value is string => typeof value === "string")
        : [],
      emergencies: Array.isArray(positionObj.emergencies)
        ? positionObj.emergencies.filter((value): value is string => typeof value === "string")
        : [],
    };
  }

  return clean;
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

function getCoachPool(selectedCoach: CoachConfigShape | undefined): CoachPlayerPool {
  return getPlayersForCoach({
    coachId: selectedCoach?.id,
    coachName: selectedCoach?.name,
  });
}

function moveItem<T>(items: T[], fromIndex: number, toIndex: number): T[] {
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "—";

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return "—";

  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function safeSheetName(input: string): string {
  return input.replace(/[\\/?*[\]:]/g, "").slice(0, 31) || "Coach";
}

export default function SelectTeamPage() {
  const router = useRouter();
  const coachConfigs = useMemo(() => normaliseCoachConfigs(), []);

  const [loginSession, setLoginSession] = useState<LoginSession | null>(null);
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [isAuthenticating, setIsAuthenticating] = useState(true);

  const [selectedCoachId, setSelectedCoachId] = useState<number>(coachConfigs[0]?.id ?? 1);
  const [teamsByCoach, setTeamsByCoach] = useState<TeamsByCoach>(() =>
    createTeamsByCoach(coachConfigs)
  );
  const [submitMessage, setSubmitMessage] = useState<string>("");
  const [isLoadingTeam, setIsLoadingTeam] = useState(false);
  const [isSavingTeam, setIsSavingTeam] = useState(false);
  const [isExportingTeams, setIsExportingTeams] = useState(false);
  const [loadedCoachIds, setLoadedCoachIds] = useState<Record<number, boolean>>({});
  const [submittedCoachIds, setSubmittedCoachIds] = useState<Record<number, boolean>>({});
  const [coachMetaById, setCoachMetaById] = useState<Record<number, CoachMeta>>({});
  const [dirtyCoachIds, setDirtyCoachIds] = useState<Record<number, boolean>>({});
  const [saveIndicatorByCoachId, setSaveIndicatorByCoachId] = useState<
    Record<number, SaveIndicatorState>
  >({});
  const autoSaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const changeVersionByCoachIdRef = useRef<Record<number, number>>({});

  const isAdmin = loginSession?.role === "admin";

  const selectedCoach =
    coachConfigs.find((coach) => coach.id === selectedCoachId) ?? coachConfigs[0];

  const teamState = teamsByCoach[selectedCoachId] ?? emptyTeamState();
  const coachPool = getCoachPool(selectedCoach);

  const canViewSelectedCoach = Boolean(
    selectedCoach && loginSession && (isAdmin || loginSession.coachId === selectedCoach.id)
  );

  const canEditSelectedCoach = Boolean(
    selectedCoach &&
      loginSession &&
      !isLoadingTeam &&
      canViewSelectedCoach &&
      !Boolean(submittedCoachIds[selectedCoach.id])
  );

  const canUnlockSelectedCoach = Boolean(
    selectedCoach &&
      loginSession &&
      !isLoadingTeam &&
      canViewSelectedCoach &&
      Boolean(submittedCoachIds[selectedCoach.id])
  );

  const playerLookup = useMemo(() => {
    const lookup = new Map<string, { name: string; club: string; number: number }>();

    for (const position of POSITIONS) {
      for (const player of coachPool[position]) {
        lookup.set(player.name, {
          name: player.name,
          club: player.club,
          number: player.number,
        });
      }
    }

    return lookup;
  }, [coachPool]);

  const resetSessionScopedState = useCallback(() => {
    setLoadedCoachIds({});
    setSubmittedCoachIds({});
    setCoachMetaById({});
    setDirtyCoachIds({});
    setSaveIndicatorByCoachId({});
    setSubmitMessage("");
    setTeamsByCoach(createTeamsByCoach(coachConfigs));
    changeVersionByCoachIdRef.current = {};
  }, [coachConfigs]);

  const loadProfileForUser = useCallback(
    async (userId: string, email: string): Promise<LoginSession | null> => {
      const { data, error } = await supabase
        .from("profiles")
        .select("id, role, coach_id, coach_name")
        .eq("id", userId)
        .single();

      if (error) {
        setLoginError(`Profile load failed: ${error.message}`);
        return null;
      }

      const profile = data as UserProfileRow | null;

      if (!profile) {
        setLoginError("No profile found for this user.");
        return null;
      }

      if (profile.role === "coach" && !profile.coach_id) {
        setLoginError("Coach profile is missing coach_id.");
        return null;
      }

      return {
        userId,
        email,
        role: profile.role,
        coachId: profile.coach_id,
        coachName:
          profile.coach_name?.trim() ||
          (profile.role === "admin"
            ? "Admin"
            : `Coach ${profile.coach_id ?? ""}`.trim()),
      };
    },
    []
  );

  useEffect(() => {
    let isMounted = true;

    async function bootstrapAuth() {
      setIsAuthenticating(true);
      setLoginError("");

      const {
        data: { session },
        error,
      } = await supabase.auth.getSession();

      if (!isMounted) return;

      if (error) {
        setLoginError(`Session check failed: ${error.message}`);
        setIsAuthenticating(false);
        return;
      }

      if (!session?.user) {
        setLoginSession(null);
        setIsAuthenticating(false);
        return;
      }

      const nextSession = await loadProfileForUser(
        session.user.id,
        session.user.email ?? ""
      );

      if (!isMounted) return;

      if (nextSession) {
        setLoginSession(nextSession);

        if (nextSession.role === "coach" && nextSession.coachId) {
          setSelectedCoachId(nextSession.coachId);
        }
      } else {
        setLoginSession(null);
      }

      setIsAuthenticating(false);
    }

    void bootstrapAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      void (async () => {
        if (!isMounted) return;

        if (!session?.user) {
          setLoginSession(null);
          resetSessionScopedState();
          setIsAuthenticating(false);
          router.replace("/login");
          return;
        }

        const nextSession = await loadProfileForUser(
          session.user.id,
          session.user.email ?? ""
        );

        if (!isMounted) return;

        if (nextSession) {
          setLoginSession(nextSession);

          if (nextSession.role === "coach" && nextSession.coachId) {
            setSelectedCoachId(nextSession.coachId);
          }
        } else {
          setLoginSession(null);
          router.replace("/login");
        }

        setIsAuthenticating(false);
      })();
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [loadProfileForUser, resetSessionScopedState, router]);

  useEffect(() => {
    if (!isAuthenticating && !loginSession) {
      router.replace("/login");
    }
  }, [isAuthenticating, loginSession, router]);

  useEffect(() => {
    if (!loginSession) return;

    if (loginSession.role === "coach" && loginSession.coachId) {
      setSelectedCoachId(loginSession.coachId);
    }
  }, [loginSession]);

  useEffect(() => {
    async function loadCoachTeam() {
      if (!selectedCoach) return;
      if (!loginSession) return;
      if (loadedCoachIds[selectedCoach.id]) return;

      setIsLoadingTeam(true);

      const { data, error } = await supabase
        .from("coach_team_selections")
        .select("coach_id, coach_name, team_data, is_submitted, submitted_at, updated_at")
        .eq("coach_id", selectedCoach.id)
        .maybeSingle();

      if (error) {
        setSubmitMessage(`Load failed: ${error.message}`);
        setIsLoadingTeam(false);
        return;
      }

      const row = data as SavedTeamRow | null;

      if (row?.team_data) {
        const cleanTeam = sanitiseTeamState(row.team_data);

        setTeamsByCoach((prev) => ({
          ...prev,
          [selectedCoach.id]: cleanTeam,
        }));
      }

      setSubmittedCoachIds((prev) => ({
        ...prev,
        [selectedCoach.id]: Boolean(row?.is_submitted),
      }));

      setCoachMetaById((prev) => ({
        ...prev,
        [selectedCoach.id]: {
          updatedAt: row?.updated_at ?? null,
          submittedAt: row?.submitted_at ?? null,
        },
      }));

      setLoadedCoachIds((prev) => ({
        ...prev,
        [selectedCoach.id]: true,
      }));

      changeVersionByCoachIdRef.current[selectedCoach.id] = 0;

      setDirtyCoachIds((prev) => ({
        ...prev,
        [selectedCoach.id]: false,
      }));

      setSaveIndicatorByCoachId((prev) => ({
        ...prev,
        [selectedCoach.id]: "saved",
      }));

      setIsLoadingTeam(false);
    }

    void loadCoachTeam();
  }, [selectedCoach, loadedCoachIds, loginSession]);

  useEffect(() => {
    async function loadAllCoachTeamsForAdmin() {
      if (!loginSession || !isAdmin) return;

      setIsLoadingTeam(true);

      const { data, error } = await supabase
        .from("coach_team_selections")
        .select("coach_id, coach_name, team_data, is_submitted, submitted_at, updated_at");

      if (error) {
        setSubmitMessage(`Admin summary load failed: ${error.message}`);
        setIsLoadingTeam(false);
        return;
      }

      const rows = (data ?? []) as SavedTeamRow[];

      if (rows.length > 0) {
        setTeamsByCoach((prev) => {
          const next = { ...prev };

          for (const row of rows) {
            next[row.coach_id] = sanitiseTeamState(row.team_data);
          }

          return next;
        });

        setSubmittedCoachIds((prev) => {
          const next = { ...prev };

          for (const row of rows) {
            next[row.coach_id] = Boolean(row.is_submitted);
          }

          return next;
        });

        setLoadedCoachIds((prev) => {
          const next = { ...prev };

          for (const row of rows) {
            next[row.coach_id] = true;
          }

          return next;
        });

        setCoachMetaById((prev) => {
          const next = { ...prev };

          for (const row of rows) {
            next[row.coach_id] = {
              updatedAt: row.updated_at ?? null,
              submittedAt: row.submitted_at ?? null,
            };
          }

          return next;
        });

        setDirtyCoachIds((prev) => {
          const next = { ...prev };

          for (const row of rows) {
            next[row.coach_id] = false;
            changeVersionByCoachIdRef.current[row.coach_id] = 0;
          }

          return next;
        });

        setSaveIndicatorByCoachId((prev) => {
          const next = { ...prev };

          for (const row of rows) {
            next[row.coach_id] = "saved";
          }

          return next;
        });
      }

      setIsLoadingTeam(false);
    }

    void loadAllCoachTeamsForAdmin();
  }, [loginSession, isAdmin]);

  function getPlayerClub(playerName: string): string {
    return playerLookup.get(playerName)?.club ?? "";
  }

  const setCoachDirtyState = useCallback((coachId: number, nextState: SaveIndicatorState) => {
    setSaveIndicatorByCoachId((prev) => ({
      ...prev,
      [coachId]: nextState,
    }));
  }, []);

  const getCoachChangeVersion = useCallback((coachId: number): number => {
    return changeVersionByCoachIdRef.current[coachId] ?? 0;
  }, []);

  const markCoachAsDirty = useCallback(
    (coachId: number) => {
      changeVersionByCoachIdRef.current[coachId] = getCoachChangeVersion(coachId) + 1;

      setDirtyCoachIds((prev) => ({
        ...prev,
        [coachId]: true,
      }));

      setCoachDirtyState(coachId, "unsaved");
    },
    [getCoachChangeVersion, setCoachDirtyState]
  );

  const markCoachAsSaved = useCallback(
    (coachId: number, expectedVersion?: number) => {
      if (
        typeof expectedVersion === "number" &&
        getCoachChangeVersion(coachId) !== expectedVersion
      ) {
        setCoachDirtyState(coachId, "unsaved");
        return false;
      }

      setDirtyCoachIds((prev) => ({
        ...prev,
        [coachId]: false,
      }));

      setCoachDirtyState(coachId, "saved");
      return true;
    },
    [getCoachChangeVersion, setCoachDirtyState]
  );

  function updateCoachTeamState(nextTeamState: TeamState) {
    setTeamsByCoach((prev) => ({
      ...prev,
      [selectedCoachId]: nextTeamState,
    }));

    markCoachAsDirty(selectedCoachId);
    setSubmitMessage("");
  }

  async function handleLogin(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const email = loginEmail.trim();
    const password = loginPassword;

    if (!email) {
      setLoginError("Enter your email.");
      return;
    }

    if (!password) {
      setLoginError("Enter your password.");
      return;
    }

    setLoginError("");
    setIsAuthenticating(true);
    resetSessionScopedState();

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setLoginError(`Login failed: ${error.message}`);
      setIsAuthenticating(false);
      return;
    }

    const user = data.user;

    if (!user) {
      setLoginError("Login succeeded, but no user was returned.");
      setIsAuthenticating(false);
      return;
    }

    const session = await loadProfileForUser(user.id, user.email ?? email);

    if (!session) {
      await supabase.auth.signOut();
      setIsAuthenticating(false);
      return;
    }

    setLoginSession(session);

    if (session.role === "coach" && session.coachId) {
      setSelectedCoachId(session.coachId);
    }

    setLoginPassword("");
    setShowPassword(false);
    setSubmitMessage("");
    setIsAuthenticating(false);
  }

  async function handleLogout() {
    setIsAuthenticating(true);
    await supabase.auth.signOut();
    setLoginSession(null);
    setLoginEmail("");
    setLoginPassword("");
    setShowPassword(false);
    setLoginError("");
    resetSessionScopedState();
    router.replace("/login");
  }

  function handleAddPlayer(
    position: PositionKey,
    bucket: "onField" | "emergencies",
    playerName: string
  ) {
    if (!selectedCoach) return;
    if (!playerName) return;
    if (isSavingTeam) return;
    if (!canEditSelectedCoach) return;

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
  }

  function handleRemovePlayer(
    position: PositionKey,
    bucket: "onField" | "emergencies",
    playerName: string
  ) {
    if (!selectedCoach) return;
    if (isSavingTeam) return;
    if (!canEditSelectedCoach) return;

    const nextState = structuredClone(teamState) as TeamState;
    nextState[position][bucket] = nextState[position][bucket].filter(
      (name) => name !== playerName
    );
    updateCoachTeamState(nextState);
  }

  function handleMovePlayer(
    position: PositionKey,
    from: "onField" | "emergencies",
    to: "onField" | "emergencies",
    playerName: string
  ) {
    if (!selectedCoach) return;
    if (from === to) return;
    if (isSavingTeam) return;
    if (!canEditSelectedCoach) return;

    const limit =
      to === "onField"
        ? selectedCoach.slots[position]
        : selectedCoach.emergencyLimits[position];

    if (teamState[position][to].length >= limit) return;

    const nextState = removePlayerFromAllSlots(teamState, playerName);
    nextState[position][to].push(playerName);
    updateCoachTeamState(nextState);
  }

  function handleMoveEmergencyUp(position: PositionKey, index: number) {
    if (!selectedCoach) return;
    if (isSavingTeam) return;
    if (!canEditSelectedCoach) return;
    if (index <= 0) return;

    const nextState = structuredClone(teamState) as TeamState;
    nextState[position].emergencies = moveItem(
      nextState[position].emergencies,
      index,
      index - 1
    );
    updateCoachTeamState(nextState);
  }

  function handleMoveEmergencyDown(position: PositionKey, index: number) {
    if (!selectedCoach) return;
    if (isSavingTeam) return;
    if (!canEditSelectedCoach) return;
    if (index >= teamState[position].emergencies.length - 1) return;

    const nextState = structuredClone(teamState) as TeamState;
    nextState[position].emergencies = moveItem(
      nextState[position].emergencies,
      index,
      index + 1
    );
    updateCoachTeamState(nextState);
  }

  function handleResetCoachTeam() {
    if (!selectedCoach) return;
    if (isSavingTeam) return;
    if (!canEditSelectedCoach) return;

    updateCoachTeamState(emptyTeamState());
    setSubmitMessage(`Team reset for ${selectedCoach.name}. Save it again when ready.`);
  }

  function validateTeamState(
    coach: CoachConfigShape | undefined,
    team: TeamState
  ): { valid: boolean; errors: string[] } {
    if (!coach) {
      return { valid: false, errors: ["No coach selected."] };
    }

    const errors: string[] = [];

    for (const position of POSITIONS) {
      const onFieldRequired = coach.slots[position];
      const emergenciesAllowed = coach.emergencyLimits[position];
      const onFieldCount = team[position].onField.length;
      const emergencyCount = team[position].emergencies.length;

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

    const allPlayers = getAllSelectedPlayers(team);
    const uniquePlayers = new Set(allPlayers);

    if (allPlayers.length !== uniquePlayers.size) {
      errors.push("Duplicate player detected across team selections.");
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  const saveTeam = useCallback(
    async ({
      coach,
      team,
      isSubmitting,
      skipIncompleteWarning = false,
      source = "manual",
    }: SaveTeamOptions) => {
      if (!loginSession) {
        setSubmitMessage("You must be logged in to save a team.");
        return;
      }

      if (!isAdmin && loginSession.coachId !== coach.id) {
        setSubmitMessage("You do not have permission to save this team.");
        return;
      }

      if (!isSubmitting && (submittedCoachIds[coach.id] ?? false)) {
        setSubmitMessage(
          `${coach.name} is locked because the final team has already been submitted.`
        );
        return;
      }

      const result = validateTeamState(coach, team);

      if (isSubmitting) {
        if (!result.valid) {
          setSubmitMessage(`Team not ready to submit: ${result.errors.join(" ")}`);
          return;
        }
      } else if (!result.valid && !skipIncompleteWarning) {
        const confirmed = window.confirm(
          `This team is incomplete.\n\n${result.errors.join(
            "\n"
          )}\n\nDo you still want to save it as a draft?`
        );

        if (!confirmed) {
          setSubmitMessage("Save cancelled. Team not saved.");
          return;
        }
      }

      setIsSavingTeam(true);

      if (source === "auto") {
        setCoachDirtyState(coach.id, "saving");
      }

      if (source === "manual") {
        setSubmitMessage(isSubmitting ? "Submitting final team..." : "Saving team...");
      }

      const alreadySubmitted = submittedCoachIds[coach.id] ?? false;
      const nowIso = new Date().toISOString();
      const existingMeta = coachMetaById[coach.id];
      const saveVersion = getCoachChangeVersion(coach.id);

      const payload = {
        coach_id: coach.id,
        coach_name: coach.name,
        team_data: team,
        is_submitted: isSubmitting ? true : alreadySubmitted,
        submitted_at: isSubmitting ? nowIso : existingMeta?.submittedAt ?? null,
        updated_at: nowIso,
      };

      const { error } = await supabase
        .from("coach_team_selections")
        .upsert(payload, { onConflict: "coach_id" });

      if (error) {
        setSubmitMessage(
          source === "auto" ? `Auto-save failed: ${error.message}` : `Save failed: ${error.message}`
        );
        setCoachDirtyState(coach.id, dirtyCoachIds[coach.id] ? "unsaved" : "saved");
        setIsSavingTeam(false);
        return;
      }

      setCoachMetaById((prev) => ({
        ...prev,
        [coach.id]: {
          updatedAt: nowIso,
          submittedAt: isSubmitting ? nowIso : prev[coach.id]?.submittedAt ?? null,
        },
      }));

      if (isSubmitting) {
        setSubmittedCoachIds((prev) => ({
          ...prev,
          [coach.id]: true,
        }));
        setSubmitMessage(`Final team submitted for ${coach.name}. It is now locked.`);
      } else if (source === "manual") {
        setSubmitMessage(
          result.valid
            ? `Team saved for ${coach.name}.`
            : `Incomplete draft saved for ${coach.name}.`
        );
      }

      setLoadedCoachIds((prev) => ({
        ...prev,
        [coach.id]: true,
      }));

      markCoachAsSaved(coach.id, saveVersion);
      setIsSavingTeam(false);
    },
    [
      coachMetaById,
      dirtyCoachIds,
      getCoachChangeVersion,
      isAdmin,
      loginSession,
      markCoachAsSaved,
      setCoachDirtyState,
      submittedCoachIds,
    ]
  );

  async function unlockTeam() {
    if (!selectedCoach) return;
    if (!loginSession) {
      setSubmitMessage("You must be logged in to unlock a team.");
      return;
    }

    const canUnlockThisTeam = isAdmin || loginSession.coachId === selectedCoach.id;

    if (!canUnlockThisTeam) {
      setSubmitMessage("You do not have permission to unlock this team.");
      return;
    }

    setIsSavingTeam(true);
    setCoachDirtyState(selectedCoach.id, "saving");
    setSubmitMessage(`Unlocking ${selectedCoach.name}'s team for changes...`);

    const nowIso = new Date().toISOString();

    const payload = {
      coach_id: selectedCoach.id,
      coach_name: selectedCoach.name,
      team_data: teamState,
      is_submitted: false,
      submitted_at: null,
      updated_at: nowIso,
    };

    const { error } = await supabase
      .from("coach_team_selections")
      .upsert(payload, { onConflict: "coach_id" });

    if (error) {
      setSubmitMessage(`Unlock failed: ${error.message}`);
      setCoachDirtyState(selectedCoach.id, dirtyCoachIds[selectedCoach.id] ? "unsaved" : "saved");
      setIsSavingTeam(false);
      return;
    }

    setSubmittedCoachIds((prev) => ({
      ...prev,
      [selectedCoach.id]: false,
    }));

    setCoachMetaById((prev) => ({
      ...prev,
      [selectedCoach.id]: {
        updatedAt: nowIso,
        submittedAt: null,
      },
    }));

    setLoadedCoachIds((prev) => ({
      ...prev,
      [selectedCoach.id]: true,
    }));

    setDirtyCoachIds((prev) => ({
      ...prev,
      [selectedCoach.id]: false,
    }));

    setSaveIndicatorByCoachId((prev) => ({
      ...prev,
      [selectedCoach.id]: "saved",
    }));

    markCoachAsSaved(selectedCoach.id);
    setSubmitMessage(
      `${selectedCoach.name}'s team has been unlocked. Save Team, Reset Team, and Submit Final Team are available again.`
    );
    setIsSavingTeam(false);
  }

  async function handleResetAllTeams() {
    if (!loginSession || !isAdmin) {
      setSubmitMessage("Only admin can reset all teams.");
      return;
    }

    const confirmed = window.confirm(
      "Reset ALL coach teams?\n\nThis will clear all selections, unlock all teams, and remove all submitted statuses."
    );

    if (!confirmed) return;

    setIsSavingTeam(true);
    setSubmitMessage("Resetting all teams...");

    const nowIso = new Date().toISOString();
    const resetRows = coachConfigs.map((coach) => ({
      coach_id: coach.id,
      coach_name: coach.name,
      team_data: emptyTeamState(),
      is_submitted: false,
      submitted_at: null,
      updated_at: nowIso,
    }));

    const { error } = await supabase
      .from("coach_team_selections")
      .upsert(resetRows, { onConflict: "coach_id" });

    if (error) {
      setSubmitMessage(`Reset all teams failed: ${error.message}`);
      setIsSavingTeam(false);
      return;
    }

    const resetTeams = createTeamsByCoach(coachConfigs);
    const resetSubmitted: Record<number, boolean> = {};
    const resetMeta: Record<number, CoachMeta> = {};
    const resetLoaded: Record<number, boolean> = {};
    const resetDirty: Record<number, boolean> = {};
    const resetIndicator: Record<number, SaveIndicatorState> = {};

    for (const coach of coachConfigs) {
      resetSubmitted[coach.id] = false;
      resetMeta[coach.id] = {
        updatedAt: nowIso,
        submittedAt: null,
      };
      resetLoaded[coach.id] = true;
      resetDirty[coach.id] = false;
      resetIndicator[coach.id] = "saved";
      changeVersionByCoachIdRef.current[coach.id] = 0;
    }

    setTeamsByCoach(resetTeams);
    setSubmittedCoachIds(resetSubmitted);
    setCoachMetaById(resetMeta);
    setLoadedCoachIds(resetLoaded);
    setDirtyCoachIds(resetDirty);
    setSaveIndicatorByCoachId(resetIndicator);

    setSubmitMessage("All coach teams have been reset.");
    setIsSavingTeam(false);
  }

  useEffect(() => {
    if (autoSaveTimeoutRef.current) {
      clearTimeout(autoSaveTimeoutRef.current);
      autoSaveTimeoutRef.current = null;
    }

    if (!selectedCoach) return;
    if (!loginSession) return;
    if (!loadedCoachIds[selectedCoach.id]) return;
    if (!dirtyCoachIds[selectedCoach.id]) return;
    if (submittedCoachIds[selectedCoach.id]) return;
    if (isLoadingTeam) return;
    if (isSavingTeam) return;

    const coachSnapshot = selectedCoach;
    const teamSnapshot = structuredClone(teamState) as TeamState;

    autoSaveTimeoutRef.current = setTimeout(() => {
      void saveTeam({
        coach: coachSnapshot,
        team: teamSnapshot,
        isSubmitting: false,
        skipIncompleteWarning: true,
        source: "auto",
      });
    }, AUTO_SAVE_DEBOUNCE_MS);

    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
        autoSaveTimeoutRef.current = null;
      }
    };
  }, [
    dirtyCoachIds,
    isLoadingTeam,
    isSavingTeam,
    loadedCoachIds,
    loginSession,
    saveTeam,
    selectedCoach,
    submittedCoachIds,
    teamState,
  ]);

  function buildExportRowsForCoach(
    coachId: number,
    team: TeamState,
    poolsByCoach: Record<number, CoachPlayerPool>
  ): ExportPlayerRow[] {
    const rows: ExportPlayerRow[] = [];
    const coachPoolForLookup = poolsByCoach[coachId];

    const selectedLookup = new Map<
      string,
      { selectedCode: string; selectionOrder: number | string }
    >();

    for (const position of POSITIONS) {
      team[position].onField.forEach((playerName, index) => {
        selectedLookup.set(playerName, {
          selectedCode: "X",
          selectionOrder: index + 1,
        });
      });

      team[position].emergencies.forEach((playerName, index) => {
        selectedLookup.set(playerName, {
          selectedCode: `I${index + 1}`,
          selectionOrder: index + 1,
        });
      });
    }

    for (const position of POSITIONS) {
      for (const player of coachPoolForLookup[position]) {
        const selectedMeta = selectedLookup.get(player.name);

        rows.push({
          "Player No.": player.number,
          Position: position,
          Club: player.club,
          "Player Name": player.name,
          Selected: selectedMeta?.selectedCode ?? "Z",
          "Selection Order": selectedMeta?.selectionOrder ?? "",
        });
      }
    }

    rows.sort((a, b) => {
      const noA = typeof a["Player No."] === "number" ? a["Player No."] : Number(a["Player No."]);
      const noB = typeof b["Player No."] === "number" ? b["Player No."] : Number(b["Player No."]);
      return noA - noB;
    });

    return rows;
  }

  async function handleExportTeamsXlsx() {
    if (!isAdmin) return;

    setIsExportingTeams(true);
    setSubmitMessage("Preparing XLSX export...");

    try {
      const { data, error } = await supabase
        .from("coach_team_selections")
        .select("coach_id, coach_name, team_data, is_submitted, submitted_at, updated_at")
        .order("coach_id", { ascending: true });

      if (error) {
        setSubmitMessage(`Export failed: ${error.message}`);
        setIsExportingTeams(false);
        return;
      }

      const rows = (data ?? []) as SavedTeamRow[];
      const workbook = XLSX.utils.book_new();

      const poolsByCoach: Record<number, CoachPlayerPool> = {};
      for (const coach of coachConfigs) {
        poolsByCoach[coach.id] = getPlayersForCoach({
          coachId: coach.id,
          coachName: coach.name,
        });
      }

      for (const coach of coachConfigs) {
        const dbRow = rows.find((row) => row.coach_id === coach.id);

        const coachTeam = dbRow?.team_data
          ? sanitiseTeamState(dbRow.team_data)
          : teamsByCoach[coach.id] ?? emptyTeamState();

        const exportRows = buildExportRowsForCoach(coach.id, coachTeam, poolsByCoach);

        const summaryRows: ExportPlayerRow[] = [
          {
            "Player No.": "",
            Position: "",
            Club: "",
            "Player Name": "",
            Selected: "",
            "Selection Order": "",
          },
          {
            "Player No.": "",
            Position: "Coach",
            Club: "",
            "Player Name": "",
            Selected: coach.name,
            "Selection Order": "",
          },
          {
            "Player No.": "",
            Position: "Coach ID",
            Club: "",
            "Player Name": "",
            Selected: String(coach.id),
            "Selection Order": "",
          },
          {
            "Player No.": "",
            Position: "Status",
            Club: "",
            "Player Name": "",
            Selected: dbRow?.is_submitted ? "Submitted Final Team" : "Draft in Progress",
            "Selection Order": "",
          },
          {
            "Player No.": "",
            Position: "Last Updated",
            Club: "",
            "Player Name": "",
            Selected: formatTimestamp(dbRow?.updated_at ?? null),
            "Selection Order": "",
          },
          {
            "Player No.": "",
            Position: "Submitted At",
            Club: "",
            "Player Name": "",
            Selected: formatTimestamp(dbRow?.submitted_at ?? null),
            "Selection Order": "",
          },
        ];

        const worksheetData = [...exportRows, ...summaryRows];

        const worksheet = XLSX.utils.json_to_sheet(worksheetData, {
          header: [
            "Player No.",
            "Position",
            "Club",
            "Player Name",
            "Selected",
            "Selection Order",
          ],
        });

        worksheet["!cols"] = [
          { wch: 10 },
          { wch: 10 },
          { wch: 12 },
          { wch: 28 },
          { wch: 16 },
          { wch: 16 },
        ];

        XLSX.utils.book_append_sheet(workbook, worksheet, safeSheetName(coach.name));
      }

      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      XLSX.writeFile(workbook, `coach-team-selections-${timestamp}.xlsx`);
      setSubmitMessage("XLSX export complete.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown export error.";
      setSubmitMessage(`Export failed: ${message}`);
    } finally {
      setIsExportingTeams(false);
    }
  }

  const validationResult = selectedCoach
    ? validateTeamState(selectedCoach, teamState)
    : { valid: false, errors: ["No coach selected."] };

  const duplicateCheck = (() => {
    const allPlayers = getAllSelectedPlayers(teamState);
    const uniquePlayers = new Set(allPlayers);

    return {
      hasDuplicates: allPlayers.length !== uniquePlayers.size,
      totalSelected: allPlayers.length,
      uniqueSelected: uniquePlayers.size,
    };
  })();

  const reviewRows = (() => {
    if (!selectedCoach) return [];

    return POSITIONS.map((position) => {
      const onFieldSelected = teamState[position].onField.length;
      const onFieldRequired = selectedCoach.slots[position];
      const emergencySelected = teamState[position].emergencies.length;
      const emergencyAllowed = selectedCoach.emergencyLimits[position];

      const onFieldReady = onFieldSelected === onFieldRequired;
      const emergenciesValid = emergencySelected <= emergencyAllowed;

      let statusText = "Ready";
      let statusClass = "border-emerald-500/30 bg-emerald-500/15 text-emerald-200";

      if (!onFieldReady) {
        statusText = "Incomplete";
        statusClass = "border-amber-500/30 bg-amber-500/15 text-amber-200";
      }

      if (!emergenciesValid) {
        statusText = "Over Limit";
        statusClass = "border-red-500/30 bg-red-500/15 text-red-200";
      }

      return {
        position,
        onFieldSelected,
        onFieldRequired,
        emergencySelected,
        emergencyAllowed,
        statusText,
        statusClass,
      };
    });
  })();

  const readyToSubmit = validationResult.valid;
  const isSubmitted = selectedCoach ? Boolean(submittedCoachIds[selectedCoach.id]) : false;
  const coachMeta = selectedCoach
    ? coachMetaById[selectedCoach.id] ?? { updatedAt: null, submittedAt: null }
    : { updatedAt: null, submittedAt: null };

  const currentSaveIndicator = selectedCoach
    ? saveIndicatorByCoachId[selectedCoach.id] ?? "saved"
    : "saved";

  const saveIndicatorClass =
    currentSaveIndicator === "saving"
      ? "border-sky-500/30 bg-sky-500/15 text-sky-100"
      : currentSaveIndicator === "unsaved"
        ? "border-amber-500/30 bg-amber-500/15 text-amber-100"
        : "border-emerald-500/30 bg-emerald-500/15 text-emerald-100";

  const saveIndicatorText =
    currentSaveIndicator === "saving"
      ? "Auto-saving..."
      : currentSaveIndicator === "unsaved"
        ? "Unsaved changes"
        : "All changes saved";

  const statusBadgeClass = isSubmitted
    ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-200"
    : "border-amber-500/30 bg-amber-500/15 text-amber-200";

  if (isAuthenticating) {
    return (
      <main className="min-h-screen bg-neutral-950 px-4 py-8 text-white">
        <div className="mx-auto max-w-md rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
          <h1 className="text-3xl font-bold">Coach Team Login</h1>
          <p className="mt-2 text-sm text-white/70">Checking your session...</p>
        </div>
      </main>
    );
  }

  if (!loginSession) {
    return null;
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-8 text-white">
      <div className="mx-auto max-w-7xl">
        <section className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h1 className="text-3xl font-bold">Coach Team Selection</h1>
              <p className="mt-1 text-sm text-white/70">
                Signed in as {loginSession.email} • {isAdmin ? "Admin" : loginSession.coachName}
              </p>
            </div>

            <button
              type="button"
              onClick={handleLogout}
              className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10"
            >
              Log Out
            </button>
          </div>
        </section>

        {isAdmin && (
          <section className="mb-6 rounded-2xl border border-sky-500/20 bg-sky-500/5 p-6">
            <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div>
                <h2 className="text-2xl font-bold">Admin Team Summary</h2>
                <p className="mt-1 text-sm text-white/70">
                  View all coaches and their current saved selections in one place.
                </p>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void handleResetAllTeams()}
                  disabled={isSavingTeam || isLoadingTeam || isExportingTeams}
                  className="rounded-xl border border-red-500/30 bg-red-500/15 px-4 py-3 text-sm font-semibold text-red-100 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isSavingTeam ? "Resetting..." : "Reset All Teams"}
                </button>

                <button
                  type="button"
                  onClick={handleExportTeamsXlsx}
                  disabled={isExportingTeams || isLoadingTeam || isSavingTeam}
                  className="rounded-xl border border-sky-500/30 bg-sky-500/15 px-4 py-3 text-sm font-semibold text-sky-100 hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isExportingTeams ? "Exporting..." : "Export Teams (XLSX)"}
                </button>
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-2">
              {coachConfigs.map((coach) => {
                const coachTeam = teamsByCoach[coach.id] ?? emptyTeamState();
                const coachSubmitted = Boolean(submittedCoachIds[coach.id]);
                const meta = coachMetaById[coach.id] ?? {
                  updatedAt: null,
                  submittedAt: null,
                };

                return (
                  <div
                    key={coach.id}
                    className={`rounded-2xl border p-4 ${
                      coachSubmitted
                        ? "border-emerald-500/20 bg-emerald-500/5"
                        : "border-white/10 bg-black/20"
                    }`}
                  >
                    <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                      <div>
                        <div className="text-lg font-bold">{coach.name}</div>
                        <div className="text-xs text-white/50">Coach ID: {coach.id}</div>
                      </div>
                      <div
                        className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                          coachSubmitted
                            ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-200"
                            : "border-amber-500/30 bg-amber-500/15 text-amber-200"
                        }`}
                      >
                        {coachSubmitted ? "Submitted Final Team" : "Draft in Progress"}
                      </div>
                    </div>

                    <div className="mb-3 text-xs text-white/50">
                      <div>Last updated: {formatTimestamp(meta.updatedAt)}</div>
                      {meta.submittedAt ? (
                        <div>Submitted at: {formatTimestamp(meta.submittedAt)}</div>
                      ) : null}
                    </div>

                    <div className="grid gap-3 md:grid-cols-2">
                      {POSITIONS.map((position) => (
                        <div
                          key={`${coach.id}-${position}`}
                          className="rounded-xl border border-white/10 bg-white/5 p-3"
                        >
                          <div className="mb-2 text-sm font-bold">{position}</div>

                          <div className="mb-2">
                            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-violet-200">
                              On-Field
                            </div>
                            {coachTeam[position].onField.length === 0 ? (
                              <div className="text-xs text-white/40">None selected</div>
                            ) : (
                              <div className="space-y-1">
                                {coachTeam[position].onField.map((player, index) => (
                                  <div
                                    key={`${coach.id}-${position}-on-${player}-${index}`}
                                    className="rounded-lg bg-black/20 px-2 py-1 text-xs text-white/85"
                                  >
                                    {player}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          <div>
                            <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-200">
                              Emergencies
                            </div>
                            {coachTeam[position].emergencies.length === 0 ? (
                              <div className="text-xs text-white/40">None selected</div>
                            ) : (
                              <div className="space-y-1">
                                {coachTeam[position].emergencies.map((player, index) => (
                                  <div
                                    key={`${coach.id}-${position}-em-${player}-${index}`}
                                    className="rounded-lg bg-black/20 px-2 py-1 text-xs text-white/85"
                                  >
                                    {index + 1}. {player}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-2xl font-bold">Team Controls</h2>
              <p className="mt-1 text-sm text-white/70">
                {isAdmin
                  ? "Admin can switch between all coaches and unlock submitted teams."
                  : "Coach access is locked to your own team, including unlocking your own submitted team."}
              </p>
            </div>

            <div className="min-w-[240px]">
              <label className="mb-2 block text-sm font-medium text-white/80">Coach</label>
              <select
                value={selectedCoachId}
                onChange={(e) => setSelectedCoachId(Number(e.target.value))}
                disabled={!isAdmin}
                className="w-full rounded-xl border border-white/10 bg-neutral-900 px-4 py-3 text-white outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                {coachConfigs.map((coach) => (
                  <option key={coach.id} value={coach.id}>
                    {coach.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <div
              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${statusBadgeClass}`}
            >
              {isLoadingTeam
                ? "Loading saved team..."
                : isSubmitted
                  ? "Submitted Final Team"
                  : "Draft in Progress"}
            </div>

            {isSubmitted ? (
              <div className="text-xs text-emerald-200/90">
                This final team is locked until it is unlocked for changes.
              </div>
            ) : canEditSelectedCoach ? (
              <div className="text-xs text-white/60">
                Save Team, Reset Team, and Submit Final Team are available.
              </div>
            ) : (
              <div className="text-xs text-white/60">
                This team cannot be edited from the current session.
              </div>
            )}

            <div
              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${saveIndicatorClass}`}
            >
              {saveIndicatorText}
            </div>
          </div>

          <div className="mt-3 text-xs text-white/50">
            <div>Last saved: {formatTimestamp(coachMeta.updatedAt)}</div>
            <div>Submitted at: {formatTimestamp(coachMeta.submittedAt)}</div>
          </div>

          {canUnlockSelectedCoach ? (
            <div className="mt-4 rounded-2xl border border-sky-500/20 bg-sky-500/10 p-4">
              <div className="mb-2 text-sm font-semibold text-sky-100">
                Unlock available
              </div>
              <div className="text-sm text-sky-100/80">
                Unlock this submitted team to restore Save Team, Reset Team, and Submit Final Team.
              </div>
            </div>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-3">
            {canEditSelectedCoach && (
              <>
                <button
                  type="button"
                  onClick={() =>
                    selectedCoach
                      ? void saveTeam({
                          coach: selectedCoach,
                          team: teamState,
                          isSubmitting: false,
                          source: "manual",
                        })
                      : undefined
                  }
                  disabled={isSavingTeam || isLoadingTeam}
                  className="rounded-xl border border-white/10 bg-white px-4 py-3 text-sm font-semibold text-black hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Save Team
                </button>

                <button
                  type="button"
                  onClick={() => handleResetCoachTeam()}
                  disabled={isSavingTeam || isLoadingTeam}
                  className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Reset Team
                </button>

                <button
                  type="button"
                  onClick={() =>
                    selectedCoach
                      ? void saveTeam({
                          coach: selectedCoach,
                          team: teamState,
                          isSubmitting: true,
                          source: "manual",
                        })
                      : undefined
                  }
                  disabled={isSavingTeam || isLoadingTeam || isSubmitted}
                  className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-black hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Submit Final Team
                </button>
              </>
            )}

            {canUnlockSelectedCoach && (
              <button
                type="button"
                onClick={() => void unlockTeam()}
                disabled={isSavingTeam || isLoadingTeam}
                className="rounded-xl border border-sky-500/30 bg-sky-500/15 px-4 py-3 text-sm font-semibold text-sky-100 hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Unlock Team
              </button>
            )}
          </div>

          {submitMessage ? (
            <div
              className={`mt-4 rounded-xl px-4 py-3 text-sm ${
                isSubmitted
                  ? "border border-emerald-500/25 bg-emerald-500/10 text-emerald-100"
                  : "border border-white/10 bg-black/20 text-white/85"
              }`}
            >
              {submitMessage}
            </div>
          ) : null}
        </section>

        <section
          className={`mb-6 rounded-2xl border p-6 ${
            readyToSubmit
              ? "border-emerald-500/20 bg-emerald-500/5"
              : "border-amber-500/20 bg-amber-500/5"
          }`}
        >
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <h2 className="text-2xl font-bold">Final Review Panel</h2>
              <p className="mt-1 text-sm text-white/70">
                Review the selected coach&apos;s team before final submission.
              </p>
            </div>

            <div
              className={`inline-flex rounded-full border px-3 py-1 text-sm font-semibold ${
                readyToSubmit
                  ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-200"
                  : "border-amber-500/30 bg-amber-500/15 text-amber-200"
              }`}
            >
              {readyToSubmit ? "Ready to Submit" : "Not Ready Yet"}
            </div>
          </div>

          <div className="mb-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {reviewRows.map((row) => (
              <div
                key={row.position}
                className="rounded-2xl border border-white/10 bg-black/20 p-4"
              >
                <div className="mb-3 flex items-center justify-between">
                  <div className="text-lg font-bold">{row.position}</div>
                  <div
                    className={`rounded-full border px-3 py-1 text-xs font-semibold ${row.statusClass}`}
                  >
                    {row.statusText}
                  </div>
                </div>

                <div className="space-y-2 text-sm text-white/80">
                  <div>
                    On-field: {row.onFieldSelected} / {row.onFieldRequired}
                  </div>
                  <div>
                    Emergencies: {row.emergencySelected} / {row.emergencyAllowed}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {validationResult.errors.length > 0 && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
              <div className="mb-2 text-sm font-semibold text-amber-200">Issues to fix</div>
              <ul className="list-disc space-y-1 pl-5 text-sm text-amber-100/90">
                {validationResult.errors.map((error, index) => (
                  <li key={`${error}-${index}`}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          {duplicateCheck.hasDuplicates && (
            <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-sm text-red-100">
              Duplicate player detected. Total selected: {duplicateCheck.totalSelected}. Unique
              players: {duplicateCheck.uniqueSelected}.
            </div>
          )}
        </section>

        <section className="grid gap-6">
          {POSITIONS.map((position) => {
            const availablePlayers = coachPool[position].filter(
              (player) => !isPlayerAlreadySelected(teamState, player.name)
            );

            return (
              <section
                key={position}
                className="rounded-2xl border border-white/10 bg-white/5 p-6"
              >
                <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h3 className="text-2xl font-bold">{position}</h3>
                    <p className="mt-1 text-sm text-white/70">
                      On-field: {selectedCoach?.slots[position] ?? 0} • Emergencies:{" "}
                      {selectedCoach?.emergencyLimits[position] ?? 0}
                    </p>
                  </div>

                  <div className="text-sm text-white/60">
                    Available in pool: {coachPool[position].length}
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="mb-3 text-sm font-bold uppercase tracking-wide text-violet-200">
                      On-Field
                    </div>

                    <div className="space-y-2">
                      {teamState[position].onField.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-sm text-white/40">
                          No players selected
                        </div>
                      ) : (
                        teamState[position].onField.map((player, index) => (
                          <div
                            key={`${position}-on-${player}-${index}`}
                            className="rounded-xl border border-white/10 bg-white/5 p-3"
                          >
                            <div className="font-semibold">{player}</div>
                            <div className="text-xs text-white/50">{getPlayerClub(player)}</div>

                            {canEditSelectedCoach && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleMovePlayer(position, "onField", "emergencies", player)
                                  }
                                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
                                >
                                  Move to Emergencies
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleRemovePlayer(position, "onField", player)
                                  }
                                  className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/15"
                                >
                                  Remove
                                </button>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>

                    {canEditSelectedCoach &&
                    selectedCoach &&
                    teamState[position].onField.length < selectedCoach.slots[position] ? (
                      <div className="mt-4">
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-white/60">
                          Add to On-Field
                        </label>
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            const value = e.target.value;
                            if (!value) return;
                            handleAddPlayer(position, "onField", value);
                            e.target.value = "";
                          }}
                          className="w-full rounded-xl border border-white/10 bg-neutral-900 px-4 py-3 text-sm text-white outline-none"
                        >
                          <option value="">Select player</option>
                          {availablePlayers.map((player) => (
                            <option key={`${position}-available-on-${player.name}`} value={player.name}>
                              {player.name} ({player.club})
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="mb-3 text-sm font-bold uppercase tracking-wide text-amber-200">
                      Emergencies
                    </div>

                    <div className="space-y-2">
                      {teamState[position].emergencies.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-sm text-white/40">
                          No emergencies selected
                        </div>
                      ) : (
                        teamState[position].emergencies.map((player, index) => (
                          <div
                            key={`${position}-em-${player}-${index}`}
                            className="rounded-xl border border-white/10 bg-white/5 p-3"
                          >
                            <div className="font-semibold">
                              {index + 1}. {player}
                            </div>
                            <div className="text-xs text-white/50">{getPlayerClub(player)}</div>

                            {canEditSelectedCoach && (
                              <div className="mt-3 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleMovePlayer(position, "emergencies", "onField", player)
                                  }
                                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10"
                                >
                                  Move to On-Field
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleMoveEmergencyUp(position, index)}
                                  disabled={index === 0}
                                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  Move Up
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handleMoveEmergencyDown(position, index)}
                                  disabled={index === teamState[position].emergencies.length - 1}
                                  className="rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  Move Down
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleRemovePlayer(position, "emergencies", player)
                                  }
                                  className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 hover:bg-red-500/15"
                                >
                                  Remove
                                </button>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>

                    {canEditSelectedCoach &&
                    selectedCoach &&
                    teamState[position].emergencies.length <
                      selectedCoach.emergencyLimits[position] ? (
                      <div className="mt-4">
                        <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-white/60">
                          Add to Emergencies
                        </label>
                        <select
                          defaultValue=""
                          onChange={(e) => {
                            const value = e.target.value;
                            if (!value) return;
                            handleAddPlayer(position, "emergencies", value);
                            e.target.value = "";
                          }}
                          className="w-full rounded-xl border border-white/10 bg-neutral-900 px-4 py-3 text-sm text-white outline-none"
                        >
                          <option value="">Select player</option>
                          {availablePlayers.map((player) => (
                            <option key={`${position}-available-em-${player.name}`} value={player.name}>
                              {player.name} ({player.club})
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : null}
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                    <div className="mb-3 text-sm font-bold uppercase tracking-wide text-white/80">
                      Available Players
                    </div>

                    <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                      {availablePlayers.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-sm text-white/40">
                          No remaining players available in this position
                        </div>
                      ) : (
                        availablePlayers.map((player) => (
                          <div
                            key={`${position}-available-${player.name}`}
                            className="rounded-xl border border-white/10 bg-white/5 px-3 py-3"
                          >
                            <div className="font-semibold">
                              {player.number}. {player.name}
                            </div>
                            <div className="text-xs text-white/50">{player.club}</div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>
              </section>
            );
          })}
        </section>
      </div>
    </main>
  );
}
