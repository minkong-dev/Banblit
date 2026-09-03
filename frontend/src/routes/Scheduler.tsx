import { Fragment, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { AppShell, Card, Panel, Tabs } from "../components/AppShell";
import { ChevronLeftIcon, ChevronRightIcon, ClockIcon } from "../components/icons";
import { getJSON } from "../lib/api";
import { hoursLabel, isRangeFree, monthCells, slotLabel, takenGrid } from "../lib/calendar";
import { dayOf, mergeSessions, slotIndex } from "../lib/slots";
import type { Session } from "../lib/slots";
import { DayDialog } from "./DayDialog";
import type { Entry, Team } from "./DayDialog";
import { useToast } from "../useToast";
import "../styles/scheduler.css";

// 기간 목록을 주는 API 가 없어 시드가 넣은 번호를 그대로 부른다.
const PERIOD_IDS = [1, 2];
// "내 팀" 을 가려낼 로그인이 아직 없다. 앞의 두 팀을 내 팀으로 본다.
const MINE_COUNT = 2;
const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
// 배정이 하나도 없을 때 쓸 여닫는 시각. 있으면 실제 배정의 앞뒤로 갈아 끼운다.
const FALLBACK_OPEN = 10;
const FALLBACK_CLOSE = 22;

type ScheduleRow = {
  team_id: number;
  team: string;
  room_id: number;
  room: string;
  start: string;
  end: string;
};

/** 여러 기간의 시간표를 한 번에 받아, 실패한 기간은 사유만 모아 둔다. */
async function loadRows(): Promise<{ rows: ScheduleRow[]; failures: string[] }> {
  const rows: ScheduleRow[] = [];
  const failures: string[] = [];
  for (const id of PERIOD_IDS) {
    try {
      const schedule = await getJSON<{ rows: ScheduleRow[] }>(`/periods/${id}/schedule`);
      rows.push(...schedule.rows);
    } catch (error) {
      failures.push(`기간 ${id}: ${error instanceof Error ? error.message : "알 수 없는 오류"}`);
    }
  }
  return { rows, failures };
}

/** 실제로 잡힌 일정의 앞뒤를 여닫는 시각으로 삼는다. 합주실 운영시간 API 가 아직 없다. */
function boundsOf(rows: ScheduleRow[]): { open: number; close: number } {
  if (rows.length === 0) return { open: FALLBACK_OPEN, close: FALLBACK_CLOSE };

  let open = 24;
  let close = 0;
  for (const row of rows) {
    open = Math.min(open, Number(row.start.slice(11, 13)));
    // 19:30 에 끝나면 20시까지 열려 있어야 그 칸이 그려진다.
    const endHour = Number(row.end.slice(11, 13)) + (row.end.slice(14, 16) === "00" ? 0 : 1);
    close = Math.max(close, endHour);
  }
  return open < close ? { open, close } : { open: FALLBACK_OPEN, close: FALLBACK_CLOSE };
}

/** 배정이 걸쳐 있는 날짜의 처음과 끝. 집중기간을 알려주는 API 가 아직 없다. */
function focusRange(rows: ScheduleRow[]): { from: string; to: string } | null {
  if (rows.length === 0) return null;
  const days = rows.map((row) => dayOf(row.start)).sort();
  return { from: days[0], to: days[days.length - 1] };
}

function teamsOf(rows: ScheduleRow[]): Team[] {
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
function visible(entries: Entry[], tab: TabKey, teams: Team[]): Entry[] {
  const mine = new Set(teams.filter((team) => team.mine).map((team) => team.key));
  return tab === "me"
    ? entries.filter((entry) => entry.kind === "off" || (entry.team !== null && mine.has(entry.team)))
    : entries.filter((entry) => entry.kind !== "off");
}

export function Scheduler() {
  const { message, say } = useToast();
  const [tab, setTab] = useState<TabKey>("me");
  const [week, setWeek] = useState(false);
  const [cursor, setCursor] = useState({ year: 2026, month: 8 });
  const [from, setFrom] = useState<number | null>(null);
  const [to, setTo] = useState<number | null>(null);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [popOpen, setPopOpen] = useState(false);
  // 화면에서 넣은 예약과 못 나오는 시간. 주고받을 API 가 없어 이 브라우저 안에만 남는다.
  const [local, setLocal] = useState<Record<string, Entry[]>>({});

  const query = useQuery({ queryKey: ["schedule", PERIOD_IDS], queryFn: loadRows });
  const rows = query.data?.rows ?? [];

  const teams = useMemo(() => teamsOf(rows), [rows]);
  const { open, close } = useMemo(() => boundsOf(rows), [rows]);
  const focus = useMemo(() => focusRange(rows), [rows]);
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

  const entriesOf = (key: string): Entry[] =>
    [...(assigned[key] ?? []), ...(local[key] ?? [])].sort((x, y) => x.a - y.a);

  const addEntry = (key: string, entry: Entry) =>
    setLocal((current) => ({ ...current, [key]: [...(current[key] ?? []), entry] }));

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
    <>
      <button className="profbtn" aria-expanded={popOpen} onClick={() => setPopOpen((on) => !on)}>
        <span className="face" aria-hidden="true">이도</span>
        <span className="nm">이도현</span>
        <span className="ar" aria-hidden="true">▾</span>
      </button>
      <div className={popOpen ? "pop on" : "pop"} role="dialog" aria-label="내 프로필">
        <div className="who">
          <span className="face" aria-hidden="true">이도</span>
          <div><b>이도현</b><small>일반멤버 · 2026년 입부</small></div>
        </div>
        <hr />
        <div className="cap">소속 팀 {myTeams.length}개</div>
        {myTeams.map((team) => (
          <div className="tm" key={team.id}>
            <i style={{ background: `var(--${team.key})` }} />{team.name}<small>미연동</small>
          </div>
        ))}
        <hr />
        <button className="act">프로필 설정<span>›</span></button>
        <button className="act quit">로그아웃</button>
      </div>
    </>
  );

  return (
    <AppShell
      page="scheduler"
      current="schedule"
      profile={profile}
      toast={message}
    >
      <Tabs label="보기 모드" items={TABS} selected={tab} onSelect={setTab} />

      {query.isError ? (
        <div className="cut">
          <p><b>시간표를 못 불러왔어요</b>{String(query.error)}</p>
          <button onClick={() => void query.refetch()}>다시 불러오기</button>
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
          <ul>
            <li><a href="#"><b><span className="new" aria-hidden="true" />9월 정기공연 순서 안내</b><small>어제 · 헤드매니저</small></a></li>
            <li><a href="#"><b>합주실 청소 당번 바뀝니다</b><small>3일 전 · 헤드매니저</small></a></li>
            <li><a href="#"><b>신입 부원 모집 마감</b><small>1주 전 · 헤드매니저</small></a></li>
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
          onAdd={addEntry}
          onSay={say}
          onClose={() => setOpenDay(null)}
        />
      )}
    </AppShell>
  );
}
