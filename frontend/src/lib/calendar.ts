// 달력이 사용하는 계산입니다. 날짜와 칸 번호만 다루고 화면이나 서버와 상호작용하지 않습니다.
// 칸 하나의 길이는 설정의 점유 단위(slot_minutes)입니다. 설정값이 없을 때의 기본값 60분은 서버의
// backend/src/backend/scheduling/slots.py 의 DEFAULT_SLOT_MINUTES 가 정본입니다.

const DAYS_PER_WEEK = 7;
// 날짜만 있는 값을 Date로 생성할 때 사용하는 시각입니다. 자정으로 설정하면 여름시간제가 있는
// 지역에서 하루가 23시간인 날에 날짜가 하루씩 밀릴 수 있습니다.
const NOON_HOUR = 12;
// 합주실이 하나도 없을 때 사용할 여는 시각과 닫는 시각입니다. 달력을 그릴 시간 범위가 없을 수는 없습니다.
const FALLBACK_OPEN_HOUR = 10;
const FALLBACK_CLOSE_HOUR = 22;

/** 달력이 처음 표시하는 달입니다. month 는 Date 와 같이 0부터 셉니다. */
export function currentMonth(now: Date = new Date()): { year: number; month: number } {
  return { year: now.getFullYear(), month: now.getMonth() };
}

export function monthCells(year: number, month: number): (number | null)[] {
  // year년 month월(0부터 시작)을 7의 배수 길이인 배열로 반환합니다.
  // 첫날의 요일만큼 앞에 null 을 넣고, 마지막 주가 부족하면 뒤에도 null 을 넣어 채웁니다.
  const leading = new Date(year, month, 1).getDay();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: lastDay }, (_, i) => i + 1);

  const cells: (number | null)[] = [...Array<null>(leading).fill(null), ...days];
  const trailing = (DAYS_PER_WEEK - (cells.length % DAYS_PER_WEEK)) % DAYS_PER_WEEK;
  return [...cells, ...Array<null>(trailing).fill(null)];
}

const MINUTES_PER_HOUR = 60;

