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
  // StarterKit 은 제목 1~6단계와 구분선을 만듭니다. 빠뜨리면 쓴 사람은 저장했는데 화면에서만
  // 사라져 왜 없어졌는지 알 수 없습니다.
  "h1", "h2", "h3", "h4", "h5", "h6", "hr",
  "a", "img",
  // 소리 재생기와 PDF·유튜브 뷰어입니다. iframe 은 주소를 아래에서 따로 제한합니다.
  "audio", "source", "iframe", "div",
];

/** 남길 속성입니다. style 은 글꼴 지정(font-family)에 필요하고, 나머지는 링크와 그림에 필요합니다. */
const ALLOWED_ATTR = [
  "href", "target", "rel", "src", "alt", "title", "style", "class",
  // 재생기와 뷰어가 쓰는 속성입니다. controls 가 없으면 소리를 재생할 수단이 화면에 없습니다.
  "controls", "preload", "type", "width", "height", "allow", "allowfullscreen", "frameborder",
  "data-youtube-video", "data-pdf",
];

/** 본문에 넣을 수 있는 주소입니다. 같은 서버의 첨부 주소(/attachments/…)와 유튜브만 허용합니다.
 *  다른 주소를 iframe 으로 열면 남이 만든 화면이 이 화면 안에서 실행됩니다. */
const ALLOWED_FRAME = /^(?:\/|https:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/embed\/)/i;

/** 저장된 본문을 sanitize(허용 목록에 없는 태그와 속성을 제거하는 처리)해서 화면에 넣을 수 있는
 *  HTML 로 반환합니다. script·iframe 과 on... 속성, javascript: 주소가 제거됩니다.
 *  ponytail: sanitize 는 화면에 넣기 직전에만 수행합니다. 서버는 받은 HTML 을 그대로 저장하므로,
 *  화면 말고 다른 곳(메일 발송 등)에서 본문을 내보내게 되면 그쪽에서도 sanitize 해야 합니다. */
export function sanitizeBody(html: string): string {
  // iframe 은 태그만 허용하면 어떤 주소든 열립니다. 주소를 직접 확인해 목록 밖이면 태그를 지웁니다.
  DOMPurify.addHook("uponSanitizeElement", (node, data) => {
    if (data.tagName !== "iframe") return;
    const src = (node as Element).getAttribute?.("src") ?? "";
    if (!ALLOWED_FRAME.test(src)) (node as Element).remove?.();
  });
  try {
    return purify(html);
  } finally {
    // hook 은 전역에 쌓입니다. 지우지 않으면 호출할 때마다 같은 hook 이 하나씩 늘어납니다.
    DOMPurify.removeHook("uponSanitizeElement");
  }
}

function purify(html: string): string {
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


/** 본문에 넣을 수 있는 형식입니다. file 은 본문에 넣지 않고 첨부 목록에만 둡니다. */
export type EmbedKind = "image" | "audio" | "pdf" | "file";

// 브라우저가 태그 하나로 여는 형식만 담습니다. heic 는 Safari 만, flac 은 Safari 가 열지 못하고,
// avi·mkv 는 어느 브라우저도 재생하지 않아 넣지 않습니다 — 깨진 그림이 뜨는 것보다 이름 줄이 낫습니다.
const IMAGE = new Set(["jpg", "jpeg", "png", "gif", "webp"]);
const AUDIO = new Set(["mp3", "wav", "m4a", "aac", "ogg"]);

/** 파일 이름을 받아 본문의 무엇으로 넣을지 반환합니다. 판정 기준은 확장자입니다. */
export function embedKind(name: string): EmbedKind {
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  if (IMAGE.has(extension)) return "image";
  if (AUDIO.has(extension)) return "audio";
  return extension === "pdf" ? "pdf" : "file";
}
