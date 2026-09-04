// 달력이 쓰는 계산. 날짜와 칸 번호만 다루고 화면도 서버도 건드리지 않는다.

const SLOTS_PER_HOUR = 2;
const DAYS_PER_WEEK = 7;
// 합주실이 하나도 없을 때 쓸 여닫는 시각 — 달력을 그릴 시간 범위가 아예 없을 수는 없다.
const FALLBACK_OPEN_HOUR = 10;
const FALLBACK_CLOSE_HOUR = 22;

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
  // 여는 시각을 0번으로 둔 칸 번호를 "18:30" 으로 적는다.
  const hour = openHour + Math.floor(index / SLOTS_PER_HOUR);
  const minute = index % SLOTS_PER_HOUR ? "30" : "00";
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

export function hoursLabel(slots: number): string {
  // 30분 칸 개수를 "3시간 30분" 으로 적는다. 화면에는 칸이 아니라 시각으로 말한다.
  const hours = Math.floor(slots / SLOTS_PER_HOUR);
  return slots % SLOTS_PER_HOUR ? `${hours}시간 30분` : `${hours}시간`;
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
    // 22시 30분에 닫으면 23시까지 칸이 그려져야 그 자리가 보인다.
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

export function datesBetween(from: string, to: string): string[] {
  // "2026-09-14" 부터 "2026-09-17" 까지의 날짜를 양 끝 포함해 잇는다.
  // 정오를 기준으로 하루씩 더해 나간다. 자정으로 세면 여름시간제가 있는 지역에서
  // 하루가 23시간인 날에 날짜 하나를 건너뛴다.
  const cursor = new Date(`${from}T12:00:00`);
  const last = new Date(`${to}T12:00:00`);
  const days: string[] = [];
  while (cursor <= last) {
    days.push(
      `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}-${String(cursor.getDate()).padStart(2, "0")}`,
    );
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}
