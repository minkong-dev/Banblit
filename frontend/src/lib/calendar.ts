// 달력이 사용하는 계산입니다. 날짜와 칸 번호만 다루고 화면이나 서버와 상호작용하지 않습니다.

// 칸 하나가 한 시간입니다(사용자 결정). 서버 쪽 정본입니다:
// backend/src/backend/scheduling/slots.py 의 SLOT_MINUTES
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
  // 첫날의 요일만큼 앞을 비우고, 마지막 주가 부족하면 뒤를 비워 채웁니다.
  const leading = new Date(year, month, 1).getDay();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: lastDay }, (_, i) => i + 1);

  const cells: (number | null)[] = [...Array<null>(leading).fill(null), ...days];
  const trailing = (DAYS_PER_WEEK - (cells.length % DAYS_PER_WEEK)) % DAYS_PER_WEEK;
  return [...cells, ...Array<null>(trailing).fill(null)];
}

const MINUTES_PER_HOUR = 60;

export function slotLabel(index: number, openHour: number): string {
  // 여는 시각을 0번으로 둔 칸 번호를 "18:00"으로 표시합니다. 소수 칸 번호는 분으로 바꿔 "18:10"이 됩니다.
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

/** 타임라인을 드래그해 고른 구간입니다. pressed 는 누른 위치, current 는 지금 위치이고 둘 다 소수 칸 번호입니다.
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

export function hoursLabel(slots: number): string {
  // 칸 개수를 "3시간"으로 표시합니다. 화면에는 칸이 아니라 시간으로 표현합니다.
  return `${slots}시간`;
}

export function takenGrid(spans: { a: number; b: number }[], slotCount: number): boolean[] {
  // spans가 차지한 칸을 true로 표시한 배열을 반환합니다. 겹쳐 들어와도 한 번만 계산합니다.
  // 소수 구간(18:10~19:30 → 0.167~1.5)은 일부라도 걸친 칸을 전부 찬 것으로 표시합니다. 칸 단위 선착순이라
  // 10분이 걸친 칸에도 한 시간짜리 예약은 들어갈 수 없기 때문입니다.
  const grid = Array<boolean>(slotCount).fill(false);
  for (const span of spans) {
    for (let i = Math.max(0, Math.floor(span.a)); i < Math.min(slotCount, Math.ceil(span.b)); i += 1) {
      grid[i] = true;
    }
  }
  return grid;
}

export function isRangeFree(grid: boolean[], from: number, to: number): boolean {
  // from부터 to 직전까지 찬 칸이 없으면 true를 반환합니다. 소수 범위는 걸친 칸 전부를 봅니다.
  return grid.slice(Math.floor(from), Math.ceil(to)).every((taken) => !taken);
}

export function roomBounds(rooms: { opens_at: string; closes_at: string }[]): {
  open: number;
  close: number;
} {
  // 합주실 여닫는 시각 중 가장 이른 것과 가장 늦은 것으로 달력의 시작과 끝 시각을 정합니다.
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

export function focusedRange(
  periods: { kind: string; starts_on: string; ends_on: string }[],
): { from: string; to: string } | null {
  // 집중합주 기간 중 시작일이 가장 이른 것 하나로 달력에 띠를 표시합니다. 여러 개를
  // 한 화면에 함께 보여줄 자리가 아직 없어서 Settings.tsx의 Readout과 같은 방식으로
  // 하나만 사용합니다.
  const focused = [...periods]
    .filter((period) => period.kind === "focused")
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  const first = focused[0];
  return first ? { from: first.starts_on, to: first.ends_on } : null;
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
