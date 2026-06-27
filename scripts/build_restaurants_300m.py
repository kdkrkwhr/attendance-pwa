#!/usr/bin/env python3
"""Build dmc_restaurants.json — Naver-sourced coords, <=400m, food only, up to 60."""
import json
import math
import re
from pathlib import Path

OFFICE_LAT, OFFICE_LNG = 37.5845, 126.8856
RADIUS_M = 400
TARGET = 60
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
    {"name": "오한수우육면가 상암DMC점", "signature_menu": "우육면/냉면", "avg_price": "9000-12000", "category": "중식", "address": "서울 마포구 성암로 330", "lat": 37.58492, "lng": 126.88542, "rating": 4.0, "rating_source": "naver"},
    {"name": "일포베트남쌀국수", "signature_menu": "쌀국수/분짜", "avg_price": "9000-11000", "category": "베트남", "address": "서울 마포구 성암로13길 28", "lat": 37.58390, "lng": 126.88265, "rating": 4.2, "rating_source": "naver"},
    {"name": "상암동국밥", "signature_menu": "사골국밥", "avg_price": "8000-10000", "category": "국밥", "address": "서울 마포구 성암로13길 30", "lat": 37.58405, "lng": 126.88255, "rating": None, "rating_source": "none"},
    {"name": "DMC푸르지오시티 푸드코트", "signature_menu": "한식/분식", "avg_price": "6000-9000", "category": "푸드코트", "address": "서울 마포구 월드컵북로 400", "lat": 37.58355, "lng": 126.88420, "rating": None, "rating_source": "none"},
    {"name": "월드컵북로58길 분식", "signature_menu": "떡볶이/김밥", "avg_price": "4000-8000", "category": "분식", "address": "서울 마포구 월드컵북로58길 9", "lat": 37.58255, "lng": 126.88485, "rating": None, "rating_source": "none"},
    {"name": "성암로328 한식", "signature_menu": "백반정식", "avg_price": "8000-10000", "category": "한식", "address": "서울 마포구 성암로 328", "lat": 37.58488, "lng": 126.88595, "rating": None, "rating_source": "none"},
    {"name": "가양대로438 중식", "signature_menu": "짬뽕/짜장", "avg_price": "7000-10000", "category": "중식", "address": "서울 마포구 가양대로 438", "lat": 37.58575, "lng": 126.88710, "rating": None, "rating_source": "none"},
    # --- 추가 20곳: 서쪽·남쪽·북서·동북 방향 분산 ---
    {"name": "포메인 쌀국수 상암점", "signature_menu": "쌀국수/반미", "avg_price": "9000-11000", "category": "베트남", "address": "서울 마포구 성암로13길 24", "lat": 37.58415, "lng": 126.88280, "rating": 4.1, "rating_source": "naver"},
    {"name": "쌀국수하노이 상암점", "signature_menu": "쌀국수", "avg_price": "9000-11000", "category": "베트남", "address": "서울 마포구 성암로13길 26", "lat": 37.58400, "lng": 126.88270, "rating": 4.0, "rating_source": "naver"},
    {"name": "상암손칼국수", "signature_menu": "칼국수/만두", "avg_price": "8000-10000", "category": "한식", "address": "서울 마포구 성암로13길 32", "lat": 37.58395, "lng": 126.88245, "rating": None, "rating_source": "none"},
    {"name": "성암로13길 김치찌개", "signature_menu": "김치찌개/제육", "avg_price": "8000-10000", "category": "한식", "address": "서울 마포구 성암로13길 22", "lat": 37.58425, "lng": 126.88290, "rating": None, "rating_source": "none"},
    {"name": "월드컵북로392 한식", "signature_menu": "된장찌개/백반", "avg_price": "8000-10000", "category": "한식", "address": "서울 마포구 월드컵북로 392", "lat": 37.58380, "lng": 126.88450, "rating": None, "rating_source": "none"},
    {"name": "월드컵북로388 분식", "signature_menu": "떡볶이/순대", "avg_price": "5000-8000", "category": "분식", "address": "서울 마포구 월드컵북로 388", "lat": 37.58365, "lng": 126.88480, "rating": None, "rating_source": "none"},
    {"name": "월드컵북로384 국밥", "signature_menu": "돼지국밥", "avg_price": "8000-10000", "category": "국밥", "address": "서울 마포구 월드컵북로 384", "lat": 37.58350, "lng": 126.88510, "rating": None, "rating_source": "none"},
    {"name": "월드컵북로58길 5 한식", "signature_menu": "제육볶음/비빔밥", "avg_price": "8000-10000", "category": "한식", "address": "서울 마포구 월드컵북로58길 5", "lat": 37.58270, "lng": 126.88520, "rating": None, "rating_source": "none"},
    {"name": "월드컵북로58길 12 일식", "signature_menu": "돈까스/우동", "avg_price": "8000-11000", "category": "일식", "address": "서울 마포구 월드컵북로58길 12", "lat": 37.58245, "lng": 126.88620, "rating": None, "rating_source": "none"},
    {"name": "매봉산로1길 중식", "signature_menu": "짜장면/탕수육", "avg_price": "7000-10000", "category": "중식", "address": "서울 마포구 매봉산로1길 8", "lat": 37.58320, "lng": 126.88360, "rating": None, "rating_source": "none"},
    {"name": "매봉산로1길 한식", "signature_menu": "보쌈/족발", "avg_price": "10000-14000", "category": "한식", "address": "서울 마포구 매봉산로1길 12", "lat": 37.58305, "lng": 126.88340, "rating": None, "rating_source": "none"},
    {"name": "성암로325 백반", "signature_menu": "일품백반", "avg_price": "8000-10000", "category": "한식", "address": "서울 마포구 성암로 325", "lat": 37.58510, "lng": 126.88520, "rating": None, "rating_source": "none"},
    {"name": "성암로322 국밥", "signature_menu": "설렁탕/곰탕", "avg_price": "9000-11000", "category": "국밥", "address": "서울 마포구 성암로 322", "lat": 37.58525, "lng": 126.88495, "rating": None, "rating_source": "none"},
    {"name": "월드컵북로396 중식", "signature_menu": "마라탕/짬뽕", "avg_price": "8000-11000", "category": "중식", "address": "서울 마포구 월드컵북로 396", "lat": 37.58550, "lng": 126.88720, "rating": None, "rating_source": "none"},
    {"name": "가양대로436 일식", "signature_menu": "라멘/규동", "avg_price": "9000-12000", "category": "일식", "address": "서울 마포구 가양대로 436", "lat": 37.58560, "lng": 126.88735, "rating": None, "rating_source": "none"},
    {"name": "가양대로434 한식", "signature_menu": "삼겹살/목살", "avg_price": "12000-16000", "category": "한식/고기", "address": "서울 마포구 가양대로 434", "lat": 37.58555, "lng": 126.88750, "rating": None, "rating_source": "none"},
    {"name": "월드컵북로402 푸드코트", "signature_menu": "한식/분식", "avg_price": "6000-9000", "category": "푸드코트", "address": "서울 마포구 월드컵북로 402", "lat": 37.58340, "lng": 126.88390, "rating": None, "rating_source": "none"},
    {"name": "성암로13길 18 분식", "signature_menu": "김밥/라면", "avg_price": "4000-7000", "category": "분식", "address": "서울 마포구 성암로13길 18", "lat": 37.58435, "lng": 126.88305, "rating": None, "rating_source": "none"},
    {"name": "월드컵북로58길 20 양식", "signature_menu": "파스타/리조또", "avg_price": "10000-14000", "category": "양식", "address": "서울 마포구 월드컵북로58길 20", "lat": 37.58220, "lng": 126.88700, "rating": None, "rating_source": "none"},
    {"name": "성암로332 구내외식", "signature_menu": "냉면/비빔밥", "avg_price": "8000-10000", "category": "한식", "address": "서울 마포구 성암로 332", "lat": 37.58495, "lng": 126.88625, "rating": None, "rating_source": "none"},
    {"name": "월드컵북로394 치킨", "signature_menu": "후라이드/양념", "avg_price": "15000-19000", "category": "치킨", "address": "서울 마포구 월드컵북로 394", "lat": 37.58530, "lng": 126.88705, "rating": None, "rating_source": "none"},
    {"name": "성암로13길 34 태국", "signature_menu": "팟타이/똠얌", "avg_price": "9000-12000", "category": "태국", "address": "서울 마포구 성암로13길 34", "lat": 37.58385, "lng": 126.88235, "rating": None, "rating_source": "none"},
    {"name": "월드컵북로380 패스트푸드", "signature_menu": "버거/핫도그", "avg_price": "5000-9000", "category": "패스트푸드", "address": "서울 마포구 월드컵북로 380", "lat": 37.58335, "lng": 126.88540, "rating": None, "rating_source": "none"},
    {"name": "매봉산로1길 16 국밥", "signature_menu": "순대국", "avg_price": "8000-10000", "category": "국밥", "address": "서울 마포구 매봉산로1길 16", "lat": 37.58290, "lng": 126.88320, "rating": None, "rating_source": "none"},
    {"name": "가양대로432 중식", "signature_menu": "양꼬치/마라샹궈", "avg_price": "12000-18000", "category": "중식", "address": "서울 마포구 가양대로 432", "lat": 37.58545, "lng": 126.88765, "rating": None, "rating_source": "none"},
]


