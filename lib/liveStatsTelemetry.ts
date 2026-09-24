import type { SupabaseClient } from "@supabase/supabase-js";
import type { HealthRun } from "./liveStatsHealth";

// Monitoring must never prevent the existing import from completing.
// Bound each request and disable subsequent writes if telemetry is unavailable.
export function createLiveStatsTelemetry(supabase: SupabaseClient, environment: string) {
  const id = crypto.randomUUID();
  let available = true;
  async function write(values: Record<string, unknown>, insert = false) {
    if (!available) return;
    try {
      const table = supabase.from("afl_live_stats_runs");
      const query = insert ? table.insert(values) : table.update(values).eq("id", id);
      const { error } = await query.abortSignal(AbortSignal.timeout(1500));
      if (error) throw error;
    } catch {
      available = false;
      console.warn("Live stats health history unavailable; import continues without telemetry.");
    }
  }
  return {
    start: () => write({ id, environment, started_at: new Date().toISOString(), status: "running" }, true),
    update: (values: Partial<Omit<HealthRun, "id" | "started_at">>) => write(values),
    finish: (values: Partial<Omit<HealthRun, "id" | "started_at">>) =>
      write({ ...values, finished_at: new Date().toISOString() }),
  };
}
