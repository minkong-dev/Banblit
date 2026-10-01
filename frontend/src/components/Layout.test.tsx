// Layout 의 Tabs·Panel 은 hook 이 없어 react-dom/server 로 문자열 렌더링해 확인합니다.

import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import { Panel, Tabs } from "./Layout";

describe("Tabs — 선택 상태", () => {
  it("selected 와 같은 key 의 탭만 aria-selected=true 이다", () => {
    const html = renderToStaticMarkup(
      <Tabs label="구분" items={[{ key: "a", text: "가" }, { key: "b", text: "나" }]} selected="b" onSelect={() => {}} />,
    );

    expect(html).toContain('role="tablist" aria-label="구분"');
    expect(html).toContain('aria-selected="true">나');
    expect(html).toContain('aria-selected="false">가');
  });
});

describe("Panel — 제목 줄", () => {
  it("onOpen 이 없으면 제목 줄이 button 이 아니라 div 이다", () => {
    const html = renderToStaticMarkup(<Panel title="공지"><p>x</p></Panel>);

    expect(html).toContain('<div class="ph">공지</div>');
    expect(html).not.toContain("<button");
  });

  it("onOpen 이 있으면 제목 줄이 button 이고, hint 가 있을 때만 span 을 그린다", () => {
    const withHint = renderToStaticMarkup(<Panel title="공지" hint="3건" onOpen={() => {}}><p>x</p></Panel>);
    const noHint = renderToStaticMarkup(<Panel title="공지" onOpen={() => {}}><p>x</p></Panel>);

    expect(withHint).toContain('<button class="ph">공지<span>3건</span></button>');
    expect(noHint).toContain('<button class="ph">공지</button>');
  });
});
