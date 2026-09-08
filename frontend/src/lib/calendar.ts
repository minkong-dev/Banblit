// 달력이 쓰는 계산. 날짜와 칸 번호만 다루고 화면도 서버도 건드리지 않는다.

// 칸 하나가 한 시간이다(사용자 결정). 서버 쪽 정본은
// backend/src/backend/scheduling/slots.py 의 SLOT_MINUTES 다.
const DAYS_PER_WEEK = 7;
// 날짜만 있는 값을 Date 로 세울 때 쓰는 시각. 자정으로 세우면 여름시간제가 있는
// 지역에서 하루가 23시간인 날에 날짜가 하루씩 밀 수 있다.
const NOON_HOUR = 12;
// 합주실이 하나도 없을 때 쓸 여닫는 시각 — 달력을 그릴 시간 범위가 아예 없을 수는 없다.
const FALLBACK_OPEN_HOUR = 10;
const FALLBACK_CLOSE_HOUR = 22;

/** 달력이 처음 여는 달. month 는 Date 와 같이 0부터 센다. */
export function currentMonth(now: Date = new Date()): { year: number; month: number } {
  return { year: now.getFullYear(), month: now.getMonth() };
}

export function monthCells(year: number, month: number): (number | null)[] {
  // year 년 month 월(0부터 센다)을 7의 배수 길이 배열로 돌려준다.
  // 첫날의 요일만큼 앞을 비우고, 마지막 주가 모자라면 뒤를 비워 채운다.
  const leading = new Date(year, month, 1).getDay();
  const lastDay = new Date(year, month + 1, 0).getDate();
  const days = Array.from({ length: lastDay }, (_, i) => i + 1);

  const cells: (number | null)[] = [...Array<null>(leading).fill(null), ...days];
  const trailing = (DAYS_PER_WEEK - (cells.length % DAYS_PER_WEEK)) % DAYS_PER_WEEK;
  return [...cells, ...Array<null>(trailing).fill(null)];
}

export function slotLabel(index: number, openHour: number): string {
  // 여는 시각을 0번으로 둔 칸 번호를 "18:00" 으로 적는다.
  const hour = openHour + index;
  return `${String(hour).padStart(2, "0")}:00`;
}

/** 여는 시각부터 닫는 시각까지 들어가는 칸 수. 칸 하나가 한 시간이라 시각 차이가
 *  곧 칸 수다 — 30분 칸이던 때의 두 배가 아니다. */
export function slotCountOf(openHour: number, closeHour: number): number {
  return closeHour - openHour;
}

export function hoursLabel(slots: number): string {
  // 칸 개수를 "3시간" 으로 적는다. 화면에는 칸이 아니라 시각으로 말한다.
  return `${slots}시간`;
}

export function takenGrid(spans: { a: number; b: number }[], slotCount: number): boolean[] {
  // spans 가 차지한 칸을 true 로 찍은 배열을 돌려준다. 겹쳐 들어와도 한 번만 센다.
  const grid = Array<boolean>(slotCount).fill(false);
  for (const span of spans) {
    for (let i = Math.max(0, span.a); i < Math.min(slotCount, span.b); i += 1) {
      grid[i] = true;
    }
  }
  return grid;
}

export function isRangeFree(grid: boolean[], from: number, to: number): boolean {
  // from 부터 to 직전까지 한 칸도 차 있지 않으면 true.
  return grid.slice(from, to).every((taken) => !taken);
}

export function roomBounds(rooms: { opens_at: string; closes_at: string }[]): {
  open: number;
  close: number;
} {
  // 합주실 여닫는 시각 중 가장 이른 것과 가장 늦은 것으로 달력의 앞뒤 시각을 정한다.
  // 배정이 있든 없든 합주실 설정만 있으면 정해진다.
  if (rooms.length === 0) return { open: FALLBACK_OPEN_HOUR, close: FALLBACK_CLOSE_HOUR };

  let open = 24;
  let close = 0;
  for (const room of rooms) {
    open = Math.min(open, Number(room.opens_at.slice(0, 2)));
    // 닫는 시각이 정시가 아니면 다음 정시까지 칸을 그려야 그 자리가 보인다.
    const closeHour =
      Number(room.closes_at.slice(0, 2)) + (room.closes_at.slice(3, 5) === "00" ? 0 : 1);
    close = Math.max(close, closeHour);
  }
  return open < close ? { open, close } : { open: FALLBACK_OPEN_HOUR, close: FALLBACK_CLOSE_HOUR };
}

