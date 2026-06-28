#!/usr/bin/env python3
"""fetch_company_weather.py 실행 후 data/weather/ 커밋·푸시 (cron용)."""
from __future__ import annotations

import subprocess
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def kst_today() -> str:
    return datetime.now(timezone(timedelta(hours=9))).strftime("%Y-%m-%d")


def run(cmd: list[str]) -> None:
    subprocess.run(cmd, cwd=ROOT, check=True)


def main() -> int:
    summary = sys.argv[1] if len(sys.argv) > 1 else None
    fetch_cmd = [sys.executable, str(ROOT / "scripts" / "fetch_company_weather.py")]
    if summary:
        fetch_cmd.append(summary)
    run(fetch_cmd)

    date = kst_today()
    run(["git", "add", f"data/weather/{date}.json", "data/weather/latest.json"])
    status = subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=ROOT)
    if status.returncode == 0:
        print(f"[SILENT] weather unchanged {date}")
        return 0
    run(["git", "commit", "-m", f"weather: {date}"])
    run(["git", "push", "origin", "main"])
    print(f"weather published {date}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
