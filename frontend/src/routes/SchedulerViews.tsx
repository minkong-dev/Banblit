// 달력 화면(routes/Scheduler)의 달 보기와 주 보기입니다. 값을 보유하지 않으며, 표시할 항목은 부모가 entriesOf 로 넘깁니다.

import { Fragment, useEffect, useRef } from "react";
import type { CSSProperties } from "react";

import { visible } from "../lib/dayEntries";
import type { DayTab, Entry } from "../lib/dayEntries";
import type { DayTeam } from "../lib/roster";
import {
  dayKey, dayWithWeekday, hoursLabel, isRangeFree, monthCells, slotLabel, takenGrid, WEEKDAY_NAMES,
} from "../lib/pipeline";
import { entryClass, entryName } from "./DayDialogParts";

type ViewProps = {
  tab: DayTab;
  teams: DayTeam[];
  entriesOf: (key: string) => Entry[];
  openHour: number;
  slotCount: number;
  /** 설정의 점유 단위(분)입니다. 점유 판정의 칸 길이입니다. */
  slotMinutes: number;
};

/** 달 보기입니다. 예약 탭에서는 날짜마다 남은 시간을, 다른 탭에서는 그날 항목 3개까지를 표시합니다. */
export function MonthView({
  year, month, range, inFocus, onOpen, tab, teams, entriesOf, openHour, slotCount, slotMinutes,
}: ViewProps & {
  year: number;
  month: number;
  /** 위쪽 시간 선택에서 시작·끝을 둘 다 지정했으면 그 범위입니다. */
  range: { from: number; to: number } | null;
  inFocus: (key: string) => boolean;
  onOpen: (key: string) => void;
}) {
  const cells = monthCells(year, month);
  const ymd = (day: number) =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const label = (index: number) => slotLabel(index, openHour);
  const gridOf = (key: string) =>
    takenGrid(entriesOf(key).filter((entry) => entry.kind !== "off"), slotCount, slotMinutes);

  return (
    <>
      <div className="dow">
        {WEEKDAY_NAMES.map((name) => <span key={name}>{name}</span>)}
      </div>
      <div className="grid">
        {cells.map((day, index) => {
          if (day === null) return <div className="cell void" key={`void-${index}`} />;

          const key = ymd(day);
          const weekday = index % 7;
          // 오늘 칸은 어느 탭에서나 테두리로 표시합니다. 날짜 문자열끼리 비교하므로 시각은 영향을 주지 않습니다.
          const marks = [weekday === 0 ? "sun" : "", key === dayKey(new Date()) ? "today" : ""].filter(Boolean);
          let blocked = false;
          let inner = null;

          if (tab === "book") {
            if (inFocus(key)) {
              blocked = true;
              inner = <div className="avail auto"><span className="big">자동 배정</span></div>;
            } else if (range !== null) {
              const free = isRangeFree(gridOf(key), range.from, range.to, slotMinutes);
              blocked = !free;
              inner = (
                <div className="avail">
                  {free
                    ? <span className="yes">예약 가능</span>
                    : <span className="no">해당시간 마감</span>}
                </div>
              );
            } else {
              // 남은 시간과 마감 판정은 점유 단위 칸으로 계산하고, meter 막대는 1시간 칸으로 그립니다.
              // 막대까지 점유 단위로 그리면 5분 단위에서 날짜 하나에 막대가 144개가 됩니다.
              const left = gridOf(key).filter((taken) => !taken).length;
              const grid = takenGrid(entriesOf(key).filter((entry) => entry.kind !== "off"), slotCount);
              blocked = left === 0;
              inner = (
                <div className={left === 0 ? "avail none" : "avail"}>
                  <span className="big">
                    {left === 0 ? "예약 마감" : <>{hoursLabel(left, slotMinutes)}<small>예약 가능</small></>}
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
                  <span className={`ev ${entryClass(entry)}`} key={i}>
                    {entryName(entry, teams)}
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
              onClick={() => onOpen(key)}
            >
              <span className="n">{day}</span>
              {inner}
            </button>
          );
        })}
      </div>
    </>
  );
}

// 주 보기는 합주실이 여는 시간만이 아니라 하루를 통째로 표시합니다. 합주실마다 여는 시각이 달라도
// 같은 줄에 같은 시각이 오고, 합주실을 변경해도 줄이 밀리지 않습니다. 대신 줄이 많아 늘 스크롤이
// 생기므로, 주 보기로 들어올 때 합주가 있는 구간으로 자동 스크롤합니다(WeekView 의 useEffect).
const WEEK_FIRST_HOUR = 1;
const WEEK_LAST_HOUR = 23;
const WEEK_HOURS = Array.from(
  { length: WEEK_LAST_HOUR - WEEK_FIRST_HOUR + 1 },
  (_, i) => WEEK_FIRST_HOUR + i,
);

function hourLabel(hour: number): string {
  return `${String(hour).padStart(2, "0")}:00`;
}

/** 주 보기입니다. dayKeys 는 일요일부터 7일치 날짜라 배열의 index 가 곧 요일입니다. */
export function WeekView({
  dayKeys, closeHour, tab, teams, entriesOf, openHour, slotCount,
}: ViewProps & { dayKeys: string[]; closeHour: number }) {
  const label = (index: number) => slotLabel(index, openHour);
  const endLabel = (index: number) => (index >= slotCount ? `${closeHour}:00` : label(index));

  // 하루 23줄 중 합주는 합주실이 여는 시간의 줄에만 있습니다. 주 보기로 들어올 때마다 그 줄이
  // 맨 위에 오게 스크롤합니다. 스크롤하지 않으면 항상 01:00 부터 보게 되어 매번 사용자가 스크롤해야 합니다.
  // 줄 높이는 CSS 가 결정하므로 계산하지 않고 실제로 렌더링된 위치를 측정합니다.
  const box = useRef<HTMLDivElement>(null);
  const firstDay = dayKeys[0];
  useEffect(() => {
    const row = box.current?.querySelector<HTMLElement>(`[data-hour="${openHour}"]`);
    if (!box.current || !row) return;
    box.current.scrollTop += row.getBoundingClientRect().top - box.current.getBoundingClientRect().top;
  }, [firstDay, openHour, tab]);

  return (
    <div className="weekscroll" ref={box}>
      <div className="weekgrid">
        <div className="wh" />
        {dayKeys.map((key, index) => (
          <div className={["wh", index === 0 ? "sun" : "", key === dayKey(new Date()) ? "today" : ""].filter(Boolean).join(" ")} key={key}>
            {WEEKDAY_NAMES[index]}<b>{Number(key.slice(8, 10))}</b>
          </div>
        ))}
        {WEEK_HOURS.map((hour) => (
          <Fragment key={hour}>
            <div className="wt" data-hour={hour}>{hourLabel(hour)}</div>
            {dayKeys.map((key) => {
              // 막대는 시작 시각이 속한 시간 줄에 두고, 줄 안에서는 --offset(0~1) 만큼 내려 그립니다.
              // 18:10 시작이면 18시 줄에 1/6 만큼 내려간 자리입니다.
              const entry = visible(entriesOf(key), tab, teams)
                .find((item) => Math.floor(item.a) + openHour === hour);
              return (
                <div className="wcell" key={`${key}-${hour}`}>
                  {entry === undefined ? null : (
                    <span className={`blk ${entryClass(entry)}`}
                      style={{ "--offset": entry.a - Math.floor(entry.a), "--span": entry.b - entry.a } as CSSProperties}>
                      {entryName(entry, teams)}
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
}
