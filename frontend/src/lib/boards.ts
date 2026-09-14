// 글과 댓글 작성의 검증과 표시입니다. 화면과 서버는 건드리지 않습니다.
// 검증 함수는 값이 유효하면 빈 문자열을, 아니면 사람이 읽을 수 있는 사유를 반환합니다.

const TITLE_MAX = 200;
const BODY_MAX = 20000;
const COMMENT_MAX = 2000;

export function titleMessage(title: string): string {
  if (!title.trim()) return "제목을 입력해주세요.";
  return title.length > TITLE_MAX ? `제목은 ${TITLE_MAX}자 이내로 작성해주세요.` : "";
}

export function bodyMessage(body: string): string {
  if (!body.trim()) return "내용을 입력해주세요.";
  return body.length > BODY_MAX ? `내용은 ${BODY_MAX}자 이내로 작성해주세요.` : "";
}

export function commentMessage(body: string): string {
  if (!body.trim()) return "댓글을 입력해주세요.";
  return body.length > COMMENT_MAX ? `댓글은 ${COMMENT_MAX}자 이내로 작성해주세요.` : "";
}

// ===== 첨부파일 =====
// 크기 상한과 허용 확장자를 적는 자리는 여기 하나입니다. 화면은 이 값을 다시 적지 않습니다.

export const MAX_ATTACHMENT_BYTES = 300 * 1024 * 1024;

const ALLOWED_EXTENSIONS = new Set([
  "jpg", "jpeg", "png", "gif", "webp", "bmp", "heic",
  "mp3", "wav", "m4a", "flac", "ogg", "aac",
  "mp4", "mov", "avi", "mkv", "webm",
  "md", "txt", "pdf", "doc", "docx", "ppt", "pptx", "hwp", "hwpx", "xls", "xlsx", "csv",
  "zip",
]);

// 사람에게 보여주는 형식 목록입니다. 위 ALLOWED_EXTENSIONS 를 전부 적으면 읽기 어려워 흔한 것만 적습니다.
// 두 곳에서 서로 다르게 적혔던 것을 여기에 통일했습니다.
const ALLOWED_TEXT = "이미지, 소리파일, 영상, 문서(md, txt, pdf, docx, ppt, pptx, hwp, xlsx, zip)";

/** <input type="file"> 의 accept 에 그대로 넣는 값입니다. 허용 확장자를 적는 자리를 하나로 유지합니다.
 *  파일 선택 창을 필터링할 뿐이므로 검증을 대신하지 못합니다. 사용자는 "모든 파일"을 선택해 넘길 수 있습니다. */
export const ATTACHMENT_ACCEPT = [...ALLOWED_EXTENSIONS].map((extension) => `.${extension}`).join(",");

const SIZE_UNITS = ["B", "KB", "MB", "GB"];

/** 파일을 선택하기 전에 보여주는 안내입니다. 상한을 문자로 다시 적지 않고 위 값에서 생성합니다. */
export const ATTACHMENT_HINT =
  `파일당 업로드 가능한 크기는 ${fileSizeLabel(MAX_ATTACHMENT_BYTES)} 이하만 가능해요. 또한, ${ALLOWED_TEXT} 형식의 파일만 업로드 가능해요.`;

export function fileSizeLabel(bytes: number): string {
  // 1024로 나눌 수 있을 때까지 나누어 단위를 한 단계씩 올려 사람이 읽을 수 있는 크기로 만듭니다.
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < SIZE_UNITS.length - 1) {
    size /= 1024;
    unit += 1;
  }
  // 소수 한 자리까지만 유지합니다. 정확히 나누어떨어지면 Number 가 자동으로 .0 을 제거합니다.
  return `${Math.round(size * 10) / 10}${SIZE_UNITS[unit]}`;
}

export function attachmentMessage(name: string, size: number): string {
  // 마지막 점 뒤가 확장자입니다. 점이 맨 앞에 있으면 (.zip) 그것은 이름이지 확장자가 아닙니다.
  const dot = name.lastIndexOf(".");
  const extension = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  if (!ALLOWED_EXTENSIONS.has(extension)) {
    return `지원하지 않는 파일 형식이에요. 파일명을 확인해주세요.`;
  }
  if (size > MAX_ATTACHMENT_BYTES) {
    return `파일 당 업로드 가능한 크기는 ${fileSizeLabel(MAX_ATTACHMENT_BYTES)} 이하만 가능해요.`
      + ` 해당 파일은 ${fileSizeLabel(size)} 에요.`;
  }
  return "";
}

// ===== 글과 댓글에 무엇을 할 수 있는가 =====

/** 수정은 작성자만, 삭제는 작성자이거나 \"타 멤버 글 수정 및 삭제\"(board_moderate) 권한자입니다.
 *  서버(board_service.py require_post_author)는 권한자에게 수정도 허용하지만, 화면은 삭제
 *  버튼만 표시합니다(사용자 결정 2026-09-11). 아직 누구인지 모르면(meId null) 아무것도 할 수 없습니다. */
export function boardActions(
  authorId: number,
  meId: number | null,
  canModerate: boolean,
): { canEdit: boolean; canDelete: boolean } {
  const mine = meId !== null && authorId === meId;
  return { canEdit: mine, canDelete: mine || (meId !== null && canModerate) };
}
