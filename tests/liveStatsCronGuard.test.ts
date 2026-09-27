import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import test from "node:test";
import ts from "typescript";
import * as guards from "../lib/liveStatsGuards.ts";
import { requireSeasonYear } from "../lib/season.ts";

const compiled = ts.transpileModule(readFileSync(new URL("../app/api/cron/live-afl-stats/route.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

function harness(configured?: string) {
  const writes: unknown[] = [];
  const events: Record<string, unknown>[] = [];
  let fetches = 0;
  const query = (table: string) => {
    const q = { select: () => q, eq: () => q,
      maybeSingle: async () => ({ data: { current_afl_round: 1, season_year: 2027 }, error: null }),
      single: async () => ({ data: { status: "active" }, error: null }),
      update: (payload: unknown) => { writes.push({ table, payload }); throw Error("Unexpected write"); },
    };
    return q;
  };
  const exports: { GET?: (request: unknown) => Promise<Response> } = {};
  runInNewContext(compiled, { exports, URL, Date, Error,
    process: { env: { NEXT_PUBLIC_SUPABASE_URL: "https://mock.local", SUPABASE_SERVICE_ROLE_KEY: "mock", LIVE_STATS_ADMIN_SECRET: "test-secret", AFL_COMP_SEASON_ID: configured } },
    fetch: async () => { fetches++; return { ok: true, json: async () => ({ matches: [{ id: 1, status: "CONCLUDED", providerId: "CD_M20260140101", compSeason: { providerId: "CD_S2026014" } }] }) }; },
    require(name: string) {
      if (name === "next/server") return { NextResponse: { json: (body: unknown, init?: ResponseInit) => new Response(JSON.stringify(body), init) } };
      if (name === "@supabase/supabase-js") return { createClient: () => ({ from: query }) };
      if (name.endsWith("/liveStatsGuards")) return guards;
      if (name.endsWith("/season")) return { requireSeasonYear };
      if (name.endsWith("/liveStatsTelemetry")) return { createLiveStatsTelemetry: () => ({ start: async () => {}, update: async (v: Record<string, unknown>) => { events.push(v); }, finish: async (v: Record<string, unknown>) => { events.push(v); } }) };
      if (name.endsWith("/aflLiveStats")) return {};
      if (name.endsWith("/super8LiveFinalisation")) return { finaliseSuper8RoundFromLiveStats: () => { throw Error("Finalisation must not run"); } };
      throw Error(`Unexpected module: ${name}`);
    },
  });
  return { writes, events, fetches: () => fetches, get: (headers: Headers) => exports.GET!({ headers, nextUrl: new URL("https://mock.local/api/cron/live-afl-stats") }) };
}

test("missing 2027 configuration and wrong-season response stop cron before fixture/stat writes", async () => {
  for (const configured of [undefined, "85", "999"]) {
    const h = harness(configured);
    const response = await h.get(new Headers({ "x-admin-secret": "test-secret" }));
    assert.equal(response.status, 500);
    assert.match((await response.json()).error, /season|fixture/i);
    assert.equal(h.writes.length, 0);
    assert.equal(h.fetches(), configured === "999" ? 1 : 0);
    assert.equal(h.events.at(-1)?.status, "failed");
  }
});

test("a spoofed cron user agent cannot reach settings, telemetry or AFL requests", async () => {
  const h = harness();
  assert.equal((await h.get(new Headers({ "user-agent": "vercel-cron" }))).status, 401);
  assert.equal(h.events.length, 0);
  assert.equal(h.fetches(), 0);
});
