// 불가능 일정 구역의 캘린더 보기입니다. 멤버 1명의 불가능 일정을 달력으로, 팀 1개의 불가능 일정을 히트맵으로 표시합니다.
// 달 보기, 주 보기 모두 칸을 누르면 그날의 타임라인을 modal 로 표시합니다. 막대에는 멤버, 일정 이름, 사유를 씁니다(사용자 결정 2026-10-16).
// 히트맵 주 보기는 빠지는 팀원 구성이 같은 연속 시간을 블록 하나로 묶어 이름을 한 번만 씁니다. 블록 색은 같은 시간에 빠지는 팀원 비율입니다.
// 달 보기 칸에는 그날 한 시간이라도 빠지는 팀원 이름을 씁니다. 시간 범위는 합주실 운영 시간 중 가장 넓은 범위입니다(roomBounds).

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import type { CSSProperties } from "react";

import { CalendarBar, useCalendarCursor } from "../components/CalendarBar";
import { MonthView, WeekView } from "../components/CalendarViews";
import { Empty, Segmented } from "../components/controls";
import { SearchIcon } from "../components/icons";
import { MemberSearch, TeamSearch } from "../components/Search";
import { Modal } from "../components/Modal";
import { useScrollToFirst } from "../components/hooks";
import { teamMembersQuery, useRooms } from "../components/queries";
import { offByDay, visibleDays } from "../lib/dayEntries";
import type { Member, MemberUnavailable, Team } from "../lib/contract";
import { loadState } from "../lib/loading";
import { heatByMonth, laneBars, offMembersOnDay, offRunsByDay, packColumns } from "../lib/unavailableMap";
import "../styles/unavailable.css";
import { MINUTES_PER_HOUR, WEEKDAY_NAMES, clockEndLabel, dayKey, dayWithWeekday, hourLabel, monthCells, roomBounds } from "../lib/calendar";
import { memberLabel } from "../lib/roster";

type Target = "member" | "team";
const TARGETS = [{ key: "member", text: "멤버" }, { key: "team", text: "팀" }] as const satisfies readonly { key: Target; text: string }[];

/** 히트맵 칸의 색 단계(0~4)입니다. 0명은 0, 나머지는 비율을 4단계로 올림합니다. */
function heatLevel(count: number, total: number): number {
  return count === 0 || total === 0 ? 0 : Math.ceil((count / total) * 4);
}

/** "18:00–20:00" 입니다. to 가 24 이면 hourLabel 이 "24:00" 을 만들지 못하므로 % 24 로 "00:00" 을 만든 뒤
 *  clockEndLabel 이 다른 화면과 같은 규칙으로 "24:00" 으로 되돌립니다. */
