// 목록을 page(목록을 나눠 보여주는 한 쪽)로 나누는 계산입니다. 서버는 목록을 전체로 반환하므로
// 나누는 것은 화면에서 수행합니다. 글이 수백 개가 되면 서버가 끊어 주는 방식으로 전환해야 합니다.

/** 한 page에 몇 개를 둘지. */
export const PER_PAGE = 10;

/** 전체 개수로 page 수를 계산합니다. 글이 없어도 page는 하나입니다. 빈 목록을 표시할 자리가 필요합니다. */
export function pageCount(total: number, perPage: number = PER_PAGE): number {
  return Math.max(1, Math.ceil(total / perPage));
}

/** 해당 page에 놓일 것만 잘라냅니다. 범위를 벗어난 page는 빈 목록입니다. */
export function pageSlice<T>(rows: T[], page: number, perPage: number = PER_PAGE): T[] {
  const start = (page - 1) * perPage;
  return rows.slice(start, start + perPage);
}

/** page 번호를 유효한 범위 안으로 조정합니다.
 *  보고 있던 page의 글이 삭제되어 page가 사라지는 경우가 있어서, 표시할 때마다 검증합니다. */
export function clampPage(page: number, count: number): number {
  return Math.min(Math.max(page, 1), count);
}

/** page 버튼에 몇 번을 표시할지입니다. page가 많아도 다섯 개만 보이고, 현재 page가 가운데 옵니다.
 *  양 끝에서는 가운데를 고집하지 않고 밀거나 당겨 다섯 개를 채웁니다. 끝에서 버튼이 셋으로 줄면
 *  누를 곳이 갑자기 좁아집니다. */
export function pageWindow(page: number, count: number, size: number = 5): number[] {
  const width = Math.min(size, count);
  const half = Math.floor(width / 2);
  const start = Math.min(Math.max(page - half, 1), count - width + 1);
  return Array.from({ length: width }, (_, index) => start + index);
}
