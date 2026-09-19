// 삭제하기 전에 한 번 묻습니다. 되돌릴 수 없는 일이므로 실수로 눌린 것과 의도한 것을 구분합니다.
//
// 브라우저의 confirm을 그대로 사용합니다. 화면 안의 확인용 모달을 별도로 만들지 않는 이유는
// 이 물음이 "예/아니오" 하나뿐이고 추가할 요소가 없기 때문입니다.

/** 이름 끝소리에 받침이 있으면 "을", 없으면 "를"입니다. 한글이 아니면 "를"을 설정합니다. */
export function objectParticle(word: string): string {
  const last = word.trim().slice(-1);
  const code = last.charCodeAt(0);
  if (Number.isNaN(code) || code < 0xac00 || code > 0xd7a3) return "를";
  return (code - 0xac00) % 28 === 0 ? "를" : "을";
}

/** "새벽 네시를 삭제할까요?" 처럼 묻습니다. 확인을 누르면 true 를 반환합니다. */
export function askDelete(name: string): boolean {
  return window.confirm(`${name}${objectParticle(name)} 삭제할까요?`);
}

/** "김민수를 추방할까요?" 처럼 묻습니다. 추방은 계정 삭제라 글·댓글·예약이 함께 삭제되는 것을 문장에 적습니다. */
export function askExpel(name: string): boolean {
  return window.confirm(`${name}${objectParticle(name)} 추방할까요? 계정과 글·댓글·예약이 함께 삭제돼요.`);
}

/** "여섯줄 18:00–21:00 예약을 취소할까요?" 처럼 묻습니다. 예약에는 삭제가 아니라 취소라고
 *  표현합니다. 버튼·물음·알림이 같은 단어를 사용해야 사용자가 무엇이 일어났는지 알 수 있습니다. */
export function askCancel(name: string): boolean {
  return window.confirm(`${name}${objectParticle(name)} 취소할까요?`);
}

/** 합주실을 삭제하기 전에 묻습니다. 삭제하면 그 합주실의 예약과 배정 결과, 이전 배정기록이
 *  ON DELETE CASCADE 로 함께 삭제되므로, 합주실 이름이 아니라 함께 사라지는 것을 문장에 적습니다. */
export function askDeleteRoom(): boolean {
  return window.confirm(
    "기록이 있을경우 예약과 배정안, 이전 배정기록이 모두 삭제돼요. 정말 삭제할까요?",
  );
}