function hoursRangeLabel(from: number, to: number): string {
  return `${hourLabel(from)}–${clockEndLabel(hourLabel(to % 24))}`;
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
  const chosenLabel = target === "member"
    ? member === null ? null : memberLabel(member.name, member.cohort)
    : team?.name ?? null;

  return (
    <div className="calview">
      <div className="unavbar">
        <Segmented label="대상 종류" items={TARGETS} value={target} onChange={setTarget} />
        <button className="pickfield" aria-haspopup="dialog" aria-label={target === "member" ? "멤버 선택" : "팀 선택"} onClick={() => setPicking(true)}>
          <SearchIcon aria-hidden="true" />
          {chosen === null || chosenLabel === null
            ? <span className="ph">{target === "member" ? "멤버를 선택해주세요" : "팀을 선택해주세요"}</span>
            : <span>{chosenLabel}</span>}
        </button>
      </div>
      <CalendarBar cursor={cursor} />

      {target === "member"
        ? member === null
          ? <Empty text="멤버를 선택하면 그 멤버의 불가능 일정을 달력에 표시해요." />
          : <MemberCalendar times={times.filter((item) => item.member_id === member.id)} cursor={cursor} open={open} close={close} />
        : team === null
          ? <Empty text="팀을 선택하면 시간별로 불가능한 팀원을 표시해요." />
          : <TeamHeat times={times} team={team} cursor={cursor} open={open} close={close} />}

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

/** 멤버 1명의 불가능 일정 달력입니다. 대시보드의 달 보기와 주 보기를 그대로 쓰고, 주 보기는 운영 시간 줄만 그립니다. */
function MemberCalendar({ times, cursor, open, close }: ViewArgs & { times: MemberUnavailable[] }) {
  const [day, setDay] = useState<string | null>(null);
  const days = cursor.week ? cursor.weekDayKeys : visibleDays(cursor.year, cursor.month);
  const byDay = offByDay(times, open, days);
  const entriesOf = (key: string) => byDay[key] ?? [];
  const view = { tab: "me" as const, teams: [], entriesOf, openHour: open, slotCount: close - open, slotMinutes: MINUTES_PER_HOUR };
  const hours = Array.from({ length: close - open }, (_, i) => open + i);

  return (
    <>
      <div className="calbody">
        {cursor.week
          ? <WeekView dayKeys={cursor.weekDayKeys} closeHour={close} hours={hours} onOpen={setDay} {...view} />
          : <MonthView year={cursor.year} month={cursor.month} range={null} inFocus={() => false} onOpen={setDay} {...view} />}
      </div>
      {day === null ? null : (
        <DayModal day={day} open={open} close={close} onClose={() => setDay(null)}
          // 멤버 1명의 달력이라 lane 이 1개뿐이고 이름은 구분용이 아니라 표시용입니다. 선택 목록(MemberPicker)이 기수로 동명이인을 구분합니다.
          lanes={[{ label: times[0]?.member ?? "", items: times }]} />
      )}
    </>
  );
}

/** 팀 1개의 히트맵입니다. 주 보기는 요일 × 시간 시간표에 묶음 블록, 달 보기는 날짜 칸에 그날 빠지는 팀원 이름입니다. */
function TeamHeat({ times, team, cursor, open, close }: ViewArgs & { times: MemberUnavailable[]; team: Team }) {
  const [day, setDay] = useState<string | null>(null);
  const roster = useQuery(teamMembersQuery(team.id));
  if (!roster.isSuccess) return <Empty state={loadState(roster)} text="팀원을 불러오고 있어요." />;
  const members = roster.data;
  if (members.length === 0) return <Empty text="팀원이 없는 팀이에요." />;
  const ids = members.map((item) => item.id);
  // ponytail: 히트맵은 render 마다 다시 계산합니다. 팀원 10명, 한 달 기준으로 즉시 끝납니다. 느려지면 useMemo 로 묶습니다.
  // modal 은 동명이인을 구분하도록 기수를 붙입니다. 칸은 이름만 쓰고, 팀 안에 같은 이름이 있을 때만 기수를 붙입니다.
  const labelOf = (id: number): string => {
    const found = members.find((item) => item.id === id);
    return found === undefined ? "" : memberLabel(found.name, found.cohort);
  };
  const nameOf = (id: number): string => {
    const found = members.find((item) => item.id === id);
    if (found === undefined) return "";
    const twins = members.filter((item) => item.name === found.name).length;
    return twins > 1 ? labelOf(id) : found.name;
  };
  const heat = { times, ids, open, close, nameOf, onPick: setDay };

  return (
    <>
      <div className="calbody">
        {cursor.week
          ? <WeekHeat dayKeys={cursor.weekDayKeys} {...heat} />
          : <MonthHeat year={cursor.year} month={cursor.month} {...heat} />}
      </div>
      <HeatScale />
      {day === null ? null : (
        <DayModal day={day} open={open} close={close} onClose={() => setDay(null)}
          lanes={ids.map((id) => ({ label: labelOf(id), items: times.filter((item) => item.member_id === id) }))} />
      )}
    </>
  );
}

type HeatArgs = {
  times: MemberUnavailable[]; ids: number[]; open: number; close: number;
  nameOf: (id: number) => string; onPick: (day: string) => void;
};

function WeekHeat({ dayKeys, times, ids, open, close, nameOf, onPick }: HeatArgs & { dayKeys: string[] }) {
  const hours = Array.from({ length: close - open }, (_, i) => open + i);
  const runs = offRunsByDay(times, ids, dayKeys, open, close);
  // grid 의 1행은 요일 머리, 2행부터 open 시입니다. 열 1은 시각, 열 2부터 일요일입니다.
  // 블록이 행과 열을 지정하므로 격자 칸도 전부 행과 열을 지정합니다. 지정하지 않으면 격자 칸이 블록을 피해 밀립니다.
  const rowOf = (hour: number) => hour - open + 2;
  return (
    <div className="heatweek" aria-label="요일별 시간별 불가능 팀원" style={{ "--rows": hours.length } as CSSProperties}>
      <div className="hh" />
      {dayKeys.map((key, index) => (
        <div className={["hh", index === 0 ? "sun" : "", key === dayKey(new Date()) ? "today" : ""].filter(Boolean).join(" ")} key={key}>
          {WEEKDAY_NAMES[index]}<b>{Number(key.slice(8, 10))}</b>
        </div>
      ))}
      {hours.map((hour) => (
        <div className="hrow" key={hour}>
          <div className="ht" style={{ gridColumn: 1, gridRow: rowOf(hour) }}>{hourLabel(hour)}</div>
          {dayKeys.map((key, col) => (
            <button key={key} type="button" className="hc" style={{ gridColumn: col + 2, gridRow: rowOf(hour) }}
              aria-label={`${dayWithWeekday(key)} ${hourLabel(hour)}`} onClick={() => onPick(key)} />
          ))}
        </div>
      ))}
      {runs.flatMap((dayRuns, col) => dayRuns.map((run) => {
        const names = run.ids.map(nameOf);
        return (
          <button key={`${dayKeys[col]}-${run.from}`} type="button" className={`hb heat-${heatLevel(run.ids.length, ids.length)}`}
            style={{ gridColumn: col + 2, gridRow: `${rowOf(run.from)} / ${rowOf(run.to)}` }}
            aria-label={`${dayWithWeekday(dayKeys[col])} ${hoursRangeLabel(run.from, run.to)}, 불가능 팀원 ${names.join(", ")}`}
            onClick={() => onPick(dayKeys[col])}>
            <span className="who">{names.join(", ")}</span>
          </button>
        );
      }))}
    </div>
  );
}

function MonthHeat({ year, month, times, ids, open, close, nameOf, onPick }: HeatArgs & { year: number; month: number }) {
  const ymd = (day: number) => `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const cells = monthCells(year, month);
  // 칸 색은 그날 가장 많이 빠지는 시간의 인원 비율입니다. 이름은 그날 한 시간이라도 빠지는 팀원 전부입니다.
  const peak = heatByMonth(times, ids, cells.filter((day): day is number => day !== null).map(ymd), open, close);
  return (
    <>
      <div className="dow">{WEEKDAY_NAMES.map((name) => <span key={name}>{name}</span>)}</div>
      <div className="grid">
        {cells.map((day, index) => {
          if (day === null) return <div className="cell void" key={`void-${index}`} />;
          const key = ymd(day);
          const names = offMembersOnDay(times, ids, key, open, close).map(nameOf);
          return (
            <button key={key} className={`cell heat-${heatLevel(peak[key] ?? 0, ids.length)}${index % 7 === 0 ? " sun" : ""}`}
              aria-label={`${dayWithWeekday(key)}, 불가능 팀원 ${names.length === 0 ? "없음" : names.join(", ")}`}
              onClick={() => onPick(key)}>
              <span className="n">{day}</span>
              {names.length === 0 ? null : <span className="who">{names.join(", ")}</span>}
            </button>
          );
        })}
      </div>
    </>
  );
}

/** 하루 타임라인 modal 입니다. 그날 일정이 있는 멤버마다 열 1개이고, 막대에는 멤버, 일정 이름, 사유만 표시합니다. */
function DayModal({ day, lanes, open, close, onClose }: {
  day: string; lanes: { label: string; items: MemberUnavailable[] }[]; open: number; close: number; onClose: () => void;
}) {
  const rows = Array.from({ length: close - open }, (_, i) => open + i);
  const shown = lanes
    .map((lane) => ({ label: lane.label, bars: laneBars(lane.items, day, open, close) }))
    // 같은 팀원의 일정끼리 겹치면 열을 나눠 옆에 놓습니다.
    .map((lane) => {
      const cols = packColumns(lane.bars);
      return { ...lane, bars: lane.bars.map((bar, at) => ({ ...bar, ...cols[at] })) };
    })
    .filter((lane) => lane.bars.length > 0);
  const bars = shown.flatMap((lane) => lane.bars);
  const first = bars.length === 0 ? null : Math.min(...bars.map((bar) => bar.from));
  const firstId = bars.find((bar) => bar.from === first)?.item.id;
  const box = useScrollToFirst(first);

  return (
    <Modal title={dayWithWeekday(day)} onClose={onClose}>
      {shown.length === 0 ? <Empty text="이날은 불가능 일정이 존재하지 않아요." /> : (
        <div className="offtl" ref={box} style={{ "--lanes": shown.length, "--rows": rows.length } as CSSProperties}>
          <div className="hrs" aria-hidden="true">
            {rows.map((hour, i) => <span key={hour} style={{ "--i": i } as CSSProperties}>{hourLabel(hour)}</span>)}
          </div>
          {shown.map((lane, index) => (
            // label 은 팀 보기에서 동명이인이면 기수가 붙지만(labelOf) 같은 이름, 같은 기수는 구분하지 못하므로 index 를 key 에 더합니다.
            <div className="lane" key={`${index}-${lane.label}`}>
              {lane.bars.map(({ item, from, to, col, cols }) => (
                <span className="evb off" key={item.id} data-first={item.id === firstId ? "" : undefined} style={{ "--from": from - open, "--span": to - from, "--col": col, "--cols": cols } as CSSProperties}>
                  <b>{item.member}</b>
                  <span>{item.name ?? "불가능 일정"}</span>
                  {item.reason === null || item.reason === "" ? null : <small>{item.reason}</small>}
                </span>
              ))}
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

/** 색 단계 범례입니다. 색이 진할수록 같은 시간에 빠지는 팀원 비율이 큽니다. */
function HeatScale() {
  return (
    <div className="heatscale">
      <span>같은 시간에 빠지는 팀원</span>
      <span>적음</span>
      {[1, 2, 3, 4].map((level) => <i key={level} className={`heat-${level}`} aria-hidden="true" />)}
      <span>많음</span>
    </div>
  );
}
