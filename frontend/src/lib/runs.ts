// 배정 화면 오른쪽 칸이 쓰는 계산 — 지난 회차가 든 칸 수와, 하루 두 번의 계산 시각을
// 거르는 값이다. 서버를 부르지 않는 순수 계산만 둔다.
// 회차에 붙는 날짜·시각 표기는 lib/calendar 의 stampLabel 이 맡는다.

/** 그 회차가 몇 칸을 들고 있었는지 적는다. */
export function slotCountLabel(count: number): string {
  return count === 0 ? "빈 배정기록" : `${count}건`;
}

/** 보내기 전에 화면이 먼저 거른다. 서버도 같은 것을 다시 거른다.
 *  형식은 보지 않는다 — <input type="time"> 이 성한 "HH:MM" 아니면 빈 값만 준다. */
export function checkRunTimes(first: string, second: string): string {
  if (first === "" || second === "") return "1차와 2차 스케줄링 시간을 모두 지정해주세요.";
  // 같은 시각을 두 번 두면 하루 두 번이 아니라 한 번이 된다.
  if (first === second) return "1차와 2차 스케줄링 시간은 같을 수 없어요.";
  return "";
}
