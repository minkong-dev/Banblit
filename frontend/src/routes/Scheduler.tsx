import { Fragment, useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";

import { AppShell, Card, Panel, Tabs } from "../components/AppShell";
import { ChevronLeftIcon, ChevronRightIcon, ClockIcon } from "../components/icons";
import { getJSON } from "../lib/api";
import { currentMonth } from "../lib/calendar";
import { focusedRange, loadReservationRows, loadUnavailable, roomBounds } from "../lib/pipeline";
import { DayDialog } from "./DayDialog";
import type { Entry } from "./DayDialog";
import { teamsOf } from "../lib/roster";
import type { DayTeam } from "../lib/roster";
import { useMe, usePeriods, useRooms } from "../components/hooks";
import "../styles/scheduler.css";
import type { Post, Reservation, ScheduleRow, Team, Unavailable } from "../lib/contract";
import { dayLabel, dayOf, dayWithWeekday, hoursLabel, isRangeFree, mergeReservations, mergeSessions, monthCells, slotCountOf, slotIndex, slotLabel, stampLabel, takenGrid, WEEKDAY_NAMES, weekKeys } from "../lib/pipeline";
import type { Session } from "../lib/pipeline";

// 오른쪽 공지 칸에 표시할 최대 줄 수입니다. 전체 목록은 공지 화면(routes/Notices)이 표시합니다.
const RECENT_NOTICES = 3;

/** 오른쪽 목록이 아직 표시할 수 없는 상태면 그 사유를 한 줄로 반환합니다. 빈 문자열이면 목록을 표시합니다. */
function listNote(
  isPending: boolean,
  error: unknown,
  count: number,
  emptyText: string,
  failText: string,
): string {
  if (isPending) return "불러오는 중…";
  if (error !== null) return error instanceof Error ? error.message : failText;
  return count === 0 ? emptyText : "";
}



/** 여러 기간의 시간표를 한 번에 받아, 실패한 기간은 사유만 모아 둡니다. */
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

const TABS = [
  { key: "me", text: "내 일정" },
  { key: "book", text: "예약" },
  { key: "all", text: "전체 일정" },
] as const;

type TabKey = (typeof TABS)[number]["key"];

/** 팀 하나의 자리를 "3/5명"으로 표시합니다. 목록에 없는 팀이면 빈 문자열을 반환합니다. */
function memberCountLabel(allTeams: Team[], teamId: number): string {
  const found = allTeams.find((team) => team.id === teamId);
  // 자리 수와 배정된 수를 함께 표시합니다. 빈 자리 수가 인원 수만큼 중요합니다.
  return found === undefined ? "" : `${found.filled_count}/${found.slot_count}명`;
}

/** 그날 화면에 표시할 항목만 선택합니다. 내 일정 탭은 내 팀의 배정과 내 불가능 시간, 전체 일정 탭은 배정·예약 전부입니다. */
function visible(entries: Entry[], tab: TabKey, teams: DayTeam[]): Entry[] {
  const mine = new Set(teams.filter((team) => team.mine).map((team) => team.key));
  return tab === "me"
    ? entries.filter((entry) => entry.kind === "off" || (entry.team !== null && mine.has(entry.team)))
    : entries.filter((entry) => entry.kind !== "off");
}

type DayEntries = Record<string, Entry[]>;

/** 확정된 시간표를 합주 한 번씩으로 합친 뒤 날짜별로 담습니다. 서버는 slot(1시간 단위 시간 칸)으로 주므로 맞닿은 slot 을 먼저 연결해야
 *  사용자가 보는 합주 한 번이 됩니다. */
function assignedByDay(rows: ScheduleRow[], teams: DayTeam[], openHour: number): DayEntries {
  const sessions: Session[] = rows.map((row) => ({
    team: row.team, room: row.room, start: row.start, end: row.end,
  }));
  const byDay: DayEntries = {};
  for (const session of mergeSessions(sessions)) {
    const team = teams.find((item) => item.name === session.team);
    (byDay[dayOf(session.start)] ??= []).push({
      kind: "assign",
      team: team?.key ?? null,
      room: session.room,
      a: slotIndex(session.start, openHour),
      b: slotIndex(session.end, openHour),
    });
  }
  return byDay;
}

/** 로그인한 사용자가 불가능한 시간을 날짜별로 담습니다. 서버에 저장된 값을 그대로 옮깁니다.
 *  조회하는 값이 로그인한 사용자의 일정뿐이라 전부 삭제할 수 있습니다. */
function offByDay(times: Unavailable[], openHour: number, days: string[]): DayEntries {
  const byDay: DayEntries = {};
  for (const item of times) {
    // 반복은 서버가 배정을 계산할 때 전개하지만(api/period_input.py expand_unavailable),
    // 달력은 저장된 행 하나만 받습니다. 표시 중인 날짜 위에 같은 규칙으로 다시 전개합니다.
    // 전개하지 않으면 매주 반복으로 등록한 일정이 첫날에만 표시되어 등록되지 않은 것처럼 보입니다.
    for (const day of repeatDays(item, days)) {
      (byDay[day] ??= []).push({
        kind: "off",
        team: null,
        who: item.reason ?? "직접 등록",
        a: slotIndex(item.starts_at, openHour),
        b: slotIndex(item.ends_at, openHour),
        // 반복으로 전개한 항목은 저장된 행이 아니므로 삭제할 수 없습니다. 원본 날짜에만 id 를 포함합니다.
        removeIds: day === dayOf(item.starts_at) ? [item.id] : undefined,
      });
    }
  }
  return byDay;
}

/** 이 불가능 일정이 적용되는 날짜들입니다. 반복이 아니면 시작 날짜 하나뿐입니다. */
function repeatDays(item: Unavailable, days: string[]): string[] {
  const first = dayOf(item.starts_at);
  if (!item.repeats_daily && !item.repeats_weekly) return [first];

  const step = item.repeats_daily ? 1 : 7;
  const last = item.repeat_until;
  return days.filter((day) => {
    if (day < first) return false;
    if (last !== null && day > last) return false;
    return daysBetween(first, day) % step === 0;
  });
}

function daysBetween(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00`) - Date.parse(`${from}T00:00:00`);
  return Math.round(ms / 86_400_000);
}

/** 현재 보고 있는 달에 표시할 수 있는 날짜 전부입니다. 앞뒤로 한 주씩 더 포함하는 것은 주 보기가
 *  달의 경계를 넘을 수 있어서입니다. 반복을 전개할 때만 사용하므로 범위가 넓어도 문제없습니다. */
function visibleDays(year: number, month: number): string[] {
  const first = new Date(year, month, 1 - DAYS_PER_WEEK);
  const last = new Date(year, month + 1, DAYS_PER_WEEK);
  const days: string[] = [];
  for (const at = first; at <= last; at.setDate(at.getDate() + 1)) {
    days.push(
      `${at.getFullYear()}-${String(at.getMonth() + 1).padStart(2, "0")}-${String(at.getDate()).padStart(2, "0")}`,
    );
  }
  return days;
}

const DAYS_PER_WEEK = 7;

/** 예약을 날짜별로 담습니다. 서버는 slot(1시간 단위 시간 칸)을 하나씩 주므로 맞닿은
 *  slot 을 먼저 하나로 연결해야 사용자가 보는 예약 한 건이 됩니다. team_id 로 실제 팀을
 *  찾습니다. 이름 비교보다 정확합니다. 동명이인 규칙과 같은 이유로 사람도 팀도 번호로 구분합니다.
 *  로그인한 사용자가 예약한 건에만 삭제할 id 를 포함해, 다른 사용자의 예약에는 취소 버튼이 표시되지 않게 합니다. */
// 주 보기는 합주실이 여는 시간만이 아니라 하루를 통째로 표시합니다. 합주실마다 여는 시각이 달라도
// 같은 줄에 같은 시각이 오고, 합주실을 바꿔도 줄이 밀리지 않습니다. 대신 줄이 많아 늘 스크롤이
// 생기므로, 주 보기로 들어올 때 합주가 있는 구간으로 자동 스크롤합니다(weekBox 의 useEffect).
const WEEK_FIRST_HOUR = 1;
const WEEK_LAST_HOUR = 23;
const WEEK_HOURS = Array.from(
  { length: WEEK_LAST_HOUR - WEEK_FIRST_HOUR + 1 },
  (_, i) => WEEK_FIRST_HOUR + i,
);

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

function bookedByDay(
  rows: Reservation[], teams: DayTeam[], openHour: number, myMemberId: number | null,
): DayEntries {
  const bookings = mergeReservations(rows.map((row) => ({
    id: row.id,
    room: row.room,
    teamId: row.team_id,
    team: row.team,
    memberId: row.member_id,
    member: row.member,
    start: row.start,
    end: row.end,
  })));

  const byDay: DayEntries = {};
  for (const booking of bookings) {
    const team = teams.find((item) => item.id === booking.teamId);
    (byDay[dayOf(booking.start)] ??= []).push({
      kind: "book",
      team: team?.key ?? null,
      room: booking.room,
      who: booking.team ?? booking.member,
      a: slotIndex(booking.start, openHour),
      b: slotIndex(booking.end, openHour),
      removeIds: booking.memberId === myMemberId ? booking.ids : undefined,
    });
  }
  return byDay;
}

export function Scheduler() {
  const { me, teamIds, teams: allTeams } = useMe();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<TabKey>("me");
  const [week, setWeek] = useState(false);
  const [cursor, setCursor] = useState(currentMonth);
  const [weekShift, setWeekShift] = useState(0);
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);

  // 합주실·기간 목록은 배정 여부와 상관없이 달력의 시간·날짜 범위를 정합니다.
  const rooms = useRooms();
  const periods = usePeriods();
  const periodIds = periods.data?.periods.map((period) => period.id) ?? [];
  const roomIds = rooms.data?.rooms.map((room) => room.id) ?? [];
  // 달력 한 달치 범위입니다. 예약 조회는 기간이 아니라 날짜 범위로 서버에 요청합니다.
  const monthFrom = `${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}-01`;
  const monthLastDay = new Date(cursor.year, cursor.month + 1, 0).getDate();
  const monthTo = `${cursor.year}-${String(cursor.month + 1).padStart(2, "0")}-${String(monthLastDay).padStart(2, "0")}`;
  // 주 보기는 달을 벗어난 주로도 넘어갑니다. 그래서 예약은 달이 아니라 현재 보고 있는
  // 날짜 범위로 요청합니다. 범위가 queryKey 에 들어 있어 주를 옮기면 그 주의 예약을 다시 받습니다.
  const weekDayKeys = weekKeys(cursor.year, cursor.month, weekShift);
  const rangeFrom = week ? weekDayKeys[0] : monthFrom;
  const rangeTo = week ? weekDayKeys[6] : monthTo;

  // 기간 목록이 오기 전에는 어느 기간의 시간표를 받을지 알 수 없어 query를 비활성화합니다.
  const query = useQuery({
    queryKey: ["schedule", periodIds],
    queryFn: () => loadRows(periodIds),
    enabled: periods.data !== undefined,
  });
  // 로그인한 사용자 id가 와야 그 사용자의 불가능 일정을 조회할 수 있습니다.
  const unavailableQuery = useQuery({
    queryKey: ["unavailable", me?.id],
    queryFn: () => loadUnavailable(me?.id ?? 0),
    enabled: me !== null,
  });
  // 합주실 목록이 와야 어느 합주실의 예약을 조회할지 알 수 있습니다.
  const reservationQuery = useQuery({
    queryKey: ["reservations", roomIds, rangeFrom, rangeTo],
    queryFn: () => loadReservationRows(roomIds, rangeFrom, rangeTo),
    enabled: rooms.data !== undefined,
  });
  // 공지 화면(routes/Notices 의 PostBoard)이 사용하는 queryKey 와 endpoint 를 그대로 사용합니다. 두 화면이
  // 같은 목록을 공유하므로, 공지를 작성하고 돌아오면 이 화면도 함께 갱신됩니다.
  const notices = useQuery({
    queryKey: ["board", "/notices"],
    queryFn: () => getJSON<{ posts: Post[] }>("/notices"),
  });
  const recentNotices = notices.data?.posts.slice(0, RECENT_NOTICES) ?? [];
  const noticeState = listNote(
    notices.isPending, notices.error, recentNotices.length,
    "아직 등록된 공지가 없습니다", "공지를 못 불러왔습니다",
  );

  // query.data 가 없을 때만 매번 새 빈 배열이 생깁니다. 그동안은 아래 useMemo 들이
  // 다시 실행되는데, 빈 배열을 다루는 가벼운 계산이라 useMemo 로 감쌀 필요가 없습니다.
  const rows = query.data?.rows ?? [];

  const teams = teamsOf(rows, teamIds, allTeams);
  const { open, close } = roomBounds(rooms.data?.rooms ?? []);
  const focus = focusedRange(periods.data?.periods ?? []);
  const slotCount = slotCountOf(open, close);

  const assigned = assignedByDay(rows, teams, open);
  const offEntries = offByDay(
    unavailableQuery.data ?? [], open, visibleDays(cursor.year, cursor.month),
  );
  const bookEntries = bookedByDay(reservationQuery.data?.rows ?? [], teams, open, me?.id ?? null);

  const entriesOf = (key: string): Entry[] =>
    [...(assigned[key] ?? []), ...(offEntries[key] ?? []), ...(bookEntries[key] ?? [])]
      .sort((x, y) => x.a - y.a);

  // POST 가 끝난 뒤 화면이 새 값을 표시하게 합니다. 클라이언트 쪽에 따로 상태를 두지 않고
  // 서버가 가진 값을 다시 조회해 저장이 실제로 되었는지까지 함께 확인합니다.
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
        {WEEKDAY_NAMES.map((name) => <span key={name}>{name}</span>)}
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
                    : <span className="no">해당시간 마감</span>}
                </div>
              );
            } else {
              const grid = gridOf(key);
              const left = grid.filter((taken) => !taken).length;
              blocked = left === 0;
              inner = (
                <div className={left === 0 ? "avail none" : "avail"}>
                  <span className="big">
                    {left === 0 ? "예약 마감" : <>{hoursLabel(left)}<small>예약 가능</small></>}
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
                      ? "불가능 일정"
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
              aria-label={dayWithWeekday(key)}
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

  // weekKeys 가 일요일부터 7일치 날짜를 반환하므로, 배열의 index 가 곧 요일입니다.
  const weekLabel = weekDayKeys[0].slice(5, 7) === weekDayKeys[6].slice(5, 7)
    ? `${dayLabel(weekDayKeys[0])} – ${Number(weekDayKeys[6].slice(8, 10))}일`
    : `${dayLabel(weekDayKeys[0])} – ${dayLabel(weekDayKeys[6])}`;

  // 하루 23줄 중 합주는 합주실이 여는 시간의 줄에만 있습니다. 주 보기로 들어올 때마다 그 줄이
  // 맨 위에 오게 스크롤합니다. 스크롤하지 않으면 항상 01:00 부터 보게 되어 매번 사용자가 스크롤해야 합니다.
  // 줄 높이는 CSS 가 정하므로 계산하지 않고 실제로 렌더링된 위치를 측정합니다.
  const weekBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!week) return;
    const box = weekBox.current;
    const row = box?.querySelector<HTMLElement>(`[data-hour="${open}"]`);
    if (!box || !row) return;
    box.scrollTop += row.getBoundingClientRect().top - box.getBoundingClientRect().top;
  }, [week, weekShift, open, tab, cursor.year, cursor.month]);

  const weekView = (
    <div className="weekscroll" ref={weekBox}>
      <div className="weekgrid">
        <div className="wh" />
        {weekDayKeys.map((key, index) => (
          <div className={index === 0 ? "wh sun" : "wh"} key={key}>
            {WEEKDAY_NAMES[index]}<b>{Number(key.slice(8, 10))}</b>
          </div>
        ))}
        {WEEK_HOURS.map((hour) => (
          <Fragment key={hour}>
            <div className="wt" data-hour={hour}>{hourLabel(hour)}</div>
            {weekDayKeys.map((key) => {
              const entry = visible(entriesOf(key), tab, teams)
                .find((item) => item.a + open === hour);
              return (
                <div className="wcell" key={`${key}-${hour}`}>
                  {entry === undefined ? null : (
                    <span className={`blk ${entry.team ? `${entry.team}` : "off"}`}
                      style={{ "--span": entry.b - entry.a } as CSSProperties}>
                      {entry.kind === "off"
                        ? "불가능 일정"
                        : teams.find((team) => team.key === entry.team)?.name ?? "개인"}
                      {/* 합주실 이름을 함께 표시합니다. 맞닿은 두 slot 이 따로 렌더링되는 유일한 이유가
                          합주실이 다른 것인데, 합주실을 표시하지 않으면 왜 나뉘었는지 알 수 없습니다. */}
                      <small>
                        {label(entry.a)}–{endLabel(entry.b)}
                        {entry.room === undefined ? "" : ` · ${entry.room}`}
                      </small>
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
  // 달력 위 화살표 하나가 두 가지를 이동합니다. 달 보기에서는 달을, 주 보기에서는 주를 이동합니다.
  // 달을 이동하면 주는 그 달 15일이 포함된 주로 돌아갑니다(weekShift 를 0 으로 초기화합니다).
  const shift = (step: number) => {
    if (week) {
      setWeekShift(weekShift + step);
      return;
    }
    const moved = new Date(cursor.year, cursor.month + step, 1);
    setCursor({ year: moved.getFullYear(), month: moved.getMonth() });
    setWeekShift(0);
  };

  return (
    <AppShell
      page="scheduler"
      current="schedule"
    >
      <Tabs label="레이아웃" items={TABS} selected={tab} onSelect={setTab} />

      {/* 합주실·기간·시간표 중 하나라도 실패하면 성공한 것만 표시하고 첫 실패 사유를
          알립니다. 다시 불러오기는 셋을 한 번에 다시 조회합니다. */}
      {rooms.isError || periods.isError || query.isError ? (
        <div className="cut">
          <p><b>스케줄을 불러오지 못했어요</b>{String(rooms.error ?? periods.error ?? query.error)}</p>
          <button onClick={() => { void rooms.refetch(); void periods.refetch(); void query.refetch(); }}>
            다시 불러오기
          </button>
        </div>
      ) : null}

      <Card>
        <div className="calbar">
          <button className="navb" aria-label={week ? "저번 주" : "저번 달"} onClick={() => shift(-1)}>
            <ChevronLeftIcon />
          </button>
          <span className="ml">{week ? weekLabel : `${cursor.year}년 ${cursor.month + 1}월`}</span>
          <button className="navb" aria-label={week ? "다음 주" : "다음 달"} onClick={() => shift(1)}>
            <ChevronRightIcon />
          </button>
          <div className="seg" role="group" aria-label="레이아웃 변경">
            <button aria-pressed={!week} onClick={() => setWeek(false)}>월</button>
            <button aria-pressed={week} onClick={() => setWeek(true)}>주</button>
          </div>
        </div>

        {tab === "book" && !week ? (
          <div className="timebar">
            <div className="fld">
              <label htmlFor="tFrom">시작시간</label>
              <select id="tFrom" value={from ?? ""}
                onChange={(event) => setFrom(event.target.value === "" ? null : Number(event.target.value))}>
                <option value="">선택 안 함</option>
                {Array.from({ length: slotCount }, (_, i) => i).map((slot) => (
                  <option value={slot} key={slot}>{label(slot)}</option>
                ))}
              </select>
            </div>
            <div className="fld">
              <label htmlFor="tTo">끝 시간</label>
              <select id="tTo" value={to ?? ""}
                onChange={(event) => setTo(event.target.value === "" ? null : Number(event.target.value))}>
                <option value="">선택 안 함</option>
                {Array.from({ length: slotCount }, (_, i) => i + 1).map((slot) => (
                  <option value={slot} key={slot}>{endLabel(slot)}</option>
                ))}
              </select>
            </div>
            <button className="clear" onClick={() => { setFrom(null); setTo(null); }}>시간 선택 취소</button>
            <span className="state">
              {from === null || to === null
                ? "지정한 시간에 예약이 가능한 날짜만 표시해요"
                : `${label(from)}–${endLabel(to)} 해당 시간으로 예약할 날짜를 눌러주세요`}
            </span>
          </div>
        ) : null}

        <div className="calbody" id="body">{week ? weekView : monthView}</div>

        <div className="cardfoot">
          <div className="legend">
            {teams.filter((team) => tab !== "me" || team.mine).map((team) => (
              <span key={team.id}><i style={{ background: `var(--${team.key})` }} />{team.name}</span>
            ))}
            {tab === "me" ? <span><i style={{ background: "var(--off)" }} />나의 불가능 일정</span> : null}
          </div>
          <div id="bandSlot">
            {focus === null ? null : (
              <span className="band"><ClockIcon />현재 집중합주 기간 <b>{focus.from} ~ {focus.to}</b> · 자동 스케줄링</span>
            )}
          </div>
        </div>
      </Card>

      {/* 알림은 상단바의 알림 아이콘으로 옮겼습니다. 이 칸은 달력을 보는 동안에만 표시되어
          게시판이나 설정 화면에 있는 사용자에게는 알림이 표시되지 않았습니다. */}
      <div className="rail">
        <Panel title="공지사항" hint="전체보기 ›" onOpen={() => void navigate("/notices")}>
          {/* 이 칸에서는 제목만 표시하고, 클릭하면 글 본문을 볼 수 있는 공지 화면으로 이동합니다. */}
          <ul>
            {noticeState !== "" ? (
              <li><button type="button" disabled><b>{noticeState}</b></button></li>
            ) : recentNotices.map((post) => (
              <li key={post.id}>
                <button type="button" onClick={() => void navigate("/notices")}>
                  <b>{post.title}</b>
                  <small>{stampLabel(post.created_at)} · {post.author}</small>
                </button>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="내 팀" hint="전체보기 ›" onOpen={() => void navigate("/teams")}>
          <ul>
            {myTeams.map((team) => (
              <li key={team.id}>
                <button className="teamrow" onClick={() => void navigate("/teams")}>
                  <i style={{ background: `var(--${team.key})` }} />
                  <b>{team.name}</b>
                  <small>{memberCountLabel(allTeams, team.id)}</small>
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
          myName={me?.name ?? ""}
          rooms={rooms.data?.rooms ?? []}
          onSaved={onSaved}
          onClose={() => setOpenDay(null)}
        />
      )}
    </AppShell>
  );
}
