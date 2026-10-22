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
 *  조회가 1회 이상 실패했고 받아 둔 값이 없으면 true 입니다. errorUpdateCount 로 판정하므로 재조회 중에도 유지됩니다. */
export function stillUnresolved(query: { data: unknown; errorUpdateCount: number }): boolean {
  return query.data === undefined && query.errorUpdateCount > 0;
}

// crashDetail 은 ErrorBoundary 가 표시하는 오류 상세 문구입니다. 화면 렌더링 중 발생한 error 는 서버 응답이 아니라
// 코드의 결함이므로, lib/api.ts 의 reason 과 달리 사용자용 안내로 치환하지 않고 원문을 그대로 전달합니다.
// 운영자가 이 문구를 그대로 옮겨 적으면 어느 줄에서 발생했는지 찾을 수 있습니다.
/** 렌더링 중 발생한 error 를 한 줄 문자열로 변환합니다.
 *
 *  Error 일 경우 "이름: 메시지" 를 반환하고, 메시지가 비어 있으면 이름만 반환합니다.
 *  null 과 undefined 는 빈 문자열을 반환합니다.
 *
 *  throw 는 어떤 값으로도 가능하므로 Error 가 아닌 값도 들어옵니다. 문자열과 숫자 같은 원시 값은
 *  그대로 변환하고, 객체는 JSON 으로 변환합니다. 객체에 String 을 적용하면 내용과 무관하게
 *  "[object Object]" 가 되어 원인을 찾을 수 없습니다. 순환 참조처럼 JSON 으로 변환할 수 없는
 *  값은 종류만 반환합니다. */
export function crashDetail(error: unknown): string {
  if (error === null || error === undefined) return "";
  if (error instanceof Error) {
    return error.message === "" ? error.name : `${error.name}: ${error.message}`;
  }
  if (typeof error === "object") {
    try {
      return JSON.stringify(error) ?? "표시할 수 없는 object 오류";
    } catch {
      return "표시할 수 없는 object 오류";
    }
  }
  // typeof 마다 분기합니다. unknown 에 String 을 그대로 적용하면 함수와 객체가
  // "[object Object]" 로 변환되는 것을 lint 가 막습니다.
  switch (typeof error) {
    case "string":
      return error;
    case "number":
    case "boolean":
    case "bigint":
      return String(error);
    case "symbol":
      return error.toString();
    default:
      return `표시할 수 없는 ${typeof error} 오류`;
  }
}
