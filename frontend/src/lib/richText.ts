// 글·댓글 본문의 서식 있는 HTML 을 다루는 규칙입니다. 편집기 자체는 components/RichText.tsx 입니다.
//
// Tiptap 으로 변경하면서 본문이 평문에서 HTML 이 되었습니다. 저장된 HTML 을 그대로 화면에 넣으면
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
  // 소리 audio player 와 PDF·유튜브 뷰어입니다. iframe 은 주소를 아래에서 따로 제한합니다.
  "audio", "source", "iframe", "div",
];

/** 남길 속성입니다. style 은 글꼴 지정(font-family)에 필요하고, 나머지는 링크와 그림에 필요합니다. */
const ALLOWED_ATTR = [
  "href", "target", "rel", "src", "alt", "title", "style", "class",
  // audio player 와 뷰어가 사용하는 속성입니다. controls 가 없으면 소리를 재생할 수단이 화면에 없습니다.
  "controls", "preload", "type", "width", "height", "allow", "allowfullscreen", "frameborder",
  "data-youtube-video", "data-pdf",
  // 아래 sanitizeBody 가 iframe 에 붙이는 값입니다. 목록에 없으면 붙이는 즉시 제거됩니다.
  "referrerpolicy",
];

/** 본문에 넣을 수 있는 주소입니다. 같은 서버의 첨부 주소(/attachments/…)와 유튜브만 허용합니다.
 *  다른 주소를 iframe 으로 열면 남이 만든 화면이 이 화면 안에서 실행됩니다. */
const ALLOWED_FRAME = /^(?:\/|https:\/\/(?:www\.)?youtube(?:-nocookie)?\.com\/embed\/)/i;

/** 저장된 본문을 sanitize(허용 목록에 없는 태그와 속성을 제거하는 처리)해서 화면에 넣을 수 있는
 *  HTML 로 반환합니다. script·iframe 과 on... 속성, javascript: 주소가 제거됩니다.
 *  ponytail: sanitize 는 화면에 넣기 직전에만 수행합니다. 서버는 받은 HTML 을 그대로 저장하므로,
 *  화면 말고 다른 곳(메일 발송 등)에서 본문을 내보내게 되면 그쪽에서도 sanitize 해야 합니다. */
export function sanitizeBody(html: string): string {
  // iframe 은 태그만 허용하면 어떤 주소든 열립니다. 주소를 직접 확인해 목록 밖이면 태그를 삭제합니다.
  DOMPurify.addHook("uponSanitizeElement", (node, data) => {
    if (data.tagName !== "iframe") return;
    const src = (node as Element).getAttribute?.("src") ?? "";
    if (!ALLOWED_FRAME.test(src)) (node as Element).remove?.();
  });
  // 배포는 문서 전체에 Referrer-Policy: same-origin 을 내려(deploy/Caddyfile) 다른 출처로 나가는
  // 요청에 Referer 를 붙이지 않습니다. 유튜브는 Referer 가 없으면 재생 화면에
  // "동영상 플레이어 구성 오류"(153)를 표시하므로, 살아남은 iframe 에 출처(경로 제외)만 보내게 합니다.
  // 편집기에서 넣을 때도 같은 값을 붙이지만(components/RichText.tsx), 그 전에 저장된 글에는
  // 없으므로 화면에 넣는 이 자리에서 붙입니다.
  // 속성을 붙이는 자리가 위 hook 이 아닌 이유: 위는 속성 검사 전이라 붙여도 그 검사에서 지워집니다.
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.nodeName !== "IFRAME") return;
    node.setAttribute("referrerpolicy", "strict-origin-when-cross-origin");
  });
  try {
    return purify(html);
  } finally {
    // hook 은 전역에 쌓입니다. 삭제하지 않으면 호출할 때마다 같은 hook 이 하나씩 늘어납니다.
    DOMPurify.removeAllHooks();
  }
}

/** href·src 에 쓸 수 있는 주소입니다. javascript:·data:·blob: 같은 주소를 막습니다.
 *  그림은 첨부한 파일의 주소만 사용합니다.
 *  저장할 때 제거하는 기준(purify)과 링크 dialog 가 거절하는 기준(linkProblem)이 이 값 하나입니다.
 *  두 곳에 따로 적으면 한쪽만 수정했을 때 dialog 는 허용하는데 저장 시 제거되거나 그 반대가 됩니다. */
const ALLOWED_URI = /^(?:https?:|mailto:|\/)/i;

function purify(html: string): string {
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOWED_URI_REGEXP: ALLOWED_URI,
  });
}

/** 링크 주소를 쓸 수 없는 사유입니다. 쓸 수 있을 경우 빈 문자열을 반환합니다.
 *  아직 입력하지 않은 빈 주소도 빈 문자열을 반환합니다 — dialog 를 열자마자 사유가
 *  표시되지 않게 합니다. 판정은 앞뒤 공백을 제거한 뒤 합니다. */
