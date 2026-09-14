// 서버가 제공한 배정안을 화면이 읽을 형식으로 변환합니다. 여기 있는 것은 모두 계산이므로
// 화면도 서버도 수정하지 않습니다.

import { slotLabel } from "./calendar";

export type Session = {
  team: string;
  room: string;
  start: string;
  end: string;
};

export function mergeSessions(items: Session[]): Session[] {
  // items를 팀·합주실·시작시각 순으로 정렬한 후, 앞 slot(1시간 단위 시간 칸)의 종료시각과 맞닿은 slot을 연결해 연속된 slot의 나열을 "합주 한 번"으로 변환합니다. 입력받은 목록은 고치지 않습니다. localeCompare()는 같으면 0을 반환합니다. || 연산자는 앞이 같을 때만 다음을 검토합니다.
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

/** mergeReservations()이 수신하는 slot(1시간 단위 시간 칸) 하나입니다. 서버 응답(lib/contract의 Reservation)에서
 *  이 계산이 사용하는 값만 추출한 형태입니다. */
export type ReservationSlot = {
  id: number;
  room: string;
  /** 예약한 팀의 번호입니다. 없으면 멤버가 개인으로 예약한 것입니다. 팀을 이름이 아니라 번호로 구분합니다. 동명이인처럼 같은 이름의 팀이 있을 수 있기 때문입니다. */
  teamId: number | null;
  team: string | null;
  memberId: number;
  member: string;
  start: string;
  end: string;
};

/** 예약 한 건입니다. 연속된 여러 slot을 연결한 것입니다. */
export type Booking = {
  /** 연결된 slot들의 ID입니다. 예약 취소는 slot마다 따로 삭제하므로 모든 ID를 보관해야 합니다. */
  ids: number[];
  room: string;
  teamId: number | null;
  team: string | null;
  memberId: number;
  member: string;
  start: string;
  end: string;
};

/** 서버가 제공한 slot(1시간 단위 시간 칸) 단위 예약을 사용자가 보는 한 건으로 연결합니다. 입력받은 목록은 고치지 않습니다. */
export function mergeReservations(rows: readonly ReservationSlot[]): Booking[] {
  // 같은 위치(합주실·팀·예약자)별로 모아 시각 순으로 정렬한 후, 앞 slot의 종료시각과 맞닿은 slot만 연결합니다. 위치가 다르면 시각이 맞닿아도 별도입니다. 취소 권한은 예약자에게만 있어, 다른 사용자의 slot을 한 건으로 묶으면 삭제할 수 없는 ID가 섞입니다.
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

// 서버는 시간대가 붙지 않은 ISO 문자열("2026-09-14T19:00:00" 형식의 시각 문자열)을 제공합니다. Date로 변환하면 브라우저가 기본 시간대를 적용해 날짜가 하루씩 밀릴 수 있으므로, 수신한 문자열을 그대로 자릅니다.

export function dayOf(iso: string): string {
  // "2026-09-14T18:30:00"에서 "2026-09-14"를 잘라 반환합니다.
  return iso.slice(0, 10);
}

export function hhmm(iso: string): string {
  // 같은 ISO 문자열에서 "18:30"을 잘라 반환합니다.
  return iso.slice(11, 16);
}

export function slotIndex(iso: string, openHour: number): number {
  // 여는 시각을 index 0으로 설정하고 한 시간마다 하나씩 증가하는 slot 번호를 반환합니다.
  return Number(iso.slice(11, 13)) - openHour;
}

export function isoAt(dayKey: string, index: number, openHour: number): string {
  // slotIndex()의 역함수입니다. 날짜와 slot 번호를 서버가 수신하는 ISO 문자열로 병합합니다.
  return `${dayKey}T${slotLabel(index, openHour)}:00`;
}

/** 설정의 예약 탭이 표시하는 목록입니다. 한 건으로 연결한 후 합주실과 무관하게 시작시각 순으로 정렬합니다.
 *  mergeReservations()는 합주실·사용자 순으로 정렬하므로, 사용자가 "다음 예약이 무엇인지" 확인하기에는 맞지 않습니다. */
export function upcomingBookings(rows: readonly ReservationSlot[]): Booking[] {
  return mergeReservations(rows).sort((a, b) => a.start.localeCompare(b.start));
}
