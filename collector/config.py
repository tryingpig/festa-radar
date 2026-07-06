# -*- coding: utf-8 -*-
"""Festa Radar 수집기 상수/매핑.

문서와 충돌하지 않게, 판별 규칙·예매처 정규화·폴백 딥링크를 코드 수정 없이
조정할 수 있도록 여기에 모아둔다. (PRD 5절, technical_spec 3절 근거)
"""

# --- KOPIS API ---------------------------------------------------------------
KOPIS_BASE = "http://www.kopis.or.kr/openApi/restful"
GENRE_POP = "CCCD"          # 대중음악 장르 코드
ROWS = 100                  # 페이지당 결과 수
LOOKBACK_DAYS = 30          # 오늘 -30일
LOOKAHEAD_DAYS = 365        # 오늘 +365일
REQUEST_TIMEOUT = 15        # 모든 호출 timeout(초)
DETAIL_SLEEP = 0.5          # 상세 조회 사이 대기(초) — KOPIS 서버 예의

# --- 페스티벌 판별 키워드 (PRD 5절) -----------------------------------------
# 공연목록(pblprfr)에서 공연명이 아래 포함 키워드에 걸리면 채택,
# 제외 키워드에 걸리면 탈락. 대소문자 무시로 매칭한다.
INCLUDE_KEYWORDS = [
    "페스티벌", "FESTIVAL", "FEST", "페스타", "FESTA",
    "뮤직캠프", "록페", "ROCK FES",
]
EXCLUDE_KEYWORDS = [
    "영화제", "필름", "불꽃", "맥주", "먹거리", "뮤지컬",
]

# --- 예매처 정규화 (technical_spec 3절) --------------------------------------
# (매칭 문자열들, 표준 vendor 명, 브랜드 색). relatenm 원문에 부분 문자열로 매칭.
# 위에서부터 순서대로 검사하여 첫 매칭을 채택.
VENDOR_RULES = [
    (["인터파크", "NOL", "놀"], "NOL티켓", "#7B2FF2"),
    (["멜론"],                 "멜론티켓", "#00C73C"),
    (["티켓링크"],             "티켓링크", "#E31C79"),
    (["예스24", "YES24"],      "YES24",   "#003399"),
]
VENDOR_DEFAULT_COLOR = "#888888"   # 그 외: 원문 그대로 + 중립 회색

# --- 검색 딥링크 폴백 (relates 비어있을 때, linkType="search") ---------------
# {q} 자리에 URL 인코딩된 공연명(대괄호 태그 제거)이 들어간다.
SEARCH_FALLBACKS = [
    ("NOL티켓", "#7B2FF2", "https://tickets.interpark.com/contents/search?keyword={q}"),
    ("멜론티켓", "#00C73C", "https://ticket.melon.com/search/index.htm?searchWord={q}"),
    ("티켓링크", "#E31C79", "https://www.ticketlink.co.kr/search?query={q}"),
]

# --- 출력 파일 ---------------------------------------------------------------
OUTPUT_PATH = "docs/festivals.json"
