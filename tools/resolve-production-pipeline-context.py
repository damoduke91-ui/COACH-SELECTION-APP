import json
import os
from datetime import datetime, timezone
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlparse
from urllib.request import Request, urlopen


def require_hosted_supabase_url(value: str) -> str:
    url = value.rstrip("/")
    parsed = urlparse(url)
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or parsed.hostname in {"127.0.0.1", "localhost", "::1"}
    ):
        raise SystemExit(
            "Safety stop: automatic production resolution requires a hosted HTTPS Supabase URL."
        )
    return url


def fetch_rows(base_url: str, service_role_key: str, table: str, params: dict[str, str]):
    query = urlencode(params)
    request = Request(
        f"{base_url}/rest/v1/{table}?{query}",
        headers={
            "apikey": service_role_key,
            "Authorization": f"Bearer {service_role_key}",
            "Accept": "application/json",
        },
    )
    try:
        with urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        details = error.read().decode("utf-8", errors="replace")
        raise SystemExit(
            f"Safety stop: Production context lookup failed ({error.code}): {details}"
        ) from error
    except (URLError, TimeoutError) as error:
        raise SystemExit(f"Safety stop: Production context lookup failed: {error}") from error


def write_github_output(name: str, value: str | int) -> None:
    output_path = os.environ.get("GITHUB_OUTPUT", "").strip()
    if not output_path:
        raise SystemExit("Safety stop: GITHUB_OUTPUT is unavailable.")
    with Path(output_path).open("a", encoding="utf-8") as output:
        output.write(f"{name}={value}\n")


def main() -> None:
    base_url = require_hosted_supabase_url(
        os.environ.get("PRODUCTION_SUPABASE_URL", "").strip()
    )
    service_role_key = os.environ.get(
        "PRODUCTION_SUPABASE_SERVICE_ROLE_KEY", ""
    ).strip()
    if not service_role_key:
        raise SystemExit("Safety stop: Production Supabase service-role key is missing.")

    settings_rows = fetch_rows(
        base_url,
        service_role_key,
        "app_settings",
        {
            "select": "season_year,current_afl_round",
            "environment": "eq.production",
        },
    )
    if len(settings_rows) != 1:
        raise SystemExit("Safety stop: Production controlled season settings are unavailable.")

    season_year = settings_rows[0].get("season_year")
    afl_round = settings_rows[0].get("current_afl_round")
    if not isinstance(season_year, int) or not 2000 <= season_year <= 2100:
        raise SystemExit("Safety stop: Production controlled season year is invalid.")
    if not isinstance(afl_round, int) or afl_round < 1:
        raise SystemExit("Safety stop: Production controlled AFL round is invalid.")

    season_rows = fetch_rows(
        base_url,
        service_role_key,
        "competition_seasons",
        {
            "select": "status",
            "environment": "eq.production",
            "season_year": f"eq.{season_year}",
        },
    )
    if len(season_rows) != 1 or season_rows[0].get("status") != "active":
        raise SystemExit(
            "Safety stop: automatic production execution requires the controlled season to be active."
        )

    match_rows = fetch_rows(
        base_url,
        service_role_key,
        "afl_matches",
        {
            "select": "utc_start_time",
            "environment": "eq.production",
            "season_year": f"eq.{season_year}",
            "afl_round": f"eq.{afl_round}",
        },
    )
    start_times = []
    for match in match_rows:
        value = match.get("utc_start_time")
        if not isinstance(value, str) or not value.strip():
            continue
        try:
            start_times.append(datetime.fromisoformat(value.replace("Z", "+00:00")))
        except ValueError as error:
            raise SystemExit(
                "Safety stop: the current Production round contains an invalid match start time."
            ) from error

    should_run = bool(start_times) and min(start_times) <= datetime.now(timezone.utc)
    write_github_output("expected_round", afl_round)
    write_github_output("season_year", season_year)
    write_github_output("should_run", str(should_run).lower())
    print(
        json.dumps(
            {
                "environment": "production",
                "season_year": season_year,
                "expected_round": afl_round,
                "season_status": "active",
                "scheduled_run_required": should_run,
                "reason": (
                    "The current round has started."
                    if should_run
                    else "The current round has no started fixture; the scheduled run is a safe no-op."
                ),
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
