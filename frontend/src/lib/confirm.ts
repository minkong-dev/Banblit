// 삭제하기 전에 한 번 묻는다. 되돌릴 수 없는 일이라 실수로 눌린 것과 가른다.
//
// 브라우저의 confirm 을 그대로 쓴다. 화면 안에 확인용 모달을 따로 만들지 않는 것은,
// 이 물음이 "예/아니오" 하나뿐이고 그 위에 얹을 것이 없어서다.

/** 이름 끝소리에 받침이 있으면 "을", 없으면 "를". 한글이 아니면 "를" 로 둔다. */
export function objectParticle(word: string): string {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0);
  if (Number.isNaN(code) || code < 0xac00 || code > 0xd7a3) return "를";
  return (code - 0xac00) % 28 === 0 ? "를" : "을";
}

/** "새벽 네시를 삭제할까요?" 처럼 묻는다. 확인을 누르면 true. */
export function askDelete(name: string): boolean {
  return window.confirm(`${name}${objectParticle(name)} 삭제할까요?`);
}

/** "여섯줄 18:00–21:00 예약을 취소할까요?" 처럼 묻는다. 예약에는 삭제가 아니라 취소라고
 *  말한다 — 단추·물음·알림이 같은 말을 써야 무엇이 일어났는지가 이어진다. */
export function askCancel(name: string): boolean {
  return window.confirm(`${name}${objectParticle(name)} 취소할까요?`);
}
