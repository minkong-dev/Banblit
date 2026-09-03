// 달력이 쓰는 계산. 날짜와 칸 번호만 다루고 화면도 서버도 건드리지 않는다.

const SLOTS_PER_HOUR = 2;
const DAYS_PER_WEEK = 7;

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

export function datesBetween(from: string, to: string): string[] {
  // "2026-09-14" 부터 "2026-09-17" 까지의 날짜를 양 끝 포함해 잇는다.
  // 정오로 만들어 세는 이유는, 자정으로 두면 여름시간제가 있는 지역에서 하루가
  // 23시간이 되는 날에 날짜가 하나 건너뛰기 때문이다.
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
