// 달력 위의 이전/다음 버튼, 표시 중인 달 또는 주, 월/주 전환입니다. 대시보드(routes/Scheduler)와
// 불가능 일정 화면(routes/UnavailableCalendar)이 같은 markup 과 이동 규칙을 씁니다.

import { useState } from "react";

import { currentMonth, dayKey, weekKeys, weekLabel, weekShiftFor } from "../lib/calendar";
import { NavButton } from "./controls";
import "../styles/calendar.css";

export type CalendarCursor = {
  week: boolean;
  setWeek: (week: boolean) => void;
  year: number;
  month: number;
  /** 주 보기의 일요일부터 7일치 날짜입니다. */
  weekDayKeys: string[];
  /** 달 보기에서는 달을, 주 보기에서는 주를 step 만큼 이동합니다. */
  shift: (step: number) => void;
};

/** 달력의 표시 위치입니다. 주 보기는 처음에 오늘이 든 주이고, 달을 이동하면 그 달 15일이 포함된 주로 돌아갑니다. */
export function useCalendarCursor(): CalendarCursor {
  const [week, setWeek] = useState(false);
  const [cursor, setCursor] = useState(currentMonth);
  const [weekShift, setWeekShift] = useState(() => weekShiftFor(cursor.year, cursor.month, dayKey(new Date())));
  const shift = (step: number) => {
    if (week) {
      setWeekShift(weekShift + step);
      return;
    }
    const moved = new Date(cursor.year, cursor.month + step, 1);
    setCursor({ year: moved.getFullYear(), month: moved.getMonth() });
    setWeekShift(0);
  };
  return { week, setWeek, ...cursor, weekDayKeys: weekKeys(cursor.year, cursor.month, weekShift), shift };
}

export function CalendarBar({ cursor }: { cursor: CalendarCursor }) {
  const { week, setWeek, year, month, weekDayKeys, shift } = cursor;
  return (
    <div className="calbar">
      <NavButton dir="prev" className="navb" label={week ? "저번 주" : "저번 달"} onClick={() => shift(-1)} />
      <span className="ml">{week ? weekLabel(weekDayKeys) : `${year}년 ${month + 1}월`}</span>
      <NavButton dir="next" className="navb" label={week ? "다음 주" : "다음 달"} onClick={() => shift(1)} />
      <div className="seg" role="group" aria-label="레이아웃 변경">
        <button aria-pressed={!week} onClick={() => setWeek(false)}>월</button>
        <button aria-pressed={week} onClick={() => setWeek(true)}>주</button>
      </div>
    </div>
  );
}
