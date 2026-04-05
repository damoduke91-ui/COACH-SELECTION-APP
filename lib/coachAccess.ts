import { supabase } from "./supabase";

export type AppRole = "admin" | "coach";

export type CoachAccessRecord = {
  coachId: number;
  coachName: string;
  passcode: string;
};

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

/**
 * Fetch a login match from Supabase
 */
export async function getAccessByPasscode(
  passcode: string
): Promise<LoginSession | null> {
  const normalised = passcode.trim().toLowerCase();

  const { data, error } = await supabase
    .from("coach_access")
    .select("*")
    .ilike("passcode", normalised)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;

  if (data.role === "admin") {
    return {
      role: "admin",
      coachId: null,
      coachName: "Admin",
    };
  }

  return {
    role: "coach",
    coachId: data.coach_id,
    coachName: data.coach_name,
  };
}