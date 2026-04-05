export type PositionKey = "KD" | "DEF" | "MID" | "FOR" | "KF" | "RUC";

export type PositionCounts = Record<PositionKey, number>;

export type CoachConfig = {
  id: number;
  name: string;
  label: string;
  slots: PositionCounts;
  emergencyLimits: PositionCounts;

  // Backward-compatible aliases for any older code
  onField: PositionCounts;
  emergencies: PositionCounts;
};

export const ON_FIELD_COUNTS: PositionCounts = {
  KD: 2,
  DEF: 4,
  MID: 5,
  FOR: 4,
  KF: 2,
  RUC: 1,
};

function cloneCounts(counts: PositionCounts): PositionCounts {
  return {
    KD: counts.KD,
    DEF: counts.DEF,
    MID: counts.MID,
    FOR: counts.FOR,
    KF: counts.KF,
    RUC: counts.RUC,
  };
}

function createCoachConfig(
  id: number,
  name: string,
  label: string,
  emergencyLimits: PositionCounts,
): CoachConfig {
  const slots = cloneCounts(ON_FIELD_COUNTS);
  const emergencies = cloneCounts(emergencyLimits);

  return {
    id,
    name,
    label,
    slots,
    emergencyLimits: emergencies,

    // Backward-compatible aliases
    onField: slots,
    emergencies,
  };
}

export const COACHES: CoachConfig[] = [
  createCoachConfig(1, "Adrian", "Coach 1", {
    KD: 3,
    DEF: 6,
    MID: 7,
    FOR: 6,
    KF: 3,
    RUC: 3,
  }),
  createCoachConfig(2, "Chris", "Coach 2", {
    KD: 3,
    DEF: 6,
    MID: 8,
    FOR: 6,
    KF: 3,
    RUC: 2,
  }),
  createCoachConfig(3, "Damian", "Coach 3", {
    KD: 4,
    DEF: 5,
    MID: 7,
    FOR: 5,
    KF: 4,
    RUC: 3,
  }),
  createCoachConfig(4, "Dane", "Coach 4", {
    KD: 4,
    DEF: 5,
    MID: 7,
    FOR: 5,
    KF: 4,
    RUC: 3,
  }),
  createCoachConfig(5, "Josh", "Coach 5", {
    KD: 4,
    DEF: 5,
    MID: 7,
    FOR: 5,
    KF: 4,
    RUC: 3,
  }),
  createCoachConfig(6, "Mark", "Coach 6", {
    KD: 3,
    DEF: 5,
    MID: 7,
    FOR: 7,
    KF: 4,
    RUC: 2,
  }),
  createCoachConfig(7, "Rick", "Coach 7", {
    KD: 4,
    DEF: 7,
    MID: 6,
    FOR: 6,
    KF: 3,
    RUC: 2,
  }),
  createCoachConfig(8, "Troy", "Coach 8", {
    KD: 4,
    DEF: 5,
    MID: 7,
    FOR: 5,
    KF: 4,
    RUC: 3,
  }),
];

// Preferred export name for newer code
export const coachConfigs = COACHES;

export function getCoachConfigById(coachId: number): CoachConfig | undefined {
  return COACHES.find((coach) => coach.id === coachId);
}

export function buildSlotLabels(
  counts: PositionCounts,
  suffix?: string,
): Record<PositionKey, string[]> {
  return {
    KD: Array.from(
      { length: counts.KD },
      (_, i) => `KD ${suffix ? `${suffix} ` : ""}${i + 1}`,
    ),
    DEF: Array.from(
      { length: counts.DEF },
      (_, i) => `DEF ${suffix ? `${suffix} ` : ""}${i + 1}`,
    ),
    MID: Array.from(
      { length: counts.MID },
      (_, i) => `MID ${suffix ? `${suffix} ` : ""}${i + 1}`,
    ),
    FOR: Array.from(
      { length: counts.FOR },
      (_, i) => `FOR ${suffix ? `${suffix} ` : ""}${i + 1}`,
    ),
    KF: Array.from(
      { length: counts.KF },
      (_, i) => `KF ${suffix ? `${suffix} ` : ""}${i + 1}`,
    ),
    RUC: Array.from(
      { length: counts.RUC },
      (_, i) => `RUC ${suffix ? `${suffix} ` : ""}${i + 1}`,
    ),
  };
}

export function buildCoachSlotLabels(coachId: number) {
  const coach = getCoachConfigById(coachId);

  if (!coach) {
    return {
      onField: buildSlotLabels(ON_FIELD_COUNTS),
      emergencies: buildSlotLabels(
        {
          KD: 0,
          DEF: 0,
          MID: 0,
          FOR: 0,
          KF: 0,
          RUC: 0,
        },
        "Emergency",
      ),
    };
  }

  return {
    onField: buildSlotLabels(coach.slots),
    emergencies: buildSlotLabels(coach.emergencyLimits, "Emergency"),
  };
}