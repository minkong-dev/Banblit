// Avatar 의 첫 렌더링(사진 없음 판정 전)을 react-dom/server 로 문자열 렌더링해 확인합니다.
// onError 이후의 전환은 서버 렌더링으로 일으킬 수 없어 확인하지 않습니다.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { Avatar } from "./Avatar";

describe("Avatar — 사진·이름 표시", () => {
  it("id 가 null 이면 사진을 요청하지 않고 이름 앞 두 글자를 aria-hidden 으로 표시한다", () => {
    const html = renderToStaticMarkup(<Avatar id={null} name="김민수" />);

    expect(html).not.toContain("<img");
    expect(html).toContain('<span class="face" aria-hidden="true">김민</span>');
  });

  it("id 가 있으면 계정 번호로 사진 주소를 만들고 alt 는 비워 둔다", () => {
    const html = renderToStaticMarkup(<Avatar id={7} name="김민수" />);

    expect(html).toContain('/members/7/avatar"');
    expect(html).toContain('alt=""');
  });

  it("photo 파일명이 있으면 ?v= 로 붙여 사진이 바뀔 때 다시 불러오게 한다", () => {
    const html = renderToStaticMarkup(<Avatar id={7} name="김민수" photo="p1.png" className="big" />);

    expect(html).toContain("/members/7/avatar?v=p1.png");
    expect(html).toContain('class="big"');
  });
});
