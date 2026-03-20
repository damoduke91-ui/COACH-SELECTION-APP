export type AppRole = "admin" | "coach";

export type CoachAccessRecord = {
  coachId: number;
  coachName: string;
  passcode: string;
};

export const ADMIN_PASSCODE = "super8admin";

export const COACH_ACCESS: CoachAccessRecord[] = [
  { coachId: 1, coachName: "Adrian Coach 1", passcode: "adrian1" },
  { coachId: 2, coachName: "Chris Coach 2", passcode: "chris2" },
  { coachId: 3, coachName: "Damian Coach 3", passcode: "damian3" },
  { coachId: 4, coachName: "Dane Coach 4", passcode: "dane4" },
  { coachId: 5, coachName: "Josh Coach 5", passcode: "josh5" },
  { coachId: 6, coachName: "Mark Coach 6", passcode: "mark6" },
  { coachId: 7, coachName: "Rick Coach 7", passcode: "rick7" },
  { coachId: 8, coachName: "Troy Coach 8", passcode: "troy8" },
];

export type LoginSession =
  | {
      role: "admin";
      coachId: null;
      coachName: "Admin";
    }
  | {
      role: "coach";
      coachId: number;
      coachName: string;
    };

export function getCoachAccessByPasscode(passcode: string): CoachAccessRecord | null {
  const normalised = passcode.trim().toLowerCase();

  return (
    COACH_ACCESS.find((coach) => coach.passcode.trim().toLowerCase() === normalised) ?? null
  );
}

export function isAdminPasscode(passcode: string): boolean {
  return passcode.trim().toLowerCase() === ADMIN_PASSCODE.trim().toLowerCase();
}