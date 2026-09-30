// Field 는 useState 를 쓰므로 함수로 직접 호출할 수 없습니다. react-dom/server 로 문자열로 렌더링해
// aria-invalid 값을 확인합니다. error 가 undefined 이거나 "" 일 경우 오류 상태가 아니고,
// 문구가 있을 경우에만 오류 상태입니다. 가입 화면의 관리자코드 칸이 error="" 를 넘깁니다.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { Field } from "./Field";

function markup(error: string | undefined): string {
  return renderToStaticMarkup(<Field name="f" label="칸" type="text" placeholder="" autoComplete="off" error={error} />);
}

describe("Field — 오류 상태", () => {
  it("error 가 undefined 또는 \"\" 이면 aria-invalid 가 true 가 아니고, 문구가 있으면 true 이다", () => {
    expect(markup(undefined)).not.toContain('aria-invalid="true"');
    expect(markup("")).not.toContain('aria-invalid="true"');
    expect(markup("")).not.toContain("field err");
    expect(markup("필수입니다.")).toContain('aria-invalid="true"');
    expect(markup("필수입니다.")).toContain("field err");
  });
});
