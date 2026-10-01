// CheckMark 는 hook 이 없어 react-dom/server 로 문자열 렌더링해 확인합니다.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { CheckMark } from "./CheckMark";

describe("CheckMark — 실제 checkbox input", () => {
  it("보이지 않게 둘 뿐 type=checkbox input 을 그린다(키보드·스크린 리더용)", () => {
    const html = renderToStaticMarkup(<CheckMark name="n" />);

    expect(html).toContain('type="checkbox"');
    expect(html).toContain('name="n"');
  });

  it("checked 를 넘기면 선택 상태로, 넘기지 않으면 속성 없이 그린다", () => {
    expect(renderToStaticMarkup(<CheckMark checked onChange={() => {}} />)).toContain('checked=""');
    expect(renderToStaticMarkup(<CheckMark />)).not.toContain("checked");
  });
});
