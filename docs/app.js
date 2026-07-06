/* =========================================================================
   FESTA RADAR — app.js  (바닐라 JS, 빌드 없음)
   fetch('festivals.json') → 클라이언트 렌더링. 리스트/캘린더 2뷰.
   ========================================================================= */
"use strict";

// ---- 상수 -----------------------------------------------------------------
const WD = ["일", "월", "화", "수", "목", "금", "토"];
const MS_DAY = 86400000;

// 지역(시도) → 권역 그룹
const REGION_GROUPS = {
  수도권: ["서울", "경기", "인천"],
  영남: ["부산", "대구", "울산", "경상"],
  호남: ["광주", "전라", "전북", "전남"],
  충청: ["대전", "세종", "충청", "충남", "충북"],
  강원: ["강원"],
  제주: ["제주"],
};

// ---- 상태 -----------------------------------------------------------------
const state = {
  all: [],
  view: "list",           // list | calendar
  hideDone: true,
  region: "",
  sort: "date",           // date | recent
  calYear: 0,
  calMonth: 0,            // 1~12
};

let TODAY = startOfDay(new Date());

// ---- 유틸 -----------------------------------------------------------------
function startOfDay(d) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }

function parseDate(s) {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return new Date(+m[1], +m[2] - 1, +m[3]);
}

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function regionGroup(region) {
  region = region || "";
  for (const [g, keys] of Object.entries(REGION_GROUPS)) {
    if (keys.some((k) => region.includes(k))) return g;
  }
  return "기타";
}

// 'YYYY-MM-DD' → '2026.10.02(금)'
function fmtKDate(s) {
  const d = parseDate(s);
  if (!d) return s || "";
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())}(${WD[d.getDay()]})`;
}
// 짧은 형: '10.04(일)'
function fmtKShort(s) {
  const d = parseDate(s);
  if (!d) return s || "";
  const p = (n) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}.${p(d.getDate())}(${WD[d.getDay()]})`;
}

// D-day / 상태 판정 (technical_spec D-day 규칙)
function dayInfo(f) {
  const s = parseDate(f.startDate);
  const e = parseDate(f.endDate) || s;
  if (!s) return { type: "none" };
  if (f.state === "공연완료" || TODAY > e) return { type: "done" };
  if (TODAY >= s && TODAY <= e) return { type: "live" };
  const dday = Math.round((s - TODAY) / MS_DAY);
  return { type: "soon", dday };
}

function isNew(f) {
  const r = parseDate(f.registeredAt);
  if (!r) return false;
  return (TODAY - r) / MS_DAY <= 7 && r <= TODAY;
}

// ---- 필터/정렬 ------------------------------------------------------------
function applyFilters(list, opts) {
  opts = opts || {};
  let out = list.slice();
  if (state.region) out = out.filter((f) => regionGroup(f.region) === state.region);
  if (!opts.ignoreHideDone && state.hideDone) {
    out = out.filter((f) => dayInfo(f).type !== "done");
  }
  if (state.sort === "recent") {
    out.sort((a, b) => (b.registeredAt || "").localeCompare(a.registeredAt || "")
      || (a.startDate || "").localeCompare(b.startDate || ""));
  } else {
    out.sort((a, b) => (a.startDate || "9999").localeCompare(b.startDate || "9999")
      || a.name.localeCompare(b.name));
  }
  return out;
}

// ---- 카드 빌드 ------------------------------------------------------------
function stickersFor(f) {
  const di = dayInfo(f);
  if (di.type === "done") return "";       // 완료: 배지 없음
  const chips = [];
  if (di.type === "live") {
    chips.push(`<span class="sticker sticker--live">진행중</span>`);
  } else if (di.type === "soon") {
    const label = di.dday === 0 ? "D-DAY" : `D-${di.dday}`;
    chips.push(`<span class="sticker sticker--dday">${label}</span>`);
  }
  // 2번째 배지 (최대 2개)
  if (isNew(f)) chips.push(`<span class="sticker sticker--new">NEW</span>`);
  else chips.push(`<span class="sticker sticker--sale">예매중</span>`);
  return `<div class="stickers">${chips.slice(0, 2).join("")}</div>`;
}

