// 글쓰기·댓글쓰기의 검사와 표시. 화면도 서버도 건드리지 않는다.
// 검사 함수는 값이 성하면 빈 문자열을, 아니면 사람이 읽을 사유를 돌려준다.

const TITLE_MAX = 200;
const BODY_MAX = 20000;
const COMMENT_MAX = 2000;

export function titleMessage(title: string): string {
  if (!title.trim()) return "제목을 입력해 주세요.";
  return title.length > TITLE_MAX ? `제목은 ${TITLE_MAX}자를 넘을 수 없습니다.` : "";
}

export function bodyMessage(body: string): string {
  if (!body.trim()) return "내용을 입력해 주세요.";
  return body.length > BODY_MAX ? `내용은 ${BODY_MAX}자를 넘을 수 없습니다.` : "";
}

export function commentMessage(body: string): string {
  if (!body.trim()) return "댓글을 입력해 주세요.";
  return body.length > COMMENT_MAX ? `댓글은 ${COMMENT_MAX}자를 넘을 수 없습니다.` : "";
}

export function postWhen(iso: string): string {
  // "2026-09-04T14:30:00" 에서 시간대 없이 날짜·시각을 그대로 잘라 쓴다.
  // Date 로 바꾸지 않는다 — 브라우저가 제 시간대를 끼워 넣어 날짜가 하루씩 밀 수 있다.
  const [date, time] = iso.split("T");
  const [, month, day] = date.split("-");
  return `${Number(month)}월 ${Number(day)}일 ${time.slice(0, 5)}`;
}

// ===== 첨부파일 =====
// 크기 상한과 허용 확장자를 적는 자리는 여기 하나다. 화면은 이 값을 다시 적지 않는다.

export const MAX_ATTACHMENT_BYTES = 300 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "bmp", "heic",
  "mp3", "wav", "m4a", "flac", "ogg", "aac",
  "mp4", "mov", "avi", "mkv", "webm",
  "md", "txt", "pdf", "doc", "docx", "ppt", "pptx", "hwp", "hwpx", "xls", "xlsx", "csv",
  "zip",
]);

const ALLOWED_TEXT =
  "올릴 수 없는 형식입니다. 사진·소리·영상과 문서(md, txt, pdf, docx, ppt, pptx, hwp, xlsx, zip)만 올릴 수 있습니다.";

/** <input type="file"> 의 accept 에 그대로 넣는 값. 허용 확장자를 적는 자리를 하나로 유지한다.
 *  고르는 창을 걸러 줄 뿐이라 검사를 대신하지 못한다 — 사람은 "모든 파일"을 골라 넘길 수 있다. */
export const ATTACHMENT_ACCEPT = [...ALLOWED_EXTENSIONS].map((extension) => `.${extension}`).join(",");

const SIZE_UNITS = ["B", "KB", "MB", "GB"];

/** 파일을 고르기 전에 보여주는 안내. 상한을 글로 다시 적지 않고 위 값에서 만든다. */
export function attachmentHint(): string {
  return `파일 하나에 ${fileSizeLabel(MAX_ATTACHMENT_BYTES)}까지,`
    + " 사진·소리·영상과 문서(md, txt, pdf, docx, ppt, hwp, xlsx, zip)를 올릴 수 있습니다.";
}

export function fileSizeLabel(bytes: number): string {
  // 1024로 나눌 수 있을 때까지 나누고 단위를 한 칸씩 올려, 사람이 읽는 크기로 만든다.
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < SIZE_UNITS.length - 1) {
    size /= 1024;
    unit += 1;
  }
  // 소수 한 자리까지만 남긴다. 딱 떨어지면 Number 가 뒤의 .0 을 알아서 뗀다.
  return `${Math.round(size * 10) / 10}${SIZE_UNITS[unit]}`;
}

export function attachmentMessage(name: string, size: number): string {
  // 마지막 점 뒤가 확장자다. 점이 맨 앞에 있으면(.zip) 그것은 이름이지 확장자가 아니다.
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  if (!ALLOWED_EXTENSIONS.has(extension)) return ALLOWED_TEXT;
  if (size > MAX_ATTACHMENT_BYTES) {
    return `파일 하나는 ${fileSizeLabel(MAX_ATTACHMENT_BYTES)}까지 올릴 수 있습니다.`
      + ` 이 파일은 ${fileSizeLabel(size)}입니다.`;
  }
  return "";
}
