#!/usr/bin/env python3
"""오늘 주식 뉴스(국내·미국) → data/news/YYYY-MM-DD.json (cron·수동 실행용)."""
from __future__ import annotations

import json
import re
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "data" / "news"
PROXY = "https://k-skill-proxy.nomadamas.org"
QUERIES_KR = ("국내주식", "코스피", "코스닥", "증시", "한국 증시")
QUERIES_US = ("미국주식", "나스닥", "S&P500", "다우존스", "미국 증시")
DISPLAY = 8


def kst_now() -> datetime:
    return datetime.now(timezone(timedelta(hours=9)))


def fetch_news(q: str, display: int = DISPLAY) -> list[dict]:
    qs = urllib.parse.urlencode({"q": q, "display": display, "sort": "date"})
    url = f"{PROXY}/v1/naver-news/search?{qs}"
    req = urllib.request.Request(url, headers={"User-Agent": "attendance-pwa-news/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        data = json.load(resp)
    return data.get("items") or []


def clean_title(title: str) -> str:
    return re.sub(r"\s+", " ", title or "").strip()


def clean_html(text: str) -> str:
    return re.sub(r"<[^>]+>", "", text or "").replace("&quot;", '"').replace("&amp;", "&").strip()


def dedupe_items(items: list[dict]) -> list[dict]:
    seen: set[str] = set()
    out: list[dict] = []
    for it in items:
        title = clean_title(it.get("title", ""))
        if not title or title in seen:
            continue
        seen.add(title)
        out.append({
            "title": title,
            "link": it.get("link") or it.get("original_link") or "",
            "description": clean_html(it.get("description", ""))[:200],
            "pubDate": it.get("pub_date") or it.get("pub_date_iso") or "",
        })
    return out


def collect_items(queries: tuple[str, ...]) -> list[dict]:
    merged: list[dict] = []
    for q in queries:
        try:
            merged.extend(fetch_news(q))
        except Exception as exc:
            print(f"warn: {q}: {exc}", file=sys.stderr)
    return dedupe_items(merged)[:15]


def naive_summary(items: list[dict], empty_msg: str) -> str:
    if not items:
        return empty_msg
    bits = []
    for it in items[:4]:
        t = it["title"]
        if len(t) > 42:
            t = t[:40] + "…"
        bits.append(t)
    return " · ".join(bits) + "."


def build_market(items: list[dict], summary_override: str | None, empty_msg: str) -> dict:
    return {
        "summary": summary_override or naive_summary(items, empty_msg),
        "items": items,
    }


def build_payload(
    kr_items: list[dict],
    us_items: list[dict],
    kr_summary: str | None = None,
    us_summary: str | None = None,
) -> dict:
    now = kst_now()
    return {
        "date": now.strftime("%Y-%m-%d"),
        "generatedAt": now.isoformat(timespec="seconds"),
        "markets": {
            "kr": build_market(kr_items, kr_summary, "오늘 국내 주식 뉴스를 불러오지 못했습니다."),
            "us": build_market(us_items, us_summary, "오늘 미국 주식 뉴스를 불러오지 못했습니다."),
        },
    }


def main() -> int:
    kr_summary = sys.argv[1] if len(sys.argv) > 1 else None
    us_summary = sys.argv[2] if len(sys.argv) > 2 else None
    kr_items = collect_items(QUERIES_KR)
    us_items = collect_items(QUERIES_US)
    payload = build_payload(kr_items, us_items, kr_summary, us_summary)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"{payload['date']}.json"
    text = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    out.write_text(text, encoding="utf-8")
    (OUT_DIR / "latest.json").write_text(text, encoding="utf-8")
    print(json.dumps(payload, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
