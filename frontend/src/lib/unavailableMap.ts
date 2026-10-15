// 불가능 일정 화면의 팀 히트맵이 사용하는 계산입니다. 시간 1칸마다 불가능 일정이 있는 팀원 수를 셉니다.
// 반복 전개는 lib/dayEntries 의 repeatDays 와 같은 규칙을 사용합니다. 서버나 화면과 상호작용하지 않습니다.

import { shiftDay } from "./calendar";
import type { Unavailable } from "./contract";
import { repeatDays } from "./dayEntries";

const MINUTES_PER_HOUR = 60;
const MINUTES_PER_DAY = 24 * MINUTES_PER_HOUR;

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
