// Dropdown 은 useLocation 을 쓰므로 MemoryRouter 로 감싸 react-dom/server 로 닫힌 상태를 렌더링합니다.
// 키보드·열림 동작은 서버 렌더링으로 일으킬 수 없어 확인하지 않습니다. lib/dropdown.ts 의 계산은 그쪽 테스트가 맡습니다.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { MemoryRouter } from "react-router-dom";

import { Dropdown } from "./Dropdown";

const choices = [{ value: "a", label: "가" }, { value: "b", label: "나" }];

type Extra = { placeholder?: string; invalid?: boolean; disabled?: boolean; className?: string };

function render(value: string, extra: Extra = {}): string {
  return renderToStaticMarkup(
    <MemoryRouter>
      <Dropdown value={value} choices={choices} onChange={() => {}} ariaLabel="구분" {...extra} />
    </MemoryRouter>,
  );
}

describe("Dropdown — 닫힌 상태의 버튼", () => {
  it("선택한 값의 label 을 표시하고 목록은 그리지 않는다", () => {
    const html = render("b");

    expect(html).toContain("<span>나</span>");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain("<li");
  });

  it("value 가 선택지에 없으면 placeholder 를 ddempty class 로 표시한다", () => {
    const html = render("zzz", { placeholder: "고르세요" });

    expect(html).toContain('<span class="ddempty">고르세요</span>');
  });

  it("invalid 면 bad class, disabled 면 disabled 속성이 붙는다", () => {
    expect(render("a", { invalid: true, className: "x" })).toContain('class="ddbtn x bad"');
    expect(render("a")).not.toContain("bad");
    expect(render("a", { disabled: true })).toContain('disabled=""');
  });
});
