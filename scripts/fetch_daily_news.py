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
QUERIES_ALL = ("주요뉴스", "경제", "IT", "정치", "국제")
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


def load_existing_file(date: str) -> dict | None:
    for name in (f"{date}.json", "latest.json"):
        path = OUT_DIR / name
        if not path.exists():
            continue
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            continue
    return None


def load_existing_summaries(date: str) -> tuple[str | None, str | None, str | None]:
  # ponytail: auto-refresh must not clobber cron AI summaries with naive title joins
    data = load_existing_file(date)
    if not data:
        return None, None, None
    m = data.get("markets") or {}
    return (
        (m.get("kr") or {}).get("summary"),
        (m.get("us") or {}).get("summary"),
        (m.get("all") or {}).get("summary"),
    )


def load_existing_items(date: str) -> tuple[list[dict], list[dict], list[dict]]:
    data = load_existing_file(date)
    if not data:
        return [], [], []
    m = data.get("markets") or {}
    return (
        list((m.get("kr") or {}).get("items") or []),
        list((m.get("us") or {}).get("items") or []),
        list((m.get("all") or {}).get("items") or []),
    )


def is_naive_summary(text: str | None) -> bool:
    if not text:
        return True
    if " · " not in text or not text.endswith("."):
        return False
    parts = [p.strip() for p in text[:-1].split(" · ") if p.strip()]
    return len(parts) >= 2 and all(len(p) <= 44 for p in parts[:4])


def build_payload(
    kr_items: list[dict],
    us_items: list[dict],
    all_items: list[dict],
    kr_summary: str | None = None,
    us_summary: str | None = None,
    all_summary: str | None = None,
) -> dict:
    now = kst_now()
    return {
        "date": now.strftime("%Y-%m-%d"),
        "generatedAt": now.isoformat(timespec="seconds"),
        "markets": {
            "kr": build_market(kr_items, kr_summary, "오늘 국내 주식 뉴스를 불러오지 못했습니다."),
            "us": build_market(us_items, us_summary, "오늘 미국 주식 뉴스를 불러오지 못했습니다."),
            "all": build_market(all_items, all_summary, "오늘 주요 뉴스를 불러오지 못했습니다."),
        },
    }


def main() -> int:
    date = kst_now().strftime("%Y-%m-%d")
    prev_kr, prev_us, prev_all = load_existing_summaries(date)
    kr_summary = sys.argv[1] if len(sys.argv) > 1 else None
    us_summary = sys.argv[2] if len(sys.argv) > 2 else None
    all_summary = sys.argv[3] if len(sys.argv) > 3 else None
    if not kr_summary and prev_kr and not is_naive_summary(prev_kr):
        kr_summary = prev_kr
    if not us_summary and prev_us and not is_naive_summary(prev_us):
        us_summary = prev_us
    if not all_summary and prev_all and not is_naive_summary(prev_all):
        all_summary = prev_all
    prev_kr_items, prev_us_items, prev_all_items = load_existing_items(date)
    kr_items = collect_items(QUERIES_KR) or prev_kr_items
    us_items = collect_items(QUERIES_US) or prev_us_items
    all_items = collect_items(QUERIES_ALL) or prev_all_items
    payload = build_payload(kr_items, us_items, all_items, kr_summary, us_summary, all_summary)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"{payload['date']}.json"
    text = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    out.write_text(text, encoding="utf-8")
    (OUT_DIR / "latest.json").write_text(text, encoding="utf-8")
    print(json.dumps(payload, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
