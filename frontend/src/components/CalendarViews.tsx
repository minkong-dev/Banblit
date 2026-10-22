// 달력의 달 보기와 주 보기입니다. 대시보드(routes/Scheduler)와 불가능 일정 화면(routes/UnavailableCalendar)이 씁니다.
// 값을 보유하지 않으며, 표시할 항목은 부모가 entriesOf 로 넘깁니다.

import { Fragment, useEffect, useRef, useState } from "react";
import type { CSSProperties, ReactNode } from "react";

import { entryClass, entryName, visible } from "../lib/dayEntries";
import type { DayTab, Entry } from "../lib/dayEntries";
import type { DayTeam } from "../lib/roster";
import "../styles/calendar.css";
import { MINUTES_PER_HOUR, WEEKDAY_NAMES, dayKey, dayWithWeekday, hourLabel, hoursLabel, isRangeFree, monthCells, slotLabel, takenGrid, withPastTaken } from "../lib/calendar";

type ViewProps = {
  tab: DayTab;
  teams: DayTeam[];
  entriesOf: (key: string) => Entry[];
  openHour: number;
  slotCount: number;
  /** 설정의 점유 단위(분)입니다. 점유 판정의 칸 길이입니다. */
  slotMinutes: number;
};

const NOW_REFRESH_MS = 60_000;

/** 현재 시각입니다. 1분마다 갱신해, 화면을 열어 둔 채 정각이나 자정을 넘겨도 오늘 표시와 지난 칸 판정이 따라갑니다.
 *  브라우저 시계와 시간대를 그대로 씁니다. 서버는 시간대 없는 값을 서버 시계로 비교하므로, 사용자 PC 의 시간대가
 *  서버와 다르면 지난 칸 판정이 어긋납니다. 시간대 지원은 미구현입니다. 배정 엔진이 시간대 없는 값만 받으므로 화면도 붙이지 않습니다. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), NOW_REFRESH_MS);
    return () => clearInterval(id);
  }, []);
  return now;
}

/** 달 보기입니다. 예약 탭에서는 날짜마다 남은 시간을, 다른 탭에서는 그날 항목 3개까지를 표시합니다. */
type CellContent = { blocked: boolean; inner: ReactNode };

/** 예약 탭의 날짜 칸 내용입니다. 지난 날짜는 누를 수 없고(blocked) 아무것도 표시하지 않습니다. 집중 합주기간은 자동 배정,
 *  시간 범위를 지정했으면 그 범위의 예약 가능 여부, 그 밖에는 남은 시간과 meter 를 표시합니다. */
function bookCell(args: {
  key: string;
  today: string;
  inFocus: boolean;
  range: { from: number; to: number } | null;
  gridOf: (key: string, minutes?: number) => boolean[];
  slotMinutes: number;
}): CellContent {
  const { key, today, inFocus, range, gridOf, slotMinutes } = args;
  // 지난 날짜는 서버가 예약을 거절하므로 누를 수 없게 두고 남은 시간도 표시하지 않습니다.
  // "YYYY-MM-DD" 문자열은 사전순 비교가 날짜순 비교와 같습니다.
  if (key < today) return { blocked: true, inner: null };
  if (inFocus) return { blocked: true, inner: <div className="avail auto"><span className="big">자동 배정</span></div> };
  if (range !== null) {
    const free = isRangeFree(gridOf(key), range.from, range.to, slotMinutes);
    return {
      blocked: !free,
      inner: (
        <div className="avail">
          {free
            ? <span className="yes">예약 가능</span>
            : <span className="no">해당 시간 마감</span>}
        </div>
      ),
    };
  }
  // 남은 시간과 마감 판정은 점유 단위 칸으로 계산하고, meter 막대는 1시간 칸으로 그립니다.
  // 막대까지 점유 단위로 그리면 5분 단위에서 날짜 하나에 막대가 144개가 됩니다.
  const left = gridOf(key).filter((taken) => !taken).length;
  const grid = gridOf(key, MINUTES_PER_HOUR);
  return {
    blocked: left === 0,
    inner: (
      <div className={left === 0 ? "avail none" : "avail"}>
        <span className="big">
          {left === 0 ? "예약 마감" : <>{hoursLabel(left, slotMinutes)}<small>예약 가능</small></>}
        </span>
        <span className="meter" aria-hidden="true">
          {grid.map((taken, i) => <i className={taken ? "on" : ""} key={i} />)}
        </span>
      </div>
    ),
  };
}