function stateLine(f) {
  const di = dayInfo(f);
  if (di.type === "live") return `<span class="state-line state-line--live"><span class="dot"></span>진행중</span>`;
  if (di.type === "done") return `<span class="state-line state-line--done"><span class="dot"></span>공연완료</span>`;
  return `<span class="state-line state-line--soon"><span class="dot"></span>공연예정</span>`;
}

function ticketButtons(f) {
  const links = f.ticketLinks || [];
  if (!links.length) return "";
  return links.map((l) => {
    const search = l.linkType === "search";
    const cls = "tbtn" + (search ? " tbtn--search" : "");
    const icon = search ? "🔍 " : "";
    const label = search ? `${esc(l.vendor)} 검색` : `${esc(l.vendor)} 예매`;
    const dot = l.color ? `<span class="dot" style="--dot:${esc(l.color)}"></span>` : "";
    return `<a class="${cls}" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">`
      + `${dot}${icon}${label}</a>`;
  }).join("");
}

function posterHtml(f) {
  if (f.poster) {
    return `<img src="${esc(f.poster)}" alt="${esc(f.name)} 포스터" loading="lazy" `
      + `onerror="this.closest('.card__poster').outerHTML=window.__emptyPoster(${JSON.stringify(esc(f.name))})">`;
  }
  return `<div class="card__poster--empty"><span>${esc(f.name)}</span></div>`;
}
// 이미지 로드 실패 시 대체 (플레이스홀더)
window.__emptyPoster = (name) =>
  `<div class="card__poster card__poster--empty"><span>${name}</span></div>`;

function periodText(f) {
  if (!f.endDate || f.endDate === f.startDate) return fmtKDate(f.startDate);
  return `${fmtKDate(f.startDate)} ~ ${fmtKShort(f.endDate)}`;
}

function cardHtml(f) {
  const di = dayInfo(f);
  const cls = "card" + (di.type === "done" ? " is-done" : "");
  const poster = f.poster
    ? `<div class="card__poster">${stickersFor(f)}${posterHtml(f)}</div>`
    : `<div class="card__poster card__poster--empty">${stickersFor(f)}<span>${esc(f.name)}</span></div>`;
  return `
    <article class="${cls}" id="card-${esc(f.id)}" data-id="${esc(f.id)}">
      ${poster}
      <div class="card__body">
        <h3 class="card__name">${esc(f.name)}</h3>
        ${stateLine(f)}
        <div class="card__meta">
          <span class="row"><span class="k">기간</span><span>${periodText(f)}</span></span>
          <span class="row"><span class="k">장소</span><span>${esc(f.venue || "-")}${f.region ? " · " + esc(f.region) : ""}</span></span>
          ${f.price ? `<span class="row"><span class="k">가격</span><span class="card__price">${esc(f.price)}</span></span>` : ""}
        </div>
        <div class="tickets">${ticketButtons(f)}</div>
      </div>
    </article>`;
}