export function slotLabel(index: number, openHour: number): string {
  // 여는 시각을 0번으로 둔 칸 번호를 "18:00"으로 표시합니다. 소수 칸 번호는 분으로 변경해 "18:10"이 됩니다.
  // 1/6 같은 값은 부동소수점 오차가 있어 분 단위로 반올림한 뒤 시·분으로 나눕니다.
  const minutes = Math.round((openHour + index) * MINUTES_PER_HOUR);
  const hour = Math.floor(minutes / MINUTES_PER_HOUR);
  const minute = minutes % MINUTES_PER_HOUR;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

/** 여는 시각(0)부터 닫는 시각(slotCount)까지 slotMinutes 간격의 칸 번호 목록입니다. 시작 선택지는 마지막 값을,
 *  종료 선택지는 첫 값을 뺀 나머지입니다. 분을 정수로 센 뒤 나누므로 10분 같은 값도 slotLabel 로 오차 없이 돌아갑니다. */
export function slotSteps(slotCount: number, slotMinutes: number): number[] {
  const count = Math.round((slotCount * MINUTES_PER_HOUR) / slotMinutes);
  return Array.from({ length: count + 1 }, (_, i) => (i * slotMinutes) / MINUTES_PER_HOUR);
}

/** 타임라인을 드래그해 선택한 구간입니다. pressed 는 누른 위치, current 는 지금 위치이고 둘 다 소수 칸 번호입니다.
 *  각 위치를 slotMinutes 간격으로 내림한 뒤 늦은 쪽에 한 칸을 더해, 누른 칸 자체가 구간에 들어갑니다.
 *  결과는 0~slotCount 로 자릅니다. 분을 정수로 세어 slotSteps 와 같은 값이 나오므로 select 의 value 와 일치합니다. */
export function dragRange(
  pressed: number, current: number, slotMinutes: number, slotCount: number,
): { a: number; b: number } {
  const last = slotCount * MINUTES_PER_HOUR - slotMinutes;
  const snap = (index: number) => {
    const minutes = Math.min(Math.max(index, 0) * MINUTES_PER_HOUR, last);
    return Math.floor(minutes / slotMinutes) * slotMinutes;
  };
  const first = Math.min(snap(pressed), snap(current));
  const end = Math.max(snap(pressed), snap(current)) + slotMinutes;
  return { a: first / MINUTES_PER_HOUR, b: end / MINUTES_PER_HOUR };
}

/** 설정의 칸 크기를 머리글에 적는 문구입니다. 60분이면 "1시간 단위", 아니면 "N분 단위"입니다. */
export function unitLabel(slotMinutes: number): string {
  return slotMinutes === MINUTES_PER_HOUR ? "1시간 단위" : `${slotMinutes}분 단위`;
}

/** 여는 시각부터 닫는 시각까지 필요한 칸 수입니다. 칸 하나가 한 시간이므로 시각 차이가
 *  곧 칸 수입니다. */
export function slotCountOf(openHour: number, closeHour: number): number {
  return closeHour - openHour;
}

export function hoursLabel(slots: number, slotMinutes: number = MINUTES_PER_HOUR): string {
  // slotMinutes 길이의 칸 개수를 "3시간"·"3.5시간"으로 표시합니다. 화면에는 칸이 아니라 시간으로 표현합니다.
  // 20분 칸 7개(2.333…시간)처럼 나누어떨어지지 않으면 소수 둘째 자리까지 표시합니다.
  return `${Math.round((slots * slotMinutes * 100) / MINUTES_PER_HOUR) / 100}시간`;
}

/** 시간 단위 위치(index, 소수 가능)가 slotMinutes 간격 grid 의 몇 번째 칸 경계인지 반환합니다.
 *  분을 정수로 반올림한 뒤 나누므로 10분(1/6) 같은 값도 소수 오차 없이 경계에 맞습니다.
 *  경계 사이의 값은 소수로 반환하므로 호출하는 쪽이 floor·ceil 로 걸친 칸을 결정합니다. */
export function cellAt(index: number, slotMinutes: number = MINUTES_PER_HOUR): number {
  return Math.round(index * MINUTES_PER_HOUR) / slotMinutes;
}

export function takenGrid(
  spans: { a: number; b: number }[], slotCount: number, slotMinutes: number = MINUTES_PER_HOUR,
): boolean[] {
  // spans가 차지한 칸을 true로 표시한 배열을 반환합니다. 칸 하나의 길이는 slotMinutes 이고, 겹쳐 들어와도 한 번만 계산합니다.
  // 칸 경계에 맞지 않는 구간(60분 칸에서 18:10~19:30)은 일부라도 걸친 칸을 전부 찬 것으로 표시합니다. 칸 단위
  // 선착순이라 10분이 걸친 칸에도 그 칸 길이의 예약은 들어갈 수 없기 때문입니다.
  const cells = cellAt(slotCount, slotMinutes);
  const grid = Array<boolean>(cells).fill(false);
  for (const span of spans) {
    const end = Math.min(cells, Math.ceil(cellAt(span.b, slotMinutes)));
    for (let i = Math.max(0, Math.floor(cellAt(span.a, slotMinutes))); i < end; i += 1) {
      grid[i] = true;
    }
  }
  return grid;
}

/** from부터 to 직전까지에서 처음으로 찬 칸의 시작 위치(시간 단위)를 반환합니다. 찬 칸이 없으면 null 입니다.
 *  grid 는 같은 slotMinutes 로 만든 takenGrid 의 결과입니다. 칸 경계에 맞지 않는 범위는 걸친 칸 전부를 확인합니다. */
export function firstTaken(
  grid: boolean[], from: number, to: number, slotMinutes: number = MINUTES_PER_HOUR,
): number | null {
  const start = Math.floor(cellAt(from, slotMinutes));
  const offset = grid.slice(start, Math.ceil(cellAt(to, slotMinutes))).indexOf(true);
  return offset === -1 ? null : ((start + offset) * slotMinutes) / MINUTES_PER_HOUR;
}

export function isRangeFree(
  grid: boolean[], from: number, to: number, slotMinutes: number = MINUTES_PER_HOUR,
): boolean {
  return firstTaken(grid, from, to, slotMinutes) === null;
}

/** 드래그로 선택한 구간을 반영할지 판단합니다. grid 가 없으면 항상 반영하고(불가능 일정은 겹쳐도 됩니다),
 *  있으면 찬 칸이 하나도 걸치지 않을 때만 반영합니다. 반영하지 않으면 직전 구간이 그대로 남아
 *  선택이 찬 칸 앞에서 멈춥니다. 등록 시점에만 거절하면 사용자가 드래그를 마친 뒤에야 막힌 것을 압니다. */
export function acceptsDrag(
  grid: boolean[] | undefined, range: { a: number; b: number }, slotMinutes: number = MINUTES_PER_HOUR,
): boolean {
  return grid === undefined || isRangeFree(grid, range.a, range.b, slotMinutes);
}

export function roomBounds(rooms: { opens_at: string; closes_at: string }[]): {
  open: number;
  close: number;
} {
  // 합주실 여닫는 시각 중 가장 이른 것과 가장 늦은 것으로 달력의 시작과 끝 시각을 결정합니다.
  // 배정이 있든 없든 합주실 설정만 있으면 결정됩니다.
  if (rooms.length === 0) return { open: FALLBACK_OPEN_HOUR, close: FALLBACK_CLOSE_HOUR };

  let open = 24;
  let close = 0;
  for (const room of rooms) {
    open = Math.min(open, Number(room.opens_at.slice(0, 2)));
    close = Math.max(close, Number(room.closes_at.slice(0, 2)));
  }
  return open < close ? { open, close } : { open: FALLBACK_OPEN_HOUR, close: FALLBACK_CLOSE_HOUR };
}

/** 양 끝 날짜를 포함하는 "YYYY-MM-DD" 범위입니다. to 가 null 이면 끝이 없습니다. */
export type DayRange = { from: string; to: string | null };

/** 집중 합주기간 전부의 팀별 배정 날짜 범위를 시작일 순서로 반환합니다. 서버가 집중 합주기간끼리의 겹침을
 *  거절하므로 범위끼리 겹치지 않습니다. "매일" 기간은 종료일이 없어 to 가 null 입니다.
 *  전체합주 날짜 범위는 팀별 배정에서 제외되므로, 전체합주가 기간 중간에 있으면 범위가 앞뒤 두 개로 나뉩니다. */
export function focusedRanges(
  periods: {
    kind: string; starts_on: string; ends_on: string; everyday: boolean;
    ensemble?: { starts_on: string; ends_on: string } | null;
  }[],
): DayRange[] {
  return periods
    .filter((period) => period.kind === "focused")
    .flatMap((period): DayRange[] => {
      const to = period.everyday ? null : period.ends_on;
      if (!period.ensemble) return [{ from: period.starts_on, to }];
      const before = { from: period.starts_on, to: shiftDay(period.ensemble.starts_on, -1) };
      const after = { from: shiftDay(period.ensemble.ends_on, 1), to };
      // 전체합주가 기간 끝에 붙으면 그쪽 범위는 시작일이 종료일보다 늦어 제외됩니다.
      return [before, after].filter((range) => range.to === null || range.from <= range.to);
    })
    .sort((a, b) => a.from.localeCompare(b.from));
}

/** "YYYY-MM-DD" 에 days 일을 더한 날짜입니다. 정오에서 계산합니다(NOON_HOUR). */
function shiftDay(key: string, days: number): string {
  const date = new Date(`${key}T12:00:00`);
  date.setDate(date.getDate() + days);
  return dayKey(date);
}

/** key 가 ranges 중 하나에 속하면 true 입니다. */
export function inRanges(ranges: DayRange[], key: string): boolean {
  return ranges.some((range) => key >= range.from && (range.to === null || key <= range.to));
}

/** Date를 "YYYY-MM-DD" 형식으로 변환합니다. 달력의 모든 queryKey(TanStack Query가 관리하는 조회 하나)는 이 형식입니다. */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** year년 month월(0부터 시작) 15일이 있는 주를 shift주만큼 옮겨, 일요일부터 토요일까지
 *  7개의 날짜 queryKey를 반환합니다. */
export function weekKeys(year: number, month: number, shift: number): string[] {
  const sunday = new Date(year, month, 15 + shift * DAYS_PER_WEEK, NOON_HOUR);
  sunday.setDate(sunday.getDate() - sunday.getDay());
  return Array.from({ length: DAYS_PER_WEEK }, (_, i) =>
    dayKey(new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + i, NOON_HOUR)));
}

