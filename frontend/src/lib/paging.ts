// 목록을 쪽으로 나누는 계산. 서버는 목록을 통째로 주므로 나누는 것은 화면이 한다 —
// 글이 몇백 개가 되면 서버가 끊어 주는 쪽으로 옮겨야 한다.

/** 한 쪽에 몇 개를 둘지. */
export const PER_PAGE = 10;

/** 전체 개수로 쪽 수를 센다. 글이 없어도 쪽은 하나다 — 빈 목록을 보여줄 자리가 필요하다. */
export function pageCount(total: number, perPage: number = PER_PAGE): number {
  return Math.max(1, Math.ceil(total / perPage));
}

/** 그 쪽에 놓일 것만 잘라 낸다. 범위를 벗어난 쪽은 빈 목록이다. */
export function pageSlice<T>(rows: T[], page: number, perPage: number = PER_PAGE): T[] {
  const start = (page - 1) * perPage;
  return rows.slice(start, start + perPage);
}

/** 쪽 번호를 있는 범위 안으로 당긴다.
 *  보고 있던 쪽의 글이 지워져 쪽이 사라지는 경우가 있어, 그릴 때마다 한 번 거른다. */
export function clampPage(page: number, count: number): number {
  return Math.min(Math.max(page, 1), count);
}

/** 쪽 단추에 몇 번을 내놓을지. 쪽이 많아도 다섯 개만 보이고, 지금 쪽이 그 가운데 온다.
 *  양 끝에서는 가운데를 고집하지 않고 밀거나 당겨 다섯 개를 채운다 — 끝에서 단추가
 *  세 개로 줄면 누를 곳이 갑자기 좁아진다. */
export function pageWindow(page: number, count: number, size: number = 5): number[] {
  const width = Math.min(size, count);
  const half = Math.floor(width / 2);
  const start = Math.min(Math.max(page - half, 1), count - width + 1);
  return Array.from({ length: width }, (_, index) => start + index);
}
