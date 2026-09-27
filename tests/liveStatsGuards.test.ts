import assert from "node:assert/strict";
import test from "node:test";
import { isLiveStatsAuthorized, resolveAflSeasonId, assertAflFixtureSeason } from "../lib/liveStatsGuards.ts";

test("QStash admin-secret authentication is preserved; user-agent spoofing is rejected", () => {
  const params = new URLSearchParams();
  const secrets = { adminSecret: "admin-test", cronSecret: "cron-test" };
  assert.equal(isLiveStatsAuthorized(new Headers({ "user-agent": "Upstash-QStash", "x-admin-secret": "admin-test" }), params, secrets), true);
  assert.equal(isLiveStatsAuthorized(new Headers(), new URLSearchParams("secret=admin-test"), secrets), true);
  assert.equal(isLiveStatsAuthorized(new Headers({ authorization: "Bearer cron-test" }), params, secrets), true);
  assert.equal(isLiveStatsAuthorized(new Headers({ "user-agent": "vercel-cron/1.0" }), params, secrets), false);
  assert.equal(isLiveStatsAuthorized(new Headers({ "x-admin-secret": "wrong" }), params, secrets), false);
  assert.equal(isLiveStatsAuthorized(new Headers({ authorization: "Bearer undefined" }), params, {}), false);
});

test("2026 fallback never silently carries forward to 2027", () => {
  assert.equal(resolveAflSeasonId(2026, undefined), "85");
  assert.throws(() => resolveAflSeasonId(2027, undefined), /Configure AFL_COMP_SEASON_ID/);
  assert.throws(() => resolveAflSeasonId(2027, "85"), /belongs to 2026/);
  assert.throws(() => resolveAflSeasonId(2027, "garbage"), /Configure/);
  assert.equal(resolveAflSeasonId(2027, "999"), "999"); // Synthetic id, not a claimed 2027 id.
});

test("all fixture rows must prove the target season before any write", () => {
  const valid = { providerId: "CD_M20270140101", compSeason: { providerId: "CD_S2027014", name: "2027 Toyota AFL Premiership" } };
  assert.doesNotThrow(() => assertAflFixtureSeason([valid], 2027));
  assert.doesNotThrow(() => assertAflFixtureSeason([], 2027));
  assert.throws(() => assertAflFixtureSeason([valid, { providerId: "CD_M20260140101" }], 2027), /could not be verified/);
  assert.throws(() => assertAflFixtureSeason([{ ...valid, compSeason: { name: "2026 Premiership" } }], 2027), /could not be verified/);
  assert.throws(() => assertAflFixtureSeason([{ id: 42 }], 2027), /could not be verified/);
});
