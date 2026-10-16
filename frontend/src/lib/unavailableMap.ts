// 불가능 일정 화면의 팀 히트맵이 사용하는 계산입니다. 시간 1칸마다 불가능 일정이 있는 팀원 수를 셉니다.
// 반복 전개는 lib/dayEntries 의 repeatDays 와 같은 규칙을 사용합니다. 서버나 화면과 상호작용하지 않습니다.

import { shiftDay } from "./calendar";
import type { Unavailable } from "./contract";
import { repeatDays } from "./dayEntries";

const MINUTES_PER_HOUR = 60;
const HOURS_PER_DAY = 24;
const MINUTES_PER_DAY = HOURS_PER_DAY * MINUTES_PER_HOUR;

/** "2026-10-12T18:30:00" 을 1970-01-01 00:00 부터의 분으로 변환합니다. 시간대를 적용하지 않습니다. */
function isoMinutes(iso: string): number {
  const part = (from: number, to: number): number => Number(iso.slice(from, to));
  return Date.UTC(part(0, 4), part(5, 7) - 1, part(8, 10), part(11, 13), part(14, 16)) / 60_000;
}

/** item 이 day 의 hour 시부터 1시간과 겹치면 true 입니다. 전날 시작해 day 로 넘어온 일정도 셉니다.
 *  ponytail: 이틀 전에 시작한 일정(길이 24시간 초과)은 세지 않습니다. 그런 일정이 생기면 확인할 날짜를 길이만큼 늘립니다. */
function covers(item: Unavailable, day: string, hour: number): boolean {
  const length = isoMinutes(item.ends_at) - isoMinutes(item.starts_at);
  const startClock = isoMinutes(item.starts_at) - isoMinutes(`${item.starts_at.slice(0, 10)}T00:00`);
  const previous = shiftDay(day, -1);
  return repeatDays(item, [previous, day]).some((occurrence) => {
    const start = startClock - (occurrence === day ? 0 : MINUTES_PER_DAY);
    return start < (hour + 1) * MINUTES_PER_HOUR && hour * MINUTES_PER_HOUR < start + length;
  });
}

/** day 의 hour 시부터 1시간 동안 불가능 일정이 있는 멤버 번호입니다. memberIds 에 없는 멤버는 제외합니다. */
export function offMembersAt(times: Unavailable[], memberIds: number[], day: string, hour: number): number[] {
  const team = new Set(memberIds);
  const off = new Set(times.filter((item) => team.has(item.member_id) && covers(item, day, hour)).map((item) => item.member_id));
  return memberIds.filter((id) => off.has(id));
}

/** dayKeys 마다 open 시부터 close 시 전까지, 시간별 불가능 팀원 수입니다. [날짜 순서][open 부터의 시간] 입니다. */
export function heatByWeek(
  times: Unavailable[], memberIds: number[], dayKeys: string[], open: number, close: number,
): number[][] {
  const hours = Array.from({ length: close - open }, (_, i) => open + i);
  return dayKeys.map((day) => hours.map((hour) => offMembersAt(times, memberIds, day, hour).length));
}

/** dayKeys 마다 open 시부터 close 시 전까지 중 가장 많이 빠지는 시간의 불가능 팀원 수입니다. */
export function heatByMonth(
  times: Unavailable[], memberIds: number[], dayKeys: string[], open: number, close: number,
): Record<string, number> {
  const week = heatByWeek(times, memberIds, dayKeys, open, close);
  return Object.fromEntries(dayKeys.map((day, i) => [day, Math.max(0, ...week[i])]));
}

/** day 의 open 시부터 close 시 전까지 한 시간이라도 불가능 일정이 있는 팀원 번호를 memberIds 순서로 반환합니다. */
export function offMembersOnDay(
  times: Unavailable[], memberIds: number[], day: string, open: number, close: number,
): number[] {
  const off = new Set(offRuns(times, memberIds, day, open, close).flatMap((run) => run.ids));
  return memberIds.filter((id) => off.has(id));
}

/** 빠지는 팀원이 같은 연속 시간 1묶음입니다. from 시부터 to 시 전까지입니다. */
export type OffRun = { from: number; to: number; ids: number[] };

/** day 의 open 시부터 close 시 전까지, 빠지는 팀원 구성이 같은 연속 시간을 묶어 반환합니다. 아무도 빠지지 않는 시간은 제외합니다. */
export function offRuns(
  times: Unavailable[], memberIds: number[], day: string, open: number, close: number,
): OffRun[] {
  const runs: OffRun[] = [];
  for (let hour = open; hour < close; hour += 1) {
    const ids = offMembersAt(times, memberIds, day, hour);
    if (ids.length === 0) continue;
    const last = runs.at(-1);
    if (last !== undefined && last.to === hour && last.ids.join() === ids.join()) {
      runs[runs.length - 1] = { ...last, to: hour + 1 };
    } else {
      runs.push({ from: hour, to: hour + 1, ids });
    }
  }
  return runs;
}

/** dayKeys 순서로 날짜마다 offRuns 를 반환합니다. */
export function offRunsByDay(
  times: Unavailable[], memberIds: number[], dayKeys: string[], open: number, close: number,
): OffRun[][] {
  return dayKeys.map((day) => offRuns(times, memberIds, day, open, close));
}

/** item 이 day 안에서 차지하는 시각 범위(소수 시간)입니다. 반복 일정은 그날 반복되는 회차를 쓰고, 전날 회차가 자정을 넘으면 0 부터입니다.
 *  그날에 없으면 null 입니다. */
export function dayHours(item: Unavailable, day: string): { from: number; to: number } | null {
  const length = (isoMinutes(item.ends_at) - isoMinutes(item.starts_at)) / MINUTES_PER_HOUR;
  const start = (isoMinutes(item.starts_at) - isoMinutes(`${item.starts_at.slice(0, 10)}T00:00`)) / MINUTES_PER_HOUR;
  if (repeatDays(item, [day]).includes(day)) return { from: start, to: Math.min(HOURS_PER_DAY, start + length) };
  const spill = start + length - HOURS_PER_DAY;
  if (spill > 0 && repeatDays(item, [shiftDay(day, -1)]).length > 0) return { from: 0, to: Math.min(HOURS_PER_DAY, spill) };
  return null;
}

/** 겹치는 막대를 옆으로 나눌 열 번호(col)와, 그 막대가 속한 겹침 묶음의 열 수(cols)입니다. 결과는 입력 순서입니다.
 *  끝난 열은 다시 씁니다. 겹치지 않는 막대는 { col: 0, cols: 1 } 입니다. */
export function packColumns(bars: { from: number; to: number }[]): { col: number; cols: number }[] {
  const order = bars.map((_, index) => index).sort((a, b) => bars[a].from - bars[b].from);
  const placed: { col: number; cols: number }[] = bars.map(() => ({ col: 0, cols: 1 }));
  let group: number[] = [];
  let ends: number[] = [];
  const flush = () => group.forEach((index) => { placed[index] = { ...placed[index], cols: ends.length }; });
  for (const index of order) {
    const { from, to } = bars[index];
    if (group.length > 0 && from >= Math.max(...ends)) { flush(); group = []; ends = []; }
    const free = ends.findIndex((end) => end <= from);
    const col = free === -1 ? ends.length : free;
    ends = ends.map((end, at) => (at === col ? to : end)).concat(free === -1 ? [to] : []);
    placed[index] = { col, cols: 1 };
    group = [...group, index];
  }
  flush();
  return placed;
}
