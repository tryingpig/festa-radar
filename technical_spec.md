# Technical Spec — Festa Radar

## 1. KOPIS API 명세 (실측 검증 완료)

Base: `http://www.kopis.or.kr/openApi/restful`
인증: 모든 요청에 `service={KOPIS_API_KEY}` 쿼리 파라미터. 응답은 XML.

### 1-1. 축제목록 `GET /prffest`

| 파라미터 | 값 | 비고 |
|---|---|---|
| stdate / eddate | YYYYMMDD | 조회 기간 (오늘−30일 ~ +365일) |
| shcate | CCCD | 대중음악 장르 코드 |
| cpage / rows | 1.. / 100 | 페이지네이션. 결과 < rows 될 때까지 순회 |

응답 항목(실측): `mt20id`, `prfnm`, `prfpdfrom`(2026.09.26 형식), `prfpdto`,
`fcltynm`, `poster`, `genrenm`, `prfstate`(공연예정/공연중/공연완료), `festival`(Y)

### 1-2. 공연목록 `GET /pblprfr` — 보완 소스

파라미터 동일 + 키워드 필터는 **클라이언트(수집기) 측에서** 공연명에 적용.
축제목록에 안 잡힌 페스티벌(주최측이 일반 콘서트로 등록한 경우)을 건진다.

### 1-3. 공연상세 `GET /pblprfr/{mt20id}`

응답 추가 필드(실측): `pcseguidance`(가격 문자열, 예 "3일권 266,000원"),
`dtguidance`(공연시간 안내), `area`(시도), `entrpsnm`(주최),
`styurls/styurl[]`(소개 이미지), **`relates/relate[]{relatenm, relateurl}`(예매처)**

날짜 형식 주의: 목록은 `2026.09.26`, 상세 등록일시는 `2026-07-01 09:52:20`.
수집기에서 ISO `YYYY-MM-DD` 로 통일한다.

## 2. 수집 파이프라인 (`collector/collect.py`)

```
1. fetch prffest (페이지네이션 전량) ──┐
2. fetch pblprfr (전량) → 키워드 필터 ─┴→ mt20id 로 병합·중복제거
3. 각 mt20id 상세 조회 (sleep 0.5s, 실패 시 스킵+경고 로그)
4. 정규화 → festivals.json 직렬화
5. 기존 파일과 내용 동일하면 종료코드 0으로 끝 (커밋 생략 판단은 워크플로우에서)
```

- 상세 조회 최적화: 기존 festivals.json 을 로드해 `prfstate=공연완료` 로 이미
  저장된 항목은 상세 재조회 생략 (변할 게 없음). 그 외에는 매일 재조회 (예매처 추가 반영).
- 오류 처리: HTTP 오류/XML 파싱 오류 시 해당 항목만 스킵. 목록 API 자체가 실패하면
  비정상 종료(exit 1) → Actions 실패 알림으로 인지.

## 3. 예매처 정규화 (`collector/config.py`)

`relatenm` 원문이 제각각이므로 부분 문자열 매칭으로 정규화:

| 매칭 문자열 | vendor 표기 | 브랜드 색 |
|---|---|---|
| 인터파크, NOL, 놀 | NOL티켓 | #7B2FF2 계열 보라 |
| 멜론 | 멜론티켓 | #00C73C 계열 그린 |
| 티켓링크 | 티켓링크 | #E31C79 계열 |
| 예스24, YES24 | YES24 | #003399 계열 블루 |
| (그 외) | 원문 그대로 | 중립 회색 |

검색 딥링크 폴백 (relates 빈 경우, `linkType: "search"`):
```
NOL티켓  https://tickets.interpark.com/contents/search?keyword={공연명}
멜론티켓  https://ticket.melon.com/search/index.htm?searchWord={공연명}
티켓링크  https://www.ticketlink.co.kr/search?query={공연명}
```
공연명은 URL 인코딩. `[제주]` 같은 대괄호 태그는 검색어에서 제거.

## 4. 데이터 스키마 (`docs/festivals.json`)

```json
{
  "updatedAt": "2026-07-06T10:00:00+09:00",
  "count": 42,
  "festivals": [
    {
      "id": "PF294968",
      "name": "부산국제록페스티벌",
      "startDate": "2026-10-02",
      "endDate": "2026-10-04",
      "venue": "삼락생태공원",
      "region": "부산광역시",
      "poster": "http://www.kopis.or.kr/upload/pfmPoster/....jpg",
      "price": "3일권 266,000원",
      "timeInfo": "금요일(11:00), 토요일 ~ 일요일(11:00)",
      "organizer": "(사) 부산축제조직위원회",
      "state": "공연예정",
      "registeredAt": "2026-07-01",
      "source": "festival_api",
      "ticketLinks": [
        { "vendor": "YES24", "url": "https://ticket.yes24.com/Perf/58933", "linkType": "direct" }
      ]
    }
  ]
}
```

`source`: `festival_api` | `keyword_match` (판별 규칙 튜닝 시 디버깅용).

## 5. 프론트엔드 (`docs/`)

바닐라 JS 단일 페이지. `fetch('festivals.json')` 후 클라이언트 렌더링.

