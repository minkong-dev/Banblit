// 합주실·기간 설정의 검증과 계산입니다. 화면이나 서버와 상호작용하지 않습니다.
// 검증 함수는 값이 유효하면 빈 문자열을, 아니면 사용자가 읽을 수 있는 오류 메시지를 반환합니다.
// 호출 순서는 pipeline.ts가 정합니다.

import { uniqueNameMessage } from "./validate";

// 칸 하나의 크기는 저장소 설정이 정합니다(GET /settings 의 slot_minutes). 이 파일은 서버와
// 상호작용하지 않으므로 값을 인자로 받습니다. 부르는 쪽이 설정에서 읽어 넘깁니다.
// 서버 쪽 정본은 backend/src/backend/services/settings_service.py 입니다.
const DEFAULT_SLOT_MINUTES = 60;
const MINUTES_PER_HOUR = 60;

/** "18:30"을 자정부터의 분으로 변환합니다. 형식이 맞지 않으면 null입니다. */
function minutesOf(hhmm: string): number | null {
  const parts = /^([01][0-9]|2[0-3]):([0-5][0-9])$/.exec(hhmm);
  return parts === null ? null : Number(parts[1]) * MINUTES_PER_HOUR + Number(parts[2]);
}

function onGrid(minutes: number, slotMinutes: number): boolean {
  return minutes % slotMinutes === 0;
}

/** 격자에 맞지 않을 때 보여줄 단위 이름입니다. 한 시간이면 "정각"이 자연스럽습니다. */
function unitText(slotMinutes: number): string {
  return slotMinutes === MINUTES_PER_HOUR ? "정각" : `${slotMinutes}분`;
}

export function openHoursMessage(
  opens: string, closes: string, slotMinutes: number = DEFAULT_SLOT_MINUTES,
): string {
  // opens·closes를 받아, 격자에 맞지 않거나 순서가 뒤집혔으면 그 메시지를 반환합니다.
  if (!opens) return "여는 시각을 입력해 주세요.";
  if (!closes) return "닫는 시각을 입력해 주세요.";
  return gridMessage(minutesOf(opens), minutesOf(closes), slotMinutes);
}

/** 자정부터의 분으로 바꾼 from·to 가 격자에 맞고 순서가 맞으면 빈 문자열, 아니면 오류 메시지를 반환합니다. */
function gridMessage(from: number | null, to: number | null, slotMinutes: number): string {
  const unit = unitText(slotMinutes);
  if (from === null || !onGrid(from, slotMinutes)) return `개방 시간은 ${unit} 기준으로 지정해주세요.`;
  if (to === null || !onGrid(to, slotMinutes)) return `마감 시간은 ${unit} 기준으로 지정해주세요.`;
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

type Hours = { opens_at: string; closes_at: string };

/** 전체합주 설정을 검증합니다. 서버 쪽 정본은 backend/src/backend/services/ensemble_service.py 와
 *  periods 의 CHECK(날짜 범위가 기간 안인지)입니다. "매일" 기간은 종료일이 없어 시작일만 비교합니다. */
export function ensembleMessage(
  form: { starts_on: string; ends_on: string; starts_at: string; ends_at: string },
  period: { starts_on: string; ends_on: string; everyday: boolean },
  room: Hours | undefined,
  slotMinutes: number,
): string {
  const dates = dateRangeMessage(form.starts_on, form.ends_on);
  if (dates !== "") return dates;
  if (form.starts_on < period.starts_on || (!period.everyday && form.ends_on > period.ends_on)) {
    return "전체합주 날짜는 집중합주 기간 안이어야 해요.";
  }
  if (room === undefined) return "합주실을 선택해주세요.";
  return ensembleTimeMessage(form.starts_at, form.ends_at, room, slotMinutes);
}

/** 전체합주 시각 한 쌍을 검증합니다. 기본 시각과 날짜별 시각이 같은 규칙입니다. */
export function ensembleTimeMessage(
  starts: string, ends: string, room: Hours, slotMinutes: number,
): string {
  const from = minutesOf(starts);
  const to = minutesOf(ends);
  if (from === null || to === null || !onGrid(from, slotMinutes) || !onGrid(to, slotMinutes)) {
    return `전체합주 시각은 ${unitText(slotMinutes)} 기준으로 지정해주세요.`;
  }
  if (to <= from) return "끝 시각은 시작 시각보다 늦어야 해요.";
  const opens = minutesOf(room.opens_at);
  const closes = minutesOf(room.closes_at);
  if (opens === null || closes === null || from < opens || to > closes) {
    return "전체합주 시각은 합주실 운영 시간 안이어야 해요.";
  }
  return "";
}

export function slotsBetween(
  opens: string, closes: string, slotMinutes: number = DEFAULT_SLOT_MINUTES,
): number {
  // 여는 시각부터 닫는 시각까지 들어가는 자리의 개수입니다. 유효하지 않으면 0입니다.
  const from = minutesOf(opens);
  const to = minutesOf(closes);
  if (from === null || to === null || gridMessage(from, to, slotMinutes) !== "") return 0;
  return (to - from) / slotMinutes;
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