export function focusedRange(
  periods: { kind: string; starts_on: string; ends_on: string }[],
): { from: string; to: string } | null {
  // 집중 합주기간 중 시작일이 가장 이른 것 하나로 달력에 띠를 그린다. 여러 개를
  // 한 화면에 같이 보여줄 자리가 아직 없어, Settings.tsx 의 Readout 과 같은 방식으로
  // 하나만 쓴다.
  const focused = [...periods]
    .filter((period) => period.kind === "focused")
    .sort((a, b) => a.starts_on.localeCompare(b.starts_on));
  const first = focused[0];
  return first ? { from: first.starts_on, to: first.ends_on } : null;
}

/** Date 를 "YYYY-MM-DD" 로. 달력 열쇠는 전부 이 모양이다. */
export function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** year 년 month 월(0부터 센다) 15일이 든 주를 shift 주만큼 옮겨, 일요일부터 토요일까지
 *  이레 치 날짜 열쇠를 돌려준다. */
export function weekKeys(year: number, month: number, shift: number): string[] {
  const sunday = new Date(year, month, 15 + shift * DAYS_PER_WEEK, NOON_HOUR);
  sunday.setDate(sunday.getDate() - sunday.getDay());
  return Array.from({ length: DAYS_PER_WEEK }, (_, i) =>
    dayKey(new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + i, NOON_HOUR)));
}

export function datesBetween(from: string, to: string): string[] {
  // "2026-09-14" 부터 "2026-09-17" 까지의 날짜를 양 끝 포함해 잇는다.
  // 정오에서 하루씩 더해 나간다(NOON_HOUR).
  const cursor = new Date(`${from}T12:00:00`);
  const last = new Date(`${to}T12:00:00`);
  const days: string[] = [];
  while (cursor <= last) {
    days.push(dayKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

// ===== 날짜를 사람이 읽는 글로 =====
// 달·요일 이름을 배열로 들고 있지 않고 Intl 에 맡긴다. 화면 넷이 각자 자르던 것을
// 여기 셋으로 모았다.

const MONTH_DAY = new Intl.DateTimeFormat("ko", { month: "long", day: "numeric" });
const MONTH_DAY_WEEKDAY = new Intl.DateTimeFormat("ko", {
  month: "long",
  day: "numeric",
  weekday: "long",
});
const WEEKDAY = new Intl.DateTimeFormat("ko", { weekday: "short" });

// "2026-09-04" 와 "2026-09-04T14:30:00" 을 함께 받는다. 뒤에 시간대가 붙어 와도
// 여기서 잘려 나간다 — 서버는 시간대 없는 값을 주고, 붙어 온 값도 적힌 그대로 읽는다.
const STAMP = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/;

/** 적힌 날짜를 그대로 담은 Date. 형식이 아니면 null.
 *  정오로 세운다 — 자정으로 세우면 여름시간제가 있는 지역에서 하루 밀 수 있다. */
function dayDate(text: string): Date | null {
  const parsed = STAMP.exec(text);
  if (parsed === null) return null;
  const [, year, month, day] = parsed;
  return new Date(Number(year), Number(month) - 1, Number(day), NOON_HOUR);
}

/** "2026-09-13" 을 "9월 13일" 로. 뒤에 시각이 붙어 있어도 날짜만 읽는다.
 *  형식이 아니면 받은 값을 그대로 돌려준다. */
export function dayLabel(key: string): string {
  const date = dayDate(key);
  return date === null ? key : MONTH_DAY.format(date);
}

/** "2026-09-13" 을 "9월 13일 일요일" 로. */
export function dayWithWeekday(key: string): string {
  const date = dayDate(key);
  return date === null ? key : MONTH_DAY_WEEKDAY.format(date);
}

/** "2026-09-04T14:30:00" 을 "9월 4일 14:30" 으로. 시각이 없으면 날짜만 적는다.
 *  시각은 적힌 글자를 그대로 쓴다 — Intl 에 넘기려면 Date 를 만들어야 하고, 그러면
 *  여름시간제로 없는 시각(새벽 2시)이 한 시간 뒤로 밀려 적힌 값과 달라진다. */
export function stampLabel(text: string): string {
  const parsed = STAMP.exec(text);
  if (parsed === null) return text;
  const [, , , , hour, minute] = parsed;
  const day = dayLabel(text);
  return hour === undefined ? day : `${day} ${hour}:${minute}`;
}

// Intl 에 요일 이름을 물으려면 날짜가 있어야 한다. 2024년 1월 7일이 일요일이다.
const A_SUNDAY = { year: 2024, month: 0, day: 7 };

/** 달력 머리글의 요일 이름 일곱 — 일요일부터 토요일까지. 달력 격자도 같은 순서다. */
export const WEEKDAY_NAMES: string[] = Array.from({ length: DAYS_PER_WEEK }, (_, index) =>
  WEEKDAY.format(new Date(A_SUNDAY.year, A_SUNDAY.month, A_SUNDAY.day + index, NOON_HOUR)));
