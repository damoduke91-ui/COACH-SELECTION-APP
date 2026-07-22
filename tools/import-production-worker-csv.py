import csv
import json
import os
from pathlib import Path
from urllib.parse import urlparse


ENABLE_PHRASE = "ENABLE_PROTECTED_PRODUCTION_CSV_IMPORT"
supabase_url = os.environ.get("PRODUCTION_SUPABASE_URL", "").rstrip("/")
service_role_key = os.environ.get("PRODUCTION_SUPABASE_SERVICE_ROLE_KEY", "")
enable_value = os.environ.get("ENABLE_PRODUCTION_CSV_IMPORT", "")
expected_round_value = os.environ.get("EXPECTED_AFL_ROUND", "")

parsed_url = urlparse(supabase_url)
if (
    parsed_url.scheme != "https"
    or not parsed_url.hostname
    or parsed_url.hostname in {"127.0.0.1", "localhost", "::1"}
):
    raise SystemExit("Safety stop: production import requires a hosted HTTPS Supabase URL.")

if enable_value != ENABLE_PHRASE:
    raise SystemExit("Safety stop: the explicit production import enable phrase is missing.")

if not service_role_key:
    raise SystemExit("Production Supabase service-role key is missing.")

try:
    expected_round = int(expected_round_value)
except ValueError as error:
    raise SystemExit("EXPECTED_AFL_ROUND must be a positive integer.") from error
if expected_round < 1:
    raise SystemExit("EXPECTED_AFL_ROUND must be a positive integer.")

import requests

fetcher_dir = Path("tools/afl-preview-fetcher")
state_path = fetcher_dir / "afl_stats_scheduler_state.json"
state = json.loads(state_path.read_text(encoding="utf-8"))
round_number = (state.get("last_run") or {}).get("round")
if round_number != expected_round:
    raise SystemExit(
        f"Safety stop: fetched AFL Round {round_number} does not match confirmed Round {expected_round}."
    )

match_files = sorted(
    (fetcher_dir / f"Round {round_number}").glob(f"round{round_number}_stats_*.csv")
)
if not match_files:
    raise SystemExit(f"No per-match CSV files were found for AFL Round {round_number}.")

number_columns = {
    "afl_round", "k", "hb", "d", "m", "g", "b", "t", "ho", "ga",
    "i50", "cl", "cg", "r50", "ff", "fa", "af", "sc",
}
headers = {
    "apikey": service_role_key,
    "Authorization": f"Bearer {service_role_key}",
    "Content-Type": "application/json",
}
rpc_url = f"{supabase_url}/rest/v1/rpc/replace_match_with_protected_csv"
files = []
inserted_rows = 0
imported_files = 0
protected_files = 0

for csv_path in match_files:
    with csv_path.open(newline="", encoding="utf-8-sig") as csv_file:
        raw_rows = list(csv.DictReader(csv_file))

    if not raw_rows:
        raise SystemExit(f"{csv_path.name} contains no player rows.")

    rows = []
    seen_players = set()
    team_codes = []
    for raw_row in raw_rows:
        if raw_row.get("environment", "").strip() != "production":
            raise SystemExit(f"Safety stop: {csv_path.name} contains a non-production row.")
        if int(raw_row.get("afl_round", "0")) != round_number:
            raise SystemExit(f"{csv_path.name} contains a row outside AFL Round {round_number}.")

        team_code = raw_row.get("afl_team_code", "").strip().upper()
        player_name = raw_row.get("player_name", "").strip()
        if not team_code or not player_name:
            raise SystemExit(f"{csv_path.name} contains a row without a team or player.")

        player_key = f"{team_code}|{player_name}"
        if player_key in seen_players:
            raise SystemExit(f"{csv_path.name} contains duplicate player {player_key}.")
        seen_players.add(player_key)

        if team_code not in team_codes:
            team_codes.append(team_code)

        row = {}
        for column, value in raw_row.items():
            row[column] = int(value or 0) if column in number_columns else value.strip()
        rows.append(row)

    if len(team_codes) != 2:
        raise SystemExit(f"{csv_path.name} does not contain exactly two teams.")

    response = requests.post(
        rpc_url,
        headers=headers,
        json={
            "p_environment": "production",
            "p_afl_round": round_number,
            "p_team_codes": team_codes,
            "p_rows": rows,
        },
        timeout=30,
    )
    response.raise_for_status()
    result = response.json()

    if result.get("status") == "protected":
        if result.get("protected_rows") != len(rows):
            raise SystemExit(
                f"{csv_path.name} has a partial protected conflict. "
                "Use the explicit production deletion override before retrying."
            )
        protected_files += 1
    elif result.get("status") == "partial_conflict":
        raise SystemExit(
            f"{csv_path.name} has a partial protected conflict. "
            "Use the explicit production deletion override before retrying."
        )
    elif result.get("status") == "imported" and result.get("inserted_rows") == len(rows):
        imported_files += 1
        inserted_rows += len(rows)
    else:
        raise SystemExit(f"{csv_path.name} returned an invalid replacement result: {result}")

    files.append({"file": csv_path.name, "rows": len(rows), "status": result.get("status")})

summary = {
    "environment": "production",
    "destination_host": parsed_url.hostname,
    "round": round_number,
    "match_files": len(match_files),
    "imported_files": imported_files,
    "protected_files": protected_files,
    "inserted_rows": inserted_rows,
    "files": files,
}
summary_path = fetcher_dir / "production_worker_import_summary.json"
summary_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
print(json.dumps(summary, indent=2))
