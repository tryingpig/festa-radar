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

# --- 페스티벌 판별 (화이트리스트 방식) --------------------------------------
# 판별 기준은 collector/known_festivals.json 한 곳에서만 관리한다.
#   - known_festivals: 화이트리스트(name/aliases 부분일치) → tier="major" + category
#   - fallback_rule  : 화이트리스트 밖이라도 장르·이름·제외 조건 통과 시 tier="etc"
# 코드에는 더 이상 포함/제외 키워드 상수를 두지 않는다. (JSON 단일 관리)
KNOWN_FILE = "known_festivals.json"   # collect.py 와 같은 폴더 기준으로 로드

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