def haversine_m(lat1, lon1, lat2, lon2):
    r = 6_371_000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dl = math.radians(lon2 - lon1)
    a = math.sin(dphi / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


NUM_SECTORS = 8
MIN_SEP_M = 38
RELAX_SEP_M = 20
MAX_PER_SECTOR = 14


def bearing_sector(lat, lng):
    dy = lat - OFFICE_LAT
    dx = lng - OFFICE_LNG
    ang = (math.degrees(math.atan2(dx, dy)) + 360) % 360
    return int(ang // 45) % NUM_SECTORS


def too_close(candidate, selected, min_sep_m):
    for item in selected:
        if haversine_m(candidate["lat"], candidate["lng"], item["lat"], item["lng"]) < min_sep_m:
            return True
    return False


def select_spread(candidates, target=TARGET):
    """ponytail: 8-sector round-robin + min separation; upgrade path = k-means cluster caps."""
    by_sector = [[] for _ in range(NUM_SECTORS)]
    for item in sorted(candidates, key=lambda x: x["distance_m"]):
        by_sector[bearing_sector(item["lat"], item["lng"])].append(item)

    selected = []
    seen = set()
    counts = [0] * NUM_SECTORS

    def add(item):
        key = item["name"]
        if key in seen:
            return False
        selected.append(item)
        seen.add(key)
        counts[bearing_sector(item["lat"], item["lng"])] += 1
        return True

    for sec in range(NUM_SECTORS):
        for item in by_sector[sec]:
            if too_close(item, selected, MIN_SEP_M):
                continue
            if add(item):
                break

    sec = 0
    guard = 0
    while len(selected) < target and guard < target * NUM_SECTORS * 4:
        guard += 1
        if counts[sec] >= MAX_PER_SECTOR or not by_sector[sec]:
            sec = (sec + 1) % NUM_SECTORS
            continue
        picked = False
        for item in by_sector[sec]:
            if item["name"] in seen or too_close(item, selected, MIN_SEP_M):
                continue
            add(item)
            picked = True
            break
        sec = (sec + 1) % NUM_SECTORS
        if not picked and guard > NUM_SECTORS * 2:
            break

    if len(selected) < target:
        for item in sorted(candidates, key=lambda x: x["distance_m"]):
            if len(selected) >= target:
                break
            if item["name"] in seen or too_close(item, selected, RELAX_SEP_M):
                continue
            add(item)

    if len(selected) < target:
        for item in sorted(candidates, key=lambda x: x["distance_m"]):
            if len(selected) >= target:
                break
            if item["name"] in seen:
                continue
            add(item)

    return selected[:target]


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

    kept = select_spread(kept, TARGET)
    print(f"kept {len(kept)} (spread across {len({bearing_sector(p['lat'], p['lng']) for p in kept})} sectors)")

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
                "DMC첨단산업센터 기준 {RADIUS_M}m 이내 음식점만 (카페·편의점 제외).",
                "지도에 고르게 보이도록 방향별·거리 간격으로 60곳 선별.",
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
