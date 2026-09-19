// ErrorBoundary 가 표시하는 오류 상세 문구입니다. 화면 렌더링 중 발생한 error 는 서버 응답이 아니라
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
  // "[object Object]" 로 변환되는 것을 검사 도구가 막습니다.
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
