# -*- coding: utf-8 -*-
"""Festa Radar 수집기.

KOPIS 오픈API(축제목록 + 공연목록 키워드필터)를 병합·중복제거하고,
각 공연 상세(가격/지역/예매처)를 조회해 docs/festivals.json 을 생성한다.

- 크롤링 없음. 100% KOPIS API.
- 목록 API 자체 실패 → 비정상 종료(exit 1). 개별 상세 실패 → 로그+스킵.
- API 키는 환경변수 KOPIS_API_KEY 로만 받는다. 코드/커밋에 절대 넣지 않는다.
"""

import os
import re
import sys
import json
import time
import datetime as dt
from urllib.parse import quote
from xml.etree import ElementTree as ET

import requests

# 같은 폴더의 config.py 임포트 (스크립트 어디서 실행하든 동작하도록)
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import config  # noqa: E402


# --- 유틸 --------------------------------------------------------------------

def log(msg):
    print(msg, flush=True)


def warn(msg):
    print("[WARN] " + msg, file=sys.stderr, flush=True)


def norm_date(s):
    """'2026.09.26' 또는 '2026-09-26 09:52:20' → 'YYYY-MM-DD'. 실패 시 원문/빈문자."""
    if not s:
        return ""
    s = s.strip()
    m = re.search(r"(\d{4})[.\-](\d{2})[.\-](\d{2})", s)
    if m:
        return "%s-%s-%s" % (m.group(1), m.group(2), m.group(3))
    return s


def text(el, tag):
    """child 텍스트를 안전하게 추출."""
    child = el.find(tag)
    if child is None or child.text is None:
        return ""
    return child.text.strip()


def strip_brackets(name):
    """검색어용: '[제주] 어쩌구' → '어쩌구'. 대괄호 태그 제거."""
    return re.sub(r"\[[^\]]*\]", "", name).strip()


# --- API 호출 ----------------------------------------------------------------

def api_get(path, params):
    """KOPIS restful GET → XML root Element. service 키는 여기서만 주입."""
    params = dict(params)
    params["service"] = API_KEY
    url = config.KOPIS_BASE + path
    resp = requests.get(url, params=params, timeout=config.REQUEST_TIMEOUT)
    resp.raise_for_status()
    return ET.fromstring(resp.content)


def fetch_list(path, stdate, eddate):
    """축제목록/공연목록 페이지네이션 전량 수집 → db Element 리스트.

    목록 API 실패는 치명적: 예외를 그대로 올려 상위에서 exit 1 처리.
    """
    items = []
    cpage = 1
    while True:
        root = api_get(path, {
            "stdate": stdate,
            "eddate": eddate,
            "shcate": config.GENRE_POP,
            "cpage": cpage,
            "rows": config.ROWS,
        })
        page_items = root.findall("db")
        items.extend(page_items)
        if len(page_items) < config.ROWS:
            break
        cpage += 1
        time.sleep(config.DETAIL_SLEEP)
    return items


def fetch_detail(mt20id):
    """공연상세 조회 → db Element (없으면 None)."""
    root = api_get("/pblprfr/" + mt20id, {})
    db = root.find("db")
    return db


# --- 파싱/정규화 -------------------------------------------------------------

def base_record(db, source):
    """목록 db → 공통 필드 dict (상세 병합 전)."""
    poster = text(db, "poster")
    if poster.startswith("/"):
        poster = "http://www.kopis.or.kr" + poster
    return {
        "id": text(db, "mt20id"),
        "name": text(db, "prfnm"),
        "startDate": norm_date(text(db, "prfpdfrom")),
        "endDate": norm_date(text(db, "prfpdto")),
        "venue": text(db, "fcltynm"),
        "poster": poster,
        "state": text(db, "prfstate"),
        "source": source,
        # 상세에서 채움
        "region": "",
        "price": "",
        "timeInfo": "",
        "organizer": "",
        "registeredAt": "",
        "ticketLinks": [],
    }


def parse_vendor(relatenm):
    """relatenm 원문 → (표준 vendor명, 브랜드색)."""
    up = relatenm.upper()
    for needles, vendor, color in config.VENDOR_RULES:
        for n in needles:
            if n.upper() in up:
                return vendor, color
    return relatenm, config.VENDOR_DEFAULT_COLOR


def extract_ticket_links(db, name):
    """상세 db 의 relates → ticketLinks. 없으면 검색 딥링크 폴백."""
    links = []
    relates = db.find("relates")
    if relates is not None:
        for rel in relates.findall("relate"):
            url = text(rel, "relateurl")
            nm = text(rel, "relatenm")
            if not url:
                continue
            vendor, color = parse_vendor(nm)
            links.append({
                "vendor": vendor,
                "color": color,
                "url": url,
                "linkType": "direct",
            })
    if links:
        return links
    # 폴백: 검색 딥링크 3종
    q = quote(strip_brackets(name))
    for vendor, color, tmpl in config.SEARCH_FALLBACKS:
        links.append({
            "vendor": vendor,
            "color": color,
            "url": tmpl.format(q=q),
            "linkType": "search",
        })
    return links


