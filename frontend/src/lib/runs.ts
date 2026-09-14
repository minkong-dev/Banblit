// 배정 화면 오른쪽 칸이 사용하는 계산입니다. 지난 배정기록이 포함한 slot 수와, 하루 2번의 계산 시각을
// 검증하는 함수입니다. 서버를 호출하지 않는 순수 계산만 둡니다.
// 배정기록에 붙는 날짜·시각 표기는 lib/calendar의 stampLabel이 담당합니다.

/** 그 배정기록이 몇 칸을 포함했는지 표시합니다. */
export function slotCountLabel(count: number): string {
  return count === 0 ? "빈 배정기록" : `${count}건`;
}

/** 전송 전에 화면이 먼저 검증합니다. 서버도 같은 값을 다시 검증합니다.
 *  형식은 검증하지 않습니다. <input type="time"> 이 유효한 "HH:MM" 또는 빈 값만 제공합니다. */
export function checkRunTimes(first: string, second: string): string {
  if (first === "" || second === "") return "1차와 2차 스케줄링 시간을 모두 지정해주세요.";
  // 같은 시각을 두 번 지정하면 하루 두 번이 아니라 한 번이 됩니다.
  if (first === second) return "1차와 2차 스케줄링 시간은 같을 수 없어요.";
  return "";
}