export function datesBetween(from: string, to: string): string[] {
  // "2026-09-14" 부터 "2026-09-17" 까지의 날짜를 양 끝 포함하여 연결합니다.
  // 정오에서 하루씩 더해 나갑니다(NOON_HOUR).
  const cursor = new Date(`${from}T12:00:00`);
  const last = new Date(`${to}T12:00:00`);
  const days: string[] = [];
  while (cursor <= last) {
    days.push(dayKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

// ===== 날짜 표시 문자열 =====
// 달·요일 이름을 배열로 보관하지 않고 Intl 에 맡깁니다.

const MONTH_DAY = new Intl.DateTimeFormat("ko", { month: "long", day: "numeric" });
const MONTH_DAY_WEEKDAY = new Intl.DateTimeFormat("ko", {
  month: "long",
  day: "numeric",
  weekday: "long",
});
const WEEKDAY = new Intl.DateTimeFormat("ko", { weekday: "short" });

// "2026-09-04" 와 "2026-09-04T14:30:00" 을 함께 받습니다. 뒤에 시간대가 붙어 와도
// 이 함수에서 제거합니다. 서버는 시간대 없는 값을 주고, 시간대가 붙은 값도 날짜 부분만 읽습니다.
const STAMP = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/;

/** 적힌 날짜를 그대로 담은 Date입니다. 형식이 맞지 않으면 null입니다.
 *  정오로 설정합니다. 자정으로 설정하면 여름시간제가 있는 지역에서 하루 밀릴 수 있습니다. */
function dayDate(text: string): Date | null {
  const parsed = STAMP.exec(text);
  if (parsed === null) return null;
  const [, year, month, day] = parsed;
  return new Date(Number(year), Number(month) - 1, Number(day), NOON_HOUR);
}

/** "2026-09-13" 을 "9월 13일" 로 변환합니다. 뒤에 시각이 붙어 있어도 날짜만 읽습니다.
 *  형식이 맞지 않으면 받은 값을 그대로 반환합니다. */
export function dayLabel(key: string): string {
  const date = dayDate(key);
  return date === null ? key : MONTH_DAY.format(date);
}

/** "2026-09-13" 을 "9월 13일 일요일" 로 변환합니다. */
export function dayWithWeekday(key: string): string {
  const date = dayDate(key);
  return date === null ? key : MONTH_DAY_WEEKDAY.format(date);
}

/** "2026-09-04T14:30:00" 을 "9월 4일 14:30" 으로 변환합니다. 시각이 없으면 날짜만 표시합니다.
 *  시각은 작성된 문자열을 그대로 사용합니다. Intl 에 넘기려면 Date 를 만들어야 하는데, 그러면
 *  여름시간제로 없는 시각(새벽 2시)이 한 시간 뒤로 밀려 작성된 값과 달라집니다. */
export function stampLabel(text: string): string {
  const parsed = STAMP.exec(text);
  if (parsed === null) return text;
  const [, , , , hour, minute] = parsed;
  const day = dayLabel(text);
  return hour === undefined ? day : `${day} ${hour}:${minute}`;
}

// Intl에 요일 이름을 물으려면 날짜가 있어야 합니다. 2024년 1월 7일이 일요일입니다.
const A_SUNDAY = { year: 2024, month: 0, day: 7 };

/** 달력 머리글의 요일 이름 7개입니다. 일요일부터 토요일까지이며 달력 격자도 같은 순서입니다. */
export const WEEKDAY_NAMES: string[] = Array.from({ length: DAYS_PER_WEEK }, (_, index) =>
  WEEKDAY.format(new Date(A_SUNDAY.year, A_SUNDAY.month, A_SUNDAY.day + index, NOON_HOUR)));

/** 불가능 일정의 반복 요일을 담는 값입니다. 월요일 1, 화요일 2, 수요일 4 … 일요일 64 를 더해
 *  하나의 숫자로 저장합니다. 서버의 unavailable_times.repeat_weekdays 와 같은 순서입니다.
 *  0 이면 반복하지 않고, 127(ALL_WEEKDAYS)이면 매일입니다. */
export const ALL_WEEKDAYS = 0b1111111;

/** 반복 요일 버튼에 표시할 이름입니다. 월요일부터이고, 배열의 index 가 곧 자릿수입니다.
 *  달력 머리글의 WEEKDAY_NAMES 는 일요일부터라 순서가 다릅니다. */
export const REPEAT_WEEKDAY_NAMES = ["월", "화", "수", "목", "금", "토", "일"];

/** mask 에 index 번째 요일이 들어 있으면 true 를 반환합니다. index 는 월요일이 0 입니다. */
export function hasWeekday(mask: number, index: number): boolean {
  return (mask & (1 << index)) !== 0;
}

/** mask 에서 index 번째 요일을 넣거나 뺀 새 값을 반환합니다. 원래 값은 변경하지 않습니다. */
export function toggleWeekday(mask: number, index: number): number {
  return hasWeekday(mask, index) ? mask & ~(1 << index) : mask | (1 << index);
}

/** "2026-09-14" 의 요일 자릿수입니다. 월요일이 0 이고 일요일이 6 입니다. */
export function weekdayIndex(day: string): number {
  return (new Date(`${day}T12:00:00`).getDay() + 6) % 7;
}

/** 목록 한 줄에 적는 반복 표기입니다. 반복하지 않으면 빈 문자열, 일곱 요일 전부면 "매일",
 *  그 밖에는 "매주 월·수·금" 입니다. */
export function repeatLabel(mask: number): string {
  if (mask === 0) return "";
  if (mask === ALL_WEEKDAYS) return "매일";
  const days = REPEAT_WEEKDAY_NAMES.filter((_, index) => hasWeekday(mask, index));
  return `매주 ${days.join("·")}`;
}
