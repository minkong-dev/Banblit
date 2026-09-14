// 목록 하나가 현재 어느 상태인지 나타냅니다. 불러오는 중·오류·성공 셋을 하나의 문자열 값에 담지 않고
// 값으로 나누어 관리합니다 — 담아 두면 오류 문구가 "loading"일 때 불러오는 중으로 읽힙니다.

import { reason } from "./api";

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

/** 목록을 표시할 수 없을 때 그 자리에 표시할 메시지입니다. 표시할 시점은 호출 지점에서 정합니다 —
 *  성공했으나 목록이 비어 있는 경우가 그 자리이며, 그때 표시할 메시지를 empty로 받습니다. */
export function stateText(state: LoadState, empty: string): string {
  if (state.kind === "loading") return "불러오는 중…";
  return state.kind === "failed" ? state.why : empty;
}

/** 폼 아래에 표시할 오류 메시지입니다. 사용자가 아직 값을 수정하지 않으면 유효성 검사 오류를
 *  숨기고, 서버가 거절한 오류는 항상 표시합니다. 없으면 빈 문자열입니다. */
export function formError(touched: boolean, why: string, error: unknown): string {
  if (touched && why !== "") return why;
  return error === null || error === undefined ? "" : reason(error);
}
