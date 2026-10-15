// 불가능 일정 구역의 캘린더 보기입니다. 멤버 1명의 불가능 일정을 달력으로, 팀 1개의 불가능 일정을 히트맵으로 표시합니다.
// 히트맵 칸 색은 그 시간에 불가능 일정이 있는 팀원 수 ÷ 팀원 수이고, 칸을 누르면 아래에 그 팀원 이름을 표시합니다.
// 사유는 표시하지 않습니다(사용자 결정 2026-10-12). 시간 범위는 합주실 운영 시간 중 가장 넓은 범위입니다(roomBounds).

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

import { CalendarBar, useCalendarCursor } from "../components/CalendarBar";
import { MonthView, WeekView } from "../components/CalendarViews";
import { Empty } from "../components/controls";
import { MemberSearch } from "../components/MemberSearch";
import { Modal } from "../components/Modal";
import { teamMembersQuery, useRooms } from "../components/queries";
import { TeamSearch } from "../components/TeamSearch";
import { entryName, offByDay, visibleDays } from "../lib/dayEntries";
import type { Member, MemberUnavailable, Team } from "../lib/contract";
import { loadState } from "../lib/loading";
import { heatByMonth, heatByWeek, offMembersAt } from "../lib/unavailableMap";
import "../styles/unavailable.css";
import { MINUTES_PER_HOUR, WEEKDAY_NAMES, clockEndLabel, dayWithWeekday, hourLabel, monthCells, roomBounds, slotLabel } from "../lib/calendar";
import { memberLabel } from "../lib/roster";

type Target = "member" | "team";
/** 누른 칸입니다. hour 가 null 이면 달 보기의 날짜 칸입니다. */
type Picked = { day: string; hour: number | null };

/** 히트맵 칸의 색 단계(0~4)입니다. 0명은 0, 나머지는 비율을 4단계로 올림합니다. */
function heatLevel(count: number, total: number): number {
  return count === 0 || total === 0 ? 0 : Math.ceil((count / total) * 4);
}

export function UnavailableCalendar({ times }: { times: MemberUnavailable[] }) {
  const cursor = useCalendarCursor();
  const [target, setTarget] = useState<Target>("member");
  const [member, setMember] = useState<Member | null>(null);
  const [team, setTeam] = useState<Team | null>(null);
  const [picking, setPicking] = useState(false);
  const rooms = useRooms();
  const { open, close } = roomBounds(rooms.data?.rooms ?? []);
  const chosen = target === "member" ? member : team;

  return (
    <div className="calview">
      <div className="unavbar">
        <div className="seg" role="group" aria-label="대상 종류">
          <button aria-pressed={target === "member"} onClick={() => setTarget("member")}>멤버</button>
          <button aria-pressed={target === "team"} onClick={() => setTarget("team")}>팀</button>
        </div>
        <button className="pickfield" aria-haspopup="dialog" aria-label={target === "member" ? "멤버 선택" : "팀 선택"} onClick={() => setPicking(true)}>
          {chosen === null
            ? <span className="ph">{target === "member" ? "멤버를 선택해주세요" : "팀을 선택해주세요"}</span>
            : target === "member" && member !== null ? memberLabel(member.name, member.cohort) : team?.name}
        </button>
      </div>
      <CalendarBar cursor={cursor} />

      {target === "member"
        ? member === null
          ? <Empty text="멤버를 선택하면 그 멤버의 불가능 일정을 달력에 표시해요." />
          // key 가 바뀌면 고른 날짜를 초기화합니다. 대상이나 월, 주 보기를 바꾸면 이전 선택은 화면에 없는 칸입니다.
          : <MemberCalendar key={`${member.id}-${cursor.week}`} times={times.filter((item) => item.member_id === member.id)} cursor={cursor} open={open} close={close} />
        : team === null
          ? <Empty text="팀을 선택하면 시간별로 불가능한 팀원 수를 표시해요." />
          : <TeamHeat key={`${team.id}-${cursor.week}`} times={times} team={team} cursor={cursor} open={open} close={close} />}

      {!picking ? null : target === "member" ? (
        <Modal title="멤버 선택" hint="불가능 일정을 확인할 멤버를 선택해주세요." onClose={() => setPicking(false)}>
          <MemberSearch onPick={(picked) => { setMember(picked); setPicking(false); }} />
        </Modal>
      ) : (
        <Modal title="팀 선택" hint="불가능 일정을 확인할 팀을 선택해주세요." onClose={() => setPicking(false)}>
          <TeamSearch onPick={(picked) => { setTeam(picked); setPicking(false); }} />
        </Modal>
      )}
    </div>
  );
}

