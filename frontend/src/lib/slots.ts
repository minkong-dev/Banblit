// 서버가 제공한 배정안을 화면이 읽을 형식으로 변환합니다. 이 파일의 함수는 모두 순수 계산이므로
// 화면이나 서버와 상호작용하지 않습니다.

import { slotLabel } from "./calendar";

export type Session = {
  team: string;
  room: string;
  start: string;
  end: string;
};

export function mergeSessions(items: Session[]): Session[] {
  // items 를 팀·합주실·시작시각 순으로 정렬한 후, 앞 slot(1시간 단위 시간 칸)의 종료시각과 맞닿은 slot 을 연결해 연속된 slot 의 나열을 "합주 한 번"으로 변환합니다. 입력받은 목록은 수정하지 않습니다. localeCompare() 는 같으면 0 을 반환합니다. || 연산자는 앞이 0 일 때만 다음을 비교합니다.
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

/** 예약 한 건입니다. 서버가 구간 한 행으로 주므로 화면에서 잇는 계산이 없습니다.
 *  서버 응답(lib/contract의 Reservation)에서 화면이 쓰는 값만 추린 형태입니다. */
export type Booking = {
  /** 취소와 이동은 이 번호 하나로 합니다. */
  id: number;
  room: string;
  /** 예약한 팀의 번호입니다. 없으면 멤버가 개인으로 예약한 것입니다. 팀을 이름이 아니라 번호로 구분합니다. 동명이인처럼 같은 이름의 팀이 있을 수 있기 때문입니다. */
  teamId: number | null;
  team: string | null;
  memberId: number;
  member: string;
  /** 예약자가 붙인 이름입니다. 비어 있으면 화면이 팀 이름이나 예약자 이름을 대신 씁니다. */
  name: string | null;
  start: string;
  end: string;
};

export function dayOf(iso: string): string {
  // "2026-09-14T18:30:00"에서 "2026-09-14"를 잘라 반환합니다.
  return iso.slice(0, 10);
}

export function hhmm(iso: string): string {
  // 같은 ISO 문자열에서 "18:30"을 잘라 반환합니다.
  return iso.slice(11, 16);
}

const MINUTES_PER_HOUR = 60;

export function slotIndex(iso: string, openHour: number): number {
  // 여는 시각을 0 으로 두고 한 시간을 1 로 세는 칸 번호를 반환합니다. 정각이 아니면 분을 한 시간의
  // 비율로 더한 소수입니다(여는 시각 18 기준 18:10 → 0.1667). 격자 줄은 정수 자리에만 긋고 막대는 소수 자리에 그립니다.
  const hour = Number(iso.slice(11, 13));
  const minute = Number(iso.slice(14, 16));
  return hour - openHour + minute / MINUTES_PER_HOUR;
}

export function isoAt(dayKey: string, index: number, openHour: number): string {
  // slotIndex()의 역함수입니다. 날짜와 칸 번호를 서버가 수신하는 ISO 문자열로 병합합니다. 소수 칸 번호는 분이 됩니다.
  return `${dayKey}T${slotLabel(index, openHour)}:00`;
}

/** 설정의 예약 탭이 표시하는 목록입니다. 합주실과 무관하게 시작 시각 순으로 세웁니다.
 *  사용자가 보려는 것이 "다음 예약이 무엇인지"라서 합주실보다 시각이 먼저입니다. */
export function upcomingBookings(rows: readonly Booking[]): Booking[] {
  return [...rows].sort((a, b) => a.start.localeCompare(b.start));
}
