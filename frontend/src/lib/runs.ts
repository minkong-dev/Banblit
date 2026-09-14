// 배정 화면 오른쪽 칸이 사용하는 계산입니다 — 지난 회차가 포함한 칸 수와, 하루 두 번의 계산 시각을
// 검사하는 값입니다. 서버를 호출하지 않는 순수 계산만 둡니다.
// 회차에 붙는 날짜·시각 표기는 lib/calendar의 stampLabel이 담당합니다.

/** 그 회차가 몇 칸을 포함했는지 표시합니다. */
export function slotCountLabel(count: number): string {
  return count === 0 ? "빈 배정기록" : `${count}건`;
}

/** 보내기 전에 화면이 먼저 검사합니다. 서버도 같은 것을 다시 검사합니다.
 *  형식은 검사하지 않습니다 — <input type="time">이 유효한 "HH:MM" 또는 빈 값만 제공합니다. */
export function checkRunTimes(first: string, second: string): string {
  if (first === "" || second === "") return "1차와 2차 스케줄링 시간을 모두 지정해주세요.";
  // 같은 시각을 두 번 지정하면 하루 두 번이 아니라 한 번이 됩니다.
  if (first === second) return "1차와 2차 스케줄링 시간은 같을 수 없어요.";
  return "";
}