export function linkProblem(url: string): string {
  const trimmed = url.trim();
  if (trimmed === "") return "";
  return ALLOWED_URI.test(trimmed) ? "" : "http 또는 https 로 시작하는 주소를 입력해주세요.";
}

/** 팔레트 맨 윗줄의 무채색 8칸입니다. 검정에서 흰색까지입니다. */
const GREYS = ["#000000", "#444444", "#666666", "#999999", "#BBBBBB", "#DDDDDD", "#EEEEEE", "#FFFFFF"];

/** 팔레트의 색 계열 8가지입니다. 빨강부터 자홍까지 색상환을 8등분한 값입니다(HSL 의 hue). */
const HUES = [0, 30, 60, 120, 180, 240, 275, 300];

/** 색 계열마다 만드는 밝기 단계입니다. 위 3줄이 밝은 쪽, 가운데가 원색, 아래 3줄이 어두운 쪽입니다.
 *  [밝기, 채도] 순서이고 단위는 퍼센트입니다. */
const TONES: [number, number][] = [
  [88, 70], [78, 80], [66, 90], [50, 100], [42, 100], [33, 100], [25, 100], [17, 100],
];

/** HSL 값을 "#rrggbb" 로 변환합니다. 팔레트 64칸을 손으로 적지 않고 계산해 만듭니다.
 *  CSS Color 4 의 HSL → RGB 변환 공식입니다. at 은 색 성분 하나를 두 자리 16진수로 반환합니다. */
export function hslHex(hue: number, light: number, saturation: number): string {
  const l = light / 100;
  const a = (saturation / 100) * Math.min(l, 1 - l);
  const at = (n: number): string => {
    const k = (n + hue / 30) % 12;
    const value = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    // padStart 는 한 자리 16진수 앞에 0 을 채웁니다. "#5a0" 같은 잘못된 값이 되지 않게 합니다.
    return Math.round(value * 255).toString(16).padStart(2, "0");
  };
  // at(0)·at(8)·at(4) 가 각각 빨강·초록·파랑 성분입니다.
  return `#${at(0)}${at(8)}${at(4)}`;
}

/** 팔레트에 들어가는 색 전부입니다. 첫 줄이 무채색 8칸이고 그 아래 8줄이 색 계열마다의 밝기 단계입니다. */
export const PALETTE: string[] = [
  ...GREYS,
  ...TONES.flatMap((tone) => HUES.map((hue) => hslHex(hue, tone[0], tone[1]))),
];

/** 지금 본문에 실제로 쓰인 색입니다. 방금 쓴 색을 다시 고를 때 팔레트를 뒤지지 않아도 됩니다.
 *  color 와 background-color 를 모두 모으고 중복을 제거해 최대 8개까지 반환합니다. */
export function usedColors(html: string): string[] {
  const found = html.match(/(?:background-)?color:\s*([^;"']+)/gi) ?? [];
  // 정규식이 "color:" 를 포함해 찾으므로 매치마다 콜론이 반드시 있습니다. [1] 은 그 뒤의 값입니다.
  const values = found.map((one) => one.split(":")[1].trim().toLowerCase());
  return [...new Set(values)].slice(0, 8);
}

/** 글자가 아닌데도 본문을 이루는 요소입니다. 그림·소리·영상·PDF·유튜브·표·구분선이 여기 듭니다.
 *  하나라도 있으면 글자가 없어도 내용이 있는 것으로 봅니다. */
const CONTENT_TAGS = /<(img|audio|video|iframe|table|hr)\b/i;

/** 본문에 사람이 읽을 내용이 있는지 판단합니다.
 *  편집기는 비어 있어도 "<p></p>" 를 내놓으므로 trim 만으로는 빈 글을 걸러내지 못합니다.
 *  태그를 걷어낸 글자가 있거나 위 요소가 하나라도 있으면 내용이 있는 것으로 봅니다. */
export function hasContent(html: string): boolean {
  return CONTENT_TAGS.test(html) || textOf(html).trim() !== "";
}

/** 태그를 걷어낸 글자입니다. 글자 수 상한을 셀 때 사용합니다. HTML 태그까지 세면
 *  굵게 표시한 글이 같은 글자 수에서 먼저 상한에 걸립니다. */
export function textOf(html: string): string {
  return html
    // 블록이 끝나는 자리를 줄바꿈으로 변경합니다. 삭제하기만 하면 앞뒤 문단의 글자가 붙습니다.
    .replace(/<\/(p|div|li|h[1-3]|blockquote|pre)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    // &amp; 를 마지막에 변경합니다. 먼저 변경하면 "&amp;lt;" 가 "<" 가 됩니다.
    .replace(/&amp;/g, "&");
}


/** 본문에 넣을 수 있는 형식입니다. file 은 본문에 넣지 않고 첨부 목록에만 둡니다. */
type EmbedKind = "image" | "audio" | "pdf" | "file";

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
