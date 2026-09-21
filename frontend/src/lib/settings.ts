// 합주실·기간 설정의 검증과 계산입니다. 화면이나 서버와 상호작용하지 않습니다.
// 검증 함수는 값이 유효하면 빈 문자열을, 아니면 사용자가 읽을 수 있는 오류 메시지를 반환합니다.
// 호출 순서는 pipeline.ts가 결정합니다.

import { uniqueNameMessage } from "./validate";

// 칸 하나의 크기는 저장소 설정이 결정합니다(GET /settings 의 slot_minutes). 이 파일은 서버와
// 상호작용하지 않으므로 값을 인자로 받습니다. 부르는 쪽이 설정에서 읽어 넘깁니다.
// 서버 쪽 정본은 backend/src/backend/services/settings_service.py 입니다.
const DEFAULT_SLOT_MINUTES = 60;
const MINUTES_PER_HOUR = 60;

/** 점유 단위로 선택할 수 있는 값(분)입니다. 한 시간을 나머지 없이 나누는 값만 둡니다.
 *  서버 정본은 backend/src/backend/api/schemas.py 의 SettingsUpdateIn 과 settings 의 CHECK 입니다. */
export const SLOT_MINUTE_CHOICES = [5, 10, 12, 15, 20, 30, 60] as const;

/** 선택지에 표시할 문구입니다. 60분은 "1시간" 이 자연스럽습니다. */
export function slotMinutesLabel(minutes: number): string {
  return minutes === MINUTES_PER_HOUR ? "1시간" : `${minutes}분`;
}

/** 합주 1회 길이의 상한(분)입니다. 서버 정본은 backend/src/backend/scheduling/slots.py 의
 *  MAX_SESSION_MINUTES 입니다. */
export const MAX_SESSION_MINUTES = 240;

/** 합주 길이로 흔히 쓰는 값(분)입니다. 이 중 칸의 배수만 선택지가 됩니다. */
const COMMON_SESSION_MINUTES = [30, 45, 60, 90, 120, 150, 180, 240];

/** 합주 1회 길이로 고를 수 있는 값(분)을 오름차순으로 반환합니다.
 *
 *  칸의 배수만 남깁니다. 배수가 아니면 합주가 칸 중간에서 끝나 남은 반 칸을 아무도 쓸 수 없습니다.
 *  배수를 전부 나열하지 않는 이유는 5분 칸에서 48개가 되어 고르기 어려워지기 때문입니다.
 *  칸과 같은 길이는 언제나 포함합니다 — 30분만 연습하는 팀이 그 값을 씁니다. */
export function sessionMinuteChoices(slotMinutes: number): number[] {
  const fits = (minutes: number) =>
    minutes >= slotMinutes && minutes <= MAX_SESSION_MINUTES && minutes % slotMinutes === 0;
  const found = COMMON_SESSION_MINUTES.filter(fits);
  return [...new Set([slotMinutes, ...found])].sort((a, b) => a - b);
}

/** 합주 길이를 사람이 읽는 문구로 바꿉니다. 90분은 "1시간 30분" 이 자연스럽습니다. */
export function sessionMinutesLabel(minutes: number): string {
  const hours = Math.floor(minutes / MINUTES_PER_HOUR);
  const rest = minutes % MINUTES_PER_HOUR;
  if (hours === 0) return `${rest}분`;
  return rest === 0 ? `${hours}시간` : `${hours}시간 ${rest}분`;
}

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

/** 자정부터의 분으로 변경한 from·to 가 격자에 맞고 순서가 맞으면 빈 문자열, 아니면 오류 메시지를 반환합니다. */
function gridMessage(from: number | null, to: number | null, slotMinutes: number): string {
  const unit = unitText(slotMinutes);
  if (from === null || !onGrid(from, slotMinutes)) return `개방 시간은 ${unit} 기준으로 지정해주세요.`;
  if (to === null || !onGrid(to, slotMinutes)) return `마감 시간은 ${unit} 기준으로 지정해주세요.`;
  if (to <= from) return "마감 시간은 개방 시간보다 빠를 수 없어요.";
  return "";
}

/** 팀별합주 시간대 한 쌍입니다. 화면의 입력칸 두 개를 그대로 담습니다. 둘 다 빈 문자열이면
 *  "정하지 않음" 이고, 그날은 합주실 개방시각 전체를 씁니다. */
export type WindowPair = { starts_at: string; ends_at: string };

/** 평일·주말 시간대를 검증합니다. 서버 쪽 정본은 periods 의 CHECK(periods_practice_window_pairs·
 *  periods_practice_window_order)와 services/period_crud_service.py 입니다.
 *
 *  격자를 함께 보는 이유는, 시간대가 격자에서 벗어나면 배정 구간도 벗어나 서버가 칸을 만들지
 *  못하기 때문입니다. 저장은 되고 배정만 실패하면 원인을 찾기 어렵습니다. */
export function practiceWindowMessage(
  weekday: WindowPair, weekend: WindowPair, slotMinutes: number,
): string {
  const first = windowPairMessage(weekday, "평일", slotMinutes);
  return first !== "" ? first : windowPairMessage(weekend, "주말", slotMinutes);
}

function windowPairMessage(pair: WindowPair, label: string, slotMinutes: number): string {
  // 둘 다 비어 있으면 그 쌍을 정하지 않은 것입니다. 오류가 아닙니다.
  if (pair.starts_at === "" && pair.ends_at === "") return "";
  if (pair.starts_at === "") return `${label} 합주 시작 시각을 입력해주세요.`;
  if (pair.ends_at === "") return `${label} 합주 종료 시각을 입력해주세요.`;
  const from = minutesOf(pair.starts_at);
  const to = minutesOf(pair.ends_at);
  if (from === null || to === null || !onGrid(from, slotMinutes) || !onGrid(to, slotMinutes)) {
    return `${label} 합주 시간은 ${unitText(slotMinutes)} 기준으로 지정해주세요.`;
  }
  if (to <= from) return `${label} 합주 종료 시각은 시작 시각보다 늦어야 해요.`;
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

/** 네 값 모두 자리의 개수입니다. 자리 하나의 길이는 capacity 에 넘긴 slotMinutes 입니다. */
export type Capacity = {
  /** 하루에 열리는 자리 수입니다. 합주실 전체의 합입니다. */
  perDay: number;
  /** 기간 전체의 자리 수입니다. */
  total: number;
  /** 팀 하나가 갖는 자리 수입니다. 집중 합주기간은 모든 팀이 정확히 같은 개수를 갖습니다. */
  perTeam: number;
  /** 팀에 고르게 나누고 남는 자리 수입니다. 예약에 사용할 수 있습니다. */
  leftover: number;
};

export function capacity(input: {
  rooms: { opens_at: string; closes_at: string }[];
  days: number;
  teams: number;
  /** 생략하면 60분입니다. 설정의 점유 단위(slot_minutes)를 넘깁니다. */
  slotMinutes?: number;
}): Capacity {
  const { rooms, days, teams, slotMinutes } = input;
  const perDay = rooms.reduce(
    (sum, room) => sum + slotsBetween(room.opens_at, room.closes_at, slotMinutes), 0,
  );
  const total = perDay * Math.max(0, days);
  // teams 가 0 이면 나누지 않고 total 을 그대로 leftover 에 담습니다.
  const perTeam = teams > 0 ? Math.floor(total / teams) : 0;
  return { perDay, total, perTeam, leftover: total - perTeam * teams };
}
