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

test("old unfinished runs surface without being labelled failed imports", () => {
  assert.equal(recentRunErrors([{ ...run, status: "running" }], now + 600_000).length, 0);
  const issues = recentRunErrors([{ ...run, status: "running" }], now + 600_001);
  assert.equal(issues[0].label, "Completion not recorded");
  assert.match(issues[0].reason, /outcome is unknown/);
  assert.equal(recentRunErrors([{ ...run, status: "running" }], now + 600_001, 30).length, 0);
});

function telemetryDatabase(failures: (string | null)[]) {
  const writes: Record<string, unknown>[] = [];
  const fake = { from: () => ({ upsert: (values: Record<string, unknown>, options: { onConflict: string }) => ({
    abortSignal: async (signal: AbortSignal) => {
      assert.equal(options.onConflict, "id");
      assert.ok(signal instanceof AbortSignal);
      writes.push(values);
      const code = failures.shift();
      if (code === "throws") throw new Error("Network unavailable");
      return { error: code ? { code } : null };
    },
  }) }) } as unknown as SupabaseClient;
  return { fake, writes };
}

test("completion repairs a transient checkpoint failure with the full accumulated snapshot", async () => {
  for (const failure of ["throws", "57014"]) {
    const { fake, writes } = telemetryDatabase([null, failure, null]);
    const telemetry = createLiveStatsTelemetry(fake, "preview");
    await telemetry.start();
    await telemetry.update({ season_year: 2027 });
    await telemetry.update({ afl_round: 1, checked_matches: 0 });
    await telemetry.finish({ status: "completed", results: [] });
    assert.equal(writes.length, 3);
    assert.equal(writes[2].id, writes[0].id);
    assert.equal(writes[2].season_year, 2027);
    assert.equal(writes[2].afl_round, 1);
    assert.equal(writes[2].status, "completed");
    assert.ok(writes[2].finished_at);
  }
});

test("completion can recover after a missing start; persistent schema failures stop requests", async () => {
  for (const code of ["throws", "42P01", "PGRST205", "42501"]) {
    const { fake, writes } = telemetryDatabase([code, null]);
    const telemetry = createLiveStatsTelemetry(fake, "production");
    await telemetry.start();
    await telemetry.update({ season_year: 2027 });
    await telemetry.finish({ status: "failed", error: "Season configuration missing" });
    assert.equal(writes.length, code === "throws" ? 2 : 1);
    if (writes.length === 2) {
      assert.equal(writes[1].id, writes[0].id);
      assert.equal(writes[1].started_at, writes[0].started_at);
      assert.equal(writes[1].error, "Season configuration missing");
    }
  }
});

test("an unavailable completion write does not throw into the importer", async () => {
  const { fake, writes } = telemetryDatabase(["throws", "throws"]);
  const telemetry = createLiveStatsTelemetry(fake, "production");
  await telemetry.start();
  await telemetry.finish({ status: "completed" });
  assert.equal(writes.length, 2);
});
