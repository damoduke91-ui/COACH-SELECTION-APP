import csv
import json
import os
from pathlib import Path


fetcher_dir = Path("tools/afl-preview-fetcher")
state_path = fetcher_dir / "afl_stats_scheduler_state.json"

if not state_path.is_file():
    raise SystemExit("Fetcher did not create its scheduler state file.")

state = json.loads(state_path.read_text(encoding="utf-8"))
last_run = state.get("last_run") or {}
round_number = last_run.get("round")

if not isinstance(round_number, int):
    raise SystemExit("Fetcher state does not contain a valid AFL round.")

expected_round_text = os.environ.get("EXPECTED_AFL_ROUND", "").strip()
if not expected_round_text.isdigit() or int(expected_round_text) < 1:
    raise SystemExit("The dashboard did not provide a valid expected AFL round.")
if round_number != int(expected_round_text):
    raise SystemExit(
        f"Safety stop: dashboard requested AFL Round {expected_round_text}, "
        f"but FootyWire detected AFL Round {round_number}."
    )

expected_environment = os.environ.get("EXPECTED_CSV_ENVIRONMENT", "preview").strip().lower()
if expected_environment not in {"preview", "production"}:
    raise SystemExit("EXPECTED_CSV_ENVIRONMENT must be either preview or production.")

round_dir = fetcher_dir / f"Round {round_number}"
match_files = sorted(round_dir.glob(f"round{round_number}_stats_*.csv"))

if not match_files:
    raise SystemExit(f"No per-match CSV files were created for AFL Round {round_number}.")

total_rows = 0
for csv_path in match_files:
    with csv_path.open(newline="", encoding="utf-8-sig") as csv_file:
        reader = csv.DictReader(csv_file)
        required = {"environment", "afl_round", "player_name", "afl_team_code"}
        missing = required.difference(reader.fieldnames or [])
        if missing:
            raise SystemExit(f"{csv_path.name} is missing columns: {sorted(missing)}")
        rows = list(reader)
        if not rows:
            raise SystemExit(f"{csv_path.name} contains no player rows.")
        if any(row.get("environment", "").strip() != expected_environment for row in rows):
            raise SystemExit(
                f"Safety stop: {csv_path.name} contains rows outside the "
                f"{expected_environment} environment."
            )
        total_rows += len(rows)

summary = {
    "environment": expected_environment,
    "round": round_number,
    "match_files": len(match_files),
    "player_rows": total_rows,
    "supabase_upload_attempted": False,
}
summary_path = fetcher_dir / "preview_worker_summary.json"
summary_path.write_text(json.dumps(summary, indent=2) + "\n", encoding="utf-8")
print(json.dumps(summary, indent=2))
