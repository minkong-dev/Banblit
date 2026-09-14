// 목록을 page(목록을 나눠 보여주는 한 쪽)로 나누는 계산입니다. 서버는 목록을 전체로 반환하므로
// 나누는 것은 화면에서 수행합니다. 글이 수백 개가 되면 서버가 끊어 주는 방식으로 전환해야 합니다.

/** 한 page 에 표시할 항목 수입니다. */
export const PER_PAGE = 10;

/** 전체 개수로 page 수를 계산합니다. 글이 없어도 page는 하나입니다. 빈 목록을 표시할 자리가 필요합니다. */
export function pageCount(total: number, perPage: number = PER_PAGE): number {
  return Math.max(1, Math.ceil(total / perPage));
}

/** 해당 page 에 속하는 항목만 잘라냅니다. 범위를 벗어난 page 는 빈 목록입니다. */
export function pageSlice<T>(rows: T[], page: number, perPage: number = PER_PAGE): T[] {
  const start = (page - 1) * perPage;
  return rows.slice(start, start + perPage);
}

/** page 번호를 유효한 범위 안으로 조정합니다.
 *  보고 있던 page의 글이 삭제되어 page가 사라지는 경우가 있어서, 표시할 때마다 검증합니다. */
export function clampPage(page: number, count: number): number {
  return Math.min(Math.max(page, 1), count);
}

/** page 버튼에 표시할 번호 목록입니다. page 가 많아도 5개만 표시하고, 현재 page 가 가운데에 옵니다.
 *  양 끝에서는 가운데 배치를 포기하고 5개를 채웁니다. 끝에서 버튼이 3개로 줄면
 *  클릭 영역이 갑자기 좁아지기 때문입니다. */
export function pageWindow(page: number, count: number, size: number = 5): number[] {
  const width = Math.min(size, count);
  const half = Math.floor(width / 2);
  const start = Math.min(Math.max(page - half, 1), count - width + 1);
  return Array.from({ length: width }, (_, index) => start + index);
}
