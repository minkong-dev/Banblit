// 여러 테스트 파일이 공유하는 값과 헬퍼입니다. 검사 데이터는 global-setup.ts 가 만들고,
// 번호(팀·기간 id)는 실행마다 바뀌므로 이름이나 그때그때 조회한 /api/... 응답으로 찾습니다.

import type { APIRequestContext } from "@playwright/test";

/** global-setup.ts 가 첫 가입자로 만드는 계정입니다. 첫 가입자라 전체 권한을 받고 E2E_TEAM 에 소속됩니다. */
/** 검사용 관리자코드입니다. docker-compose.override.yml 의 e2e-api 가 같은 값을
 *  ADMIN_SIGNUP_CODE 환경변수로 받습니다. 두 값이 다르면 global-setup 의 가입이 거절됩니다. */
export const E2E_ADMIN_CODE = "e2e-admin-code";

export const E2E_ACCOUNT = {
  name: "검사 계정",
  department: "검사학과",
  student_no: "20260915",
  email: "e2e@banblit.test",
  login_id: "e2eadmin",
  password: "E2e-Password1!",
  cohort: 46,
} as const;

/** global-setup.ts 가 두 번째로 가입시키는 멤버입니다. 권한이 없고 두 팀 모두에 소속됩니다.
 *  배정 엔진은 멤버 없는 팀을 거절하므로 E2E 계정이 속하지 않은 팀에도 멤버가 있어야 합니다. */
export const E2E_MEMBER = {
  ...E2E_ACCOUNT,
  name: "검사 멤버",
  student_no: "20260916",
  email: "e2e-member@banblit.test",
  login_id: "e2emember",
} as const;

/** E2E 계정과 E2E_MEMBER 가 소속된 팀입니다. */
export const E2E_TEAM = "새벽 네시";
/** E2E 계정이 속하지 않은 팀입니다. E2E_MEMBER 만 소속됩니다. */
export const E2E_OTHER_TEAM = "E2E 다른 팀";
export const E2E_ROOM = { name: "E2E 합주실", opens_at: "18:00", closes_at: "22:00" } as const;

/** E2E 계정의 로그인 cookie 를 담는 파일입니다. playwright.config.ts 의 storageState 가 모든 검사에 넣습니다. */
export const E2E_STATE_PATH = "playwright/.auth/e2e-account.json";

/** 로그인하지 않은 상태로 시작할 검사가 `test.use({ storageState: SIGNED_OUT })` 로 씁니다. */
export const SIGNED_OUT = { cookies: [], origins: [] };

/** 오늘부터 offset 일 뒤의 날짜를 "2026-09-15" 형식으로 반환합니다. 브라우저와 같은 컨테이너 시간대를 씁니다. */
export function dayFromToday(offset: number): string {
  const day = new Date();
  day.setDate(day.getDate() + offset);
  const pad = (value: number): string => String(value).padStart(2, "0");
  return `${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}`;
}

/** ISO 시각 문자열에서 시간대 변환 없이 날짜 부분만 추출합니다.
 *  "2026-09-14T18:00:00" → { year: 2026, month: 9, day: 14 }. */
export function dateParts(iso: string): { year: number; month: number; day: number } {
  const [datePart] = iso.split("T");
  const [year, month, day] = datePart.split("-").map(Number);
  return { year, month, day };
}

const WEEKDAYS_KR = ["일", "월", "화", "수", "목", "금", "토"];

/** Date.UTC로만 계산해 요일을 구합니다. 실행하는 컴퓨터의 시간대가 영향을 주지 않습니다. */
export function weekdayKr(year: number, month: number, day: number): string {
  return WEEKDAYS_KR[new Date(Date.UTC(year, month - 1, day)).getUTCDay()];
}

/** 정규식에 그대로 사용해도 안전하도록 특수문자를 이스케이프합니다. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type Team = { id: number; name: string };

/** 이름으로 팀을 찾습니다. 없으면 global-setup 이 데이터를 만들지 못한 것이므로 실패합니다. */
export async function teamNamed(request: APIRequestContext, name: string): Promise<Team> {
  const { teams } = (await (await request.get("/api/teams")).json()) as { teams: Team[] };
  const team = teams.find((item) => item.name === name);
  if (team === undefined) throw new Error(`팀 '${name}' 이 없습니다. global-setup.ts 를 확인하세요.`);
  return team;
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

/** 집중 합주기간 중 저장된 배정이 있는 기간 하나와 없는 기간 하나를 조회합니다.
 *  global-setup 이 둘을 하나씩 만듭니다. 없으면 실패합니다. */
export async function findFocusedPeriods(request: APIRequestContext): Promise<{
  withSchedule: PeriodWithSchedule;
  withoutSchedule: Period;
}> {
  const { periods } = (await (await request.get("/api/periods")).json()) as { periods: Period[] };
  let withSchedule: PeriodWithSchedule | null = null;
  let withoutSchedule: Period | null = null;
  for (const period of periods.filter((item) => item.kind === "focused")) {
    const scheduleRes = await request.get(`/api/periods/${period.id}/schedule`);
    const { rows } = (await scheduleRes.json()) as { rows: ScheduleRow[] };
    if (rows.length > 0 && withSchedule === null) withSchedule = { ...period, rows };
    if (rows.length === 0 && withoutSchedule === null) withoutSchedule = period;
  }
  if (withSchedule === null || withoutSchedule === null) {
    throw new Error("배정이 저장된 기간과 저장되지 않은 기간이 하나씩 있어야 합니다. global-setup.ts 를 확인하세요.");
  }
  return { withSchedule, withoutSchedule };
}
