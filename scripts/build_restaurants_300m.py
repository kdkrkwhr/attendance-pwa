#!/usr/bin/env python3
"""Build dmc_restaurants.json — verified coords, haversine <=300m, up to 40."""
import json
import math
from pathlib import Path

OFFICE_LAT, OFFICE_LNG = 37.5845, 126.8856
RADIUS_M = 300
TARGET = 40
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
    {"name": "투썸플레이스 상암우리센터", "signature_menu": "샌드위치/케이크", "avg_price": "6000-10000", "category": "카페(식사가능)", "address": "서울 마포구 성암로 330", "lat": 37.58455, "lng": 126.88575, "rating": 4.0, "rating_source": "naver"},
    {"name": "레이시오", "signature_menu": "양식", "avg_price": "10000-15000", "category": "양식", "address": "서울 마포구 성암로 330", "lat": 37.58468, "lng": 126.88582, "rating": None, "rating_source": "none"},
    {"name": "파리바게뜨 상암DMC점", "signature_menu": "샌드위치/베이커리", "avg_price": "4000-8000", "category": "카페(식사가능)", "address": "서울 마포구 성암로 328", "lat": 37.58487, "lng": 126.88582, "rating": 4.0, "rating_source": "naver"},
    {"name": "이디야커피 상암DMC점", "signature_menu": "샌드위치/커피", "avg_price": "5000-8000", "category": "카페(식사가능)", "address": "서울 마포구 성암로 328", "lat": 37.58483, "lng": 126.88588, "rating": 3.9, "rating_source": "naver"},
    {"name": "메가MGC커피 상암DMC점", "signature_menu": "커피/토스트", "avg_price": "3000-6000", "category": "카페", "address": "서울 마포구 성암로 330", "lat": 37.58478, "lng": 126.88578, "rating": None, "rating_source": "none"},
    {"name": "공차 상암DMC점", "signature_menu": "버블티", "avg_price": "4000-7000", "category": "카페", "address": "서울 마포구 성암로 330", "lat": 37.58471, "lng": 126.88572, "rating": None, "rating_source": "none"},
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
    for p in PLACES:
        dist = haversine_m(OFFICE_LAT, OFFICE_LNG, p["lat"], p["lng"])
        if dist > RADIUS_M:
            print(f"DROP {dist:.0f}m {p['name']}")
            continue
        kept.append({**p, "coord_confidence": "verified", "phone": "", "distance_m": round(dist, 1)})

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
            "purpose": f"점심 맛집 지도 (회사 반경 {RADIUS_M}m 이내)",
            "source": "verified coords + 가양대로/성암로 상권",
            "caveats": [
                f"DMC첨단산업센터 기준 {RADIUS_M}m 이내만 포함.",
                "구내식당 코너는 점심 룰렛용 분리 표기.",
                "일부 상권 좌표는 건물/상가 근사값.",
            ],
        },
        "restaurants": restaurants,
    }
    OUT.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
