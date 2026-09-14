// 여러 테스트 파일이 공유하는 헬퍼입니다. 시각 파싱, 요일 이름, 실제 데이터로 기간을 조회하는 API 호출을 포함합니다.
// seed 번호(팀·기간 id)가 재seed 마다 바뀌므로, 화면에 표시되는 값이나 그때그때 조회한 /api/... 응답으로 찾습니다.

import type { APIRequestContext } from "@playwright/test";

const WEEKDAYS_KR = ["일", "월", "화", "수", "목", "금", "토"];

// backend/scripts/seed_dev.py가 생성하는 e2e(브라우저를 실제로 조작해 화면·서버·DB를 함께 검사하는 테스트) 전용 로그인 계정입니다.
// 헤드매니저이며 '새벽 네시' 팀에 소속되어 있습니다.
export const E2E_ACCOUNT_EMAIL = "e2e@banblit.test";
export const E2E_ACCOUNT_PASSWORD = "E2e-Password1!";
export const E2E_ACCOUNT_TEAM = "새벽 네시";

/** 전달한 APIRequestContext 마다 /api/login 을 호출해 session cookie 를 받아 둡니다.
 *  page.request 는 page 의 브라우저 컨텍스트와 cookie 저장소를 공유하므로, 이 함수에서 받은
 *  cookie(banblit_session·banblit_signed_in)는 이어지는 page.goto 호출에도 포함됩니다.
 *  반면 테스트가 받는 request 는 별개의 cookie 저장소입니다. 화면과 API 를 함께 확인하는
 *  테스트는 `loginForTests(page.request, request)` 처럼 둘 다 전달해야 합니다.
 *  로그인 form 자체가 동작하는지는 account.spec.ts 가 따로 확인합니다. 나머지 테스트는
 *  로그인된 이후 화면만 확인하면 되므로, 매번 form 을 입력하지 않습니다. */
export async function loginForTests(...contexts: APIRequestContext[]): Promise<void> {
  for (const context of contexts) {
    await context.post("/api/login", {
      data: { email: E2E_ACCOUNT_EMAIL, password: E2E_ACCOUNT_PASSWORD },
    });
  }
}

/** ISO 시각 문자열에서 시간대 변환 없이 날짜 부분만 추출합니다.
 *  "2026-09-14T18:00:00" → { year: 2026, month: 9, day: 14 }. */
export function dateParts(iso: string): { year: number; month: number; day: number } {
  const [datePart] = iso.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  return { year, month, day };
}

/** Date.UTC로만 계산해 요일을 구합니다. 실행하는 컴퓨터의 시간대가 영향을 주지 않습니다. */
export function weekdayKr(year: number, month: number, day: number): string {
  return WEEKDAYS_KR[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

/** 정규식에 그대로 사용해도 안전하도록 특수문자를 이스케이프합니다. */
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

/** 집중 합주기간 중, 저장된 배정이 있는 기간 하나와 없는 기간 하나를 조회합니다.
 *  seed 는 앞 기간은 배정이 성공해 저장되고 뒤 기간은 slot(1시간 단위 시간 칸)을 채우지 못해 저장되지 않게
 *  만들지만, 이 함수에서는 순서를 가정하지 않고 실제 응답을 하나씩 확인합니다. */
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
