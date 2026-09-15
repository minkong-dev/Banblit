// 달력 하루에 표시할 항목(Entry)을 서버 자료에서 만드는 계산입니다. 화면이나 서버와 상호작용하지 않습니다.

import { dayOf, mergeSessions, slotIndex } from "./slots";
import type { Session } from "./slots";
import type { DayTeam } from "./roster";
import type { Period, Reservation, Room, ScheduleRow, Team, Unavailable } from "./contract";

const DAYS_PER_WEEK = 7;

/** 하루에 표시하는 항목 하나입니다. 배정은 서버가 계산한 항목, 전체합주는 기간 설정에서 온 항목이고,
 *  예약과 불가능 일정은 사용자가 등록한 항목입니다. */
export type Entry = {
  kind: "assign" | "book" | "off" | "ensemble";
  team: string | null;
  room?: string;
  who?: string;
  /** 불가능 일정에 적은 사유입니다. 이름(who)과 따로 표시합니다. */
  note?: string;
  a: number;
  b: number;
  /** 로그인한 사용자가 삭제할 수 있는 불가능 일정이면, 삭제할 때 서버에 넘길 id 입니다.
   *  없으면 반복으로 전개한 항목이라 화면에서 삭제하지 못합니다. */
  removeIds?: number[];
  /** 로그인한 사용자가 취소할 수 있는 예약이면 그 예약의 번호입니다. 없으면 다른 사용자의
   *  예약이거나 서버가 배정한 일정이라 화면에서 취소하지 못합니다. */
  bookingId?: number;
};

export type DayEntries = Record<string, Entry[]>;

/** 달력 화면의 탭입니다. 내 일정, 예약, 전체 일정 순서입니다. */
export type DayTab = "me" | "book" | "all";

/** 그날 화면에 표시할 항목만 선택합니다. 내 일정 탭은 내 팀의 배정·전체합주·내 불가능 시간,
 *  전체 일정 탭은 배정·전체합주·예약 전부입니다. 전체합주는 모든 멤버의 일정이라 두 탭 모두에 있습니다. */
export function visible(entries: Entry[], tab: DayTab, teams: DayTeam[]): Entry[] {
  const mine = new Set(teams.filter((team) => team.mine).map((team) => team.key));
  return tab === "me"
    ? entries.filter((entry) => entry.kind === "off" || entry.kind === "ensemble"
      || (entry.team !== null && mine.has(entry.team)))
    : entries.filter((entry) => entry.kind !== "off");
}

/** 그날의 전체합주입니다. custom 이 true 면 날짜별로 지정한 시각이고, false 면 기본 시각입니다. */
export type EnsembleOn = {
  periodId: number; roomId: number; startsAt: string; endsAt: string; custom: boolean;
};

/** day 가 어느 기간의 전체합주 날짜 범위에 속하면 그 시각을, 아니면 null 을 반환합니다.
 *  서버가 집중 합주기간끼리의 겹침을 거절하므로 속하는 기간은 하나뿐입니다. */
export function ensembleOn(periods: Period[], day: string): EnsembleOn | null {
  const period = periods.find((item) =>
    item.ensemble !== null && day >= item.ensemble.starts_on && day <= item.ensemble.ends_on);
  if (period?.ensemble == null) return null;
  const { ensemble } = period;
  const own = ensemble.days.find((item) => item.day === day);
  return {
    periodId: period.id,
    roomId: ensemble.room_id,
    startsAt: own?.starts_at ?? ensemble.starts_at,
    endsAt: own?.ends_at ?? ensemble.ends_at,
    custom: own !== undefined,
  };
}

/** days 중 전체합주 날짜마다 항목 하나를 담습니다. 서버는 기간마다 날짜 범위 하나만 주므로 표시 중인 날짜 위에 전개합니다. */
export function ensembleByDay(
  periods: Period[], rooms: Room[], openHour: number, days: string[],
): DayEntries {
  const byDay: DayEntries = {};
  for (const day of days) {
    const on = ensembleOn(periods, day);
    if (on === null) continue;
    byDay[day] = [{
      kind: "ensemble",
      team: null,
      room: rooms.find((room) => room.id === on.roomId)?.name,
      who: "전체합주",
      a: slotIndex(`${day}T${on.startsAt}`, openHour),
      b: slotIndex(`${day}T${on.endsAt}`, openHour),
    }];
  }
  return byDay;
}

