import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as health from "../lib/liveStatsHealth.ts";
import { requireSeasonYear } from "../lib/season.ts";

// Execute the actual route with an in-memory database/auth boundary. Never contacts Supabase.
const compiled = ts.transpileModule(readFileSync(new URL("../app/api/admin/live-stats-health/route.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness(options: { environment?: string; adminEnvironment?: string; historyMissing?: boolean; invalidToken?: boolean } = {}) {
  const queries: { table: string; filters: Record<string, unknown> }[] = [];
  const database = {
    auth: { getUser: async () => ({ data: { user: options.invalidToken ? null : { id: "user-1" } }, error: null }) },
    from(table: string) {
      const filters: Record<string, unknown> = {};
      queries.push({ table, filters });
      const result = () => {
        if (table === "profiles") return { data: filters.environment === (options.adminEnvironment ?? "production") ? { id: "user-1" } : null, error: null };
        if (table === "app_settings") return { data: { season_year: 2026, current_afl_round: 24 }, error: null };
        if (table === "afl_matches") return { data: [{ afl_match_id: 1, home_team_name: "A", away_team_name: "B", status: "LIVE", utc_start_time: null }], error: null };
        return { data: options.historyMissing ? null : [], error: options.historyMissing ? { message: "Table missing" } : null };
      };
      const query = {
        select() { return query; }, eq(key: string, value: unknown) { filters[key] = value; return query; },
        order() { return query; }, limit() { return query; },
        single: async () => result(), maybeSingle: async () => result(),
        then(resolve: (value: ReturnType<typeof result>) => unknown) { return Promise.resolve(result()).then(resolve); },
      };
      return query;
    },
  };
  const exported: { GET?: (request: Request) => Promise<Response> } = {};
  runInNewContext(compiled, {
    exports: exported,
    process: { env: { APP_ENV: options.environment ?? "production", NEXT_PUBLIC_SUPABASE_URL: "http://mock.local", SUPABASE_SERVICE_ROLE_KEY: "test-only" } },
    require(name: string) {
      if (name === "next/server") return { NextResponse: { json: (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init) } };
      if (name === "@supabase/supabase-js") return { createClient: () => database };
      if (name.endsWith("/season")) return { requireSeasonYear };
      if (name.endsWith("/liveStatsHealth")) return health;
      throw new Error(`Unexpected dependency: ${name}`);
    },
  });
  return { queries, get: (token?: string) => exported.GET!(new Request("http://localhost/api/admin/live-stats-health", {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  })) };
}

test("health API rejects anonymous and invalid sessions", async () => {
  const anonymous = harness();
  assert.equal((await anonymous.get()).status, 401);
  assert.equal(anonymous.queries.length, 0);
  assert.equal((await harness({ invalidToken: true }).get("bad")).status, 401);
});

test("Production health rejects Preview-only admins and does not read health data", async () => {
  const api = harness({ adminEnvironment: "preview" });
  assert.equal((await api.get("coach-or-preview-admin")).status, 403);
  assert.equal(api.queries.some((query) => query.table === "afl_matches"), false);
});

test("Preview health accepts Production admin fallback but reads only Preview matches", async () => {
  const api = harness({ environment: "preview" });
  const response = await api.get("admin");
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store");
  const matchQuery = api.queries.find((query) => query.table === "afl_matches")!;
  assert.deepEqual(matchQuery.filters, { environment: "preview", season_year: 2026, afl_round: 24 });
  const body = await response.json();
  assert.equal(body.environment, "preview");
  assert.equal(body.matches[0].eligible, true);
  assert.equal(body.matches[0].latestOutcome, null);
  assert.equal(body.heartbeat, "unknown");
});

test("missing telemetry migration keeps match data available with an explicit warning", async () => {
  const response = await harness({ historyMissing: true }).get("admin");
  const body = await response.json();
  assert.equal(response.status, 200);
  assert.match(body.telemetryWarning, /history is unavailable/);
  assert.equal(body.matches.length, 1);
  assert.equal(body.heartbeat, "unknown");
});
