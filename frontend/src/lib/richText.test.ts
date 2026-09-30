// DOMPurify 는 브라우저의 DOM 을 사용해 태그를 판정합니다. vitest 는 Node 에서 돌아 DOM 이 없으므로
// 이 파일만 DOM 환경에서 실행합니다. 나머지 test 는 문자열 계산이라 Node 로 충분합니다.
// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { PALETTE, embedKind, hasContent, hslHex, linkProblem, sanitizeBody, textOf, usedColors } from "./richText";

describe("hslHex — HSL 을 #rrggbb 로 변환", () => {
  it("채도 0 은 무채색을 반환한다", () => {
    expect(hslHex(0, 0, 0)).toBe("#000000");
    expect(hslHex(0, 100, 0)).toBe("#ffffff");
    expect(hslHex(120, 50, 0)).toBe("#808080");
  });

  it("밝기 50 채도 100 은 원색을 반환한다", () => {
    expect(hslHex(0, 50, 100)).toBe("#ff0000");
    expect(hslHex(120, 50, 100)).toBe("#00ff00");
    expect(hslHex(240, 50, 100)).toBe("#0000ff");
  });

  it("두 자리가 되도록 0 을 채운다", () => {
    // 각 색 성분이 한 자리(예: 0x5)일 때 "#5..." 가 아니라 "#05..." 가 되어야 합니다.
    expect(hslHex(0, 2, 100)).toMatch(/^#[0-9a-f]{6}$/);
  });
});

describe("PALETTE — 팔레트에 들어가는 색 전부", () => {
  it("무채색 8칸과 색 계열 8줄로 72칸이다", () => {
    expect(PALETTE).toHaveLength(72);
  });

  it("전부 #rrggbb 형식이다", () => {
    for (const color of PALETTE) expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
});

describe("usedColors — 본문에 실제로 쓰인 색", () => {
  it("색이 없으면 빈 배열을 반환한다", () => {
    expect(usedColors("<p>글자</p>")).toEqual([]);
  });

  it("color 와 background-color 를 모두 모은다", () => {
    expect(usedColors('<span style="color: #ff0000">가</span><span style="background-color: #00ff00">나</span>'))
      .toEqual(["#ff0000", "#00ff00"]);
  });

  it("같은 색이 여러 번 나오면 한 번만 반환한다", () => {
    expect(usedColors('<span style="color:#ff0000">가</span><span style="color:#ff0000">나</span>'))
      .toEqual(["#ff0000"]);
  });

  it("대문자를 소문자로 변환한다", () => {
    expect(usedColors('<span style="color: #AABBCC">가</span>')).toEqual(["#aabbcc"]);
  });

  it("최대 8개까지 반환한다", () => {
    const html = PALETTE.slice(0, 20).map((color) => `<span style="color:${color}">가</span>`).join("");
    expect(usedColors(html)).toHaveLength(8);
  });

  it("rgb() 처럼 괄호가 있는 값도 그대로 반환한다", () => {
    expect(usedColors('<span style="color: rgb(255, 0, 0)">가</span>')).toEqual(["rgb(255, 0, 0)"]);
  });
});

describe("linkProblem — 링크 주소를 쓸 수 없는 사유", () => {
  it("빈 주소는 사유가 없다", () => {
    // 링크 dialog 를 열자마자 빨간 문구가 표시되지 않게, 아직 입력하지 않은 상태는 통과시킵니다.
    expect(linkProblem("")).toBe("");
    expect(linkProblem("   ")).toBe("");
  });

  it("http·https·mailto 와 / 로 시작하는 주소를 허용한다", () => {
    expect(linkProblem("http://example.com")).toBe("");
    expect(linkProblem("https://example.com/a?b=1")).toBe("");
    expect(linkProblem("mailto:a@example.com")).toBe("");
    expect(linkProblem("/notices/3")).toBe("");
  });

  it("대소문자를 구분하지 않는다", () => {
    expect(linkProblem("HTTPS://example.com")).toBe("");
  });

  it("앞뒤 공백을 제거한 뒤 판정한다", () => {
    expect(linkProblem("  https://example.com  ")).toBe("");
  });

  it("javascript: 주소는 사유를 반환한다", () => {
    expect(linkProblem("javascript:alert(1)")).toBe("http 또는 https 로 시작하는 주소를 입력해주세요.");
  });

  it("data: 와 blob: 주소도 사유를 반환한다", () => {
    expect(linkProblem("data:text/html,<script>alert(1)</script>")).not.toBe("");
    expect(linkProblem("blob:https://example.com/abc")).not.toBe("");
  });

  it("scheme 이 없는 주소는 사유를 반환한다", () => {
    expect(linkProblem("example.com")).not.toBe("");
  });

  it("sanitizeBody 가 제거하는 주소를 통과시키지 않는다", () => {
    // 두 곳의 기준이 어긋나면 dialog 는 허용하는데 저장 시 제거되거나 그 반대가 됩니다.
    // 같은 정규식(ALLOWED_URI)을 참조하는지 검사합니다.
    for (const url of ["javascript:alert(1)", "data:text/html,x", "vbscript:x", "file:///etc/passwd"]) {
      expect(linkProblem(url)).not.toBe("");
      expect(sanitizeBody(`<a href="${url}">링크</a>`)).not.toContain(url);
    }
  });
});

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

describe("sanitizeBody — iframe 은 허용한 주소만 남긴다", () => {
  it("유튜브 임베드 주소는 남긴다", () => {
    const kept = sanitizeBody('<iframe src="https://www.youtube.com/embed/abc123"></iframe>');

    expect(kept).toContain("youtube.com/embed/abc123");
  });

  it("남긴 iframe 에는 referrerpolicy 를 붙인다", () => {
    // 배포가 문서 전체에 Referrer-Policy: same-origin 을 내리므로, 이것이 없으면 유튜브가
    // Referer 를 받지 못해 재생 화면에 오류 153 을 표시합니다. 이 값이 붙기 전에 저장된 글도
    // 화면에 넣는 시점에 붙습니다.
    const kept = sanitizeBody('<iframe src="https://www.youtube-nocookie.com/embed/abc123"></iframe>');

    expect(kept).toContain('referrerpolicy="strict-origin-when-cross-origin"');
  });

  it("첨부 파일 주소(같은 서버)는 남긴다", () => {
    expect(sanitizeBody('<iframe src="/api/attachments/7"></iframe>')).toContain("iframe");
  });

  it("남의 주소는 태그째 지운다", () => {
    expect(sanitizeBody('<iframe src="https://evil.example.com/page"></iframe>')).toBe("");
  });

  it("주소가 없는 iframe 도 지운다", () => {
    expect(sanitizeBody("<iframe></iframe>")).toBe("");
  });

  it("여러 번 불러도 판정이 그대로다", () => {
    const bad = '<iframe src="https://evil.example.com/page"></iframe>';
    sanitizeBody(bad);
    sanitizeBody(bad);

    expect(sanitizeBody(bad)).toBe("");
  });
});

describe("sanitizeBody — 편집기가 만드는 나머지 태그", () => {
  it("구분선과 4단계 제목을 남긴다", () => {
    const kept = sanitizeBody("<hr><h4>소제목</h4>");

    expect(kept).toContain("<hr>");
    expect(kept).toContain("<h4>소제목</h4>");
  });

  it("소리 재생기를 남긴다", () => {
    const kept = sanitizeBody('<audio controls src="/api/attachments/3"></audio>');

    expect(kept).toContain("controls");
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

  it("소리·PDF·유튜브·표만 있어도 내용이 있는 것으로 본다", () => {
    // 본문에 넣은 것만으로 글이 완성되는 경우입니다. 글자를 더 쓰라고 요구하지 않습니다.
    expect(hasContent('<p><audio src="/api/attachments/1/inline"></audio></p>')).toBe(true);
    expect(hasContent('<iframe data-pdf src="/api/attachments/2/inline"></iframe>')).toBe(true);
    expect(hasContent('<div data-youtube-video><iframe src="https://www.youtube-nocookie.com/embed/x"></iframe></div>')).toBe(true);
    expect(hasContent("<table><tbody><tr><td></td></tr></tbody></table>")).toBe(true);
    expect(hasContent("<hr>")).toBe(true);
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

describe("embedKind — 떨군 파일을 본문의 무엇으로 넣을지", () => {
  it("그림은 미리보기로 넣는다", () => {
    expect(embedKind("악보.png")).toBe("image");
    expect(embedKind("사진.JPG")).toBe("image");
  });

  it("소리는 재생기로 넣는다", () => {
    expect(embedKind("데모.mp3")).toBe("audio");
    expect(embedKind("합주.m4a")).toBe("audio");
  });

  it("PDF 는 뷰어로 넣는다", () => {
    expect(embedKind("악보.pdf")).toBe("pdf");
  });

  it("브라우저가 못 여는 형식은 본문에 넣지 않는다", () => {
    expect(embedKind("자료.zip")).toBe("file");
    expect(embedKind("사진.heic")).toBe("file");
    expect(embedKind("이름없음")).toBe("file");
  });
});
