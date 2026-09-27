import type { SupabaseClient } from "@supabase/supabase-js";
import type { HealthRun } from "./liveStatsHealth";

// Monitoring must never prevent the existing import from completing.
// Stop repeated checkpoints after a failure, but allow one bounded completion
// upsert to repair a missing/partial run after a transient failure.
export function createLiveStatsTelemetry(supabase: SupabaseClient, environment: string) {
  const id = crypto.randomUUID();
  const snapshot: Record<string, unknown> = { id, environment, started_at: new Date().toISOString(), status: "running" };
  let checkpointsAvailable = true;
  let permanentlyUnavailable = false;
  async function write(values: Record<string, unknown>, finishing = false) {
    Object.assign(snapshot, values);
    if (permanentlyUnavailable || (!checkpointsAvailable && !finishing)) return;
    try {
      const { error } = await supabase.from("afl_live_stats_runs")
        .upsert({ ...snapshot }, { onConflict: "id" })
        .abortSignal(AbortSignal.timeout(finishing ? 3000 : 1500));
      if (error) throw error;
    } catch (error) {
      checkpointsAvailable = false;
      const code = error && typeof error === "object" && "code" in error ? String(error.code) : "unknown";
      permanentlyUnavailable = ["42P01", "PGRST205", "42501"].includes(code);
      console.warn("Live stats health history write failed; import continues.", { runId: id, phase: finishing ? "completion" : "checkpoint", code });
    }
  }
  return {
    start: () => write({}),
    update: (values: Partial<Omit<HealthRun, "id" | "started_at">>) => write(values),
    finish: (values: Partial<Omit<HealthRun, "id" | "started_at">>) =>
      write({ ...values, finished_at: new Date().toISOString() }, true),
  };
}