type ViewArgs = { cursor: ReturnType<typeof useCalendarCursor>; open: number; close: number };

/** 멤버 1명의 불가능 일정 달력입니다. 대시보드의 달 보기와 주 보기를 그대로 쓰고, 날짜를 누르면 그날 일정을 아래에 나열합니다. */
function MemberCalendar({ times, cursor, open, close }: ViewArgs & { times: MemberUnavailable[] }) {
  const [day, setDay] = useState<string | null>(null);
  const days = cursor.week ? cursor.weekDayKeys : visibleDays(cursor.year, cursor.month);
  const byDay = offByDay(times, open, days);
  const entriesOf = (key: string) => byDay[key] ?? [];
  const view = { tab: "me" as const, teams: [], entriesOf, openHour: open, slotCount: close - open, slotMinutes: MINUTES_PER_HOUR };
  const picked = day === null ? [] : entriesOf(day);

  return (
    <>
      <div className="calbody">
        {cursor.week
          ? <WeekView dayKeys={cursor.weekDayKeys} closeHour={close} {...view} />
          : <MonthView year={cursor.year} month={cursor.month} range={null} inFocus={() => false} onOpen={setDay} {...view} />}
      </div>
      {day === null ? null : (
        <section className="heatnote" aria-live="polite">
          <b>{dayWithWeekday(day)}</b>
          {picked.length === 0 ? <p>불가능 일정이 없어요.</p> : (
            <ul>
              {picked.map((entry, index) => (
                <li key={index}>{slotLabel(entry.a, open)}–{slotLabel(entry.b, open)} {entryName(entry, [])}</li>
              ))}
            </ul>
          )}
        </section>
      )}
    </>
  );
}

/** 팀 1개의 히트맵입니다. 주 보기는 요일 × 시간 칸, 달 보기는 날짜마다 가장 많이 빠지는 시간의 인원입니다. */
function TeamHeat({ times, team, cursor, open, close }: ViewArgs & { times: MemberUnavailable[]; team: Team }) {
  const [picked, setPicked] = useState<Picked | null>(null);
  const roster = useQuery(teamMembersQuery(team.id));
  if (!roster.isSuccess) return <Empty state={loadState(roster)} text="팀원을 불러오고 있어요." />;
  const members = roster.data;
  if (members.length === 0) return <Empty text="팀원이 없는 팀이에요." />;
  // ponytail: 칸을 누를 때마다 히트맵 전체를 다시 계산합니다. 팀원 10명, 한 달 기준으로 즉시 끝납니다. 느려지면 useMemo 로 묶습니다.
  const ids = members.map((item) => item.id);
  const total = ids.length;
  // 달 보기 날짜 칸을 누르면 그날 불가능한 팀원이 있는 시간 전부, 주 보기 칸을 누르면 그 시간 1개를 나열합니다.
  const hours = picked === null ? [] : picked.hour !== null ? [picked.hour] : Array.from({ length: close - open }, (_, i) => open + i);
  const rows = picked === null ? [] : hours
    .map((hour) => ({ hour, off: offMembersAt(times, ids, picked.day, hour) }))
    .filter((row) => picked.hour !== null || row.off.length > 0);
  const nameOf = (id: number) => {
    const found = members.find((item) => item.id === id);
    return found === undefined ? "" : memberLabel(found.name, found.cohort);
  };

  return (
    <>
      <div className="calbody">
        {cursor.week ? (
          <WeekHeat heat={heatByWeek(times, ids, cursor.weekDayKeys, open, close)} dayKeys={cursor.weekDayKeys}
            open={open} total={total} picked={picked} onPick={setPicked} />
        ) : (
          <MonthHeat year={cursor.year} month={cursor.month} total={total} picked={picked} onPick={setPicked}
            heat={(days) => heatByMonth(times, ids, days, open, close)} />
        )}
      </div>
      <HeatScale total={total} />
      {picked === null ? null : (
        <section className="heatnote" aria-live="polite">
          {rows.length === 0 ? <p>불가능한 팀원이 없는 날이에요.</p> : rows.map((row) => (
            <div key={row.hour}>
              <b>{dayWithWeekday(picked.day)} {hourLabel(row.hour)}–{clockEndLabel(hourLabel((row.hour + 1) % 24))}</b>
              <span>{total}명 중 {row.off.length}명 불가능</span>
              {row.off.length === 0 ? null : <p>{row.off.map(nameOf).join(", ")}</p>}
            </div>
          ))}
        </section>
      )}
    </>
  );
}

