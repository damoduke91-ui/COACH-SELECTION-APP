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
import { APP_ENV, supabase } from "../../lib/supabase";

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
  environment: "production" | "preview";
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

type AppSettingsRow = {
  environment: "production" | "preview";
  team_lockout?: boolean | null;
  updated_at?: string | null;
  lockout_enabled?: boolean | null;
  lockout_day?: string | null;
  lockout_time?: string | null;
  lockout_timezone?: string | null;
  lockout_at?: string | null;
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
const LOCKOUT_TICK_MS = 30000;
const DEFAULT_LOCKOUT_DAY = "Thursday";
const DEFAULT_LOCKOUT_TIME = "19:20";
const DEFAULT_LOCKOUT_TIMEZONE = "Australia/Melbourne";
const WEEKDAY_OPTIONS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

type WeekdayName = (typeof WEEKDAY_OPTIONS)[number];

function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function normaliseWeekday(value: string | null | undefined): WeekdayName {
  const match = WEEKDAY_OPTIONS.find(
    (weekday) => weekday.toLowerCase() === String(value ?? "").trim().toLowerCase()
  );

  return match ?? DEFAULT_LOCKOUT_DAY;
}

function normaliseTimeValue(value: string | null | undefined): string {
  const raw = String(value ?? "").trim();

  if (!raw) return DEFAULT_LOCKOUT_TIME;

  const match = raw.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);

  if (!match) return DEFAULT_LOCKOUT_TIME;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);

  if (!Number.isInteger(hours) || hours < 0 || hours > 23) return DEFAULT_LOCKOUT_TIME;
  if (!Number.isInteger(minutes) || minutes < 0 || minutes > 59) return DEFAULT_LOCKOUT_TIME;

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

function getTimeZoneOffsetMinutes(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    timeZoneName: "shortOffset",
    hour: "2-digit",
  });

  const parts = formatter.formatToParts(date);
  const offsetValue = parts.find((part) => part.type === "timeZoneName")?.value ?? "GMT+0";
  const match = offsetValue.match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/i);

  if (!match) {
    return 0;
  }

  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] ?? "0");
  const minutes = Number(match[3] ?? "0");

  return sign * (hours * 60 + minutes);
}

function getTimeZoneNowParts(timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-AU", {
    timeZone,
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(new Date());
  const values: Record<string, string> = {};

  for (const part of parts) {
    if (part.type !== "literal") {
      values[part.type] = part.value;
    }
  }

  return {
    weekday: normaliseWeekday(values.weekday),
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second),
  };
}

function buildLockoutAtIso(day: string, time: string, timeZone: string): string {
  const weekday = normaliseWeekday(day);
  const [hourText, minuteText] = normaliseTimeValue(time).split(":");
  const targetHour = Number(hourText);
  const targetMinute = Number(minuteText);

  const nowParts = getTimeZoneNowParts(timeZone);
  const currentIndex = WEEKDAY_OPTIONS.indexOf(nowParts.weekday);
  const targetIndex = WEEKDAY_OPTIONS.indexOf(weekday);

  let daysAhead = (targetIndex - currentIndex + 7) % 7;

  const currentMinutes = nowParts.hour * 60 + nowParts.minute;
  const targetMinutes = targetHour * 60 + targetMinute;

  if (daysAhead === 0 && targetMinutes <= currentMinutes) {
    daysAhead = 7;
  }

  const roughUtc = new Date(
    Date.UTC(
      nowParts.year,
      nowParts.month - 1,
      nowParts.day + daysAhead,
      targetHour,
      targetMinute,
      0,
      0
    )
  );

  let offsetMinutes = getTimeZoneOffsetMinutes(roughUtc, timeZone);
  let finalUtcMs =
    Date.UTC(
      nowParts.year,
      nowParts.month - 1,
      nowParts.day + daysAhead,
      targetHour,
      targetMinute,
      0,
      0
    ) -
    offsetMinutes * 60 * 1000;

  const adjustedDate = new Date(finalUtcMs);
  const adjustedOffsetMinutes = getTimeZoneOffsetMinutes(adjustedDate, timeZone);

  if (adjustedOffsetMinutes !== offsetMinutes) {
    offsetMinutes = adjustedOffsetMinutes;
    finalUtcMs =
      Date.UTC(
        nowParts.year,
        nowParts.month - 1,
        nowParts.day + daysAhead,
        targetHour,
        targetMinute,
        0,
        0
      ) -
      offsetMinutes * 60 * 1000;
  }

  return new Date(finalUtcMs).toISOString();
}

