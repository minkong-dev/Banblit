// 검사 전체를 시작하기 전에 한 번 실행합니다. e2e-api 가 뜰 때 DB 를 비우므로
// (backend/scripts/reset_e2e_db.py) 여기가 저장소의 첫 가입입니다. 첫 계정은 관리자코드를 넣어
// 전체 권한을 받습니다 — 첫 가입자에게 자동으로 주던 규칙은 없앴습니다(사용자 결정 2026-09-16).
//
// 만드는 데이터:
// - 계정 2개(전체 권한인 E2E 계정, 권한 없는 E2E 멤버)
// - 합주실 1개(18:00–22:00, 하루 4칸)
// - 팀 2개 — E2E_TEAM(E2E 계정·E2E 멤버), E2E_OTHER_TEAM(E2E 멤버). 배정 엔진은 멤버 없는 팀을 거절합니다
// - 오늘 하루짜리 집중 합주기간 — 배정을 계산해 저장합니다. 팀마다 2칸이라 계산이 성공합니다
// - 내일 하루짜리 집중 합주기간 — 저장하지 않습니다. E2E 계정이 합주실이 여는 시간 전체에
//   불가능 시간을 두어, 이 기간을 계산하면 조율안(E2E 계정을 제외한 배정안)이 나옵니다

import { request } from "@playwright/test";
import type { APIRequestContext, FullConfig } from "@playwright/test";

import {
  E2E_ACCOUNT, E2E_ADMIN_CODE, E2E_MEMBER, E2E_OTHER_TEAM, E2E_ROOM, E2E_STATE_PATH, E2E_TEAM, dayFromToday,
} from "./helpers";

const JOB_POLL_MS = 500;
const JOB_WAIT_MS = 30_000;
const RUN_TIMES = { first_run_at: "09:00", second_run_at: "21:00" };

type Method = "GET" | "POST" | "PUT";
type Job = { id: string; status: "queued" | "running" | "done" | "failed"; result: { saved: boolean } | null; error: string | null };

/** 요청이 실패하면 응답 본문을 담아 멈춥니다. 준비가 반쯤 된 상태로 검사를 돌리지 않습니다. */
async function call<T>(context: APIRequestContext, method: Method, url: string, data?: unknown): Promise<T> {
  const response = await context.fetch(url, { method, data });
  if (!response.ok()) {
    throw new Error(`${method} ${url} 가 ${response.status()} 로 실패했습니다: ${await response.text()}`);
  }
  return (await response.json()) as T;
}

async function waitForJob(context: APIRequestContext, jobId: string): Promise<Job> {
  const deadline = Date.now() + JOB_WAIT_MS;
  while (Date.now() < deadline) {
    const { job } = await call<{ job: Job }>(context, "GET", `/api/jobs/${jobId}`);
    if (job.status === "done" || job.status === "failed") return job;
    await new Promise((resolve) => setTimeout(resolve, JOB_POLL_MS));
  }
  throw new Error(`배정 계산 ${jobId} 가 ${JOB_WAIT_MS}ms 안에 끝나지 않았습니다`);
}

/** 두 번째 계정은 따로 만든 context 로 가입합니다. 가입 응답이 cookie 를 덮어써 E2E 계정의 로그인이 바뀌지 않게 합니다. */
async function signupMember(baseURL: string | undefined): Promise<{ id: number }> {
  const separate = await request.newContext({ baseURL });
  try {
    const { account } = await call<{ account: { id: number } }>(separate, "POST", "/api/signup", E2E_MEMBER);
    return account;
  } finally {
    await separate.dispose();
  }
}

/** 팀을 만들고 포지션마다 memberIds 를 순서대로 지정합니다. seats 의 자리 수 합이 memberIds 수와 같아야 합니다. */
async function createTeam(
  context: APIRequestContext, name: string, seats: Record<string, number>, memberIds: number[],
): Promise<{ id: number }> {
  const { team } = await call<{ team: { id: number } }>(context, "POST", "/api/teams", { name, slots: seats });
  const { slots } = await call<{ slots: { id: number }[] }>(context, "GET", `/api/teams/${team.id}/slots`);
  for (const [index, memberId] of memberIds.entries()) {
    await call(context, "PUT", `/api/teams/${team.id}/slots/${slots[index].id}`, { member_id: memberId });
  }
  return team;
}

async function createFocusedPeriod(context: APIRequestContext, day: string): Promise<{ id: number }> {
  const { period } = await call<{ period: { id: number } }>(context, "POST", "/api/periods", {
    kind: "focused", starts_on: day, ends_on: day, everyday: false, ...RUN_TIMES,
  });
  return period;
}

export default async function globalSetup(config: FullConfig): Promise<void> {
  const baseURL = config.projects[0].use.baseURL;
  const context = await request.newContext({ baseURL });
  try {
    // 이미 가입된 계정이면 DB 가 비어 있지 않은 것입니다. 여기서 멈춥니다.
    const { account } = await call<{ account: { id: number } }>(
      context, "POST", "/api/signup", { ...E2E_ACCOUNT, admin_code: E2E_ADMIN_CODE },
    )
      .catch((error: unknown) => {
        throw new Error(`${String(error)}\nDB 가 비어 있어야 합니다. COMMAND.md 12-1 의 첫 줄로 e2e-api 를 다시 만든 뒤 실행하세요.`);
      });
    const member = await signupMember(baseURL);
    const { room } = await call<{ room: { id: number } }>(context, "POST", "/api/rooms", E2E_ROOM);

    const mine = await createTeam(context, E2E_TEAM, { 보컬: 1, 드럼: 1 }, [account.id, member.id]);
    const other = await createTeam(context, E2E_OTHER_TEAM, { 드럼: 1 }, [member.id]);
    const assignBody = { team_ids: [mine.id, other.id], room_ids: [room.id] };

    const today = await createFocusedPeriod(context, dayFromToday(0));
    const { job } = await call<{ job: Job }>(context, "POST", `/api/periods/${today.id}/assign`, assignBody);
    const finished = await waitForJob(context, job.id);
    if (finished.result?.saved !== true) {
      throw new Error(`오늘 기간의 배정이 저장되지 않았습니다: ${finished.error ?? "조율안만 나옴"}`);
    }

    const tomorrow = dayFromToday(1);
    await createFocusedPeriod(context, tomorrow);
    await call(context, "POST", `/api/members/${account.id}/unavailable`, {
      starts_at: `${tomorrow}T${E2E_ROOM.opens_at}:00`,
      ends_at: `${tomorrow}T${E2E_ROOM.closes_at}:00`,
    });

    // 가입 응답이 준 cookie 를 저장합니다. 모든 검사가 이 로그인 상태로 시작합니다.
    // 검사마다 로그인하면 로그인 rate limit(5분에 10번)에 걸립니다.
    await context.storageState({ path: E2E_STATE_PATH });
  } finally {
    await context.dispose();
  }
}
