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

/** 글을 블라인드하기 전에 묻습니다. 삭제가 아니라 가리는 조치이므로 되돌릴 수 있는 곳(설정의 블라인드 탭)을 문장에 적습니다. */
export function askBlind(): boolean {
  return window.confirm(
    "해당 글을 가릴까요? 작성자 본인도 볼 수 없게 되고, 설정의 블라인드 탭에서 되돌릴 수 있어요.",
  );
}

/** 글을 삭제하기 전에 묻습니다. 첨부파일도 함께 삭제되므로 그 사실을 문장에 적습니다. */
export function askDeletePost(): boolean {
  return window.confirm("해당 글과 첨부된 파일을 모두 삭제할까요?");
}

/** 확정된 배정안을 이전 배정기록으로 되돌리기 전에 묻습니다. 취소할 수 없는 작업이므로 복구가
 *  어렵다는 것을 문장에 적습니다. */
export function askRollback(): boolean {
  return window.confirm(
    "현재 확정된 시간표를 해당 배정안으로 되돌려요. 해당 작업은 진행 후 다시 복구하기 어려워요. 그래도 되돌릴까요?",
  );
}