function isScheduledLockoutActive(settings: {
  enabled: boolean;
  lockoutAt: string | null;
}): boolean {
  if (!settings.enabled) return false;
  if (!settings.lockoutAt) return false;

  const lockoutDate = new Date(settings.lockoutAt);

  if (Number.isNaN(lockoutDate.getTime())) return false;

  return Date.now() >= lockoutDate.getTime();
}

function formatScheduleSummary(options: {
  enabled: boolean;
  lockoutDay: string;
  lockoutTime: string;
  lockoutTimezone: string;
  lockoutAt: string | null;
}): string {
  if (!options.enabled) {
    return "Schedule OFF";
  }

  const base = `${normaliseWeekday(options.lockoutDay)} at ${normaliseTimeValue(
    options.lockoutTime
  )} (${options.lockoutTimezone || DEFAULT_LOCKOUT_TIMEZONE})`;

  if (!options.lockoutAt) {
    return `Schedule ON • ${base}`;
  }

  return `Schedule ON • ${base} • Next lockout: ${formatTimestamp(options.lockoutAt)}`;
}

function normaliseAppSettingsRow(input: unknown): AppSettingsRow {
  const row = input && typeof input === "object" ? (input as Record<string, unknown>) : {};

  return {
    environment: APP_ENV,
    team_lockout: Boolean(row.team_lockout),
    updated_at: typeof row.updated_at === "string" ? row.updated_at : null,
    lockout_enabled:
      typeof row.lockout_enabled === "boolean" ? row.lockout_enabled : Boolean(row.lockout_at),
    lockout_day: typeof row.lockout_day === "string" ? row.lockout_day : DEFAULT_LOCKOUT_DAY,
    lockout_time: typeof row.lockout_time === "string" ? row.lockout_time : DEFAULT_LOCKOUT_TIME,
    lockout_timezone:
      typeof row.lockout_timezone === "string" && row.lockout_timezone.trim()
        ? row.lockout_timezone
        : DEFAULT_LOCKOUT_TIMEZONE,
    lockout_at: typeof row.lockout_at === "string" ? row.lockout_at : null,
  };
}

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

