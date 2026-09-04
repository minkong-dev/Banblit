import { Fragment, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { AppShell, Card, Panel, ProfileMenu, Tabs } from "../components/AppShell";
import { ChevronLeftIcon, ChevronRightIcon, ClockIcon } from "../components/icons";
import { DevOfflineToggle } from "../components/DevOfflineToggle";
import { getJSON } from "../lib/api";
import { focusedRange, loadReservationRows, loadUnavailable, roomBounds } from "../lib/pipeline";
import { DayDialog } from "./DayDialog";
import type { DayTeam, Entry } from "./DayDialog";
import { useMe, useToast } from "../components/hooks";
import "../styles/scheduler.css";
import type { Period, Room, ScheduleRow } from "../lib/contract";
import { dayOf, hoursLabel, isRangeFree, mergeSessions, monthCells, slotIndex, slotLabel, takenGrid } from "../lib/pipeline";
import type { Session } from "../lib/pipeline";

// "내 팀" 을 가려낼 로그인이 아직 없다. 앞의 두 팀을 내 팀으로 본다.
const MINE_COUNT = 2;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];



/** 여러 기간의 시간표를 한 번에 받아, 실패한 기간은 사유만 모아 둔다. */
async function loadRows(periodIds: number[]): Promise<{ rows: ScheduleRow[]; failures: string[] }> {
  const rows: ScheduleRow[] = [];
  const failures: string[] = [];
  for (const id of periodIds) {
    try {
      const schedule = await getJSON<{ rows: ScheduleRow[] }>(`/periods/${id}/schedule`);
      rows.push(...schedule.rows);
    } catch (error) {
      failures.push(`기간 ${id}: ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
    }
  }
  return { rows, failures };
}

function teamsOf(rows: ScheduleRow[]): DayTeam[] {
  const seen = new Map<number, string>();
  for (const row of rows) {
    if (!seen.has(row.team_id)) seen.set(row.team_id, row.team);
  }
  return [...seen.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([id, name], index) => ({
      id,
      name,
      key: `c${(index % 4) + 1}`,
      mine: index < MINE_COUNT,
    }));
}

const TABS = [
  { key: "me", text: "내 일정" },
  { key: "book", text: "예약" },
  { key: "all", text: "전체 일정" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/** 그날 화면에 보일 것만 고른다 — 내 일정은 내 팀과 내가 안 되는 시간, 전체는 예약된 것 전부. */
function visible(entries: Entry[], tab: TabKey, teams: DayTeam[]): Entry[] {
  const mine = new Set(teams.filter((team) => team.mine).map((team) => team.key));
  return tab === "me"
    ? entries.filter((entry) => entry.kind === "off" || (entry.team !== null && mine.has(entry.team)))
    : entries.filter((entry) => entry.kind !== "off");
}

export function Scheduler() {
  const { message, say } = useToast();
  const { me } = useMe();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>("me");
  const [week, setWeek] = useState(false);
  const [cursor, setCursor] = useState({ year: 2026, month: 8 });
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);

  // 합주실·기간 목록은 배정 여부와 상관없이 달력의 시간·날짜 범위를 정한다.
  const rooms = useQuery({
    queryKey: ["rooms"],
    queryFn: () => getJSON<{ rooms: Room[] }>("/rooms"),
  });
  const periods = useQuery({
    queryKey: ["periods"],
    queryFn: () => getJSON<{ periods: Period[] }>("/periods"),
  });
  const periodIds = periods.data?.periods.map((period) => period.id) ?? [];
  const roomIds = rooms.data?.rooms.map((room) => room.id) ?? [];
  // 달력 한 달치 범위 — 예약 조회는 기간이 아니라 날짜 범위로 서버에 묻는다.
  const monthFrom = `${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}-01`;
  const monthLastDay = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const monthTo = `${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}-${String(monthLastDay).padStart(2, "0")}`;

  // 기간 목록이 오기 전에는 어느 기간의 시간표를 받을지 알 수 없어 쉰다.
  const query = useQuery({
    queryKey: ["schedule", periodIds],
    queryFn: () => loadRows(periodIds),
    enabled: periods.data !== undefined,
  });
  // 로그인한 사람 번호가 와야 그 사람의 못 나오는 시간을 물을 수 있다.
  const unavailableQuery = useQuery({
    queryKey: ["unavailable", me?.id],
    queryFn: () => loadUnavailable(me?.id ?? 0),
    enabled: me !== null,
  });
  // 방 목록이 와야 어느 방의 예약을 물을지 안다.
  const reservationQuery = useQuery({
    queryKey: ["reservations", roomIds, monthFrom, monthTo],
    queryFn: () => loadReservationRows(roomIds, monthFrom, monthTo),
    enabled: rooms.data !== undefined,
  });
  // query.data 가 없을 때만 매번 새 빈 배열이 생긴다 — 그동안은 아래 useMemo 들이
  // 다시 도는데, 빈 배열을 다루는 계산이라 가벼워 따로 감쌀 만큼은 아니다.
  const rows = query.data?.rows ?? [];

  const teams = useMemo(() => teamsOf(rows), [rows]);
  const { open, close } = roomBounds(rooms.data?.rooms ?? []);
  const focus = focusedRange(periods.data?.periods ?? []);
  const slotCount = (close - open) * 2;

  // 서버가 준 30분 조각을 합주 한 번으로 합쳐 날짜별로 담는다.
  const assigned = useMemo(() => {
    const sessions: Session[] = rows.map((row) => ({
      team: row.team, room: row.room, start: row.start, end: row.end,
    }));
    const byDay: Record<string, Entry[]> = {};
    for (const session of mergeSessions(sessions)) {
      const team = teams.find((item) => item.name === session.team);
      (byDay[dayOf(session.start)] ??= []).push({
        kind: "assign",
        team: team?.key ?? null,
        room: session.room,
        a: slotIndex(session.start, open),
        b: slotIndex(session.end, open),
      });
    }
    return byDay;
  }, [rows, teams, open]);

  // 내가 못 나오는 시간 — 서버에 저장된 값을 그대로 날짜별로 담는다.
  const offEntries = useMemo(() => {
    const byDay: Record<string, Entry[]> = {};
    for (const item of unavailableQuery.data ?? []) {
      (byDay[dayOf(item.starts_at)] ??= []).push({
        kind: "off",
        team: null,
        who: "직접 등록",
        a: slotIndex(item.starts_at, open),
        b: slotIndex(item.ends_at, open),
      });
    }
    return byDay;
  }, [unavailableQuery.data, open]);

  // 상시 개방기간 예약 — team_id 로 실제 팀을 찾아 매칭한다(이름 대조보다 정확하다).
  const bookEntries = useMemo(() => {
    const byDay: Record<string, Entry[]> = {};
    for (const row of reservationQuery.data?.rows ?? []) {
      const team = teams.find((item) => item.id === row.team_id);
      (byDay[dayOf(row.start)] ??= []).push({
        kind: "book",
        team: team?.key ?? null,
        room: row.room,
        who: row.team ?? row.member,
        a: slotIndex(row.start, open),
        b: slotIndex(row.end, open),
      });
    }
    return byDay;
  }, [reservationQuery.data, teams, open]);

  const entriesOf = (key: string): Entry[] =>
    [...(assigned[key] ?? []), ...(offEntries[key] ?? []), ...(bookEntries[key] ?? [])]
      .sort((x, y) => x.a - y.a);

  // POST 가 끝난 뒤 화면이 새 값을 보게 한다 — 클라이언트 쪽에 따로 상태를 두지 않고
  // 서버가 가진 값을 다시 물어 저장이 실제로 됐는지까지 함께 확인한다.
  const onSaved = () => {
    void queryClient.invalidateQueries({ queryKey: ["unavailable"] });
    void queryClient.invalidateQueries({ queryKey: ["reservations"] });
  };

  const inFocus = (key: string) => focus !== null && key >= focus.from && key <= focus.to;
  const gridOf = (key: string) =>
    takenGrid(entriesOf(key).filter((entry) => entry.kind !== "off"), slotCount);

  const label = (index: number) => slotLabel(index, open);
  const endLabel = (index: number) => (index >= slotCount ? `${close}:00` : label(index));

  const cells = monthCells(cursor.year, cursor.month);
  const ymd = (day: number) =>
    `${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  const monthView = (
    <>
      <div className="dow">
        {WEEKDAYS.map((name) => <span key={name}>{name}</span>)}
      </div>
      <div className="grid">
        {cells.map((day, index) => {
          if (day === null) return <div className="cell void" key={`void-${index}`} />;

          const key = ymd(day);
          const weekday = index % 7;
          const marks = [weekday === 0 ? "sun" : ""].filter(Boolean);
          let blocked = false;
          let inner = null;

          if (tab === "book") {
            if (inFocus(key)) {
              blocked = true;
              inner = <div className="avail auto"><span className="big">자동 배정</span></div>;
            } else if (from !== null && to !== null) {
              const free = isRangeFree(gridOf(key), from, to);
              blocked = !free;
              inner = (
                <div className="avail">
                  {free
                    ? <span className="yes">예약 가능</span>
                    : <span className="no">이 시간 참</span>}
                </div>
              );
            } else {
              const grid = gridOf(key);
              const left = grid.filter((taken) => !taken).length;
              blocked = left === 0;
              inner = (
                <div className={left === 0 ? "avail none" : "avail"}>
                  <span className="big">
                    {left === 0 ? "예약 마감" : <>{hoursLabel(left)}<small>비어 있음</small></>}
                  </span>
                  <span className="meter" aria-hidden="true">
                    {grid.map((taken, i) => <i className={taken ? "on" : ""} key={i} />)}
                  </span>
                </div>
              );
            }
            if (!blocked) marks.push("pickable");
          } else {
            const list = visible(entriesOf(key), tab, teams);
            inner = (
              <>
                {list.slice(0, 3).map((entry, i) => (
                  <span className={`ev ${entry.team ? `${entry.team}` : "off"}`} key={i}>
                    {entry.kind === "off"
                      ? "못 나옴"
                      : teams.find((team) => team.key === entry.team)?.name ?? "개인"}
                    <time>{label(entry.a)}</time>
                  </span>
                ))}
                {list.length > 3 ? <span className="plus">+{list.length - 3}</span> : null}
              </>
            );
          }

          return (
            <button
              key={key}
              className={["cell", ...marks].join(" ")}
              disabled={blocked}
              aria-label={`${cursor.month + 1}월 ${day}일 ${WEEKDAYS[weekday]}요일`}
              onClick={() => setOpenDay(key)}
            >
              <span className="n">{day}</span>
              {inner}
            </button>
          );
        })}
      </div>
    </>
  );

  // 주 보기는 그 달 15일이 든 주를 보여준다. 날짜를 고르는 자리는 아직 없다.
  const weekStart = new Date(cursor.year, cursor.month, 15);
  weekStart.setDate(weekStart.getDate() - weekStart.getDay());
  const weekDays = Array.from({ length: 7 }, (_, i) =>
    new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate() + i));

  const weekView = (
    <div className="weekscroll">
      <div className="weekgrid">
        <div className="wh" />
        {weekDays.map((date) => (
          <div className={date.getDay() === 0 ? "wh sun" : "wh"} key={date.getDate()}>
            {WEEKDAYS[date.getDay()]}<b>{date.getDate()}</b>
          </div>
        ))}
        {Array.from({ length: slotCount }, (_, i) => i).map((slot) => (
          <Fragment key={slot}>
            <div className={slot % 2 ? "wt half" : "wt"}>{label(slot)}</div>
            {weekDays.map((date) => {
              const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
              const entry = visible(entriesOf(key), tab, teams).find((item) => item.a === slot);
              return (
                <div className={slot % 2 ? "wcell half" : "wcell"} key={`${key}-${slot}`}>
                  {entry === undefined ? null : (
                    <span className={`blk ${entry.team ? `${entry.team}` : "off"}`}
                      style={{ height: (entry.b - entry.a) * 26 - 4 }}>
                      {entry.kind === "off"
                        ? "못 나옴"
                        : teams.find((team) => team.key === entry.team)?.name ?? "개인"}
                      <small>{label(entry.a)}–{endLabel(entry.b)}</small>
                    </span>
                  )}
                </div>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );

  const myTeams = teams.filter((team) => team.mine);
  const shift = (step: number) => {
    const moved = new Date(cursor.year, cursor.month + step, 1);
    setCursor({ year: moved.getFullYear(), month: moved.getMonth() });
  };

  const profile = (
    <ProfileMenu
      name="이도현"
      sub="일반멤버 · 2026년 입부"
      teams={myTeams.map((team) => ({ id: team.id, name: team.name, colorKey: team.key }))}
    />
  );

  return (
    <AppShell
      page="scheduler"
      current="schedule"
      profile={profile}
      toast={message}
      sideExtra={import.meta.env.DEV && <DevOfflineToggle />}
    >
      <Tabs label="보기 모드" items={TABS} selected={tab} onSelect={setTab} />

      {/* 합주실·기간·시간표 중 하나라도 실패하면 성공한 것만 그리고 첫 실패 사유를
          알린다. 다시 불러오기는 셋을 한 번에 다시 부른다. */}
      {rooms.isError || periods.isError || query.isError ? (
        <div className="cut">
          <p><b>시간표를 못 불러왔어요</b>{String(rooms.error ?? periods.error ?? query.error)}</p>
          <button onClick={() => { void rooms.refetch(); void periods.refetch(); void query.refetch(); }}>
            다시 불러오기
          </button>
        </div>
      ) : null}

      <Card>
        <div className="calbar">
          <button className="navb" aria-label="이전 달" onClick={() => shift(-1)}><ChevronLeftIcon /></button>
          <span className="ml">{cursor.year}년 {cursor.month + 1}월</span>
          <button className="navb" aria-label="다음 달" onClick={() => shift(1)}><ChevronRightIcon /></button>
          <div className="seg" role="group" aria-label="보기 전환">
            <button aria-pressed={!week} onClick={() => setWeek(false)}>월</button>
            <button aria-pressed={week} onClick={() => setWeek(true)}>주</button>
          </div>
        </div>

        {tab === "book" && !week ? (
          <div className="timebar">
            <div className="fld">
              <label htmlFor="tFrom">시작</label>
              <select id="tFrom" value={from ?? ""}
                onChange={(event) => setFrom(event.target.value === "" ? null : Number(event.target.value))}>
                <option value="">선택 안 함</option>
                {Array.from({ length: slotCount }, (_, i) => i).map((slot) => (
                  <option value={slot} key={slot}>{label(slot)}</option>
                ))}
              </select>
            </div>
            <div className="fld">
              <label htmlFor="tTo">끝</label>
              <select id="tTo" value={to ?? ""}
                onChange={(event) => setTo(event.target.value === "" ? null : Number(event.target.value))}>
                <option value="">선택 안 함</option>
                {Array.from({ length: slotCount }, (_, i) => i + 1).map((slot) => (
                  <option value={slot} key={slot}>{endLabel(slot)}</option>
                ))}
              </select>
            </div>
            <button className="clear" onClick={() => { setFrom(null); setTo(null); }}>시간 지우기</button>
            <span className="state">
              {from === null || to === null
                ? "시간을 고르면 그 시간이 비어 있는 날짜만 켜집니다"
                : `${label(from)}–${endLabel(to)} 고른 시간으로 예약할 날짜를 눌러주세요`}
            </span>
          </div>
        ) : null}

        <div className="calbody" id="body">{week ? weekView : monthView}</div>

        <div className="cardfoot">
          <div className="legend">
            {teams.filter((team) => tab !== "me" || team.mine).map((team) => (
              <span key={team.id}><i style={{ background: `var(--${team.key})` }} />{team.name}</span>
            ))}
            {tab === "me" ? <span><i style={{ background: "var(--off)" }} />내가 안 되는 시간</span> : null}
          </div>
          <div id="bandSlot">
            {focus === null ? null : (
              <span className="band"><ClockIcon />배정된 기간 <b>{focus.from} ~ {focus.to}</b> · 자동 배정</span>
            )}
          </div>
        </div>
      </Card>

      <div className="rail">
        <Panel title="공지사항" hint="전체보기 ›" onOpen={() => say("공지사항 API 가 아직 없습니다")}>
          {/* 상세 API 가 없어 각 줄을 실제 글로 보내지 못한다. 눌리는 자리로 두고 사유를 알린다. */}
          <ul>
            <li><button type="button" onClick={() => say("공지사항 API 가 아직 없습니다")}><b><span className="new" aria-hidden="true" />9월 정기공연 순서 안내</b><small>어제 · 헤드매니저</small></button></li>
            <li><button type="button" onClick={() => say("공지사항 API 가 아직 없습니다")}><b>합주실 청소 당번 바뀝니다</b><small>3일 전 · 헤드매니저</small></button></li>
            <li><button type="button" onClick={() => say("공지사항 API 가 아직 없습니다")}><b>신입 부원 모집 마감</b><small>1주 전 · 헤드매니저</small></button></li>
          </ul>
        </Panel>
        <Panel title="내 팀" hint="전체보기 ›" onOpen={() => say("팀 명단 API 가 아직 없습니다")}>
          <ul>
            {myTeams.map((team) => (
              <li key={team.id}>
                <button className="teamrow">
                  <i style={{ background: `var(--${team.key})` }} />
                  <b>{team.name}</b><small>명단 API 미연동</small>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      {openDay === null ? null : (
        <DayDialog
          dayKey={openDay}
          tab={tab}
          teams={teams}
          entries={entriesOf(openDay)}
          openHour={open}
          closeHour={close}
          slotCount={slotCount}
          fixed={from !== null && to !== null ? { from, to } : null}
          inFocus={inFocus(openDay)}
          memberId={me?.id ?? null}
          // ponytail: 합주실 여러 개를 고르는 자리가 화면 설계에 아직 없어 첫 번째
          // 합주실에 고정한다. 방을 고르는 UI가 생기면 여기서 선택값을 받아 바꾼다.
          roomId={rooms.data?.rooms[0]?.id ?? null}
          onSaved={onSaved}
          onSay={say}
          onClose={() => setOpenDay(null)}
        />
      )}
    </AppShell>
  );
}
