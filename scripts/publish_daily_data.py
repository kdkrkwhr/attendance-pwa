#!/usr/bin/env python3
"""날씨·뉴스 fetch 후 git commit·push를 한 번만 (Pages 배포 충돌 방지)."""
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
    # ponytail: argv passthrough — weather summary first, then news kr/us summaries
    args = sys.argv[1:]
    weather_summary = args[0] if len(args) > 0 else None
    news_kr = args[1] if len(args) > 1 else None
    news_us = args[2] if len(args) > 2 else None

    fetch_weather = [sys.executable, str(ROOT / "scripts" / "fetch_company_weather.py")]
    if weather_summary:
        fetch_weather.append(weather_summary)
    run(fetch_weather)

    fetch_news = [sys.executable, str(ROOT / "scripts" / "fetch_daily_news.py")]
    if news_kr:
        fetch_news.append(news_kr)
    if news_us:
        fetch_news.append(news_us)
    run(fetch_news)

    date = kst_today()
    run(
        [
            "git",
            "add",
            f"data/weather/{date}.json",
            "data/weather/latest.json",
            f"data/news/{date}.json",
            "data/news/latest.json",
        ]
    )
    status = subprocess.run(["git", "diff", "--cached", "--quiet"], cwd=ROOT)
    if status.returncode == 0:
        print(f"[SILENT] daily data unchanged {date}")
        return 0
    run(["git", "commit", "-m", f"data: {date}"])
    run(["git", "push", "origin", "main"])
    print(f"daily data published {date}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
