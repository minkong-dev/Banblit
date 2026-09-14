// 합주실·기간 설정의 검증과 계산입니다. 화면이나 서버와 상호작용하지 않습니다.
// 검증 함수는 값이 유효하면 빈 문자열을, 아니면 사용자가 읽을 수 있는 오류 메시지를 반환합니다.
// 호출 순서는 pipeline.ts가 정합니다.

import { uniqueNameMessage } from "./validate";

// 칸 하나가 한 시간입니다(사용자 결정). 서버 쪽 정본입니다:
// backend/src/backend/scheduling/slots.py의 SLOT_MINUTES
const SLOT_MINUTES = 60;
const MINUTES_PER_HOUR = 60;

/** "18:30"을 자정부터의 분으로 변환합니다. 형식이 맞지 않으면 null입니다. */
function minutesOf(hhmm: string): number | null {
  const parts = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(hhmm);
  return parts === null ? null : Number(parts[1]) * MINUTES_PER_HOUR + Number(parts[2]);
}

function onGrid(minutes: number): boolean {
  return minutes % SLOT_MINUTES === 0;
}

export function openHoursMessage(opens: string, closes: string): string {
  // opens·closes를 받아, 정각이 아니거나 순서가 뒤집혔으면 그 메시지를 반환합니다.
  if (!opens) return "여는 시각을 입력해 주세요.";
  if (!closes) return "닫는 시각을 입력해 주세요.";

  const from = minutesOf(opens);
  const to = minutesOf(closes);
  if (from === null || !onGrid(from)) return "개방 시간은 정각 기준으로 지정해주세요.";
  if (to === null || !onGrid(to)) return "마감 시간은 정각 기준으로 지정해주세요.";
  if (to <= from) return "마감 시간은 개방 시간보다 빠를 수 없어요.";
  return "";
}

export function roomNameMessage(name: string, taken: string[]): string {
  return uniqueNameMessage(name, taken, "합주실");
}

export function dateRangeMessage(from: string, to: string): string {
  if (!from) return "시작일을 지정해주세요.";
  if (!to) return "종료일을 지정해주세요.";
  // from·to를 문자 그대로 비교합니다. "YYYY-MM-DD"는 사전식 순서가 날짜 순서와 같습니다.
  // Date 로 변환하지 않습니다. 브라우저가 시간대를 적용해 날짜가 밀릴 수 있습니다.
  return to < from ? "종료일은 시작일보다 빠를 수 없어요." : "";
}

export function slotsBetween(opens: string, closes: string): number {
  // 여는 시각부터 닫는 시각까지 들어가는 한 시간짜리 자리의 개수입니다. 유효하지 않으면 0입니다.
  if (openHoursMessage(opens, closes) !== "") return 0;
  const from = minutesOf(opens);
  const to = minutesOf(closes);
  if (from === null || to === null) return 0;
  return (to - from) / SLOT_MINUTES;
}

export type Capacity = {
  /** 하루에 열리는 1시간 자리 수입니다. 합주실 전체의 합입니다. */
  perDay: number;
  /** 기간 전체의 1시간 자리 수입니다. */
  total: number;
  /** 팀 하나가 갖는 1시간 자리 수입니다. 집중 합주기간은 모든 팀이 정확히 같은 개수를 갖습니다. */
  perTeam: number;
  /** 팀에 고르게 나누고 남는 1시간 자리 수입니다. 예약에 사용할 수 있습니다. */
  leftover: number;
};

export function capacity(input: {
  rooms: { opens_at: string; closes_at: string }[];
  days: number;
  teams: number;
}): Capacity {
  const { rooms, days, teams } = input;
  const perDay = rooms.reduce((sum, room) => sum + slotsBetween(room.opens_at, room.closes_at), 0);
  const total = perDay * Math.max(0, days);
  // teams 가 0 이면 나누지 않고 total 을 그대로 leftover 에 담습니다.
  const perTeam = teams > 0 ? Math.floor(total / teams) : 0;
  return { perDay, total, perTeam, leftover: total - perTeam * teams };
}
