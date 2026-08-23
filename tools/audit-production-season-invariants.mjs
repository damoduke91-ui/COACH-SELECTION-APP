import { createHash } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Supabase audit credentials are required.");

const db = createClient(url, key, { auth: { persistSession: false } });
const pageSize = 1000;

async function loadAll(table, columns, filters = []) {
  const rows = [];
  for (let from = 0; ; from += pageSize) {
    let query = db.from(table).select(columns).range(from, from + pageSize - 1);
    for (const [column, value] of filters) query = query.eq(column, value);
    const result = await query;
    if (result.error) throw new Error(`${table}: ${result.error.message}`);
    rows.push(...(result.data ?? []));
    if ((result.data ?? []).length < pageSize) break;
  }
  return rows;
}

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).sort(([left], [right]) => left.localeCompare(right)).map(
        ([keyName, child]) => [keyName, canonical(child)],
      ),
    );
  }
  return value;
}

function digest(rows) {
  const ordered = rows.map(canonical).sort((left, right) =>
    JSON.stringify(left).localeCompare(JSON.stringify(right)),
  );
  return createHash("sha256").update(JSON.stringify(ordered)).digest("hex");
}

const specifications = {
  app_settings: {
    columns: "environment,current_afl_round,current_super8_round,lockout_enabled,lockout_at,latest_team_list_round",
    filters: [["environment", "production"]],
  },
  coach_team_selections: {
    columns: "coach_id,coach_name,is_submitted,submitted_at,updated_at",
    filters: [["environment", "production"]],
  },
  round_submissions: {
    columns: "id,coach_id,coach_name,is_submitted,submitted_at,round_number,afl_round",
    filters: [["environment", "production"]],
  },
  season_fixture: {
    columns: "id,competition_round,afl_round,matchup_index,coach_id,coach_name,opponent_coach_id,opponent_coach_name",
    filters: [["environment", "production"]],
  },
  super8_match_results: {
    columns: "id,round_number,afl_round,matchup_index,coach_1_id,coach_1_name,coach_1_score,coach_2_id,coach_2_name,coach_2_score,imported_at,score_source,source_updated_at",
  },
  finals_results: {
    columns: "id,environment,season_year,match_code,coach_1_score,coach_2_score,completed_at,created_at,updated_at",
    filters: [["environment", "production"]],
  },
  afl_player_round_stats: {
    columns: "id,afl_round,afl_team_code,player_name,k,hb,d,m,g,b,t,ho,ga,i50,cl,cg,r50,ff,fa,af,sc,imported_at,score_source,updated_at",
    filters: [["environment", "production"]],
  },
  afl_round_finalisation: {
    columns: "afl_round,expected_match_count,final_match_count,player_row_count,club_count,live_ready_at,live_finalised_at,csv_imported_at,active_source,updated_at,live_cleared_at",
    filters: [["environment", "production"]],
  },
};

const output = {};
for (const [table, specification] of Object.entries(specifications)) {
  const rows = await loadAll(table, specification.columns, specification.filters);
  output[table] = { count: rows.length, sha256: digest(rows) };
}

console.log(JSON.stringify(output, null, 2));