function WeekHeat({ heat, dayKeys, open, total, picked, onPick }: {
  heat: number[][]; dayKeys: string[]; open: number; total: number; picked: Picked | null; onPick: (picked: Picked) => void;
}) {
  return (
    <div className="heatweek" aria-label="요일별 시간별 불가능 팀원 수">
      <div className="hh" />
      {dayKeys.map((key, index) => (
        <div className={index === 0 ? "hh sun" : "hh"} key={key}>{WEEKDAY_NAMES[index]}<b>{Number(key.slice(8, 10))}</b></div>
      ))}
      {(heat[0] ?? []).map((_, row) => (
        <div className="hrow" key={row}>
          <div className="ht">{hourLabel(open + row)}</div>
          {dayKeys.map((key, col) => {
            const count = heat[col][row];
            const on = picked?.day === key && picked.hour === open + row;
            return (
              <button key={key} className={`hc heat-${heatLevel(count, total)}`} aria-pressed={on}
                aria-label={`${dayWithWeekday(key)} ${hourLabel(open + row)}, ${total}명 중 ${count}명 불가능`}
                onClick={() => onPick({ day: key, hour: open + row })}>
                {count === 0 ? "" : count}
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function MonthHeat({ year, month, total, picked, onPick, heat }: {
  year: number; month: number; total: number; picked: Picked | null; onPick: (picked: Picked) => void;
  heat: (days: string[]) => Record<string, number>;
}) {
  const ymd = (day: number) => `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const cells = monthCells(year, month);
  const byDay = heat(cells.filter((day): day is number => day !== null).map(ymd));
  return (
    <>
      <div className="dow">{WEEKDAY_NAMES.map((name) => <span key={name}>{name}</span>)}</div>
      <div className="grid">
        {cells.map((day, index) => {
          if (day === null) return <div className="cell void" key={`void-${index}`} />;
          const key = ymd(day);
          const count = byDay[key] ?? 0;
          return (
            <button key={key} className={`cell heat-${heatLevel(count, total)}${index % 7 === 0 ? " sun" : ""}`}
              aria-pressed={picked?.day === key && picked.hour === null}
              aria-label={`${dayWithWeekday(key)}, 가장 많이 빠지는 시간 ${total}명 중 ${count}명`}
              onClick={() => onPick({ day: key, hour: null })}>
              <span className="n">{day}</span>
              {count === 0 ? null : <span className="peak">최대 {count}명</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}

/** 색 단계 범례입니다. 왼쪽 끝이 0명, 오른쪽 끝이 팀원 전부입니다. */
function HeatScale({ total }: { total: number }) {
  return (
    <div className="heatscale" aria-hidden="true">
      <span>0명</span>
      {[0, 1, 2, 3, 4].map((level) => <i key={level} className={`heat-${level}`} />)}
      <span>{total}명</span>
    </div>
  );
}
