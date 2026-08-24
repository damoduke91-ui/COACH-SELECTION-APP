import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const workflow = readFileSync(
  new URL("../.github/workflows/production-afl-csv-replacement.yml", import.meta.url),
  "utf8",
);
const resolver = readFileSync(
  new URL("../tools/resolve-production-pipeline-context.py", import.meta.url),
  "utf8",
);

test("Production automation has an independent kill switch and keeps manual confirmation", () => {
  assert.match(workflow, /schedule:\s*\n\s+- cron:/);
  assert.match(workflow, /PRODUCTION_PIPELINE_AUTOMATION_ENABLED == 'true'/);
  assert.match(workflow, /inputs\.confirmation_phrase == 'PRODUCTION_AFL_CSV_REPLACEMENT'/);
});

test("scheduled Production runs resolve controlled active season context", () => {
  assert.match(workflow, /Resolve active Production season and round/);
  assert.match(workflow, /steps\.production-context\.outputs\.expected_round/);
  assert.match(workflow, /steps\.production-context\.outputs\.should_run == 'true'/);
  assert.match(resolver, /"competition_seasons"/);
  assert.match(resolver, /"afl_matches"/);
  assert.match(resolver, /import requests/);
  assert.match(resolver, /truststore\.inject_into_ssl\(\)/);
  assert.match(workflow, /production-worker-venv\\Scripts\\python\.exe" tools\/resolve-production-pipeline-context\.py/);
  assert.match(resolver, /season_rows\[0\]\.get\("status"\) != "active"/);
  assert.match(resolver, /"environment": "eq\.production"/);
  assert.match(resolver, /min\(start_times\) <= datetime\.now\(timezone\.utc\)/);
});

test("scheduled runs cannot activate locked recovery mode", () => {
  assert.match(
    workflow,
    /github\.event_name == 'workflow_dispatch' && inputs\.recovery_match_ids/,
  );
});
