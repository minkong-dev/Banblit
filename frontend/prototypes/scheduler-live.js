// 스케줄러 화면 — 프로토타입의 하드코딩 데이터를 실제 API 응답으로 갈아끼운 것.
// 마크업과 CSS 는 scheduler.html 그대로다. 이 파일은 데이터만 담당한다.
(() => {
  "use strict";



  // 여닫는 시각과 집중기간은 서버가 준 배정에서 뽑아낸다. 합주실 운영시간이나
  // 기간을 알려주는 API 가 아직 없어, 실제로 잡힌 일정의 앞뒤를 경계로 삼는다.
  let OPEN = 10, CLOSE = 22, N = (CLOSE - OPEN) * 2;
  const TODAY = "2026-09-02";
  let FOCUS = { a: "9999-12-31", b: "0000-01-01" };
  const WD = ["일", "월", "화", "수", "목", "금", "토"];
  const PX = 17;

  // 기간 목록을 주는 API 가 없어 시드가 넣은 번호를 그대로 쓴다.
  const PERIOD_IDS = [1, 2];
  // "내 팀" 을 가려낼 로그인이 아직 없다. 앞의 두 팀을 내 팀으로 가정한다.
  const MINE_COUNT = 2;

  let TEAMS = [];
  // 팀 명단을 주는 API 가 아직 없다. 비워 두고 화면에서 미연동이라고 알린다.
  const ROSTER = {};

  const hm = (i) => String(OPEN + Math.floor(i / 2)).padStart(2, "0") + ":" + (i % 2 ? "30" : "00");
  const hmEnd = (i) => (i >= N ? CLOSE + ":00" : hm(i));
  const hrs = (n) => (n % 2 ? Math.floor(n / 2) + "시간 30분" : n / 2 + "시간");
  const ymd = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const isFocus = (key) => key >= FOCUS.a && key <= FOCUS.b;
  const teamOf = (k) => TEAMS.find((x) => x.k === k);

  // 배정이 실제로 걸쳐 있는 날짜 범위. 기간을 알려주는 API 가 없어 이것으로 대신한다.
  function focusLabel() {
    if (FOCUS.a > FOCUS.b) return "배정 없음";
    const [, am, ad] = FOCUS.a.split("-");
    const [, bm, bd] = FOCUS.b.split("-");
    const from = Number(am) + "월 " + Number(ad) + "일";
    const to = am === bm ? Number(bd) + "일" : Number(bm) + "월 " + Number(bd) + "일";
    return from + " ~ " + to;
  }

  // 그날 실제로 쓰인 합주실 이름들. 합주실 목록 API 가 없어 배정에서 뽑아 쓴다.
  function roomsLabel(key) {
    const rooms = [...new Set(dayOf(key).map((e) => e.room).filter(Boolean))];
    return rooms.length ? rooms.join(" · ") : "합주실";
  }

  // 서버에서 받은 배정이 여기 쌓인다. 예약과 못 나오는 시간은 주고받을 API 가
  // 아직 없어, 화면에서 넣은 것만 이 브라우저 안에 남는다 — 새로고침하면 사라진다.
  const data = {};
  const put = (key, e) => { (data[key] ||= []).push(e); };

  const dayOf = (key) => (data[key] || []).slice().sort((x, y) => x.a - y.a);
  const nameOf = (e) => e.kind === "off" ? e.who : (e.team ? teamOf(e.team).name : e.who);
  const kindOf = (e) => e.kind === "assign" ? "자동 배정" : e.kind === "book" ? "예약" : "못 나오는 시간";
  const taken = (key) => {
    const g = new Array(N).fill(false);
    dayOf(key).filter((e) => e.kind !== "off").forEach((e) => { for (let i = e.a; i < e.b; i++) g[i] = true; });
    return g;
  };
  const rangeFree = (key, a, b) => {
    const g = taken(key);
    for (let i = a; i < b; i++) if (g[i]) return false;
    return true;
  };

  const S = { view: "month", mode: "me", y: 2026, m: 8, cut: false, who: "me", from: null, to: null };
  const $ = (id) => document.getElementById(id);
  const body = $("body");


  function fillTimeSelects() {
    let f = '<option value="">선택 안 함</option>', t = '<option value="">선택 안 함</option>';
    for (let i = 0; i < N; i++) f += '<option value="' + i + '">' + hm(i) + "</option>";
    for (let i = 1; i <= N; i++) t += '<option value="' + i + '">' + hmEnd(i) + "</option>";
    $("tFrom").innerHTML = f; $("tTo").innerHTML = t;
  }

  function timeState() {
    const el = $("tState");
    if (S.from === null || S.to === null) { el.textContent = "시간을 고르면 그 시간이 비어 있는 날짜만 켜집니다"; return; }
    let n = 0;
    for (let d = 1; d <= 30; d++) {
      const key = ymd(new Date(2026, 8, d));
      if (!isFocus(key) && rangeFree(key, S.from, S.to)) n++;
    }
    el.innerHTML = hm(S.from) + "–" + hmEnd(S.to) + " 가능한 날 <b>" + n + "일</b>";
  }

  function renderMonth() {
    const pad = new Date(S.y, S.m, 1).getDay();
    const last = new Date(S.y, S.m + 1, 0).getDate();
    let cells = "";
    for (let i = 0; i < pad; i++) cells += '<div class="cell void"></div>';

    for (let n = 1; n <= last; n++) {
      const d = new Date(S.y, S.m, n), key = ymd(d);
      const cls = ["cell"];
      if (d.getDay() === 0) cls.push("sun");
      if (key === TODAY) cls.push("today");
      let inner = "", blocked = false;

      if (S.mode === "book") {
        if (isFocus(key)) {
          blocked = true;
          inner = '<div class="avail auto"><span class="big">자동 배정</span></div>';
        } else if (S.from !== null && S.to !== null) {
          const ok = rangeFree(key, S.from, S.to);
          blocked = !ok;
          inner = '<div class="avail">' + (ok
            ? '<span class="yes"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4 12l6 6L20 6"/></svg>예약 가능</span>'
            : '<span class="no">이 시간 참</span>') + "</div>";
        } else {
          const g = taken(key), left = g.filter((x) => !x).length;
          blocked = left === 0;
          inner = '<div class="avail' + (left === 0 ? " none" : "") + '"><span class="big">' +
            (left === 0 ? "예약 마감" : hrs(left) + '<small>비어 있음</small>') + "</span>" +
            '<span class="meter" aria-hidden="true">' + g.map((x) => '<i class="' + (x ? "on" : "") + '"></i>').join("") + "</span></div>";
        }
        if (!blocked) cls.push("pickable");
      } else {
        const list = S.mode === "me"
          ? dayOf(key).filter((e) => e.kind === "off" || (e.team && teamOf(e.team).mine))
          : dayOf(key).filter((e) => e.kind !== "off");
        inner = list.slice(0, 3).map((e) => {
          const t = e.team ? teamOf(e.team) : null;
          const c = e.kind === "off" ? "off" : (t ? t.k : "solo");
          const nm = e.kind === "off" ? "못 나옴" : (t ? t.name : "개인");
          return '<span class="ev ' + c + '">' + nm + "<time>" + hm(e.a) + "</time></span>";
        }).join("") + (list.length > 3 ? '<span class="plus">+' + (list.length - 3) + "</span>" : "");
      }

      cells += '<button class="' + cls.join(" ") + '" data-key="' + key + '"' + (blocked ? " disabled" : "") +
        ' aria-label="' + (S.m + 1) + "월 " + n + "일 " + WD[d.getDay()] + '요일"><span class="n">' + n + "</span>" + inner + "</button>";
    }
    for (let i = pad + last; i % 7; i++) cells += '<div class="cell void"></div>';

    body.innerHTML = '<div class="dow">' + WD.map((w) => "<span>" + w + "</span>").join("") +
      '</div><div class="grid">' + cells + "</div>";
    $("bandSlot").innerHTML = '<span class="band"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>' +
      "배정된 기간 <b>" + focusLabel() + "</b> · 자동 배정</span>";
  }

  function renderWeek() {
    const base = new Date(S.y, S.m, 15);
    base.setDate(base.getDate() - base.getDay());
    const days = Array.from({ length: 7 }, (_, i) => new Date(base.getFullYear(), base.getMonth(), base.getDate() + i));
    let html = '<div class="weekscroll"><div class="weekgrid"><div class="wh"></div>';
    days.forEach((d) => {
      const c = ["wh"];
      if (d.getDay() === 0) c.push("sun");
      if (ymd(d) === TODAY) c.push("now");
      html += '<div class="' + c.join(" ") + '">' + WD[d.getDay()] + "<b>" + d.getDate() + "</b></div>";
    });
    for (let i = 0; i < N; i++) {
      const half = i % 2 === 1;
      html += '<div class="wt' + (half ? " half" : "") + '">' + hm(i) + "</div>";
      days.forEach((d) => {
        const key = ymd(d);
        const src = S.mode === "me"
          ? dayOf(key).filter((e) => e.kind === "off" || (e.team && teamOf(e.team).mine))
          : dayOf(key).filter((e) => e.kind !== "off");
        const ev = src.find((e) => e.a === i);
        let inner = "";
        if (ev) {
          const t = ev.team ? teamOf(ev.team) : null;
          const c = ev.kind === "off" ? "off" : (t ? t.k : "solo");
          inner = '<span class="blk ' + c + '" style="height:' + ((ev.b - ev.a) * 26 - 4) + 'px">' +
            nameOf(ev) + "<small>" + hm(ev.a) + "–" + hmEnd(ev.b) + "</small></span>";
        }
        html += '<div class="wcell' + (half ? " half" : "") + '">' + inner + "</div>";
      });
    }
    body.innerHTML = html + "</div></div>";
    $("bandSlot").innerHTML = "";
  }

  function renderLegend() {
    if (S.mode === "book" && S.view === "month") {
      $("legend").innerHTML = (S.from !== null && S.to !== null)
        ? "<span>고른 시간이 비어 있는 날짜만 누를 수 있어요.</span>"
        : "<span>하루 " + String(OPEN).padStart(2, "0") + ":00–" + String(CLOSE).padStart(2, "0") +
          ":00 · 파란 부분이 이미 찬 시간이에요.</span>";
      return;
    }
    const items = TEAMS.filter((t) => S.mode !== "me" || t.mine)
      .map((t) => '<span><i style="background:var(--' + t.k + ')"></i>' + t.name + "</span>");
    if (S.mode === "me") items.push('<span><i style="background:var(--off)"></i>내가 안 되는 시간</span>');
    $("legend").innerHTML = items.join("");
  }

  function render() {
    $("mLabel").textContent = S.y + "년 " + (S.m + 1) + "월";
    $("timebar").hidden = !(S.mode === "book" && S.view === "month");
    if (!$("timebar").hidden) timeState();
    if (S.cut) {
      body.innerHTML = '<div class="blank"><b>시간표를 못 불러왔어요</b><p>위의 다시 불러오기를 눌러주세요. 저절로 다시 시도하지 않아요.</p></div>';
      $("bandSlot").innerHTML = ""; $("legend").innerHTML = "";
      return;
    }
    if (S.view === "month") renderMonth(); else renderWeek();
    renderLegend();
  }

  const modal = $("modal");

  function timeline(list) {
    let rows = "";
    for (let h = OPEN; h < CLOSE; h++) rows += '<div class="hr" data-h="' + h + ':00"></div>';
    const evs = list.map((e) => {
      const t = e.team ? teamOf(e.team) : null;
      const c = e.kind === "off" ? "off" : (t ? t.k : "solo");
      return '<span class="evb ' + c + '" style="top:' + (e.a * PX) + "px;height:" + ((e.b - e.a) * PX - 3) + 'px">' +
        nameOf(e) + "<small>" + hm(e.a) + "–" + hmEnd(e.b) + " · " + kindOf(e) + "</small></span>";
    }).join("");
    return '<div class="tl">' + rows + evs + "</div>";
  }

  function people(list) {
    const keys = [...new Set(list.filter((e) => e.kind === "assign" && e.team).map((e) => e.team))];
    if (!keys.length) return "";
    const rows = keys.flatMap((k) => (ROSTER[k] || []).map(([n, no, pos]) =>
      '<div class="prow"><span class="pic" style="background:var(--' + k + '-tint);color:var(--' + k + ')">' +
      teamOf(k).sym + '</span><span class="nm">' + n + '</span><span class="ps">' + pos + "</span></div>")).join("");
    // 명단 API 가 없어 사람을 못 채운다. 빈 자리를 그리는 대신 이유를 적는다.
    if (!rows) {
      return '<div class="people"><h3>이날 나오는 사람</h3>' +
        '<p style="opacity:.7;padding:6px 2px">팀 명단을 주는 API 가 아직 없습니다 (미연동)</p></div>';
    }
    return '<div class="people"><h3>이날 나오는 사람</h3><div class="plist">' + rows + "</div></div>";
  }

  const opts = (from, to, g) => {
    let s = "";
    for (let i = from; i <= to; i++) {
      const t = g && i < N && g[i];
      s += '<option value="' + i + '"' + (t ? " disabled" : "") + ">" + hmEnd(i) + (t ? " (찼어요)" : "") + "</option>";
    }
    return s;
  };

  const dayTitle = (key) => {
    const d = new Date(key + "T00:00:00");
    return (d.getMonth() + 1) + "월 " + d.getDate() + "일 " + WD[d.getDay()] + "요일";
  };

  function open(key) {
    $("modalTitle").textContent = dayTitle(key);
    $("modalSub").textContent = roomsLabel(key) + " · " + String(OPEN).padStart(2, "0") + ":00–" +
      String(CLOSE).padStart(2, "0") + ":00 · 30분 단위 · " + (isFocus(key) ? "배정된 기간" : "배정 없음");
    if (S.mode === "book") mBook(key);
    else if (S.mode === "me") mMe(key);
    else mAll(key);
    modal.showModal();
  }

  function mAll(key) {
    const list = dayOf(key).filter((e) => e.kind !== "off");
    $("modalBody").innerHTML = list.length ? timeline(list) + people(list)
      : '<div class="blank"><b>이날은 아무도 안 써요</b><p>합주실이 하루 종일 비어 있어요.</p></div>';
    $("modalFoot").hidden = true;
  }

  function mMe(key) {
    const list = dayOf(key).filter((e) => e.kind === "off" || (e.team && teamOf(e.team).mine));
    $("modalBody").innerHTML =
      (list.length ? timeline(list) : '<div class="blank"><b>이날은 등록한 일정이 없어요</b><p>아래에서 안 되는 시간을 알려주세요.</p></div>') +
      '<p class="cap2">안 되는 시간</p><div class="pick">' +
        '<div class="fld"><label for="mf">시작</label><select id="mf">' + opts(0, N - 1) + "</select></div>" +
        '<div class="fld"><label for="mt">끝</label><select id="mt">' + opts(1, N) + "</select></div></div>" +
      '<p class="msg" id="mMsg"></p>' +
      '<p class="tip">여기 넣은 시간에는 자동 배정이 절대 잡지 않아요.</p>';
    $("mf").value = "16"; $("mt").value = "24";
    $("modalFoot").hidden = false;
    $("modalFoot").innerHTML = '<button class="ghost" id="mClose">닫기</button><button class="primary" id="mGo">등록하기</button>';
    $("mClose").onclick = () => modal.close();
    $("mGo").onclick = () => {
      const a = Number($("mf").value), b = Number($("mt").value);
      if (b <= a) { $("mMsg").textContent = "끝나는 시각이 시작보다 뒤여야 해요."; return; }
      put(key, { kind: "off", team: null, who: "직접 등록", a, b });
      say("안 되는 시간으로 등록했어요"); mMe(key); render();
    };
  }

  function mBook(key) {
    const list = dayOf(key).filter((e) => e.kind !== "off");
    const g = taken(key);
    const fixed = S.from !== null && S.to !== null;
    const a0 = fixed ? S.from : Math.max(0, g.findIndex((x) => !x));
    const b0 = fixed ? S.to : Math.min(N, a0 + 4);

    $("modalBody").innerHTML =
      (fixed
        ? '<div class="bigtime"><b>' + hm(a0) + " – " + hmEnd(b0) + "</b><small>이 시간으로 예약해요</small></div>"
        : timeline(list) + '<p class="cap2">언제 쓰실 건가요</p><div class="pick">' +
          '<div class="fld"><label for="bf">시작</label><select id="bf">' + opts(0, N - 1, g) + "</select></div>" +
          '<div class="fld"><label for="bt">끝</label><select id="bt">' + opts(1, N) + "</select></div></div>") +
      '<p class="cap2">누구 이름으로 할까요</p><div class="who2" id="who2">' +
        '<button data-w="me" aria-pressed="true">이도현 (나)</button>' +
        TEAMS.filter((t) => t.mine).map((t) => '<button data-w="' + t.k + '" aria-pressed="false">' + t.name + "</button>").join("") +
      '</div><p class="msg" id="bMsg"></p>' +
      (fixed ? '<p class="tip">먼저 누른 사람이 가져가요. 예약한 뒤에도 취소하거나 시간을 바꿀 수 있어요.</p>' : "");

    if (!fixed) { $("bf").value = String(a0); $("bt").value = String(b0); }
    S.who = "me";
    $("who2").onclick = (ev) => {
      const b = ev.target.closest("button[data-w]"); if (!b) return;
      S.who = b.dataset.w;
      $("who2").querySelectorAll("button").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    };
    $("modalFoot").hidden = false;
    $("modalFoot").innerHTML = '<button class="ghost" id="bClose">닫기</button><button class="primary" id="bGo">예약하기</button>';
    $("bClose").onclick = () => modal.close();
    $("bGo").onclick = () => {
      const a = fixed ? a0 : Number($("bf").value);
      const b = fixed ? b0 : Number($("bt").value);
      const msg = $("bMsg");
      if (b <= a) { msg.textContent = "끝나는 시각이 시작보다 뒤여야 해요."; return; }
      for (let i = a; i < b; i++) if (g[i]) { msg.textContent = hm(i) + "은 이미 찼어요. 다른 시간을 골라주세요."; return; }
      const team = S.who === "me" ? null : S.who;
      put(key, { kind: "book", team, who: team ? "" : "이도현", a, b });
      say(dayTitle(key) + " " + hm(a) + "–" + hmEnd(b) + " 예약했어요");
      modal.close(); render();
    };
  }

  body.addEventListener("click", (ev) => {
    const c = ev.target.closest(".cell");
    if (c && !c.classList.contains("void") && !c.disabled && !S.cut) open(c.dataset.key);
  });
  $("modalX").onclick = () => modal.close();

  [["t-me", "me"], ["t-book", "book"], ["t-all", "all"]].forEach(([id, mode]) => {
    $(id).onclick = () => {
      S.mode = mode;
      document.querySelectorAll('[role="tab"]').forEach((b) => b.setAttribute("aria-selected", String(b.id === id)));
      body.setAttribute("aria-labelledby", id);
      render();
    };
  });

  const setView = (v) => {
    S.view = v;
    $("vMonth").setAttribute("aria-pressed", String(v === "month"));
    $("vWeek").setAttribute("aria-pressed", String(v === "week"));
    render();
  };
  $("vMonth").onclick = () => setView("month");
  $("vWeek").onclick = () => setView("week");

  const shift = (n) => { const d = new Date(S.y, S.m + n, 1); S.y = d.getFullYear(); S.m = d.getMonth(); render(); };
  $("prev").onclick = () => shift(-1);
  $("next").onclick = () => shift(1);

  fillTimeSelects();
  $("tFrom").onchange = () => {
    S.from = $("tFrom").value === "" ? null : Number($("tFrom").value);
    if (S.from !== null && (S.to === null || S.to <= S.from)) { S.to = Math.min(N, S.from + 4); $("tTo").value = String(S.to); }
    render();
  };
  $("tTo").onchange = () => {
    S.to = $("tTo").value === "" ? null : Number($("tTo").value);
    if (S.to !== null && (S.from === null || S.to <= S.from)) { S.from = Math.max(0, S.to - 4); $("tFrom").value = String(S.from); }
    render();
  };
  $("tClear").onclick = () => { S.from = S.to = null; $("tFrom").value = ""; $("tTo").value = ""; render(); };

  // 사이드바는 넓은 창에서 늘 열려 있다. 이 버튼은 1000px 아래에서만 보인다.
  $("menuBtn").onclick = () => {
    const on = !document.body.classList.contains("navopen");
    document.body.classList.toggle("navopen", on);
    $("menuBtn").setAttribute("aria-expanded", String(on));
    $("menuBtn").setAttribute("aria-label", on ? "메뉴 닫기" : "메뉴 열기");
  };

  const pop = $("pop");
  const showPop = (on) => { pop.classList.toggle("on", on); $("profBtn").setAttribute("aria-expanded", String(on)); };
  $("profBtn").onclick = (e) => { e.stopPropagation(); showPop(!pop.classList.contains("on")); };
  document.addEventListener("click", (e) => { if (!pop.contains(e.target)) showPop(false); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") showPop(false); });

  // 내 팀 목록은 팀이 다 들어온 뒤에 그린다. 인원수와 내 포지션은 명단 API 가
  // 없어 채우지 못하므로 그 자리에 이유를 적는다.
  function renderMyTeams() {
    const mine = TEAMS.filter((t) => t.mine);
    $("popTeams").innerHTML = mine.map((t) =>
      '<div class="tm"><i style="background:var(--' + t.k + ')"></i>' + t.name + "<small>미연동</small></div>").join("");
    $("railTeams").innerHTML = mine.map((t) =>
      '<li><button class="teamrow"><i style="background:var(--' + t.k + ')"></i><b>' + t.name +
      "</b><small>명단 API 미연동</small></button></li>").join("");
  }

  $("cutSw").onchange = (e) => { S.cut = e.target.checked; $("cut").hidden = !S.cut; render(); };
  $("retry").onclick = () => { S.cut = false; $("cut").hidden = true; $("cutSw").checked = false; render(); say("시간표를 다시 불러왔어요"); };

  $("themeBtn").onclick = () => {
    const sys = matchMedia("(prefers-color-scheme: dark)").matches;
    const now = document.documentElement.dataset.theme || (sys ? "dark" : "light");
    const nx = now === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = nx;
    $("themeBtn").setAttribute("aria-label", nx === "dark" ? "밝은 화면으로 바꾸기" : "어두운 화면으로 바꾸기");
  };

  let tm;
  function say(msg) {
    const el = $("toast");
    el.textContent = msg; el.classList.add("on");
    clearTimeout(tm); tm = setTimeout(() => el.classList.remove("on"), 2800);
  }

  // ── 서버에서 배정 불러오기 ──────────────────────────────────────────
  // 이 화면은 API 와 같은 출처(localhost:8000/proto/)로 서빙되므로 상대경로로 부른다.

  async function getJSON(path) {
    const res = await fetch(path);
    let body = null;
    try {
      body = await res.json();
    } catch (e) {
      // 본문이 없는 답장도 있다.
    }
    if (!res.ok) {
      throw new Error((body && body.detail) || res.status + " " + res.statusText);
    }
    return body;
  }

  // 엔진은 30분 칸을 하나씩 배정한다. 같은 팀이 같은 방에서 이어 쓴 칸을 하나로
  // 합쳐야 사람이 읽는 "합주 한 번"이 된다.
  function mergeRows(rows) {
    const sorted = rows.slice().sort((a, b) =>
      a.team_id !== b.team_id ? a.team_id - b.team_id
        : a.room_id !== b.room_id ? a.room_id - b.room_id
        : a.start.localeCompare(b.start));

    const merged = [];
    for (const row of sorted) {
      const last = merged[merged.length - 1];
      if (last && last.team_id === row.team_id && last.room_id === row.room_id && last.end === row.start) {
        last.end = row.end;
      } else {
        merged.push({ ...row });
      }
    }
    return merged;
  }

  // 30분 칸 하나가 인덱스 하나다. 여는 시각이 기준점이므로 OPEN 이 정해진 뒤에 부른다.
  const slotIndex = (iso) => {
    const hour = Number(iso.slice(11, 13));
    const minute = Number(iso.slice(14, 16));
    return (hour - OPEN) * 2 + (minute >= 30 ? 1 : 0);
  };

  function adoptBounds(rows) {
    // 실제로 잡힌 일정의 앞뒤를 화면의 여닫는 시각과 집중기간으로 삼는다.
    let earliest = 24, latest = 0;
    for (const row of rows) {
      earliest = Math.min(earliest, Number(row.start.slice(11, 13)));
      const endHour = Number(row.end.slice(11, 13)) + (row.end.slice(14, 16) === "00" ? 0 : 1);
      latest = Math.max(latest, endHour);
      const day = row.start.slice(0, 10);
      if (day < FOCUS.a) FOCUS.a = day;
      if (day > FOCUS.b) FOCUS.b = day;
    }
    if (earliest < latest) {
      OPEN = earliest;
      CLOSE = latest;
      N = (CLOSE - OPEN) * 2;
    }
  }

  function adoptTeams(rows) {
    const seen = new Map();
    for (const row of rows) {
      if (!seen.has(row.team_id)) seen.set(row.team_id, row.team);
    }
    TEAMS = [...seen.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([id, name], i) => ({
        k: "c" + ((i % 4) + 1),
        id: id,
        name: name,
        sym: name.slice(0, 2),
        mine: i < MINE_COUNT,
        pos: "",
        cnt: 0
      }));
  }

  const teamKeyOf = (teamId) => (TEAMS.find((t) => t.id === teamId) || TEAMS[0]).k;

  async function load() {
    let rows = [];
    const failures = [];
    for (const id of PERIOD_IDS) {
      try {
        const schedule = await getJSON("/periods/" + id + "/schedule");
        rows = rows.concat(schedule.rows);
      } catch (error) {
        failures.push("기간 " + id + ": " + error.message);
      }
    }

    if (!rows.length) {
      // 배정이 하나도 없으면 프로토타입의 기본 시각을 그대로 두고 빈 달력을 그린다.
      renderMyTeams();
      render();
      say(failures.length ? failures[0] : "서버에 저장된 배정이 없습니다");
      return;
    }

    adoptBounds(rows);
    adoptTeams(rows);
    // 시각 고르는 칸은 초기화 때 기본 시각으로 이미 채워졌다. 여닫는 시각을
    // 서버 값으로 바꿨으니 다시 채운다.
    fillTimeSelects();
    for (const block of mergeRows(rows)) {
      put(block.start.slice(0, 10), {
        kind: "assign",
        team: teamKeyOf(block.team_id),
        room: block.room,
        a: slotIndex(block.start),
        b: slotIndex(block.end)
      });
    }

    renderMyTeams();
    render();
    if (failures.length) say(failures[0]);
  }

  load();
})();
