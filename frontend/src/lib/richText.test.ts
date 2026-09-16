// DOMPurify 는 브라우저의 DOM 을 사용해 태그를 판정합니다. vitest 는 Node 에서 돌아 DOM 이 없으므로
// 이 파일만 DOM 환경에서 실행합니다. 나머지 test 는 문자열 계산이라 Node 로 충분합니다.
// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { hasContent, sanitizeBody, textOf } from "./richText";

describe("sanitizeBody — 남이 쓴 본문에서 허용하지 않은 태그와 속성을 제거한다", () => {
  it("서식 태그는 남긴다", () => {
    const kept = sanitizeBody("<p><strong>굵게</strong> 그리고 <em>기울임</em></p>");

    expect(kept).toBe("<p><strong>굵게</strong> 그리고 <em>기울임</em></p>");
  });

  it("script 를 제거한다", () => {
    expect(sanitizeBody("<p>본문</p><script>alert(1)</script>")).toBe("<p>본문</p>");
  });

  it("이벤트 속성을 제거한다", () => {
    expect(sanitizeBody('<p onclick="alert(1)">본문</p>')).toBe("<p>본문</p>");
  });

  it("javascript: 주소를 제거한다", () => {
    expect(sanitizeBody('<a href="javascript:alert(1)">눌러</a>')).toBe("<a>눌러</a>");
  });

  it("http 주소는 남긴다", () => {
    const kept = sanitizeBody('<a href="https://example.com">예시</a>');

    expect(kept).toContain('href="https://example.com"');
  });

  it("글꼴 지정은 남긴다", () => {
    const kept = sanitizeBody('<span style="font-family: Georgia">본문</span>');

    expect(kept).toContain("font-family");
  });
});

describe("hasContent — 편집기가 내놓은 빈 본문을 걸러낸다", () => {
  it("빈 문단만 있으면 내용이 없다", () => {
    expect(hasContent("<p></p>")).toBe(false);
  });

  it("공백만 있어도 내용이 없다", () => {
    expect(hasContent("<p>   </p>")).toBe(false);
  });

  it("글자가 있으면 내용이 있다", () => {
    expect(hasContent("<p>본문</p>")).toBe(true);
  });

  it("글자가 없어도 그림이 있으면 내용이 있다", () => {
    expect(hasContent('<p><img src="/files/1" alt="" /></p>')).toBe(true);
  });
});

describe("textOf — 글자 수를 셀 때 쓰는 평문", () => {
  it("태그를 걷어낸다", () => {
    expect(textOf("<p><strong>가나</strong>다</p>").trim()).toBe("가나다");
  });

  it("문단이 끝나는 자리를 줄바꿈으로 바꿔 글자가 붙지 않게 한다", () => {
    expect(textOf("<p>가</p><p>나</p>").trim()).toBe("가\n나");
  });

  it("문자 참조를 원래 글자로 되돌린다", () => {
    expect(textOf("<p>&lt;태그&gt; &amp; 그리고</p>").trim()).toBe("<태그> & 그리고");
  });
});
