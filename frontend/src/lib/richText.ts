// 글·댓글 본문의 서식 있는 HTML 을 다루는 규칙입니다. 편집기 자체는 components/RichText.tsx 입니다.
//
// Tiptap 으로 바꾸면서 본문이 평문에서 HTML 이 되었습니다. 저장된 HTML 을 그대로 화면에 넣으면
// 남이 작성한 글의 script 가 읽는 사람의 브라우저에서 실행됩니다. 그래서 화면에 넣기 직전에
// 허용한 태그와 속성만 남기고 전부 제거합니다.

import DOMPurify from "dompurify";

/** 편집기가 만들 수 있는 태그입니다. 목록에 없는 태그는 sanitize 할 때 제거됩니다. */
const ALLOWED_TAGS = [
  "p", "br", "strong", "em", "s", "u", "span",
  "ul", "ol", "li", "blockquote", "code", "pre",
  "h1", "h2", "h3", "a", "img",
];

/** 남길 속성입니다. style 은 글꼴 지정(font-family)에 필요하고, 나머지는 링크와 그림에 필요합니다. */
const ALLOWED_ATTR = ["href", "target", "rel", "src", "alt", "title", "style", "class"];

/** 저장된 본문을 sanitize(허용 목록에 없는 태그와 속성을 제거하는 처리)해서 화면에 넣을 수 있는
 *  HTML 로 반환합니다. script·iframe 과 on... 속성, javascript: 주소가 제거됩니다.
 *  ponytail: sanitize 는 화면에 넣기 직전에만 수행합니다. 서버는 받은 HTML 을 그대로 저장하므로,
 *  화면 말고 다른 곳(메일 발송 등)에서 본문을 내보내게 되면 그쪽에서도 sanitize 해야 합니다. */
export function sanitizeBody(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // data: 와 blob: 주소를 막습니다. 그림은 첨부한 파일의 주소만 사용합니다.
    ALLOWED_URI_REGEXP: /^(?:https?:|mailto:|\/)/i,
  });
}

/** 본문에 사람이 읽을 내용이 있는지 판단합니다.
 *  편집기는 비어 있어도 "<p></p>" 를 내놓으므로 trim 만으로는 빈 글을 걸러내지 못합니다.
 *  태그를 걷어낸 글자가 있거나 그림이 1장이라도 있으면 내용이 있는 것으로 봅니다. */
export function hasContent(html: string): boolean {
  return /<img\b/i.test(html) || textOf(html).trim() !== "";
}

/** 태그를 걷어낸 글자입니다. 글자 수 상한을 셀 때 사용합니다. HTML 태그까지 세면
 *  굵게 표시한 글이 같은 글자 수에서 먼저 상한에 걸립니다. */
export function textOf(html: string): string {
  return html
    // 블록이 끝나는 자리를 줄바꿈으로 바꿉니다. 지우기만 하면 앞뒤 문단의 글자가 붙습니다.
    .replace(/<\/(p|div|li|h[1-3]|blockquote|pre)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    // &amp; 를 마지막에 바꿉니다. 먼저 바꾸면 "&amp;lt;" 가 "<" 가 됩니다.
    .replace(/&amp;/g, "&");
}
