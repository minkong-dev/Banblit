// 서버가 준 배정을 화면이 읽을 모양으로 바꾼다. 여기 있는 것은 전부 계산이라
// 화면도 서버도 건드리지 않는다.

import { slotLabel } from "./calendar";

export type Session = {
  team: string;
  room: string;
  start: string;
  end: string;
};

export function mergeSessions(items: Session[]): Session[] {
  // items 를 팀·방·시작시각 순으로 세운 뒤, 앞 칸의 끝과 맞닿은 칸을 이어 붙여
  // 한 시간짜리 칸의 나열을 "합주 한 번"으로 만든다. 받은 목록은 고치지 않는다.
  // localeCompare 는 같으면 0 을 준다. || 로 이으면 앞이 같을 때만 다음을 본다.
  const sorted = [...items].sort((a, b) =>
    a.team.localeCompare(b.team)
    || a.room.localeCompare(b.room)
    || a.start.localeCompare(b.start),
  );

  const merged: Session[] = [];
  for (const item of sorted) {
    const last = merged[merged.length - 1];
    if (last && last.team === item.team && last.room === item.room && last.end === item.start) {
      merged[merged.length - 1] = { ...last, end: item.end };
    } else {
      merged.push({ ...item });
    }
  }
  return merged;
}

/** mergeReservations 이 받는 칸 하나. 서버 응답(lib/contract 의 Reservation)에서
 *  이 계산이 쓰는 값만 추린 모양이다. */
export type ReservationSlot = {
  id: number;
  room: string;
  /** 이름을 건 팀의 번호. 없으면 개인이 직접 잡은 것이다. 이름이 아니라 번호로 가른다 —
   *  동명이인과 같은 이유로 이름은 겹칠 수 있다. */
  teamId: number | null;
  team: string | null;
  memberId: number;
  member: string;
  start: string;
  end: string;
};

/** 예약 한 건 — 맞닿은 칸 여럿을 이어 붙인 것. */
export type Booking = {
  /** 이어 붙인 칸들의 번호. 취소는 칸마다 따로 지우므로 전부 들고 있어야 한다. */
  ids: number[];
  room: string;
  teamId: number | null;
  team: string | null;
  memberId: number;
  member: string;
  start: string;
  end: string;
};

/** 서버가 칸 하나씩 주는 예약을 사람이 보는 한 건으로 잇는다. 받은 목록은 고치지 않는다. */
export function mergeReservations(rows: readonly ReservationSlot[]): Booking[] {
  // 같은 자리(합주실·팀·잡은 사람)끼리 모아 시각 순으로 세운 뒤, 앞 칸의 끝과 맞닿은
  // 칸만 이어 붙인다. 자리가 다르면 시각이 맞닿아도 남남이다 — 취소는 잡은 사람만
  // 할 수 있어, 남의 칸을 한 건으로 묶으면 지울 수 없는 번호가 섞인다.
  const sorted = [...rows].sort((a, b) =>
    a.room.localeCompare(b.room)
    || a.memberId - b.memberId
    || (a.teamId ?? 0) - (b.teamId ?? 0)
    || a.start.localeCompare(b.start),
  );

  const merged: Booking[] = [];
  for (const row of sorted) {
    const last = merged[merged.length - 1];
    const joins = last !== undefined
      && last.room === row.room
      && last.memberId === row.memberId
      && last.teamId === row.teamId
      && last.end === row.start;
    if (joins) {
      last.ids.push(row.id);
      last.end = row.end;
    } else {
      merged.push({
        ids: [row.id],
        room: row.room,
        teamId: row.teamId,
        team: row.team,
        memberId: row.memberId,
        member: row.member,
        start: row.start,
        end: row.end,
      });
    }
  }
  return merged;
}

// 서버는 시간대가 붙지 않은 시각을 준다. Date 로 바꾸면 브라우저가 제 시간대를
// 끼워 넣어 날짜가 하루씩 밀 수 있으므로, 받은 글자를 그대로 자른다.

export function dayOf(iso: string): string {
  // "2026-09-14T18:30:00" 에서 "2026-09-14" 를 잘라 돌려준다.
  return iso.slice(0, 10);
}

export function hhmm(iso: string): string {
  // 같은 값에서 "18:30" 을 잘라 돌려준다.
  return iso.slice(11, 16);
}

export function slotIndex(iso: string, openHour: number): number {
  // 여는 시각을 0번으로 두고 한 시간마다 하나씩 늘어나는 칸 번호를 돌려준다.
  return Number(iso.slice(11, 13)) - openHour;
}

export function isoAt(dayKey: string, index: number, openHour: number): string {
  // slotIndex 의 반대 방향 — 날짜와 칸 번호를 서버가 받는 시간대 없는 시각 문자열로 합친다.
  return `${dayKey}T${slotLabel(index, openHour)}:00`;
}
