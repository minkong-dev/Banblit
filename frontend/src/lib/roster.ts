// 팀 만들기·참가의 검사. 화면도 서버도 건드리지 않는다.
// 검사 함수는 값이 성하면 빈 문자열을, 아니면 사람이 읽을 사유를 돌려준다.

export function teamNameMessage(name: string, taken: string[]): string {
  // name 을 taken 과 견줘, 비었거나 겹치면 그 사유를 돌려준다.
  // 앞뒤 공백을 뗀 뒤 견주므로 공백만 다른 이름도 겹친 것으로 본다 — settings.ts의
  // roomNameMessage와 같은 규칙이다.
  const trimmed = name.trim();
  if (!trimmed) return "팀 이름을 입력해 주세요.";
  const clash = taken.some((other) => other.trim() === trimmed);
  return clash ? "같은 이름의 팀이 이미 있습니다." : "";
}

export function joinPositionMessage(positionId: number | null): string {
  return positionId === null ? "맡을 포지션을 골라 주세요." : "";
}