/** 내 일정, 전체 일정 탭의 날짜 칸 내용입니다. 항목 3개까지 표시하고 나머지는 개수로 표시합니다. 칸은 항상 누를 수 있습니다. */
function entryCell(list: Entry[], teams: DayTeam[], label: (index: number) => string): CellContent {
  return {
    blocked: false,
    inner: (
      <>
        {list.slice(0, 3).map((entry, i) => (
          <span className={`ev ${entryClass(entry)}`} key={i}>
            <span className="nm">{entryName(entry, teams)}</span>
            <time>{label(entry.a)}</time>
          </span>
        ))}
        {list.length > 3 ? <span className="plus">+{list.length - 3}</span> : null}
      </>
    ),
  };
}

export function MonthView({
  year, month, range, inFocus, onOpen, tab, teams, entriesOf, openHour, slotCount, slotMinutes,
}: ViewProps & {
  year: number;
  month: number;
  /** 위쪽 시간 선택에서 시작 시간과 종료 시간을 둘 다 지정했으면 그 범위입니다. */
  range: { from: number; to: number } | null;
  inFocus: (key: string) => boolean;
  onOpen: (key: string) => void;
}) {
  const cells = monthCells(year, month);
  const now = useNow();
  const today = dayKey(now);
  const ymd = (day: number) =>
    `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  const label = (index: number) => slotLabel(index, openHour);
  // 오늘 날짜는 시작 시간이 지난 칸을 찬 칸으로 계산합니다. 서버가 그 시각의 예약을 거절하므로 남은 시간에서 제외합니다.
  const gridOf = (key: string, minutes: number = slotMinutes) => {
    const grid = takenGrid(entriesOf(key).filter((entry) => entry.kind !== "off"), slotCount, minutes);
    return key === today ? withPastTaken(grid, now, openHour, minutes) : grid;
  };

  return (
    <>
      <div className="dow">
        {WEEKDAY_NAMES.map((name) => <span key={name}>{name}</span>)}
      </div>
      {/* key 로 달이나 탭이 바뀔 때 칸 묶음을 새로 그려 calendar.css 의 넘김 움직임이 다시 재생되게 합니다. */}
      <div className="grid" key={`${year}-${month}-${tab}`}>
        {cells.map((day, index) => {
          if (day === null) return <div className="cell void" key={`void-${index}`} />;

          const key = ymd(day);
          const weekday = index % 7;
          // 오늘 칸은 어느 탭에서나 테두리로 표시합니다. 날짜 문자열끼리 비교하므로 시각은 영향을 주지 않습니다.
          const marks = [weekday === 0 ? "sun" : "", key === today ? "today" : ""].filter(Boolean);
          const { blocked, inner } = tab === "book"
            ? bookCell({ key, today, inFocus: inFocus(key), range, gridOf, slotMinutes })
            : entryCell(visible(entriesOf(key), tab, teams), teams, label);
          if (tab === "book" && !blocked) marks.push("pickable");

          return (
            <button
              key={key}
              className={["cell", ...marks].join(" ")}
              disabled={blocked}
              // 지난 날짜는 누를 수 없는 이유를 스크린 리더에 알립니다. 화면에는 표시하지 않습니다.
              aria-label={tab === "book" && key < today ? `${dayWithWeekday(key)}, 지난 날짜라 예약할 수 없어요` : dayWithWeekday(key)}
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
// 00:00 줄은 두지 않습니다. 합주실은 늦어도 다음 날 00:00 에 닫으므로(LATEST_CLOSE_NEXT_DAY) 00:00 에 시작하는 일정이 없고,
// 00:00 은 전날 마지막 줄의 종료 시간으로만 표시합니다.
const WEEK_FIRST_HOUR = 1;
const WEEK_LAST_HOUR = 23;
const WEEK_HOURS = Array.from(
  { length: WEEK_LAST_HOUR - WEEK_FIRST_HOUR + 1 },
  (_, i) => WEEK_FIRST_HOUR + i,
);

/** 주 보기입니다. dayKeys 는 일요일부터 7일치 날짜라 배열의 index 가 곧 요일입니다.
 *  onOpen 을 넘기면 칸이 버튼이 되고, 칸을 누르면 그 칸의 날짜로 onOpen 을 호출합니다.
 *  hours 를 넘기면 그 시각 줄만 표시합니다. 기본값은 WEEK_HOURS 입니다. */
export function WeekView({
  dayKeys, closeHour, tab, teams, entriesOf, openHour, slotCount, onOpen, hours = WEEK_HOURS,
}: ViewProps & { dayKeys: string[]; closeHour: number; onOpen?: (key: string) => void; hours?: number[] }) {
  const label = (index: number) => slotLabel(index, openHour);
  const endLabel = (index: number) => (index >= slotCount ? hourLabel(closeHour) : label(index));
  // 오늘 판정에 useNow 를 씁니다. new Date() 를 렌더링마다 읽으면 화면을 열어 둔 채 자정이 지나도 다시 렌더링되기 전에는 옛 날짜입니다.
  const today = dayKey(useNow());

  // 하루 23줄 중 합주는 합주실이 여는 시간의 줄에만 있습니다. 주 보기로 들어올 때마다 그 줄이
  // 맨 위에 오게 스크롤합니다. 스크롤하지 않으면 항상 01:00 부터 보게 되어 매번 사용자가 스크롤해야 합니다.
  // 줄 높이는 CSS 가 결정하므로 계산하지 않고 실제로 렌더링된 위치를 측정합니다.
  const box = useRef<HTMLDivElement>(null);
  const firstDay = dayKeys[0];
  useEffect(() => {
    const row = box.current?.querySelector<HTMLElement>(`[data-hour="${openHour}"]`);
    if (!box.current || !row) return;
    // 요일 머리글은 스크롤해도 맨 위에 고정되므로, 그 높이만큼 덜 내려야 여는 시각 줄이 머리글 바로 아래에 보입니다.
    const header = box.current.querySelector(".wh")?.getBoundingClientRect().height ?? 0;
    const rowRect = row.getBoundingClientRect();
    const target = box.current.scrollTop + rowRect.top - box.current.getBoundingClientRect().top - header;
    // 늦게 여는 합주실은 목표가 스크롤 최댓값을 넘어 잘립니다. 잘린 위치는 줄 경계와 어긋나 맨 위 시각 글자가
    // 머리글에 반쯤 가려지므로, 줄 높이 단위로 올려 경계에 맞춥니다. 모든 줄의 높이는 같습니다.
    const overshoot = target - (box.current.scrollHeight - box.current.clientHeight);
    const step = rowRect.height;
    box.current.scrollTop = overshoot > 0 && step > 0 ? target - Math.ceil(overshoot / step) * step : target;
  }, [firstDay, openHour, tab]);

  return (
    <div className="weekscroll" ref={box}>
      <div className="weekgrid">
        <div className="wh" />
        {dayKeys.map((key, index) => (
          <div className={["wh", index === 0 ? "sun" : "", key === today ? "today" : ""].filter(Boolean).join(" ")} key={key}>
            {WEEKDAY_NAMES[index]}<b>{Number(key.slice(8, 10))}</b>
          </div>
        ))}
        {hours.map((hour) => (
          <Fragment key={hour}>
            <div className="wt" data-hour={hour}>{hourLabel(hour)}</div>
            {dayKeys.map((key) => {
              // 막대는 시작 시간이 속한 시간 줄에 두고, 줄 안에서는 --offset(0~1) 만큼 내려 그립니다.
              // 18:10 시작이면 18시 줄에 1/6 만큼 내려간 자리입니다.
              // ponytail: 같은 시간에 시작하는 항목이 2개 이상이면(합주실이 다른 배정 등) 첫 항목만 그립니다. 전부 그리려면
              // 칸을 가로로 나누는 열 배치(lib/unavailableMap.ts 의 packColumns 와 같은 방식)가 필요합니다. 하루 modal 에는 전부 나옵니다.
              const entry = visible(entriesOf(key), tab, teams)
                .find((item) => Math.floor(item.a) + openHour === hour);
              const block = entry === undefined ? null : (
                <span className={`blk ${entryClass(entry)}`}
                  // CSSProperties 타입에는 --offset 같은 CSS 변수 이름이 없어 as 로 단정합니다. 값은 calendar.css 가 calc 로 읽습니다.
                  style={{ "--offset": entry.a - Math.floor(entry.a), "--span": entry.b - entry.a } as CSSProperties}>
                  {entryName(entry, teams)}
                  {/* 합주실명을 함께 표시합니다. 맞닿은 두 slot 이 따로 렌더링되는 유일한 이유가
                      합주실이 다른 것인데, 합주실을 표시하지 않으면 왜 나뉘었는지 알 수 없습니다. */}
                  <small>
                    {label(entry.a)}–{endLabel(entry.b)}
                    {entry.room === undefined ? "" : ` ${entry.room}`}
                  </small>
                </span>
              );
              if (onOpen === undefined) return <div className="wcell" key={`${key}-${hour}`}>{block}</div>;
              // aria-label 이 버튼 안의 글자를 대신하므로 칸의 일정 이름을 함께 넣습니다.
              const name = entry === undefined ? "" : `, ${entryName(entry, teams)}`;
              return (
                <button type="button" className="wcell" key={`${key}-${hour}`}
                  aria-label={`${dayWithWeekday(key)} ${hourLabel(hour)}${name}`} onClick={() => onOpen(key)}>
                  {block}
                </button>
              );
            })}
          </Fragment>
        ))}
      </div>
    </div>
  );
}
