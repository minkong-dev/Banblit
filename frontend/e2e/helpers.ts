// 여러 검사 파일이 함께 쓰는 것 — 시각 파싱, 요일 이름, 실제 데이터로 기간을
// 찾는 API 호출. 시드 번호(팀·기간 id)가 재시딩마다 바뀌므로, 화면에 보이는
// 값이나 그때그때 부른 /api/... 응답으로 찾는다.

import type { APIRequestContext, Page } from "@playwright/test";

const WEEKDAYS_KR = ["일", "월", "화", "수", "목", "금", "토"];

// backend/scripts/seed_dev.py 가 넣는 E2E 전용 로그인 계정 — 헤드매니저이고
// "새벽 네시" 소속이다.
export const E2E_ACCOUNT_EMAIL = "e2e@banblit.test";
export const E2E_ACCOUNT_PASSWORD = "e2e-password1";
export const E2E_ACCOUNT_TEAM = "새벽 네시";

/** 로그인 화면을 실제로 누르는 대신, API를 미리 불러 세션 쿠키를 받아 둔다.
 *  page.request 는 page 의 브라우저 컨텍스트와 쿠키 저장소를 공유하므로, 여기서
 *  받은 쿠키(banblit_session·banblit_signed_in)가 이어지는 page.goto 에도 실린다.
 *  로그인 서식 자체가 되는지는 account.spec.ts가 따로 확인한다 — 나머지 검사들은
 *  로그인된 다음 화면만 보면 되므로 매번 서식을 채우지 않는다. */
export async function loginForTests(page: Page): Promise<void> {
  await page.request.post("/api/login", {
    data: { email: E2E_ACCOUNT_EMAIL, password: E2E_ACCOUNT_PASSWORD },
  });
}

/** ISO 시각 문자열에서 시간대 변환 없이 날짜 부분만 뗀다.
 *  "2026-09-14T18:00:00" → { year: 2026, month: 9, day: 14 }. */
export function dateParts(iso: string): { year: number; month: number; day: number } {
  const [datePart] = iso.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  return { year, month, day };
}

/** Date.UTC 로만 계산해 요일을 구한다 — 실행하는 컴퓨터의 시간대가 끼어들지 않는다. */
export function weekdayKr(year: number, month: number, day: number): string {
  return WEEKDAYS_KR[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

/** 정규식에 그대로 넣어도 안전하도록 특수문자를 이스케이프한다. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type ScheduleRow = {
  team_id: number;
  team: string;
  room_id: number;
  room: string;
  start: string;
  end: string;
};

export type Period = {
  id: number;
  kind: "open" | "focused";
  starts_on: string;
  ends_on: string;
};

export type PeriodWithSchedule = Period & { rows: ScheduleRow[] };

/** 집중 합주기간 중, 저장된 배정이 있는 것 하나와 없는 것 하나를 찾는다.
 *  시드는 앞 기간은 성사돼 저장되고 뒤 기간은 자리를 못 채워 저장되지 않게
 *  만들지만, 그 순서를 여기서 가정하지 않고 실제 응답을 하나씩 확인한다. */
export async function findFocusedPeriods(request: APIRequestContext): Promise<{
  withSchedule: PeriodWithSchedule | null;
  withoutSchedule: Period | null;
}> {
  const periodsRes = await request.get("/api/periods");
  const { periods } = (await periodsRes.json()) as { periods: Period[] };
  const focused = periods.filter((period) => period.kind === "focused");

  let withSchedule: PeriodWithSchedule | null = null;
  let withoutSchedule: Period | null = null;
  for (const period of focused) {
    const scheduleRes = await request.get(`/api/periods/${period.id}/schedule`);
    const { rows } = (await scheduleRes.json()) as { rows: ScheduleRow[] };
    if (rows.length > 0 && withSchedule === null) withSchedule = { ...period, rows };
    if (rows.length === 0 && withoutSchedule === null) withoutSchedule = period;
  }
  return { withSchedule, withoutSchedule };
}
