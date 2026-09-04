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
