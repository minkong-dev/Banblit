// 배정 결과 화면 — 프로토타입의 하드코딩 데이터를 실제 API 응답으로 갈아끼운 것.
// 마크업과 CSS 는 assignment.html 그대로다. 이 파일은 데이터만 담당한다.
(() => {
  "use strict";

  const $ = (id) => document.getElementById(id);

  // ── 서버 ────────────────────────────────────────────────────────────
  // 이 화면은 API 와 같은 출처(localhost:8000/proto/)로 서빙되므로 상대경로로 부른다.

  async function getJSON(path, init) {
    const res = await fetch(path, init);
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

  // 팀·합주실 목록을 주는 API 가 아직 없다. 확정된 시간표에서 번호를 뽑아 쓰고,
  // 그것도 비어 있으면 시드가 넣은 번호를 그대로 쓴다.
  const FALLBACK_TEAM_IDS = [1, 2, 3, 4];
  const FALLBACK_ROOM_IDS = [1, 2];

  // ── 칸을 덩어리로 ───────────────────────────────────────────────────
  // 엔진은 30분 칸을 하나씩 배정한다. 같은 팀이 같은 방에서 이어 쓴 칸을 하나로
  // 합쳐야 사람이 읽는 "합주 한 번"이 된다.

  function mergeBlocks(slots) {
    const sorted = slots.slice().sort((a, b) =>
      a.team !== b.team ? a.team.localeCompare(b.team)
        : a.room !== b.room ? a.room.localeCompare(b.room)
        : a.start.localeCompare(b.start));

    const blocks = [];
    for (const slot of sorted) {
      const last = blocks[blocks.length - 1];
      if (last && last.team === slot.team && last.room === slot.room && last.end === slot.start) {
        last.end = slot.end;
      } else {
        blocks.push({ team: slot.team, room: slot.room, start: slot.start, end: slot.end });
      }
    }
    return blocks;
  }

  function flatten(slotsByTeam) {
    const out = [];
    for (const [team, slots] of Object.entries(slotsByTeam || {})) {
      for (const slot of slots) {
        out.push({ team: team, room: slot.room, start: slot.start, end: slot.end });
      }
    }
    return out;
  }

  // ── 날짜·시각 ───────────────────────────────────────────────────────
  // 서버는 시간대 없는 값을 준다. 문자열을 그대로 잘라 쓴다 — Date 로 바꾸면
  // 브라우저 시간대가 끼어들어 날짜가 하루씩 밀 수 있다.

  const dayOf = (iso) => iso.slice(0, 10);
  const hm = (iso) => iso.slice(11, 16);
  const ymd = (date) => date.getFullYear() + "-" +
    String(date.getMonth() + 1).padStart(2, "0") + "-" +
    String(date.getDate()).padStart(2, "0");

  function datesBetween(from, to) {
    const out = [];
    const cur = new Date(from + "T00:00:00");
    const end = new Date(to + "T00:00:00");
    while (cur <= end) {
      out.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }

  function minutes(block) {
    return (new Date(block.end) - new Date(block.start)) / 60000;
  }

  // ── 상태 ────────────────────────────────────────────────────────────

  let periodId = 1;
  let confirmedRows = [];  // 서버가 준 원본 행
  let confirmed = [];      // 위를 합친 덩어리
  let result = null;       // 방금 돌린 배정 결과
  let view = "now";        // now | p0 | p1 …
  let failure = "";        // 서버가 거절했을 때의 사유
  let teamKey = new Map();

  function rememberTeams(blocks) {
    const names = new Set(teamKey.keys());
    blocks.forEach((block) => names.add(block.team));
    teamKey = new Map();
    [...names].sort().forEach((name, i) => teamKey.set(name, "c" + ((i % 4) + 1)));
  }

  function teamIds() {
    const ids = [...new Set(confirmedRows.map((row) => row.team_id))];
    return ids.length ? ids.sort((a, b) => a - b) : FALLBACK_TEAM_IDS;
  }

  function roomIds() {
    const ids = [...new Set(confirmedRows.map((row) => row.room_id))];
    return ids.length ? ids.sort((a, b) => a - b) : FALLBACK_ROOM_IDS;
  }

  function shownBlocks() {
    if (view === "now" || !result) return confirmed;
    const proposal = result.proposals[Number(view.slice(1))];
    return proposal ? mergeBlocks(flatten(proposal.assignment.slots_by_team)) : confirmed;
  }

  // ── 그리기 ──────────────────────────────────────────────────────────

  function renderHead() {
    const blocks = shownBlocks();
    const label = blocks.length
      ? dayOf(blocks.map((b) => b.start).sort()[0]) + " ~ " +
        dayOf(blocks.map((b) => b.end).sort().reverse()[0])
      : "표시할 일정 없음";

    document.querySelector(".calhead span").innerHTML = label +
      ' · 기간 <select id="pick" aria-label="기간 고르기">' +
      [1, 2].map((id) =>
        '<option value="' + id + '"' + (id === periodId ? " selected" : "") + ">" + id + "번</option>").join("") +
      "</select>";
    $("pick").onchange = (event) => {
      periodId = Number(event.target.value);
      load();
    };
  }

  function renderTabs() {
    const items = [["now", "지금 확정된 것"]];
    if (result) {
      result.proposals.forEach((proposal, i) => {
        items.push(["p" + i, String.fromCharCode(65 + i) + "안"]);
      });
    }
    $("tabs").innerHTML = items.map(([key, text]) =>
      '<button class="tab" role="tab" data-view="' + key + '" aria-selected="' +
      (view === key) + '">' + text + "</button>").join("");
    $("tabs").querySelectorAll("[data-view]").forEach((button) => {
      button.onclick = () => {
        view = button.dataset.view;
        render();
      };
    });
  }

  function renderCal() {
    const blocks = shownBlocks();
    rememberTeams(blocks);

    $("keys").innerHTML = [...teamKey.entries()].map(([name, key]) =>
      '<i><em style="background:var(--' + key + ')"></em>' + name + "</i>").join("");

    if (!blocks.length) {
      $("cal").innerHTML =
        '<div class="day" style="grid-column:1/-1"><span class="free">표시할 일정이 없습니다</span></div>';
      return;
    }

    const starts = blocks.map((block) => dayOf(block.start)).sort();
    const days = datesBetween(starts[0], starts[starts.length - 1]);
    // 요일 머리글이 월요일부터라 첫 주의 앞쪽을 빈 칸으로 채운다.
    let html = '<div class="day" aria-hidden="true"></div>'.repeat((days[0].getDay() + 6) % 7);

    for (const date of days) {
      const key = ymd(date);
      const items = blocks
        .filter((block) => dayOf(block.start) === key)
        .sort((x, y) => x.start.localeCompare(y.start));
      const body = items.map((block) =>
        '<div class="ses ' + teamKey.get(block.team) + '">' + block.team +
        "<small>" + hm(block.start) + "–" + hm(block.end) + "</small>" +
        '<span class="out">' + block.room + "</span></div>").join("");
      html += '<div class="day' + (date.getDay() === 0 ? " sunday" : "") + '">' +
        '<span class="n">' + date.getDate() + "</span>" + body +
        (items.length ? "" : '<span class="free">합주 없음</span>') + "</div>";
    }
    $("cal").innerHTML = html;
  }

  function countsRow(blocks) {
    const stat = new Map();
    for (const block of blocks) {
      const seen = stat.get(block.team) || { times: 0, mins: 0 };
      seen.times += 1;
      seen.mins += minutes(block);
      stat.set(block.team, seen);
    }
    return [...teamKey.entries()].map(([name, key]) => {
      const seen = stat.get(name) || { times: 0, mins: 0 };
      return '<span class="cnt' + (seen.times === 0 ? " short" : "") + '">' +
        '<i style="background:var(--' + key + ')"></i>' + name +
        " 합주 <b>" + seen.times + "번</b> · " + (seen.mins / 60).toFixed(1) + "시간</span>";
    }).join("");
  }

  function renderUnder() {
    const blocks = shownBlocks();
    const counts = '<div class="counts">' + countsRow(blocks) + "</div>";
    const again = '<div class="act"><button class="btn main" id="again">지금 다시 계산</button></div>';

    if (failure) {
      $("under").innerHTML = "<h2>서버가 요청을 받지 못했습니다</h2>" +
        '<p class="sub">' + failure + "</p>" + again;
      bindAgain();
      return;
    }

    if (view !== "now" && result) {
      const proposal = result.proposals[Number(view.slice(1))];
      const who = proposal.excluded_member;
      $("under").innerHTML =
        "<h2>" + who.name + "(#" + who.id + ") 을 빼면 이렇게 됩니다</h2>" +
        '<p class="sub">이 사람의 못 나오는 시간 때문에 팀 전원이 모일 자리를 찾지 못했습니다. ' +
        "빠지는 것은 이 기간의 합주뿐입니다.</p>" + counts +
        '<div class="note">달력이 이 안대로 바뀐 시간표를 보여주고 있습니다. ' +
        "고르기(확정) 기능은 아직 서버에 없어 지금은 보기만 합니다.</div>" +
        '<div class="act"><button class="btn" id="back">지금 것으로 돌아가기</button></div>';
      $("back").onclick = () => {
        view = "now";
        render();
      };
      return;
    }

    if (!confirmed.length) {
      $("under").innerHTML = "<h2>아직 확정된 시간표가 없습니다</h2>" +
        '<p class="sub">이 기간은 자동 배정이 아직 자리를 다 채우지 못했습니다. ' +
        "빈 시간표를 내보내지 않고 여기서 멈춰 있습니다.</p>" + counts +
        '<div class="note">아래 <b>지금 다시 계산</b>을 누르면 서버가 배정을 돌립니다. ' +
        "풀리지 않으면 누구를 빼면 되는지 <b>A안·B안</b> 탭으로 나옵니다.</div>" + again;
      bindAgain();
      return;
    }

    const total = blocks.reduce((sum, block) => sum + minutes(block), 0) / 60;
    $("under").innerHTML = "<h2>확정된 시간표입니다</h2>" +
      '<p class="sub">합주 ' + blocks.length + "번 · 모두 합쳐 " + total.toFixed(1) +
      "시간. 서버에 저장된 배정을 그대로 보여줍니다.</p>" + counts +
      '<div class="note">다시 계산하면 지금 시간표는 백업으로 밀려나고 새 결과가 확정됩니다.</div>' + again;
    bindAgain();
  }

  function bindAgain() {
    const button = $("again");
    if (!button) return;
    button.onclick = async () => {
      button.disabled = true;
      button.textContent = "계산하는 중…";
      failure = "";
      try {
        result = await getJSON("/periods/" + periodId + "/assign", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ team_ids: teamIds(), room_ids: roomIds() })
        });
        await loadConfirmed();
        view = "now";
        say(result.assignment.feasible
          ? (result.saved ? "배정을 새로 확정했습니다" : "배정은 됐지만 저장되지 않았습니다")
          : "자리를 다 채우지 못했습니다 · 조율안 " + result.proposals.length + "개");
      } catch (error) {
        failure = error.message;
        say("계산하지 못했습니다");
      }
      render();
    };
  }

  function renderRail() {
    // 지난 계산 이력을 주는 API 가 아직 없다. 되돌리기(POST /periods/{id}/rollback)는
    // 있지만 "어느 회차로" 를 고를 목록이 없어 화면을 붙이지 않았다.
    $("vers").innerHTML =
      '<li style="padding:12px 14px;opacity:.72;line-height:1.6">' +
      "<b>미연동</b><br>지난 계산 이력을 주는 API 가 아직 없습니다.</li>";
  }

  function render() {
    renderHead();
    renderTabs();
    renderCal();
    renderUnder();
    renderRail();
  }

  // ── 불러오기 ────────────────────────────────────────────────────────

  async function loadConfirmed() {
    const schedule = await getJSON("/periods/" + periodId + "/schedule");
    confirmedRows = schedule.rows;
    confirmed = mergeBlocks(schedule.rows);
  }

  async function load() {
    failure = "";
    result = null;
    view = "now";
    $("under").innerHTML = "<h2>불러오는 중…</h2>";
    try {
      await loadConfirmed();
    } catch (error) {
      confirmedRows = [];
      confirmed = [];
      failure = error.message;
    }
    render();
  }

  // ── 프로토타입에서 그대로 가져온 조작들 ─────────────────────────────

  const dialog = $("ask");
  $("askNo").onclick = () => dialog.close();
  $("askYes").onclick = () => dialog.close();

  $("menuBtn").onclick = () => document.body.classList.toggle("navopen");
  $("themeBtn").onclick = () => {
    const systemDark = matchMedia("(prefers-color-scheme: dark)").matches;
    const now = document.documentElement.dataset.theme || (systemDark ? "dark" : "light");
    const next = now === "dark" ? "light" : "dark";
    document.documentElement.dataset.theme = next;
    $("themeBtn").setAttribute("aria-label",
      next === "dark" ? "밝은 화면으로 바꾸기" : "어두운 화면으로 바꾸기");
  };

  let toastTimer;
  function say(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.add("on");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove("on"), 2800);
  }

  // 계산이 도는 시각은 읽고 쓸 API 가 없어 잠가 둔다.
  $("tShow").textContent = "미연동";
  $("t1").disabled = true;
  $("t2").disabled = true;
  $("tSave").disabled = true;
  $("tSave").textContent = "API 없음";

  load();
})();
