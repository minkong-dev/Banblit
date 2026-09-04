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
  // 30분 조각의 나열을 "합주 한 번"으로 만든다. 받은 목록은 고치지 않는다.
  const sorted = [...items].sort((a, b) =>
    a.team !== b.team
      ? a.team.localeCompare(b.team)
      : a.room !== b.room
        ? a.room.localeCompare(b.room)
        : a.start.localeCompare(b.start),
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
  // 여는 시각을 0번으로 두고 30분마다 하나씩 늘어나는 칸 번호를 돌려준다.
  const hour = Number(iso.slice(11, 13));
  const minute = Number(iso.slice(14, 16));
  return (hour - openHour) * 2 + (minute >= 30 ? 1 : 0);
}

export function isoAt(dayKey: string, index: number, openHour: number): string {
  // slotIndex 의 반대 방향 — 날짜와 칸 번호를 서버가 받는 시간대 없는 시각 문자열로 합친다.
  return `${dayKey}T${slotLabel(index, openHour)}:00`;
}
