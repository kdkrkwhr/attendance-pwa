import json, sys

paths = ["data/news/2026-07-13.json", "data/news/latest.json"]
all_ok = True
for p in paths:
    try:
        with open(p, "r", encoding="utf-8") as f:
            d = json.load(f)
        assert d["date"] == "2026-07-13"
        assert "markets" in d
        assert "kr" in d["markets"] and "us" in d["markets"]
        assert len(d["markets"]["kr"]["summary"]) > 50
        assert len(d["markets"]["us"]["summary"]) > 50
        assert len(d["markets"]["kr"]["items"]) >= 10
        assert len(d["markets"]["us"]["items"]) >= 10
        kr_summary_new = "코스피 오늘 8% 폭락하며 올해 7번째 서킷브레이커 발동" in d["markets"]["kr"]["summary"]
        us_summary_new = "뉴욕 프리마켓 약세 전환" in d["markets"]["us"]["summary"]
        print(f"OK  {p}  ({len(json.dumps(d, ensure_ascii=False))} chars, {len(d['markets']['kr']['items'])} kr items, {len(d['markets']['us']['items'])} us items, kr_summary_updated={kr_summary_new}, us_summary_updated={us_summary_new})")
    except Exception as e:
        print(f"FAIL {p}: {e}")
        all_ok = False

sys.exit(0 if all_ok else 1)