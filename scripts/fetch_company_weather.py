#!/usr/bin/env python3
"""회사(DMC) 단기예보 → data/weather/YYYY-MM-DD.json (cron·수동 실행용)."""
from __future__ import annotations

import json
import sys
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "data" / "weather"
PROXY = "https://k-skill-proxy.nomadamas.org"
LAT, LON = 37.5845, 126.8856
LOCATION = "DMC첨단산업센터"

SKY = {"1": "맑음", "2": "맑음", "3": "구름많음", "4": "흐림"}
PTY = {"0": "없음", "1": "비", "2": "비/눈", "3": "눈", "4": "소나기"}


def kst_now() -> datetime:
    return datetime.now(timezone(timedelta(hours=9)))


def fetch_forecast() -> dict:
    qs = urllib.parse.urlencode({"lat": LAT, "lon": LON})
    url = f"{PROXY}/v1/korea-weather/forecast?{qs}"
    req = urllib.request.Request(url, headers={"User-Agent": "attendance-pwa-weather/1.0"})
    with urllib.request.urlopen(req, timeout=60) as resp:
        return json.load(resp)


def parse_items(raw: dict) -> list[dict]:
    items = raw.get("response", {}).get("body", {}).get("items", {}).get("item", [])
    if isinstance(items, dict):
        items = [items]
    by_slot: dict[str, dict] = {}
    for it in items:
        key = f"{it.get('fcstDate')}_{it.get('fcstTime')}"
        slot = by_slot.setdefault(key, {"fcstDate": it.get("fcstDate"), "fcstTime": it.get("fcstTime")})
        cat = it.get("category")
        if cat:
            slot[cat] = it.get("fcstValue")
    return sorted(by_slot.values(), key=lambda s: (s.get("fcstDate", ""), s.get("fcstTime", "")))


def slot_label(fcst_time: str) -> str:
    h = int(fcst_time[:2]) if fcst_time else 0
    if h < 12:
        return "오전"
    if h < 18:
        return "오후"
    return "저녁"


def build_periods(slots: list[dict], date_str: str) -> list[dict]:
    periods = []
    for s in slots:
        if s.get("fcstDate") != date_str.replace("-", ""):
            continue
        t = s.get("fcstTime", "")
        periods.append({
            "time": f"{t[:2]}:{t[2:4]}" if len(t) >= 4 else t,
            "label": slot_label(t),
            "temp": int(s["TMP"]) if s.get("TMP") and str(s["TMP"]).lstrip("-").isdigit() else s.get("TMP"),
            "sky": SKY.get(str(s.get("SKY", "")), "—"),
            "pop": int(s["POP"]) if s.get("POP") and str(s["POP"]).isdigit() else None,
            "pty": PTY.get(str(s.get("PTY", "0")), "없음"),
        })
    return periods[:8]


def summarize(periods: list[dict]) -> str:
    if not periods:
        return "예보 데이터를 불러오지 못했습니다."
    temps = [p["temp"] for p in periods if isinstance(p.get("temp"), int)]
    tmin = min(temps) if temps else None
    tmax = max(temps) if temps else None
    rain = [p for p in periods if p.get("pty") not in (None, "없음") or (p.get("pop") or 0) >= 40]
    parts = []
    if tmin is not None and tmax is not None:
        parts.append(f"오늘 {tmin}~{tmax}°C")
    skies = {p.get("sky") for p in periods if p.get("sky")}
    if skies:
        parts.append("·".join(sorted(skies)))
    if rain:
        parts.append("비/소나기 가능 — 우산 챙기세요")
    elif tmax and tmax >= 30:
        parts.append("더움 — 수분 보충")
    return ". ".join(parts) + "."


def build_payload(raw: dict, summary_override: str | None = None) -> dict:
    now = kst_now()
    date_str = now.strftime("%Y-%m-%d")
    slots = parse_items(raw)
    periods = build_periods(slots, date_str)
    temps = [p["temp"] for p in periods if isinstance(p.get("temp"), int)]
    return {
        "date": date_str,
        "location": LOCATION,
        "lat": LAT,
        "lng": LON,
        "generatedAt": now.isoformat(timespec="seconds"),
        "periods": periods,
        "highlights": {
            "tempMin": min(temps) if temps else None,
            "tempMax": max(temps) if temps else None,
        },
        "summary": summary_override or summarize(periods),
    }


def main() -> int:
    summary_override = sys.argv[1] if len(sys.argv) > 1 else None
    try:
        raw = fetch_forecast()
    except Exception as exc:
        print(f"warn: forecast fetch failed: {exc}", file=sys.stderr)
        raw = {}
    payload = build_payload(raw, summary_override)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"{payload['date']}.json"
    out.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    latest = OUT_DIR / "latest.json"
    latest.write_text(out.read_text(encoding="utf-8"), encoding="utf-8")
    print(json.dumps(payload, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
