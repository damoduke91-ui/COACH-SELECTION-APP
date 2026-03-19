export type PositionKey = "KD" | "DEF" | "MID" | "FOR" | "KF" | "RUC";

export type PositionCounts = Record<PositionKey, number>;

export type CoachConfig = {
  id: number;
  name: string;
  label: string;
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

export const COACHES: CoachConfig[] = [
  {
    id: 1,
    name: "Adrian",
    label: "Coach 1",
    onField: ON_FIELD_COUNTS,
    emergencies: { KD: 3, DEF: 6, MID: 7, FOR: 6, KF: 3, RUC: 3 },
  },
  {
    id: 2,
    name: "Chris",
    label: "Coach 2",
    onField: ON_FIELD_COUNTS,
    emergencies: { KD: 3, DEF: 6, MID: 8, FOR: 6, KF: 3, RUC: 2 },
  },
  {
    id: 3,
    name: "Damian",
    label: "Coach 3",
    onField: ON_FIELD_COUNTS,
    emergencies: { KD: 4, DEF: 5, MID: 7, FOR: 5, KF: 4, RUC: 3 },
  },
  {
    id: 4,
    name: "Dane",
    label: "Coach 4",
    onField: ON_FIELD_COUNTS,
    emergencies: { KD: 4, DEF: 5, MID: 7, FOR: 5, KF: 4, RUC: 3 },
  },
  {
    id: 5,
    name: "Josh",
    label: "Coach 5",
    onField: ON_FIELD_COUNTS,
    emergencies: { KD: 4, DEF: 5, MID: 7, FOR: 5, KF: 4, RUC: 3 },
  },
  {
    id: 6,
    name: "Mark",
    label: "Coach 6",
    onField: ON_FIELD_COUNTS,
    emergencies: { KD: 3, DEF: 5, MID: 7, FOR: 7, KF: 4, RUC: 2 },
  },
  {
    id: 7,
    name: "Rick",
    label: "Coach 7",
    onField: ON_FIELD_COUNTS,
    emergencies: { KD: 4, DEF: 7, MID: 6, FOR: 6, KF: 3, RUC: 2 },
  },
  {
    id: 8,
    name: "Troy",
    label: "Coach 8",
    onField: ON_FIELD_COUNTS,
    emergencies: { KD: 4, DEF: 5, MID: 7, FOR: 5, KF: 4, RUC: 3 },
  },
];

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