// ---- 리스트 뷰 (월별 섹션) -----------------------------------------------
function renderList() {
  const filtered = applyFilters(state.all);
  document.getElementById("result-count").textContent = `${filtered.length}개`;
  const mount = document.getElementById("months");
  const empty = document.getElementById("list-empty");
  if (!filtered.length) { mount.innerHTML = ""; empty.hidden = false; return; }
  empty.hidden = true;

  let html = "";
  if (state.sort === "date") {
    // 월별 그룹핑
    const groups = new Map();
    for (const f of filtered) {
      const d = parseDate(f.startDate);
      const key = d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}` : "기타";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(f);
    }
    for (const [key, items] of groups) {
      const [y, m] = key.split("-");
      const title = key === "기타" ? "날짜 미정" : `${y}년 ${+m}월의 페스티벌`;
      html += `<section class="month-section">
        <div class="month-section__head">
          <h2 class="month-section__title">${title}</h2>
          <span class="month-section__count">${items.length}개</span>
        </div>
        <div class="grid">${items.map(cardHtml).join("")}</div>
      </section>`;
    }
  } else {
    html += `<section class="month-section">
      <div class="month-section__head">
        <h2 class="month-section__title">최근 등록순</h2>
        <span class="month-section__count">${filtered.length}개</span>
      </div>
      <div class="grid">${filtered.map(cardHtml).join("")}</div>
    </section>`;
  }
  mount.innerHTML = html;
}

// ---- 마퀴 티커 ------------------------------------------------------------
function renderTicker() {
  const upcoming = applyFilters(state.all, { ignoreHideDone: true })
    .map((f) => ({ f, di: dayInfo(f) }))
    .filter((x) => x.di.type === "soon" || x.di.type === "live")
    .sort((a, b) => (a.di.dday ?? -1) - (b.di.dday ?? -1))
    .slice(0, 15);
  const track = document.getElementById("ticker-track");
  if (!upcoming.length) {
    document.getElementById("ticker").style.display = "none";
    return;
  }
  const item = (x) => {
    const label = x.di.type === "live" ? "진행중" : (x.di.dday === 0 ? "D-DAY" : `D-${x.di.dday}`);
    return `<button class="ticker__item" data-id="${esc(x.f.id)}">`
      + `<span class="ticker__dday">${label}</span>`
      + `<span class="ticker__name">${esc(x.f.name)}</span></button>`;
  };
  // 끊김 없는 스크롤을 위해 내용 2회 반복(translateX -50%)
  const once = upcoming.map(item).join("");
  track.innerHTML = once + once;
}

// ---- 캘린더 뷰 ------------------------------------------------------------
function renderCalendar() {
  const y = state.calYear, m = state.calMonth;
  document.getElementById("cal-title").textContent = `${y}년 ${m}월`;

  const first = new Date(y, m - 1, 1);
  const last = new Date(y, m, 0);
  const gridStart = new Date(y, m - 1, 1 - first.getDay()); // 그 주 일요일
  const items = applyFilters(state.all, { ignoreHideDone: true }); // 캘린더는 지역필터만

  const weeksEl = document.getElementById("cal-weeks");
  let html = "";

  for (let ws = new Date(gridStart); ws <= last; ws.setDate(ws.getDate() + 7)) {
    const weekStart = new Date(ws);
    const weekEnd = new Date(ws); weekEnd.setDate(weekEnd.getDate() + 6);

    // 날짜 셀
    let days = "";
    for (let i = 0; i < 7; i++) {
      const d = new Date(weekStart); d.setDate(d.getDate() + i);
      const out = d.getMonth() !== m - 1;
      const today = d.getTime() === TODAY.getTime();
      const cls = "cal-day" + (out ? " cal-day--out" : "") + (today ? " cal-day--today" : "");
      days += `<div class="${cls}">${d.getDate()}</div>`;
    }

    // 이 주에 걸치는 페스티벌 세그먼트
    const segs = [];
    for (const f of items) {
      const s = parseDate(f.startDate);
      const e = parseDate(f.endDate) || s;
      if (!s) continue;
      const segS = s > weekStart ? s : weekStart;
      const segE = e < weekEnd ? e : weekEnd;
      if (segS > segE) continue;
      const col = Math.round((segS - weekStart) / MS_DAY); // 0~6
      const span = Math.round((segE - segS) / MS_DAY) + 1;
      segs.push({ f, col, span, contStart: s < weekStart, contEnd: e > weekEnd });
    }
    segs.sort((a, b) => a.col - b.col || b.span - a.span);

    // 레인 배치 (겹침 방지)
    const lanes = [];
    for (const sg of segs) {
      let placed = false;
      for (const lane of lanes) {
        if (lane.every((o) => sg.col >= o.col + o.span || sg.col + sg.span <= o.col)) {
          lane.push(sg); placed = true; break;
        }
      }
      if (!placed) lanes.push([sg]);
    }

    let bars = "";
    for (const lane of lanes) {
      let laneHtml = "";
      for (const sg of lane) {
        const cls = "cal-bar"
          + (sg.contStart ? " is-cont-end" : "")   // 이어짐: 왼쪽 각지게
          + (sg.contEnd ? " is-cont-start" : "");
        laneHtml += `<button class="${cls}" style="grid-column:${sg.col + 1}/span ${sg.span}" `
          + `data-id="${esc(sg.f.id)}" title="${esc(sg.f.name)}">${esc(sg.f.name)}</button>`;
      }
      bars += `<div class="cal-lane">${laneHtml}</div>`;
    }

    html += `<div class="cal-week"><div class="cal-days">${days}</div>`
      + `<div class="cal-bars">${bars}</div></div>`;
  }
  weeksEl.innerHTML = html;
}

function showCalDetail(id) {
  const f = state.all.find((x) => x.id === id);
  const el = document.getElementById("cal-detail");
  if (!f) { el.innerHTML = ""; return; }
  el.innerHTML = `<div class="grid">${cardHtml(f)}</div>`;
  const card = el.querySelector(".card");
  if (card) { card.classList.add("is-highlight"); card.scrollIntoView({ behavior: "smooth", block: "nearest" }); }
}

// ---- 뷰 전환 --------------------------------------------------------------
function setView(v) {
  state.view = v;
  const isList = v === "list";
  document.getElementById("list-view").hidden = !isList;
  document.getElementById("calendar-view").hidden = isList;
  document.getElementById("tab-list").classList.toggle("is-active", isList);
  document.getElementById("tab-calendar").classList.toggle("is-active", !isList);
  document.getElementById("tab-list").setAttribute("aria-selected", isList);
  document.getElementById("tab-calendar").setAttribute("aria-selected", !isList);
  if (!isList) renderCalendar();
}

function scrollToCard(id) {
  setView("list");
  // hideDone로 숨겨졌으면 임시 해제
  const f = state.all.find((x) => x.id === id);
  if (f && state.hideDone && dayInfo(f).type === "done") {
    state.hideDone = false;
    document.getElementById("hide-done").checked = false;
    renderList();
  }
  requestAnimationFrame(() => {
    const el = document.getElementById("card-" + id);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("is-highlight");
    setTimeout(() => el.classList.remove("is-highlight"), 2200);
  });
}

// ---- 이벤트 바인딩 --------------------------------------------------------
function bindEvents() {
  document.getElementById("tab-list").addEventListener("click", () => setView("list"));
  document.getElementById("tab-calendar").addEventListener("click", () => setView("calendar"));

  document.getElementById("hide-done").addEventListener("change", (e) => {
    state.hideDone = e.target.checked; renderList(); renderTicker();
  });
  document.getElementById("region-select").addEventListener("change", (e) => {
    state.region = e.target.value; renderList(); renderTicker();
    if (state.view === "calendar") renderCalendar();
  });
  document.getElementById("sort-select").addEventListener("change", (e) => {
    state.sort = e.target.value; renderList();
  });

  document.getElementById("cal-prev").addEventListener("click", () => {
    state.calMonth--; if (state.calMonth < 1) { state.calMonth = 12; state.calYear--; }
    renderCalendar();
  });
  document.getElementById("cal-next").addEventListener("click", () => {
    state.calMonth++; if (state.calMonth > 12) { state.calMonth = 1; state.calYear++; }
    renderCalendar();
  });

  // 티커 클릭 → 해당 카드
  document.getElementById("ticker-track").addEventListener("click", (e) => {
    const btn = e.target.closest(".ticker__item");
    if (btn) scrollToCard(btn.dataset.id);
  });
  // 캘린더 바 클릭 → 상세 카드
  document.getElementById("cal-weeks").addEventListener("click", (e) => {
    const bar = e.target.closest(".cal-bar");
    if (bar) showCalDetail(bar.dataset.id);
  });
}

// ---- 부트스트랩 -----------------------------------------------------------
async function init() {
  bindEvents();
  try {
    const res = await fetch("festivals.json", { cache: "no-cache" });
    if (!res.ok) throw new Error("HTTP " + res.status);
    const data = await res.json();
    state.all = data.festivals || [];

    // 마지막 갱신 표시
    const up = data.updatedAt ? new Date(data.updatedAt) : null;
    if (up) {
      const p = (n) => String(n).padStart(2, "0");
      document.getElementById("updated").textContent =
        `마지막 갱신 ${up.getFullYear()}.${p(up.getMonth() + 1)}.${p(up.getDate())} ${p(up.getHours())}:${p(up.getMinutes())}`;
    }
    // 캘린더 초기 월 = 오늘
    state.calYear = TODAY.getFullYear();
    state.calMonth = TODAY.getMonth() + 1;

    renderTicker();
    renderList();
  } catch (err) {
    document.getElementById("months").innerHTML =
      `<p class="empty">데이터를 불러오지 못했습니다. (${esc(err.message)})</p>`;
    console.error(err);
  }
}

document.addEventListener("DOMContentLoaded", init);