async function loadAppSettings(): Promise<AppSettingsRow> {
  const { data, error } = await supabase
    .from("app_settings")
    .select("*")
    .eq("environment", APP_ENV)
    .maybeSingle();

  if (error) {
    console.error("Failed to load app settings:", error.message);
    return normaliseAppSettingsRow(null);
  }

  return normaliseAppSettingsRow(data);
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
  const [manualTeamLockout, setManualTeamLockout] = useState(false);
  const [lockoutScheduleEnabled, setLockoutScheduleEnabled] = useState(false);
  const [lockoutScheduleDay, setLockoutScheduleDay] = useState<WeekdayName>(DEFAULT_LOCKOUT_DAY);
  const [lockoutScheduleTime, setLockoutScheduleTime] = useState(DEFAULT_LOCKOUT_TIME);
  const [lockoutScheduleTimezone, setLockoutScheduleTimezone] = useState(
    DEFAULT_LOCKOUT_TIMEZONE
  );
  const [lockoutScheduleAt, setLockoutScheduleAt] = useState<string | null>(null);
  const [isTogglingLockout, setIsTogglingLockout] = useState(false);
  const [isSavingLockoutSchedule, setIsSavingLockoutSchedule] = useState(false);
  const [lockoutClockTick, setLockoutClockTick] = useState(() => Date.now());
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

  const scheduledTeamLockoutActive = useMemo(
    () =>
      isScheduledLockoutActive({
        enabled: lockoutScheduleEnabled,
        lockoutAt: lockoutScheduleAt,
      }),
    [lockoutClockTick, lockoutScheduleAt, lockoutScheduleEnabled]
  );

  const isTeamLocked = manualTeamLockout || scheduledTeamLockoutActive;
  const lockoutModeText = manualTeamLockout
    ? "Manual"
    : scheduledTeamLockoutActive
      ? "Scheduled"
      : "Off";
  const lockoutScheduleSummary = formatScheduleSummary({
    enabled: lockoutScheduleEnabled,
    lockoutDay: lockoutScheduleDay,
    lockoutTime: lockoutScheduleTime,
    lockoutTimezone: lockoutScheduleTimezone,
    lockoutAt: lockoutScheduleAt,
  });

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
      !Boolean(submittedCoachIds[selectedCoach.id]) &&
      (isAdmin || !isTeamLocked)
  );

  const canUnlockSelectedCoach = Boolean(
    selectedCoach &&
      loginSession &&
      !isLoadingTeam &&
      canViewSelectedCoach &&
      Boolean(submittedCoachIds[selectedCoach.id]) &&
      (isAdmin || !isTeamLocked)
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
        .eq("environment", APP_ENV)
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

      const nextSession = await loadProfileForUser(session.user.id, session.user.email ?? "");

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

        const nextSession = await loadProfileForUser(session.user.id, session.user.email ?? "");

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

  const applyAppSettings = useCallback((row: AppSettingsRow) => {
    setManualTeamLockout(Boolean(row.team_lockout));
    setLockoutScheduleEnabled(Boolean(row.lockout_enabled));
    setLockoutScheduleDay(normaliseWeekday(row.lockout_day));
    setLockoutScheduleTime(normaliseTimeValue(row.lockout_time));
    setLockoutScheduleTimezone(row.lockout_timezone || DEFAULT_LOCKOUT_TIMEZONE);
    setLockoutScheduleAt(row.lockout_at ?? null);
  }, []);

  const refreshAppSettings = useCallback(async () => {
    const settings = await loadAppSettings();
    applyAppSettings(settings);
    setLockoutClockTick(Date.now());
  }, [applyAppSettings]);

  useEffect(() => {
    let isMounted = true;

    async function initialLoadAppSettings() {
      const settings = await loadAppSettings();

      if (!isMounted) return;
      applyAppSettings(settings);
      setLockoutClockTick(Date.now());
    }

    void initialLoadAppSettings();

    return () => {
      isMounted = false;
    };
  }, [applyAppSettings]);

  useEffect(() => {
    const channel = supabase
      .channel(`app-settings-${APP_ENV}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "app_settings",
          filter: `environment=eq.${APP_ENV}`,
        },
        () => {
          void refreshAppSettings();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refreshAppSettings]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setLockoutClockTick(Date.now());
    }, LOCKOUT_TICK_MS);

    return () => {
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    async function loadCoachTeam() {
      if (!selectedCoach) return;
      if (!loginSession) return;
      if (loadedCoachIds[selectedCoach.id]) return;

      setIsLoadingTeam(true);

      const { data, error } = await supabase
        .from("coach_team_selections")
        .select("coach_id, coach_name, team_data, is_submitted, submitted_at, updated_at, environment")
        .eq("coach_id", selectedCoach.id)
        .eq("environment", APP_ENV)
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
        .select("coach_id, coach_name, team_data, is_submitted, submitted_at, updated_at, environment")
        .eq("environment", APP_ENV);

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

      if (!isAdmin && isTeamLocked) {
        setSubmitMessage("Team selection is locked. You can view your team but cannot make changes.");
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
        environment: APP_ENV,
        is_submitted: isSubmitting ? true : alreadySubmitted,
        submitted_at: isSubmitting ? nowIso : existingMeta?.submittedAt ?? null,
        updated_at: nowIso,
      };

      const { error } = await supabase
        .from("coach_team_selections")
        .upsert(payload, { onConflict: "coach_id,environment" });

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

    const canUnlockThisTeam = isAdmin || (!isTeamLocked && loginSession.coachId === selectedCoach.id);

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
      environment: APP_ENV,
      is_submitted: false,
      submitted_at: null,
      updated_at: nowIso,
    };

    const { error } = await supabase
      .from("coach_team_selections")
      .upsert(payload, { onConflict: "coach_id,environment" });

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
      environment: APP_ENV,
      is_submitted: false,
      submitted_at: null,
      updated_at: nowIso,
    }));

    const { error } = await supabase
      .from("coach_team_selections")
      .upsert(resetRows, { onConflict: "coach_id,environment" });

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

  async function handleToggleTeamLockout() {
    if (!loginSession || !isAdmin) {
      setSubmitMessage("Only admin can change team lockout.");
      return;
    }

    const nextManualLockState = !manualTeamLockout;
    const actionLabel = nextManualLockState ? "turn ON" : "turn OFF";
    const confirmed = window.confirm(
      `Are you sure you want to ${actionLabel} manual team lockout?`
    );

    if (!confirmed) return;

    setIsTogglingLockout(true);
    setSubmitMessage(
      nextManualLockState
        ? "Turning manual team lockout ON..."
        : "Turning manual team lockout OFF..."
    );

    const { error } = await supabase.from("app_settings").upsert(
      {
        environment: APP_ENV,
        team_lockout: nextManualLockState,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "environment" }
    );

    if (error) {
      setSubmitMessage(`Manual team lockout update failed: ${error.message}`);
      setIsTogglingLockout(false);
      return;
    }

    setManualTeamLockout(nextManualLockState);
    setLockoutClockTick(Date.now());
    setSubmitMessage(
      nextManualLockState
        ? "Manual team lockout is now ON. Coaches can view but cannot change teams."
        : "Manual team lockout is now OFF. Scheduled lockout rules still apply if enabled."
    );
    setIsTogglingLockout(false);
  }

  async function handleSaveLockoutSchedule() {
    if (!loginSession || !isAdmin) {
      setSubmitMessage("Only admin can save the lockout schedule.");
      return;
    }

    const normalisedDay = normaliseWeekday(lockoutScheduleDay);
    const normalisedTime = normaliseTimeValue(lockoutScheduleTime);
    const requestedTimezone = lockoutScheduleTimezone.trim() || DEFAULT_LOCKOUT_TIMEZONE;

    if (!isValidTimeZone(requestedTimezone)) {
      setSubmitMessage(
        `Lockout schedule save failed: "${requestedTimezone}" is not a valid timezone.`
      );
      return;
    }

    const normalisedTimezone = requestedTimezone;
    const nextLockoutAt = lockoutScheduleEnabled
      ? buildLockoutAtIso(normalisedDay, normalisedTime, normalisedTimezone)
      : null;

    setIsSavingLockoutSchedule(true);
    setSubmitMessage(
      lockoutScheduleEnabled ? "Saving lockout schedule..." : "Clearing lockout schedule..."
    );

    const schedulePayload = {
      environment: APP_ENV,
      team_lockout: manualTeamLockout,
      lockout_enabled: lockoutScheduleEnabled,
      lockout_day: normalisedDay,
      lockout_time: `${normalisedTime}:00`,
      lockout_timezone: normalisedTimezone,
      lockout_at: nextLockoutAt,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("app_settings")
      .upsert(schedulePayload, { onConflict: "environment" });

    if (error) {
      setSubmitMessage(
        `Lockout schedule save failed: ${error.message}. You may need to add the schedule columns to app_settings before this can be saved.`
      );
      setIsSavingLockoutSchedule(false);
      return;
    }

    setLockoutScheduleDay(normalisedDay);
    setLockoutScheduleTime(normalisedTime);
    setLockoutScheduleTimezone(normalisedTimezone);
    setLockoutScheduleAt(nextLockoutAt);
    setLockoutClockTick(Date.now());

    setSubmitMessage(
      lockoutScheduleEnabled
        ? `Lockout schedule saved for ${normalisedDay} at ${normalisedTime} (${normalisedTimezone}).`
        : "Lockout schedule has been turned off."
    );
    setIsSavingLockoutSchedule(false);
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
    if (!isAdmin && isTeamLocked) return;
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
    isAdmin,
    isLoadingTeam,
    isSavingTeam,
    isTeamLocked,
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
        .select("coach_id, coach_name, team_data, is_submitted, submitted_at, updated_at, environment")
        .eq("environment", APP_ENV)
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
            Position: "Environment",
            Club: "",
            "Player Name": "",
            Selected: APP_ENV,
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
      XLSX.writeFile(workbook, `coach-team-selections-${APP_ENV}-${timestamp}.xlsx`);
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
  const coachLockedByAppSetting = Boolean(!isAdmin && isTeamLocked);
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
          <div className="mb-3 inline-flex rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/70">
            {APP_ENV}
          </div>
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
              <div className="mb-3 flex flex-wrap items-center gap-3">
                <div
                  className={`rounded-full border px-3 py-1 text-[11px] font-semibold uppercase tracking-wide ${
                    APP_ENV === "preview"
                      ? "border-amber-500/30 bg-amber-500/15 text-amber-200"
                      : "border-emerald-500/30 bg-emerald-500/15 text-emerald-200"
                  }`}
                >
                  {APP_ENV}
                </div>
              </div>

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
                  onClick={() => void handleToggleTeamLockout()}
                  disabled={
                    isTogglingLockout ||
                    isLoadingTeam ||
                    isSavingTeam ||
                    isExportingTeams ||
                    isSavingLockoutSchedule
                  }
                  className={`rounded-xl border px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-40 ${
                    manualTeamLockout
                      ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-100 hover:bg-emerald-500/20"
                      : "border-amber-500/30 bg-amber-500/15 text-amber-100 hover:bg-amber-500/20"
                  }`}
                >
                  {isTogglingLockout
                    ? "Updating Manual Lockout..."
                    : manualTeamLockout
                      ? "Turn Manual Lockout Off"
                      : "Turn Manual Lockout On"}
                </button>

                <button
                  type="button"
                  onClick={() => void handleResetAllTeams()}
                  disabled={
                    isSavingTeam ||
                    isLoadingTeam ||
                    isExportingTeams ||
                    isTogglingLockout ||
                    isSavingLockoutSchedule
                  }
                  className="rounded-xl border border-red-500/30 bg-red-500/15 px-4 py-3 text-sm font-semibold text-red-100 hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isSavingTeam ? "Resetting..." : "Reset All Teams"}
                </button>

                <button
                  type="button"
                  onClick={handleExportTeamsXlsx}
                  disabled={
                    isExportingTeams ||
                    isLoadingTeam ||
                    isSavingTeam ||
                    isTogglingLockout ||
                    isSavingLockoutSchedule
                  }
                  className="rounded-xl border border-sky-500/30 bg-sky-500/15 px-4 py-3 text-sm font-semibold text-sky-100 hover:bg-sky-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {isExportingTeams ? "Exporting..." : "Export Teams (XLSX)"}
                </button>
              </div>
            </div>

            <div className="mb-4 flex flex-wrap gap-3">
              <div className="inline-flex rounded-full border border-sky-500/30 bg-sky-500/15 px-3 py-1 text-xs font-semibold text-sky-100">
                Current environment: {APP_ENV}
              </div>
              <div
                className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                  isTeamLocked
                    ? "border-red-500/30 bg-red-500/15 text-red-100"
                    : "border-emerald-500/30 bg-emerald-500/15 text-emerald-100"
                }`}
              >
                Effective lockout: {isTeamLocked ? "ON" : "OFF"} ({lockoutModeText})
              </div>
              <div
                className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                  manualTeamLockout
                    ? "border-amber-500/30 bg-amber-500/15 text-amber-100"
                    : "border-white/10 bg-white/5 text-white/70"
                }`}
              >
                Manual lockout: {manualTeamLockout ? "ON" : "OFF"}
              </div>
              <div
                className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                  lockoutScheduleEnabled
                    ? "border-violet-500/30 bg-violet-500/15 text-violet-100"
                    : "border-white/10 bg-white/5 text-white/70"
                }`}
              >
                {lockoutScheduleSummary}
              </div>
            </div>

            <div className="mb-6 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="mb-3 text-lg font-semibold">Weekly Lockout Schedule</div>
                <p className="mb-4 text-sm text-white/65">
                  Save the next round lockout day and time here. Once the scheduled time arrives,
                  coach pages will lock without needing a refresh.
                </p>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
                  <label className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-white/60">
                      Schedule Status
                    </span>
                    <select
                      value={lockoutScheduleEnabled ? "on" : "off"}
                      onChange={(event) => setLockoutScheduleEnabled(event.target.value === "on")}
                      disabled={isSavingLockoutSchedule || isTogglingLockout}
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white outline-none"
                    >
                      <option value="off">Off</option>
                      <option value="on">On</option>
                    </select>
                  </label>

                  <label className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-white/60">
                      Day
                    </span>
                    <select
                      value={lockoutScheduleDay}
                      onChange={(event) =>
                        setLockoutScheduleDay(normaliseWeekday(event.target.value))
                      }
                      disabled={
                        !lockoutScheduleEnabled ||
                        isSavingLockoutSchedule ||
                        isTogglingLockout
                      }
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white outline-none disabled:opacity-50"
                    >
                      {WEEKDAY_OPTIONS.map((weekday) => (
                        <option key={weekday} value={weekday}>
                          {weekday}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-white/60">
                      Time
                    </span>
                    <input
                      type="time"
                      step={60}
                      value={lockoutScheduleTime}
                      onChange={(event) => setLockoutScheduleTime(normaliseTimeValue(event.target.value))}
                      disabled={
                        !lockoutScheduleEnabled ||
                        isSavingLockoutSchedule ||
                        isTogglingLockout
                      }
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white outline-none disabled:opacity-50"
                    />
                  </label>

                  <label className="space-y-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-white/60">
                      Timezone
                    </span>
                    <input
                      type="text"
                      value={lockoutScheduleTimezone}
                      onChange={(event) => setLockoutScheduleTimezone(event.target.value)}
                      disabled={
                        !lockoutScheduleEnabled ||
                        isSavingLockoutSchedule ||
                        isTogglingLockout
                      }
                      className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-sm text-white outline-none disabled:opacity-50"
                    />
                  </label>
                </div>

                <div className="mt-4 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => void handleSaveLockoutSchedule()}
                    disabled={isSavingLockoutSchedule || isTogglingLockout || isSavingTeam}
                    className="rounded-xl border border-violet-500/30 bg-violet-500/15 px-4 py-3 text-sm font-semibold text-violet-100 hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {isSavingLockoutSchedule ? "Saving Schedule..." : "Save Lockout Schedule"}
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="mb-3 text-lg font-semibold">Lockout Status</div>
                <div className="space-y-2 text-sm text-white/75">
                  <div>Manual lockout: {manualTeamLockout ? "ON" : "OFF"}</div>
                  <div>Schedule enabled: {lockoutScheduleEnabled ? "ON" : "OFF"}</div>
                  <div>
                    Scheduled trigger:{" "}
                    {lockoutScheduleAt ? formatTimestamp(lockoutScheduleAt) : "Not set"}
                  </div>
                  <div>Schedule timezone: {lockoutScheduleTimezone || DEFAULT_LOCKOUT_TIMEZONE}</div>
                  <div>Effective lockout: {isTeamLocked ? "ON" : "OFF"}</div>
                </div>

                <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/60">
                  Realtime updates are active for app_settings. When manual lockout or the saved
                  schedule changes, open coach and admin pages will update automatically.
                </div>
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
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-2xl font-bold">Team Controls</h2>
              <p className="mt-1 text-sm text-white/70">
                {isAdmin
                  ? "Admin can view and manage any coach team."
                  : "Select and submit your team for this round."}
              </p>
            </div>

            <div className="w-full max-w-xs">
              <label className="mb-2 block text-xs font-semibold uppercase tracking-wide text-white/60">
                Coach
              </label>
              <select
                value={selectedCoachId}
                onChange={(event) => setSelectedCoachId(Number(event.target.value))}
                disabled={!isAdmin}
                className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white outline-none disabled:cursor-not-allowed disabled:opacity-60"
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

            <div
              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                APP_ENV === "preview"
                  ? "border-amber-500/30 bg-amber-500/15 text-amber-200"
                  : "border-emerald-500/30 bg-emerald-500/15 text-emerald-200"
              }`}
            >
              Environment: {APP_ENV}
            </div>

            <div
              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                isTeamLocked
                  ? "border-red-500/30 bg-red-500/15 text-red-200"
                  : "border-emerald-500/30 bg-emerald-500/15 text-emerald-200"
              }`}
            >
              Team Lockout: {isTeamLocked ? "ON" : "OFF"} ({lockoutModeText})
            </div>

            <div
              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                lockoutScheduleEnabled
                  ? "border-violet-500/30 bg-violet-500/15 text-violet-200"
                  : "border-white/10 bg-white/5 text-white/60"
              }`}
            >
              {lockoutScheduleSummary}
            </div>

            {isAdmin ? (
              <div className="text-xs text-white/60">
                Use the admin controls in the Admin Team Summary section to manage manual lockout
                and the weekly schedule.
              </div>
            ) : null}

            {coachLockedByAppSetting ? (
              <div className="text-xs text-red-200/90">
                Team lockout is active ({lockoutModeText}). You can view your team but cannot save,
                reset, or submit changes.
              </div>
            ) : isSubmitted ? (
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
              <div className="mb-2 text-sm font-semibold text-sky-100">Unlock available</div>
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
              <h2 className="text-2xl font-bold">Submission Review</h2>
              <p className="mt-1 text-sm text-white/70">
                Check position counts before saving or submitting the final team.
              </p>
            </div>

            <div
              className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold ${
                readyToSubmit
                  ? "border-emerald-500/30 bg-emerald-500/15 text-emerald-200"
                  : "border-amber-500/30 bg-amber-500/15 text-amber-200"
              }`}
            >
              {readyToSubmit ? "Ready to Submit" : "Not Ready Yet"}
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {reviewRows.map((row) => (
              <div
                key={row.position}
                className="rounded-xl border border-white/10 bg-black/20 p-4"
              >
                <div className="mb-2 flex items-center justify-between">
                  <div className="text-base font-semibold">{row.position}</div>
                  <div
                    className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${row.statusClass}`}
                  >
                    {row.statusText}
                  </div>
                </div>

                <div className="space-y-1 text-sm text-white/75">
                  <div>
                    On-field: {row.onFieldSelected} / {row.onFieldRequired}
                  </div>
                  <div>
                    Emergencies: {row.emergencySelected} / {row.emergencyAllowed}
                  </div>
                </div>
              </div>
            ))}

            <div
              className={`rounded-xl border p-4 ${
                duplicateCheck.hasDuplicates
                  ? "border-red-500/20 bg-red-500/5"
                  : "border-emerald-500/20 bg-emerald-500/5"
              }`}
            >
              <div className="mb-2 flex items-center justify-between">
                <div className="text-base font-semibold">Duplicate Check</div>
                <div
                  className={`inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold ${
                    duplicateCheck.hasDuplicates
                      ? "border-red-500/30 bg-red-500/15 text-red-200"
                      : "border-emerald-500/30 bg-emerald-500/15 text-emerald-200"
                  }`}
                >
                  {duplicateCheck.hasDuplicates ? "Duplicates Found" : "All Unique"}
                </div>
              </div>

              <div className="space-y-1 text-sm text-white/75">
                <div>Total selected: {duplicateCheck.totalSelected}</div>
                <div>Unique selected: {duplicateCheck.uniqueSelected}</div>
              </div>
            </div>
          </div>

          {!readyToSubmit && validationResult.errors.length > 0 ? (
            <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-4">
              <div className="mb-2 text-sm font-semibold text-amber-100">Fix these before submitting</div>
              <ul className="list-disc space-y-1 pl-5 text-sm text-amber-100/90">
                {validationResult.errors.map((error) => (
                  <li key={error}>{error}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>

        <section className="mb-6 rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="mb-4">
            <h2 className="text-2xl font-bold">Available Players</h2>
            <p className="mt-1 text-sm text-white/70">
              Select on-field players and emergencies for each position.
            </p>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            {POSITIONS.map((position) => {
              const pool = coachPool[position];
              const onFieldSelected = teamState[position].onField;
              const emergenciesSelected = teamState[position].emergencies;
              const onFieldLimit = selectedCoach?.slots[position] ?? 0;
              const emergencyLimit = selectedCoach?.emergencyLimits[position] ?? 0;

              const availablePlayers = pool.filter(
                (player) => !isPlayerAlreadySelected(teamState, player.name)
              );

              return (
                <div
                  key={position}
                  className="rounded-2xl border border-white/10 bg-black/20 p-4"
                >
                  <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <h3 className="text-xl font-bold">{position}</h3>
                      <div className="text-xs text-white/50">
                        On-field {onFieldSelected.length}/{onFieldLimit}
                        {" • "}
                        Emergencies {emergenciesSelected.length}/{emergencyLimit}
                      </div>
                    </div>
                  </div>

                  <div className="grid gap-4 md:grid-cols-3">
                    <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3">
                      <div className="mb-2 text-sm font-semibold text-violet-100">On-Field</div>
                      <div className="space-y-2">
                        {onFieldSelected.length === 0 ? (
                          <div className="text-xs text-white/40">No players selected</div>
                        ) : (
                          onFieldSelected.map((playerName, index) => (
                            <div
                              key={`${position}-on-${playerName}-${index}`}
                              className="rounded-lg border border-violet-500/20 bg-black/20 p-2"
                            >
                              <div className="text-sm font-medium text-white">{playerName}</div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleRemovePlayer(position, "onField", playerName)}
                                  disabled={!canEditSelectedCoach}
                                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  Remove
                                </button>
                                {emergencyLimit > 0 ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleMovePlayer(position, "onField", "emergencies", playerName)
                                    }
                                    disabled={!canEditSelectedCoach}
                                    className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-100 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    Move to Emergency
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                      <div className="mb-2 text-sm font-semibold text-amber-100">Emergencies</div>
                      <div className="space-y-2">
                        {emergenciesSelected.length === 0 ? (
                          <div className="text-xs text-white/40">No emergencies selected</div>
                        ) : (
                          emergenciesSelected.map((playerName, index) => (
                            <div
                              key={`${position}-em-${playerName}-${index}`}
                              className="rounded-lg border border-amber-500/20 bg-black/20 p-2"
                            >
                              <div className="text-sm font-medium text-white">
                                {index + 1}. {playerName}
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleMoveEmergencyUp(position, index)
                                  }
                                  disabled={!canEditSelectedCoach || index === 0}
                                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  Move Up
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleMoveEmergencyDown(position, index)
                                  }
                                  disabled={
                                    !canEditSelectedCoach ||
                                    index === emergenciesSelected.length - 1
                                  }
                                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  Move Down
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleRemovePlayer(position, "emergencies", playerName)
                                  }
                                  disabled={!canEditSelectedCoach}
                                  className="rounded-lg border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-semibold text-white hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  Remove
                                </button>

                                <button
                                  type="button"
                                  onClick={() =>
                                    handleMovePlayer(position, "emergencies", "onField", playerName)
                                  }
                                  disabled={!canEditSelectedCoach}
                                  className="rounded-lg border border-violet-500/20 bg-violet-500/10 px-2 py-1 text-[11px] font-semibold text-violet-100 hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  Move to On-Field
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                      <div className="mb-2 text-sm font-semibold text-white">Available Players</div>
                      <div className="max-h-[420px] space-y-2 overflow-auto pr-1">
                        {availablePlayers.length === 0 ? (
                          <div className="text-xs text-white/40">No available players</div>
                        ) : (
                          availablePlayers.map((player) => (
                            <div
                              key={`${position}-available-${player.name}`}
                              className="rounded-lg border border-white/10 bg-black/20 p-2"
                            >
                              <div className="text-sm font-medium text-white">{player.name}</div>
                              <div className="text-xs text-white/50">
                                #{player.number} • {player.club}
                              </div>
                              <div className="mt-2 flex flex-wrap gap-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleAddPlayer(position, "onField", player.name)
                                  }
                                  disabled={!canEditSelectedCoach || onFieldSelected.length >= onFieldLimit}
                                  className="rounded-lg border border-violet-500/20 bg-violet-500/10 px-2 py-1 text-[11px] font-semibold text-violet-100 hover:bg-violet-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                                >
                                  Add On-Field
                                </button>

                                {emergencyLimit > 0 ? (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleAddPlayer(position, "emergencies", player.name)
                                    }
                                    disabled={
                                      !canEditSelectedCoach ||
                                      emergenciesSelected.length >= emergencyLimit
                                    }
                                    className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-2 py-1 text-[11px] font-semibold text-amber-100 hover:bg-amber-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                                  >
                                    Add Emergency
                                  </button>
                                ) : null}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/5 p-6">
          <div className="mb-4">
            <h2 className="text-2xl font-bold">Selected Team Snapshot</h2>
            <p className="mt-1 text-sm text-white/70">
              Quick view of your current saved selections by position.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {POSITIONS.map((position) => (
              <div
                key={`snapshot-${position}`}
                className="rounded-xl border border-white/10 bg-black/20 p-4"
              >
                <div className="mb-2 text-lg font-semibold">{position}</div>

                <div className="mb-3">
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-violet-200">
                    On-Field
                  </div>
                  {teamState[position].onField.length === 0 ? (
                    <div className="text-xs text-white/40">None selected</div>
                  ) : (
                    <div className="space-y-1">
                      {teamState[position].onField.map((playerName, index) => (
                        <div
                          key={`snapshot-on-${position}-${playerName}-${index}`}
                          className="rounded-lg bg-black/20 px-2 py-1 text-xs text-white/85"
                        >
                          {playerName} {getPlayerClub(playerName) ? `• ${getPlayerClub(playerName)}` : ""}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-amber-200">
                    Emergencies
                  </div>
                  {teamState[position].emergencies.length === 0 ? (
                    <div className="text-xs text-white/40">None selected</div>
                  ) : (
                    <div className="space-y-1">
                      {teamState[position].emergencies.map((playerName, index) => (
                        <div
                          key={`snapshot-em-${position}-${playerName}-${index}`}
                          className="rounded-lg bg-black/20 px-2 py-1 text-xs text-white/85"
                        >
                          {index + 1}. {playerName}{" "}
                          {getPlayerClub(playerName) ? `• ${getPlayerClub(playerName)}` : ""}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}