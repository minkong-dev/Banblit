// Pager 는 hook 이 없어 react-dom/server 로 문자열 렌더링해 확인합니다.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { Pager } from "./Pager";

const render = (page: number, pages: number): string =>
  renderToStaticMarkup(<Pager page={page} pages={pages} onPage={() => {}} />);

describe("Pager — 이전·다음 버튼과 현재 쪽", () => {
  it("첫 쪽에서는 이전 버튼만 disabled 이다", () => {
    const html = render(1, 3);

    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="이전 목록"/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*aria-label="다음 목록"/);
  });

  it("마지막 쪽에서는 다음 버튼만 disabled 이다", () => {
    const html = render(3, 3);

    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="다음 목록"/);
    expect(html).not.toMatch(/<button[^>]*disabled=""[^>]*aria-label="이전 목록"/);
  });

  it("현재 쪽 번호에만 aria-current=page 가 붙는다", () => {
    const html = render(2, 3);

    expect(html.match(/aria-current="page"/g)).toHaveLength(1);
    expect(html).toMatch(/aria-label="2페이지" aria-current="page"/);
  });
});
