// 목록 하나가 지금 어느 상태인지. 불러오는 중·걸림·성함 셋을 문자열 한 값에 담지 않고
// 값으로 나눠 든다 — 담아 두면 오류 문구가 "loading" 일 때 불러오는 중으로 읽힌다.

import { reason } from "./api";

export type LoadState =
  | { kind: "loading" }
  | { kind: "failed"; why: string }
  | { kind: "ready" };

/** 물어본 결과를 LoadState 로 옮긴다. 다시 불러오는 동안에는 지난번 사유보다
 *  불러오는 중이 앞선다. */
export function loadState(query: { isPending: boolean; error: unknown }): LoadState {
  if (query.isPending) return { kind: "loading" };
  if (query.error === null || query.error === undefined) return { kind: "ready" };
  return { kind: "failed", why: reason(query.error) };
}

/** 목록을 못 그릴 때 그 자리에 넣을 한 줄. 언제 넣을지는 부르는 쪽이 정한다 —
 *  성한데 목록이 빈 경우가 그 자리라, 그때 쓸 문구를 empty 로 받는다. */
export function stateText(state: LoadState, empty: string): string {
  if (state.kind === "loading") return "불러오는 중…";
  return state.kind === "failed" ? state.why : empty;
}

/** 서식 아래에 띄울 사유 한 줄. 사람이 아직 아무것도 안 건드렸으면 검사 사유를
 *  숨기고, 서버가 거절한 사유는 언제나 보여준다. 없으면 빈 문자열. */
export function formError(touched: boolean, why: string, error: unknown): string {
  if (touched && why !== "") return why;
  return error === null || error === undefined ? "" : reason(error);
}
