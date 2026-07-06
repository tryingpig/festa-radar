# CLAUDE.md — Festa Radar (뮤직 페스티벌 트래커)

## 프로젝트 개요

국내 뮤직/락 페스티벌 정보를 KOPIS(공연예술통합전산망) 오픈API로 매일 자동 수집하여,
GitHub Pages 정적 사이트에서 리스트/월별 캘린더로 보여주고 각 예매처(NOL티켓, 멜론티켓,
티켓링크, YES24 등) 구매 페이지로 직링크를 제공하는 서비스.

- **크롤링 없음.** 데이터는 100% KOPIS API. (티켓오픈일 알림은 Phase 2, 이번 범위 아님)
- **서버 없음.** Python 수집기 → `docs/festivals.json` → GitHub Pages 정적 렌더링.
- **자동화:** GitHub Actions cron, 매일 10:00 KST.

## 기술 스택

| 구분 | 선택 | 비고 |
|---|---|---|
| 수집기 | Python 3.11+ | `requests` 만 사용 (표준 `xml.etree.ElementTree`로 파싱) |
| 프론트 | 바닐라 HTML/CSS/JS 단일 페이지 | 프레임워크·빌드 도구 금지 |
| 호스팅 | GitHub Pages (`docs/` 폴더 방식) | |
| 자동화 | GitHub Actions | cron `0 1 * * *` (01:00 UTC = 10:00 KST) |
| 비밀키 | GitHub Secrets `KOPIS_API_KEY` | 코드/커밋에 키 절대 포함 금지 |

## 리포 구조

```
festa-radar/
├── CLAUDE.md
├── PRD.md
├── technical_spec.md
├── requirements.txt          # requests 만
├── collector/
│   ├── collect.py            # 메인 수집 스크립트
│   └── config.py             # 키워드, 예매처 정규화 매핑, 상수
├── docs/                     # GitHub Pages 루트
│   ├── index.html
│   ├── app.js
│   ├── style.css
│   └── festivals.json        # 수집 결과 (커밋 대상)
└── .github/workflows/daily.yml
```

## 실행 방법

```bash
# 로컬 테스트 (Windows)
set KOPIS_API_KEY=발급키
python collector/collect.py
# → docs/festivals.json 생성/갱신

# 로컬 프리뷰
python -m http.server 8000 --directory docs
```

## 코딩 규칙

- 수집기는 **단일 파일로 이해 가능**하게. 과도한 추상화 금지.
- 모든 API 호출에 `timeout=15`, 상세 조회 사이 `time.sleep(0.5)` (KOPIS 서버 예의).
- 개별 공연 상세 조회 실패는 **로그 남기고 스킵** — 전체 파이프라인을 죽이지 않는다.
- festivals.json 은 UTF-8, `ensure_ascii=False`, `indent=2`. 변경 없으면 커밋하지 않는다.
- 프론트 텍스트는 전부 한국어. 날짜 표기 `2026.10.02(금)` 형식.
- 색상 컨벤션 주의: 이 프로젝트는 주식 아님. 예매중=활성색, 공연완료=회색 등 상태 기반.

## 검증 체크리스트 (구현 완료 기준)

1. `collect.py` 실행 시 축제목록 + 대중음악 공연목록(키워드 필터)이 병합·중복제거되어 JSON 생성
2. 각 항목에 상세정보(가격, 시간 안내, 지역)와 `ticketLinks` 배열 포함 (없으면 검색 딥링크 폴백)
3. index.html 에서 리스트 뷰 / 월별 캘린더 뷰 탭 전환 동작
4. 모바일(380px)에서 카드·캘린더 레이아웃 깨지지 않음
5. GitHub Actions 워크플로우가 수동 트리거(workflow_dispatch)로도 동작