### 뷰

- **리스트 뷰(기본):** 반응형 카드 그리드(모바일 1열 / 태블릿 2 / 데스크톱 3~4).
  카드 = 포스터(2:3, lazy load) + 상태 배지 + D-day + 공연명 + 기간·장소·지역 + 가격
  + 예매 버튼 행. `linkType:"search"` 버튼은 🔍 아이콘과 "검색" 레이블로 구분.
- **캘린더 뷰:** 월 그리드 + 이전/다음 달 내비게이션. 공연 기간을 행 단위 가로 바로
  렌더링(주 단위 분할). 바 클릭 시 하단에 해당 카드 표시. 모바일에서는 바에
  약칭(공연명 8자 말줄임) 표시.

### 필터/정렬 바 (상단 고정)

상태 토글(기본: 공연완료 숨김) · 지역 셀렉트(수도권/영남/호남/충청/강원/제주 그룹핑) ·
정렬(공연일 가까운순 기본 / 최근 등록순). 헤더에 `updatedAt` 기준 "마지막 갱신" 표시.

### D-day 규칙

`오늘 < startDate` → `D-{n}` 배지 강조 / 기간 중 → `진행중` / 종료 → 배지 없음(회색 카드).

### 디자인 방향 — 레퍼런스: blankinside.co.uk

미니멀·플레이풀 커머스 스타일. 원칙: **포스터가 주인공, UI는 화이트로 물러난다.**
레퍼런스를 그대로 베끼지 말고 아래 번역 규칙을 따를 것.

**토큰**
- 배경 `#FFFFFF` / 텍스트·라인 `#111111` / 브랜드 컬러 딥 네이비 1종 `#130071` 근처
  (버튼, 링크, 티커 띠, 포커스 링에만 사용) / 상태 보조색: 진행중 계열 1종, 완료 회색.
  색은 총 4~5개로 제한. 예매처 브랜드 색은 버튼 내부 작은 도트로만 사용(카드가 알록달록해지는 것 방지).
- 서체: 본문 Pretendard. 헤드라인은 대문자/큰 사이즈의 기하학적 산세리프 느낌으로
  Pretendard ExtraBold 를 자간 좁혀 사용(웹폰트 1종으로 통일, 로딩 최소화).
- 여백 넉넉하게, 얇은 1px 라인 구분. 그림자 대신 테두리.

**시그니처 요소 (레퍼런스 → 우리 번역)**
1. **마퀴 티커(상단 띠):** 레퍼런스의 할인 문구 티커 → "D-7 부산국제록페스티벌 ·
   D-12 카스쿨 페스티벌 · ..." 임박순 페스티벌이 흐르는 정보 티커. 클릭 시 해당 카드로.
   `prefers-reduced-motion` 시 정지된 목록으로 대체.
2. **스티커 배지:** D-day / 예매중 / NEW(등록 7일 이내) 를 손그림 느낌 SVG 스티커로
   포스터 모서리에 살짝 기울여 부착. 배지는 카드당 최대 2개.
3. **월별 섹션 리스트:** 레퍼런스의 작가별 컬렉션 → "7월의 페스티벌", "8월의 페스티벌"
   섹션 헤더로 그룹핑. 리스트 뷰 자체가 타임라인이 된다.

**포스터 정돈 규칙 (중요)**
KOPIS 포스터는 비율·화질이 제각각이므로 2:3 고정 크롭(`object-fit: cover`) +
`1px #11111114` 테두리로 강제 통일. 이 정돈이 레퍼런스 특유의 "깔끔함"의 전제 조건.
포스터 없는 항목은 네이비 배경 + 공연명 타이포 플레이스홀더.

**품질 기준**
캘린더 기간 바도 네이비 단색으로 절제. 키보드 포커스 표시, 색+텍스트 병행(색맹 대응),
380px 모바일 우선. 애니메이션은 티커와 카드 hover(살짝 떠오름) 두 곳만.

## 6. GitHub Actions (`.github/workflows/daily.yml`)

```yaml
on:
  schedule: [{ cron: "0 1 * * *" }]   # 10:00 KST
  workflow_dispatch:
jobs:
  collect:
    runs-on: ubuntu-latest
    steps:
      - checkout
      - setup-python 3.11 + pip install -r requirements.txt
      - run: python collector/collect.py
        env: { KOPIS_API_KEY: ${{ secrets.KOPIS_API_KEY }} }
      - docs/festivals.json 변경 시에만 commit & push (git diff --quiet 로 판정)
```

리스크 메모: GitHub Actions(해외 IP)에서 KOPIS API 가 차단될 가능성은 낮지만,
만약 발생하면 로컬 PC 작업 스케줄러 수집 + push 하이브리드로 전환 (블로그 모니터 패턴).

## 7. Phase 2 예고 (이번 구현 범위 아님)

티켓오픈일: 예매처 4곳의 "티켓오픈 공지" 게시판을 일 1회 경량 수집 → 공연명 매칭 →
`ticketOpenAt` 필드 추가 + 텔레그램 알림. 별도 스펙으로 진행.
