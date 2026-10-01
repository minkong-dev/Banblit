// 목록 하나가 현재 어느 상태인지 나타냅니다. 불러오는 중·오류·성공 셋을 하나의 문자열 값에 담지 않고
// 별도 값으로 나누어 관리합니다. 하나에 담으면 오류 문구가 "loading" 일 때 불러오는 중으로 잘못 판정됩니다.

import { reason } from "./api";

/** 조회가 끝나지 않았을 때 그 자리에 표시할 문구입니다. 화면마다 다른 문구를 쓰지 않도록 한 곳에서 보유합니다. */
export const LOADING_TEXT = "불러오는 중…";

export type LoadState =
  | { kind: "loading" }
  | { kind: "failed"; why: string }
  | { kind: "ready" };

/** 조회(TanStack Query가 관리하는 서버 조회 하나) 결과를 LoadState로 변환합니다. 다시 불러오는 동안에는
 *  이전의 오류 메시지보다 불러오는 중이 우선합니다. */
export function loadState(query: { isPending: boolean; error: unknown }): LoadState {
  if (query.isPending) return { kind: "loading" };
  if (query.error === null || query.error === undefined) return { kind: "ready" };
  return { kind: "failed", why: reason(query.error) };
}

/** 화면 하나가 여러 조회를 함께 쓸 때, 그중 처음 실패한 조회의 사유입니다.
 *  전부 성공했을 경우 빈 문자열을 반환합니다.
 *
 *  TanStack Query 는 실패하지 않은 조회의 error 를 null 로 두므로 null 과 undefined 를
 *  성공으로 판정합니다. 조회 하나가 실패해도 그 자리에 ?? [] 가 빈 배열을 주어 화면이
 *  "등록된 항목이 없음" 과 같아집니다. 실패를 표시하지 않으면 사용자가 그 둘을 구분할 수 없습니다. */
export function firstWhy(errors: readonly unknown[]): string {
  const failed = errors.find((error) => error !== null && error !== undefined);
  return failed === undefined ? "" : reason(failed);
}

/** 목록을 표시할 수 없을 때 그 자리에 표시할 메시지입니다. 조회에 성공했으나 목록이 비어 있는
 *  경우에 표시할 메시지는 empty 로 받습니다. */
export function stateText(state: LoadState, empty: string): string {
  if (state.kind === "loading") return LOADING_TEXT;
  return state.kind === "failed" ? state.why : empty;
}

/** 폼 아래에 표시할 오류 메시지입니다. 사용자가 아직 값을 수정하지 않으면 유효성 검사 오류를
 *  숨기고, 서버가 거절한 오류는 항상 표시합니다. 없으면 빈 문자열입니다. */
export function formError(touched: boolean, why: string, error: unknown): string {
  if (touched && why !== "") return why;
  return error === null || error === undefined ? "" : reason(error);
}

/** 조회가 한 번 이상 실패했고 아직 받아 둔 값이 없으면 true 를 반환합니다. 다시 조회하는 동안에도 유지됩니다.
 *
 *  받아 둔 값이 없는 조회를 다시 조회하면 TanStack Query 는 error 를 null 로, status 를 pending 으로
 *  되돌립니다(query-core 의 fetchState). error 나 LoadState 로 판정하면 재조회마다 안내가 사라졌다가
 *  실패하면 다시 나타나, 화면이 흔들리고 role="alert" 이 폴링 주기마다 다시 읽힙니다.
 *  errorUpdateCount 는 실패할 때마다 1 증가하고 성공해도 줄지 않으므로, 받아 둔 값의 유무와 함께 쓰면
 *  "한 번 실패한 뒤 아직 성공하지 못함" 을 재조회 중에도 같은 값으로 판정합니다. */
export function stillUnresolved(query: { data: unknown; errorUpdateCount: number }): boolean {
  return query.data === undefined && query.errorUpdateCount > 0;
}
