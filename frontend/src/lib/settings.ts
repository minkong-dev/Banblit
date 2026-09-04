// 합주실·기간 설정의 검사와 셈. 화면도 서버도 건드리지 않는다.
// 검사 함수는 값이 성하면 빈 문자열을, 아니면 사람이 읽을 사유를 돌려준다.
// 부르는 순서는 pipeline.ts 가 정한다.

const SLOT_MINUTES = 30;
const MINUTES_PER_HOUR = 60;

/** "18:30" 을 자정부터의 분으로 바꾼다. 모양이 아니면 null. */
function minutesOf(hhmm: string): number | null {
  const parts = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(hhmm);
  return parts === null ? null : Number(parts[1]) * MINUTES_PER_HOUR + Number(parts[2]);
}

function onGrid(minutes: number): boolean {
  return minutes % SLOT_MINUTES === 0;
}

export function openHoursMessage(opens: string, closes: string): string {
  // opens·closes 를 받아, 30분 격자를 벗어났거나 순서가 뒤집혔으면 그 사유를 돌려준다.
  if (!opens) return "여는 시각을 입력해 주세요.";
  if (!closes) return "닫는 시각을 입력해 주세요.";

  const from = minutesOf(opens);
  const to = minutesOf(closes);
  if (from === null || !onGrid(from)) return "여는 시각은 정시 또는 30분이어야 합니다.";
  if (to === null || !onGrid(to)) return "닫는 시각은 정시 또는 30분이어야 합니다.";
  if (to <= from) return "닫는 시각은 여는 시각보다 늦어야 합니다.";
  return "";
}

export function roomNameMessage(name: string, taken: string[]): string {
  // name 을 taken 과 견줘, 비었거나 겹치면 그 사유를 돌려준다.
  // 앞뒤 공백을 뗀 뒤 견주므로 공백만 다른 이름도 겹친 것으로 본다.
  const trimmed = name.trim();
  if (!trimmed) return "합주실 이름을 입력해 주세요.";
  const clash = taken.some((other) => other.trim() === trimmed);
  return clash ? "같은 이름의 합주실이 이미 있습니다." : "";
}

export function dateRangeMessage(from: string, to: string): string {
  if (!from) return "시작하는 날을 골라 주세요.";
  if (!to) return "끝나는 날을 골라 주세요.";
  // from·to 를 글자 그대로 견준다. "YYYY-MM-DD" 는 사전 순서가 곧 날짜 순서다.
  // Date 로 바꾸지 않는다 — 브라우저가 제 시간대를 끼워 넣어 하루씩 밀 수 있다.
  return to < from ? "끝나는 날은 시작하는 날보다 빠를 수 없습니다." : "";
}

export function slotsBetween(opens: string, closes: string): number {
  // 여는 시각부터 닫는 시각까지 들어가는 30분 자리의 개수. 성하지 않으면 0.
  if (openHoursMessage(opens, closes) !== "") return 0;
  const from = minutesOf(opens);
  const to = minutesOf(closes);
  if (from === null || to === null) return 0;
  return (to - from) / SLOT_MINUTES;
}

export type Capacity = {
  /** 하루에 열리는 30분 자리 — 방을 모두 더한 것. */
  perDay: number;
  /** 기간 전체의 30분 자리. */
  total: number;
  /** 팀 하나가 갖는 30분 자리. 집중기간은 모든 팀이 정확히 같은 개수를 갖는다. */
  perTeam: number;
  /** 팀에 고르게 나눠주고 남는 30분 자리. 예약으로 쓸 수 있다. */
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
  // teams 가 0 이면 나누지 않고 total 을 그대로 leftover 에 담는다.
  const perTeam = teams > 0 ? Math.floor(total / teams) : 0;
  return { perDay, total, perTeam, leftover: total - perTeam * teams };
}
