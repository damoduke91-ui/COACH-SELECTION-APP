import assert from "node:assert/strict";
import test from "node:test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { expectedIntervalMinutes, heartbeatHealth, isInLivePollingWindow, recentRunErrors, type HealthRun } from "../lib/liveStatsHealth.ts";
import { createLiveStatsTelemetry } from "../lib/liveStatsTelemetry.ts";

const now = Date.parse("2026-09-21T10:00:00Z");
const run: HealthRun = { id: "test", started_at: new Date(now).toISOString(), finished_at: null,
  season_year: 2026, afl_round: 24, status: "completed", error: null, checked_matches: 1, candidate_matches: 1, results: [] };

test("heartbeat does not imply success when absent, stale, interrupted or degraded", () => {
  assert.equal(heartbeatHealth(null, now, 5), "unknown");
  assert.equal(heartbeatHealth(run, now, 5), "recent");
  assert.equal(heartbeatHealth({ ...run, status: "running" }, now, 5), "running");
  assert.equal(heartbeatHealth({ ...run, status: "running" }, now + 600_001, 5), "stale");
  assert.equal(heartbeatHealth({ ...run, status: "degraded" }, now, 5), "attention");
  assert.equal(heartbeatHealth({ ...run, started_at: "invalid" }, now, 5), "unknown");
  assert.equal(expectedIntervalMinutes("30"), 30);
  assert.equal(expectedIntervalMinutes("0"), 5);
  assert.equal(expectedIntervalMinutes(undefined), 5);
});

test("polling windows include their boundaries and live/final matches without start times", () => {
  const match = { status: "SCHEDULED", utc_start_time: new Date(now).toISOString() };
  assert.equal(isInLivePollingWindow(match, now - 90 * 60_000), true);
  assert.equal(isInLivePollingWindow(match, now - 90 * 60_000 - 1), false);
  assert.equal(isInLivePollingWindow(match, now + 5 * 60 * 60_000), true);
  assert.equal(isInLivePollingWindow(match, now + 5 * 60 * 60_000 + 1), false);
  assert.equal(isInLivePollingWindow({ status: "LIVE", utc_start_time: null }, now), true);
  assert.equal(isInLivePollingWindow({ status: "COMPLETED", utc_start_time: null }, now), true);
  assert.equal(isInLivePollingWindow({ status: "SCHEDULED", utc_start_time: "bad" }, now), false);
});

test("recent errors include match and run failures but exclude ordinary season skips", () => {
  const results = [{ afl_match_id: 42, label: "A v B", status: "LIVE", action: "failed" as const, reason: "No rows" }];
  assert.equal(recentRunErrors([{ ...run, error: "Fixtures failed", results }]).length, 2);
  assert.equal(recentRunErrors([{ ...run, status: "skipped", error: "Season archived" }]).length, 0);
});

test("telemetry failures do not throw or keep adding requests to the import", async () => {
  for (const throws of [false, true]) {
    let calls = 0;
    const fake = { from: () => ({ insert: () => ({ abortSignal: async (signal: AbortSignal) => {
      calls++;
      assert.ok(signal instanceof AbortSignal);
      if (throws) throw new Error("Network unavailable");
      return { error: { message: "Missing migration" } };
    } }) }) } as unknown as SupabaseClient;
    const telemetry = createLiveStatsTelemetry(fake, "preview");
    await telemetry.start();
    await telemetry.update({ results: [] });
    await telemetry.finish({ status: "completed" });
    assert.equal(calls, 1);
  }
});

test("telemetry checkpoints and completion use the same run id", async () => {
  const saved: Record<string, unknown>[] = [];
  const ids: unknown[] = [];
  const fake = { from: () => ({
    insert: (values: Record<string, unknown>) => ({ abortSignal: async () => { saved.push(values); return { error: null }; } }),
    update: (values: Record<string, unknown>) => ({ eq: (_column: string, id: unknown) => ({ abortSignal: async () => { ids.push(id); saved.push(values); return { error: null }; } }) }),
  }) } as unknown as SupabaseClient;
  const telemetry = createLiveStatsTelemetry(fake, "preview");
  await telemetry.start();
  await telemetry.update({ season_year: 2026, results: [] });
  await telemetry.finish({ status: "failed", error: "Token unavailable" });
  assert.equal(saved[0].environment, "preview");
  assert.deepEqual(ids, [saved[0].id, saved[0].id]);
  assert.equal(saved[2].status, "failed");
  assert.ok(saved[2].finished_at);
});