/** 확정된 시간표를 합주 한 번씩으로 합친 뒤 날짜별로 담습니다. 서버는 slot(1시간 단위 시간 칸)으로 주므로 맞닿은 slot 을 먼저 연결해야
 *  사용자가 보는 합주 한 번이 됩니다. */
export function assignedByDay(rows: ScheduleRow[], teams: DayTeam[], openHour: number): DayEntries {
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
export function offByDay(times: Unavailable[], openHour: number, days: string[]): DayEntries {
  const byDay: DayEntries = {};
  for (const item of times) {
    // 반복은 서버가 배정을 계산할 때 전개하지만(services/period_input.py expand_unavailable),
    // 달력은 저장된 행 하나만 받습니다. 표시 중인 날짜 위에 같은 규칙으로 다시 전개합니다.
    // 전개하지 않으면 매주 반복으로 등록한 일정이 첫날에만 표시되어 등록되지 않은 것처럼 보입니다.
    for (const day of repeatDays(item, days)) {
      (byDay[day] ??= []).push({
        kind: "off",
        team: null,
        who: item.name ?? "불가능 일정",
        note: item.reason ?? undefined,
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
export function repeatDays(item: Unavailable, days: string[]): string[] {
  const first = dayOf(item.starts_at);
  if (!item.repeats_daily && !item.repeats_weekly) return [first];

  const step = item.repeats_daily ? 1 : DAYS_PER_WEEK;
  const last = item.repeat_until;
  return days.filter((day) => {
    if (day < first) return false;
    if (last !== null && day > last) return false;
    return dayDistance(first, day) % step === 0;
  });
}

/** from 부터 to 까지 며칠 떨어져 있는지입니다. 같은 날이면 0 입니다. */
function dayDistance(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00`) - Date.parse(`${from}T00:00:00`);
  return Math.round(ms / 86_400_000);
}

/** 현재 보고 있는 달에 표시할 수 있는 날짜 전부입니다. 앞뒤로 한 주씩 더 포함하는 것은 주 보기가
 *  달의 경계를 넘을 수 있어서입니다. 반복을 전개할 때만 사용하므로 범위가 넓어도 문제없습니다. */
export function visibleDays(year: number, month: number): string[] {
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

/** 예약을 날짜별로 담습니다. 서버가 구간 한 행으로 주므로 잇는 계산이 없습니다.
 *  team_id 로 실제 팀을 찾습니다. 이름 비교보다 정확합니다. 동명이인 규칙과 같은 이유로
 *  사람도 팀도 번호로 구분합니다.
 *  로그인한 사용자가 예약한 건에만 취소할 id 를 포함해, 다른 사용자의 예약에는 취소 버튼이 표시되지 않게 합니다. */
export function bookedByDay(
  rows: Reservation[], teams: DayTeam[], openHour: number, myMemberId: number | null,
): DayEntries {
  const byDay: DayEntries = {};
  for (const booking of rows) {
    const team = teams.find((item) => item.id === booking.team_id);
    (byDay[dayOf(booking.start)] ??= []).push({
      kind: "book",
      team: team?.key ?? null,
      room: booking.room,
      // 예약자가 붙인 이름이 있으면 그 이름을, 없으면 팀 이름을, 팀도 없으면 예약자 이름을 씁니다.
      who: booking.name ?? booking.team ?? booking.member,
      a: slotIndex(booking.start, openHour),
      b: slotIndex(booking.end, openHour),
      bookingId: booking.member_id === myMemberId ? booking.id : undefined,
    });
  }
  return byDay;
}

/** 팀 하나의 자리를 "3/5명"으로 표시합니다. 목록에 없는 팀이면 빈 문자열을 반환합니다. */
export function memberCountLabel(allTeams: Team[], teamId: number): string {
  const found = allTeams.find((team) => team.id === teamId);
  // 자리 수와 배정된 수를 함께 표시합니다. 빈 자리 수가 인원 수만큼 중요합니다.
  return found === undefined ? "" : `${found.filled_count}/${found.slot_count}명`;
}

/** 오른쪽 목록이 아직 표시할 수 없는 상태면 그 사유를 한 줄로 반환합니다. 빈 문자열이면 목록을 표시합니다. */
export function listNote(
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
