// 배정 화면 오른쪽 칸이 쓰는 계산 — 지난 회차 목록에 붙일 이름과, 하루 두 번의
// 계산 시각을 고르고 거르는 값이다. 서버를 부르지 않는 순수 계산만 둔다.

const MINUTES_PER_SLOT = 30;
const SLOTS_PER_DAY = 48;
const CLOCK = /^([01]\d|2[0-3]):([0-5]\d)$/;
const STAMP = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/;

/** 저장 시각을 "9월 7일 18:03" 으로 읽는다.
 *  브라우저의 날짜 값으로 바꾸지 않고 글자에서 그대로 잘라 쓴다 — 바꾸면 브라우저가
 *  제 시간대를 끼워 넣어 날짜가 하루씩 밀 수 있다. */
export function backupLabel(savedAt: string): string {
  const parsed = STAMP.exec(savedAt);
  if (parsed === null) return savedAt;
  const [, , month, day, hour, minute] = parsed;
  return `${Number(month)}월 ${Number(day)}일 ${hour}:${minute}`;
}

/** 그 회차가 몇 칸을 들고 있었는지 적는다. */
export function slotCountLabel(count: number): string {
  return count === 0 ? "빈 회차" : `${count}칸`;
}

/** 계산 시각으로 고를 수 있는 값 — 하루를 30분으로 쪼갠 48개다. */
export function runTimeOptions(): string[] {
  return Array.from({ length: SLOTS_PER_DAY }, (_, index) => {
    const minutes = index * MINUTES_PER_SLOT;
    const hour = String(Math.floor(minutes / 60)).padStart(2, "0");
    const minute = String(minutes % 60).padStart(2, "0");
    return `${hour}:${minute}`;
  });
}

/** 보내기 전에 화면이 먼저 거른다. 서버도 같은 것을 다시 거른다. */
export function checkRunTimes(first: string, second: string): string {
  if (!CLOCK.test(first) || !CLOCK.test(second)) {
    return "계산 시각은 HH:MM 형식이어야 합니다";
  }
  // 같은 시각을 두 번 두면 하루 두 번이 아니라 한 번이 된다.
  if (first === second) return "두 계산 시각은 서로 달라야 합니다";
  return "";
}
