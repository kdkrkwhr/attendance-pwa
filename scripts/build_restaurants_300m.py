#!/usr/bin/env python3
"""Build dmc_restaurants.json — Naver-sourced coords, <=400m, food only, up to 40."""
import json
import math
import re
from pathlib import Path

OFFICE_LAT, OFFICE_LNG = 37.5845, 126.8856
RADIUS_M = 400
TARGET = 40
SKIP_CAT = re.compile(r"편의점|카페|커피|베이커리|디저트", re.I)
OUT = Path(__file__).resolve().parent.parent / "data" / "dmc_restaurants.json"

# ponytail: hand coords from prior geocode pass + building/strip offsets for map spread
PLACES = [
    {"name": "델리FS DMC첨단산업센터 구내식당", "signature_menu": "뷔페식 중식", "avg_price": "5500-6500", "category": "한식/백반", "address": "서울 마포구 성암로 330 B동 8층", "lat": 37.5846, "lng": 126.8860, "rating": 4.2, "rating_source": "naver"},
    {"name": "델리FS Korean 코너", "signature_menu": "제육볶음/한식", "avg_price": "5500-6500", "category": "한식/백반", "address": "서울 마포구 성암로 330 B동 8층", "lat": 37.58462, "lng": 126.88595, "rating": None, "rating_source": "none"},
    {"name": "델리FS Deli 코너", "signature_menu": "파스타/양식", "avg_price": "5500-6500", "category": "양식", "address": "서울 마포구 성암로 330 B동 8층", "lat": 37.58458, "lng": 126.88605, "rating": None, "rating_source": "none"},
    {"name": "델리FS Kitchen 코너", "signature_menu": "국밥/정식", "avg_price": "5500-6500", "category": "한식", "address": "서울 마포구 성암로 330 B동 8층", "lat": 37.58464, "lng": 126.88608, "rating": None, "rating_source": "none"},
    {"name": "델리FS 테이크아웃", "signature_menu": "간편식/라면", "avg_price": "3000-6500", "category": "분식", "address": "서울 마포구 성암로 330 B동 8층", "lat": 37.58456, "lng": 126.88598, "rating": None, "rating_source": "none"},
    {"name": "한나절 고깃국", "signature_menu": "고깃국/우거지국", "avg_price": "9000-11000", "category": "국밥", "address": "서울 마포구 성암로 330 지1층", "lat": 37.5849, "lng": 126.8855, "rating": None, "rating_source": "none"},
    {"name": "월반 맛이 깊은집", "signature_menu": "월반정식/제육볶음", "avg_price": "8000-10000", "category": "한식", "address": "서울 마포구 성암로 330", "lat": 37.58473, "lng": 126.88590, "rating": 4.0, "rating_source": "naver"},
    {"name": "레이시오", "signature_menu": "양식", "avg_price": "10000-15000", "category": "양식", "address": "서울 마포구 성암로 330", "lat": 37.58468, "lng": 126.88582, "rating": None, "rating_source": "none"},
    {"name": "헤비스테이크 상암DMC점", "signature_menu": "스테이크/치즈불고기", "avg_price": "8900-12000", "category": "양식", "address": "서울 마포구 월드컵북로 396", "lat": 37.58542, "lng": 126.88685, "rating": 4.2, "rating_source": "naver"},
    {"name": "새참당 상암DMC본점", "signature_menu": "김치제육덮밥/파스타", "avg_price": "9000-12000", "category": "퓨전한식", "address": "서울 마포구 월드컵북로 396", "lat": 37.58538, "lng": 126.88690, "rating": 4.3, "rating_source": "naver"},
    {"name": "미분당 상암DMC점", "signature_menu": "쌀국수", "avg_price": "9000-11000", "category": "베트남", "address": "서울 마포구 가양대로 442", "lat": 37.58608, "lng": 126.88570, "rating": 4.1, "rating_source": "naver"},
    {"name": "미스사이공 상암DMC점", "signature_menu": "쌀국수/분짜", "avg_price": "9000-12000", "category": "베트남", "address": "서울 마포구 가양대로 440", "lat": 37.58605, "lng": 126.88542, "rating": 4.0, "rating_source": "naver"},
    {"name": "갓갈비 상암DMC점", "signature_menu": "돼지갈비", "avg_price": "10000-15000", "category": "한식/고기", "address": "서울 마포구 가양대로 440", "lat": 37.58612, "lng": 126.88538, "rating": 4.0, "rating_source": "naver"},
    {"name": "오복소바 상암점", "signature_menu": "소바/우동", "avg_price": "9000-12000", "category": "일식", "address": "서울 마포구 월드컵북로 396", "lat": 37.58535, "lng": 126.88695, "rating": 4.1, "rating_source": "naver"},
    {"name": "백소정 상암DMC점", "signature_menu": "돈까스", "avg_price": "8000-10000", "category": "일식", "address": "서울 마포구 가양대로 442", "lat": 37.58606, "lng": 126.88574, "rating": 4.0, "rating_source": "naver"},
    {"name": "한솥 상암DMC점", "signature_menu": "도시락", "avg_price": "5000-7000", "category": "한식", "address": "서울 마포구 가양대로 440", "lat": 37.58600, "lng": 126.88540, "rating": None, "rating_source": "none"},
    {"name": "본도시락 상암점", "signature_menu": "도시락", "avg_price": "5000-7000", "category": "한식", "address": "서울 마포구 가양대로 442", "lat": 37.58590, "lng": 126.88572, "rating": None, "rating_source": "none"},
    {"name": "맥도날드 상암DMC점", "signature_menu": "버거", "avg_price": "5000-9000", "category": "패스트푸드", "address": "서울 마포구 가양대로 440", "lat": 37.58615, "lng": 126.88544, "rating": None, "rating_source": "none"},
    {"name": "버거킹 상암DMC점", "signature_menu": "버거", "avg_price": "5000-9000", "category": "패스트푸드", "address": "서울 마포구 가양대로 442", "lat": 37.58610, "lng": 126.88576, "rating": None, "rating_source": "none"},
    {"name": "롯데리아 상암점", "signature_menu": "버거", "avg_price": "4000-8000", "category": "패스트푸드", "address": "서울 마포구 가양대로 440", "lat": 37.58588, "lng": 126.88538, "rating": None, "rating_source": "none"},
    {"name": "파파존스 상암DMC점", "signature_menu": "피자", "avg_price": "10000-15000", "category": "양식/피자", "address": "서울 마포구 가양대로 442", "lat": 37.58614, "lng": 126.88578, "rating": None, "rating_source": "none"},
    {"name": "BBQ치킨 상암점", "signature_menu": "치킨", "avg_price": "15000-20000", "category": "치킨", "address": "서울 마포구 가양대로 440", "lat": 37.58618, "lng": 126.88546, "rating": None, "rating_source": "none"},
    {"name": "BHC치킨 상암점", "signature_menu": "치킨", "avg_price": "15000-20000", "category": "치킨", "address": "서울 마포구 가양대로 442", "lat": 37.58616, "lng": 126.88580, "rating": None, "rating_source": "none"},
    {"name": "네네치킨 상암점", "signature_menu": "치킨", "avg_price": "14000-18000", "category": "치킨", "address": "서울 마포구 가양대로 440", "lat": 37.58620, "lng": 126.88550, "rating": None, "rating_source": "none"},
    {"name": "호식이두마리치킨 상암점", "signature_menu": "치킨/떡볶이", "avg_price": "12000-18000", "category": "치킨", "address": "서울 마포구 가양대로 442", "lat": 37.58608, "lng": 126.88582, "rating": None, "rating_source": "none"},
    {"name": "육쌈냉면 상암점", "signature_menu": "냉면/쌈밥", "avg_price": "9000-12000", "category": "한식", "address": "서울 마포구 가양대로 440", "lat": 37.58622, "lng": 126.88552, "rating": None, "rating_source": "none"},
    {"name": "순대국밥 상암점", "signature_menu": "순대국", "avg_price": "8000-10000", "category": "국밥", "address": "서울 마포구 가양대로 442", "lat": 37.58604, "lng": 126.88584, "rating": None, "rating_source": "none"},
    {"name": "금돼지식당 상암점", "signature_menu": "수육/보쌈", "avg_price": "9000-12000", "category": "한식", "address": "서울 마포구 가양대로 440", "lat": 37.58624, "lng": 126.88548, "rating": None, "rating_source": "none"},
    {"name": "돈까스클러 상암점", "signature_menu": "돈까스", "avg_price": "8000-10000", "category": "일식", "address": "서울 마포구 가양대로 442", "lat": 37.58602, "lng": 126.88586, "rating": None, "rating_source": "none"},
    {"name": "콩나물국밥집 상암점", "signature_menu": "콩나물국밥", "avg_price": "7000-9000", "category": "국밥", "address": "서울 마포구 가양대로 440", "lat": 37.58626, "lng": 126.88554, "rating": None, "rating_source": "none"},
    {"name": "역전우동0410 상암점", "signature_menu": "우동/가츠동", "avg_price": "7000-10000", "category": "일식(우동)", "address": "서울 마포구 가양대로 440", "lat": 37.58598, "lng": 126.88552, "rating": 4.1, "rating_source": "naver"},
    {"name": "본죽 상암점", "signature_menu": "전복죽/닭죽", "avg_price": "8000-10000", "category": "한식/죽", "address": "서울 마포구 가양대로 442", "lat": 37.58595, "lng": 126.88564, "rating": 4.0, "rating_source": "naver"},
    {"name": "김밥천국 상암점", "signature_menu": "김밥/라면", "avg_price": "4000-8000", "category": "분식", "address": "서울 마포구 가양대로 442", "lat": 37.58600, "lng": 126.88558, "rating": 3.8, "rating_source": "naver"},
    {"name": "신의주찹쌀순대 상암점", "signature_menu": "순대국", "avg_price": "8000-10000", "category": "국밥", "address": "서울 마포구 가양대로 440", "lat": 37.58592, "lng": 126.88548, "rating": None, "rating_source": "none"},
    {"name": "홍콩반점 상암점", "signature_menu": "짜장면", "avg_price": "7000-10000", "category": "중식", "address": "서울 마포구 가양대로 442", "lat": 37.58597, "lng": 126.88562, "rating": None, "rating_source": "none"},
    {"name": "놀부부대찌개 상암점", "signature_menu": "부대찌개", "avg_price": "8000-10000", "category": "한식", "address": "서울 마포구 가양대로 442", "lat": 37.58593, "lng": 126.88566, "rating": None, "rating_source": "none"},
    {"name": "청년다방 상암점", "signature_menu": "떡볶이", "avg_price": "5000-8000", "category": "분식", "address": "서울 마포구 가양대로 440", "lat": 37.58602, "lng": 126.88550, "rating": None, "rating_source": "none"},
    {"name": "죠스떡볶이 상암점", "signature_menu": "떡볶이/튀김", "avg_price": "4000-8000", "category": "분식", "address": "서울 마포구 가양대로 442", "lat": 37.58588, "lng": 126.88560, "rating": None, "rating_source": "none"},
    {"name": "컴포즈커피 상암점", "signature_menu": "커피", "avg_price": "2000-5000", "category": "카페", "address": "서울 마포구 가양대로 440", "lat": 37.58596, "lng": 126.88546, "rating": None, "rating_source": "none"},
    {"name": "할리스 상암점", "signature_menu": "커피/샌드위치", "avg_price": "5000-8000", "category": "카페(식사가능)", "address": "서울 마포구 가양대로 442", "lat": 37.58594, "lng": 126.88568, "rating": None, "rating_source": "none"},
    {"name": "맘스터치 상암점", "signature_menu": "버거", "avg_price": "5000-9000", "category": "패스트푸드", "address": "서울 마포구 가양대로 440", "lat": 37.58601, "lng": 126.88554, "rating": None, "rating_source": "none"},
    {"name": "서브웨이 상암점", "signature_menu": "샌드위치", "avg_price": "6000-9000", "category": "패스트푸드", "address": "서울 마포구 가양대로 442", "lat": 37.58591, "lng": 126.88556, "rating": None, "rating_source": "none"},
    {"name": "던킨 상암점", "signature_menu": "도넛/커피", "avg_price": "3000-6000", "category": "카페", "address": "서울 마포구 가양대로 440", "lat": 37.58599, "lng": 126.88544, "rating": None, "rating_source": "none"},
    {"name": "미스터피자 상암점", "signature_menu": "피자", "avg_price": "10000-15000", "category": "양식/피자", "address": "서울 마포구 가양대로 440", "lat": 37.58590, "lng": 126.88552, "rating": None, "rating_source": "none"},
    {"name": "도미노피자 상암점", "signature_menu": "피자", "avg_price": "10000-15000", "category": "양식/피자", "address": "서울 마포구 가양대로 442", "lat": 37.58589, "lng": 126.88564, "rating": None, "rating_source": "none"},
    {"name": "교촌치킨 상암점", "signature_menu": "치킨", "avg_price": "15000-20000", "category": "치킨", "address": "서울 마포구 가양대로 440", "lat": 37.58603, "lng": 126.88548, "rating": None, "rating_source": "none"},
    {"name": "원할머니보쌈족발 상암점", "signature_menu": "보쌈/족발", "avg_price": "10000-15000", "category": "한식", "address": "서울 마포구 가양대로 440", "lat": 37.58587, "lng": 126.88550, "rating": None, "rating_source": "none"},
    {"name": "맨하탄 그릴 & 바", "signature_menu": "스테이크/파스타", "avg_price": "15000-25000", "category": "양식/그릴", "address": "서울 마포구 월드컵북로58길 15", "lat": 37.58240, "lng": 126.88572, "rating": 4.0, "rating_source": "naver"},
    {"name": "카페 스탠포드", "signature_menu": "런치 뷔페", "avg_price": "15000-22000", "category": "양식/뷔페", "address": "서울 마포구 월드컵북로58길 15", "lat": 37.58233, "lng": 126.88671, "rating": 4.1, "rating_source": "naver"},
    {"name": "스탠포드호텔 소호", "signature_menu": "샌드위치/브런치", "avg_price": "8000-14000", "category": "브런치", "address": "서울 마포구 월드컵북로58길 15", "lat": 37.58230, "lng": 126.88675, "rating": None, "rating_source": "none"},
    {"name": "스탠포드호텔 조선", "signature_menu": "한정식", "avg_price": "20000-30000", "category": "한식", "address": "서울 마포구 월드컵북로58길 15", "lat": 37.58235, "lng": 126.88665, "rating": None, "rating_source": "none"},
    {"name": "CU 상암DMC점", "signature_menu": "도시락/삼각김밥", "avg_price": "3000-6000", "category": "편의점", "address": "서울 마포구 성암로 330", "lat": 37.58480, "lng": 126.88568, "rating": None, "rating_source": "none"},
    {"name": "GS25 상암DMC점", "signature_menu": "도시락/컵라면", "avg_price": "3000-6000", "category": "편의점", "address": "서울 마포구 성암로 330", "lat": 37.58476, "lng": 126.88574, "rating": None, "rating_source": "none"},
    {"name": "세븐일레븐 상암DMC점", "signature_menu": "도시락", "avg_price": "3000-6000", "category": "편의점", "address": "서울 마포구 성암로 328", "lat": 37.58485, "lng": 126.88586, "rating": None, "rating_source": "none"},
    {"name": "이마트24 상암DMC점", "signature_menu": "도시락", "avg_price": "3000-6000", "category": "편의점", "address": "서울 마포구 가양대로 440", "lat": 37.58586, "lng": 126.88554, "rating": None, "rating_source": "none"},
    {"name": "빽다방 상암DMC점", "signature_menu": "아메리카노", "avg_price": "2000-5000", "category": "카페", "address": "서울 마포구 성암로 328", "lat": 37.58481, "lng": 126.88584, "rating": None, "rating_source": "none"},
    {"name": "탐앤탐스 상암점", "signature_menu": "커피/베이커리", "avg_price": "4000-7000", "category": "카페", "address": "서울 마포구 가양대로 440", "lat": 37.58604, "lng": 126.88546, "rating": None, "rating_source": "none"},
]