def find_reg_date(db):
    """상세 db 자식들 중 'YYYY-MM-DD HH:MM:SS' 패턴을 찾아 날짜부 반환.

    KOPIS 등록/수정일 필드명이 판본마다 다를 수 있어 값 패턴으로 탐지."""
    for child in db.iter():
        if child.text and re.search(r"\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}", child.text):
            return norm_date(child.text)
    return ""


def merge_detail(rec, db):
    """상세 db 정보를 rec 에 병합."""
    rec["region"] = text(db, "area")
    rec["price"] = text(db, "pcseguidance")
    rec["timeInfo"] = text(db, "dtguidance")
    rec["organizer"] = text(db, "entrpsnm")
    rec["registeredAt"] = find_reg_date(db)
    # 상세에도 상태가 있으면 최신으로 갱신
    st = text(db, "prfstate")
    if st:
        rec["state"] = st
    rec["ticketLinks"] = extract_ticket_links(db, rec["name"])
    return rec


# --- 메인 --------------------------------------------------------------------

def keyword_match(name):
    up = name.upper()
    if any(k.upper() in up for k in config.EXCLUDE_KEYWORDS):
        return False
    return any(k.upper() in up for k in config.INCLUDE_KEYWORDS)


def load_existing(path):
    """기존 festivals.json → {id: record}. 없으면 빈 dict."""
    try:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)
        return {r["id"]: r for r in data.get("festivals", [])}
    except (FileNotFoundError, json.JSONDecodeError, KeyError):
        return {}


def main():
    today = dt.date.today()
    stdate = (today - dt.timedelta(days=config.LOOKBACK_DAYS)).strftime("%Y%m%d")
    eddate = (today + dt.timedelta(days=config.LOOKAHEAD_DAYS)).strftime("%Y%m%d")
    log("조회 기간: %s ~ %s" % (stdate, eddate))

    # 1) 축제목록 (전량 채택)
    try:
        fest_dbs = fetch_list("/prffest", stdate, eddate)
    except Exception as e:
        warn("축제목록 API 실패(치명적): %s" % e)
        return 1
    log("축제목록: %d건" % len(fest_dbs))

    # 2) 공연목록 (키워드 필터)
    try:
        perf_dbs = fetch_list("/pblprfr", stdate, eddate)
    except Exception as e:
        warn("공연목록 API 실패(치명적): %s" % e)
        return 1
    log("공연목록: %d건 (키워드 필터 전)" % len(perf_dbs))

    # 3) mt20id 병합·중복제거 (축제목록 우선)
    records = {}
    for db in fest_dbs:
        rec = base_record(db, "festival_api")
        if rec["id"]:
            records[rec["id"]] = rec
    kw_added = 0
    for db in perf_dbs:
        mt = text(db, "mt20id")
        if not mt or mt in records:
            continue
        if keyword_match(text(db, "prfnm")):
            records[mt] = base_record(db, "keyword_match")
            kw_added += 1
    log("키워드 매칭 추가: %d건 / 병합 총 %d건" % (kw_added, len(records)))

    # 4) 상세 조회 (공연완료로 이미 저장된 항목은 재조회 생략)
    existing = load_existing(config.OUTPUT_PATH)
    fetched, skipped, failed = 0, 0, 0
    for mt, rec in records.items():
        prev = existing.get(mt)
        if prev and prev.get("state") == "공연완료":
            # 변할 게 없음 → 기존 상세 재사용
            for k in ("region", "price", "timeInfo", "organizer",
                      "registeredAt", "ticketLinks"):
                if k in prev:
                    rec[k] = prev[k]
            skipped += 1
            continue
        try:
            db = fetch_detail(mt)
            if db is None:
                warn("상세 없음, 스킵: %s (%s)" % (mt, rec["name"]))
                failed += 1
            else:
                merge_detail(rec, db)
                fetched += 1
        except Exception as e:
            warn("상세 조회 실패, 스킵: %s (%s) — %s" % (mt, rec["name"], e))
            failed += 1
        finally:
            time.sleep(config.DETAIL_SLEEP)
    log("상세: 신규조회 %d · 재사용 %d · 실패/스킵 %d" % (fetched, skipped, failed))

    # 5) 직렬화
    festivals = sorted(records.values(),
                       key=lambda r: (r["startDate"] or "9999", r["name"]))
    now_kst = dt.datetime.now(dt.timezone(dt.timedelta(hours=9)))
    out = {
        "updatedAt": now_kst.replace(microsecond=0).isoformat(),
        "count": len(festivals),
        "festivals": festivals,
    }
    os.makedirs(os.path.dirname(config.OUTPUT_PATH), exist_ok=True)
    with open(config.OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(out, f, ensure_ascii=False, indent=2)
    log("작성 완료: %s (%d건)" % (config.OUTPUT_PATH, len(festivals)))
    return 0


if __name__ == "__main__":
    API_KEY = os.environ.get("KOPIS_API_KEY", "").strip()
    if not API_KEY:
        warn("환경변수 KOPIS_API_KEY 가 없습니다. 키 없이 실행할 수 없습니다.")
        sys.exit(2)
    sys.exit(main())