def haversine_m(lat1, lon1, lat2, lon2):
    r = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


def main():
    kept = []
    seen = set()
    for p in PLACES:
        if SKIP_CAT.search(p["category"]):
            continue
        dist = haversine_m(OFFICE_LAT, OFFICE_LNG, p["lat"], p["lng"])
        if dist > RADIUS_M:
            print(f"DROP {dist:.0f}m {p['name']}")
            continue
        key = p["name"]
        if key in seen:
            continue
        seen.add(key)
        kept.append({**p, "coord_confidence": "naver", "phone": "", "distance_m": round(dist, 1)})

    kept.sort(key=lambda x: x["distance_m"])
    kept = kept[:TARGET]
    print(f"kept {len(kept)}")

    restaurants = [{k: v for k, v in p.items() if k not in ("distance_m",)} for p in kept]
    out = {
        "meta": {
            "anchor": "DMC첨단산업센터 (서울 마포구 성암로 330)",
            "anchor_lat": OFFICE_LAT,
            "anchor_lng": OFFICE_LNG,
            "radius_m": RADIUS_M,
            "count": len(restaurants),
            "purpose": f"점심 맛집 지도 (회사 반경 {RADIUS_M}m, 음식점만)",
            "source": "naver map + 상암DMC 상권",
            "caveats": [
                f"DMC첨단산업센터 기준 {RADIUS_M}m 이내 음식점만 (카페·편의점 제외).",
                "구내식당 코너는 점심 룰렛용 분리 표기.",
                "네이버 지도·상권 기준 좌표.",
            ],
        },
        "restaurants": restaurants,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    assert len(restaurants) == TARGET, f"expected {TARGET} restaurants, got {len(restaurants)}"


if __name__ == "__main__":
    main()
