import { expect, test } from "@playwright/test";

import { findFocusedPeriods } from "./helpers";

// 배정 계산은 실측 1초 안팎이지만(2026-09-04), 컨테이너 부하에 따라 늘어날 수 있어
// 20초를 둡니다. frontend(lib/jobs.ts)의 JOB_DEADLINE_MS(60초)보다는 작습니다. 60초보다
// 오래 걸리면 frontend 도 조회를 중단하므로 그 이상 기다릴 이유가 없습니다.
const ASSIGN_WAIT_MS = 20_000;

test.describe("배정 다시 계산", () => {
  test("기간 선택은 번호가 아니라 날짜 범위로 나온다", async ({ page }) => {
    await page.goto("/admin");
    // 기간 고르기는 기본 select 가 아니라 직접 그린 드롭다운입니다(components/Dropdown.tsx).
    // 목록은 버튼을 눌러야 그려지므로 먼저 엽니다.
    await page.getByRole("button", { name: "기간 선택" }).click();
    const options = page.getByRole("option");
    // 기간 목록이 도착하기 전에는 선택지가 비어 있습니다. 첫 항목이 표시될 때까지 기다립니다.
    await expect(options.first()).toBeAttached();
    for (const text of await options.allTextContents()) {
      expect(text).toMatch(/^\d{4}-\d{2}-\d{2} – \d{4}-\d{2}-\d{2}$/);
    }
  });

  // 연산 결과는 스케줄링 기록으로만 쌓이고 현재 배정안은 적용할 때만 바뀝니다(사용자 결정 2026-10-13).
  test("다시 계산하면 연산 결과를 표시하고 현재 배정안은 그대로 둔다", async ({ page }) => {
    const { withSchedule } = await findFocusedPeriods(page.request);
    const originalRows = withSchedule.rows;
    // 확정된 배정안에 없는 팀입니다. 멤버가 없는 팀은 계산에서 제외되므로 E2E 계정을 앉힙니다. 이 테스트가 끝나면 삭제합니다.
    const created = await page.request.post("/api/teams", { data: { name: "E2E 확정안 밖 팀", slots: { 보컬: 1 } } });
    expect(created.ok()).toBe(true);
    const { team: outside } = (await created.json()) as { team: { id: number } };
    const { account } = (await (await page.request.get("/api/me")).json()) as { account: { id: number } };
    const { slots } = (await (await page.request.get(`/api/teams/${outside.id}/slots`)).json()) as { slots: { id: number }[] };
    expect((await page.request.put(`/api/teams/${outside.id}/slots/${slots[0].id}`, { data: { member_id: account.id } })).ok()).toBe(true);

    await page.goto("/admin");
    // 기간 고르기는 기본 select 가 아니라 직접 그린 드롭다운입니다(components/Dropdown.tsx).
    // 버튼을 눌러 목록을 연 뒤 그 선택지를 누릅니다.
    await page.getByRole("button", { name: "기간 선택" }).click();
    await page
      .getByRole("option", { name: `${withSchedule.starts_on} – ${withSchedule.ends_on}` })
      .click();
    await expect(page.getByRole("heading", { name: "확정된 배정안이에요" })).toBeVisible();

    // 확정된 배정안이 있어도 자동 배정(jobs/auto_assign.py)과 같이 전체 팀과 합주실을 계산에 넣습니다.
    // 확정된 배정안에 없는 팀이 빠지면 그 팀은 다시 계산해도 배정받지 못합니다.
    const assignRequest = page.waitForRequest((req) => req.method() === "POST" && req.url().endsWith(`/periods/${withSchedule.id}/assign`));
    const runButton = page.getByRole("button", { name: /^스케줄링/ });
    await runButton.click();
    const sent = (await assignRequest).postDataJSON() as { team_ids: number[]; room_ids: number[] };
    const { teams } = (await (await page.request.get("/api/teams")).json()) as { teams: { id: number; filled_count: number }[] };
    const { rooms } = (await (await page.request.get("/api/rooms")).json()) as { rooms: { id: number }[] };
    const sorted = (values: number[]): number[] => [...values].sort((a, b) => a - b);
    expect(sorted(sent.team_ids)).toEqual(sorted(teams.filter((team) => team.filled_count > 0).map((team) => team.id)));
    expect(sent.team_ids).toContain(outside.id);
    expect(sorted(sent.room_ids)).toEqual(sorted(rooms.map((room) => room.id)));
    await expect(runButton).toHaveText("스케줄링 진행 중…");
    // 연산이 끝나면 연산 결과 보기로 넘어가 스케줄링 버튼이 사라지므로 토스트를 기다립니다.
    await expect(page.getByText("스케줄링 연산에 성공했어요")).toBeVisible({ timeout: ASSIGN_WAIT_MS });
    await expect(page.getByRole("heading", { name: /연산 결과예요$/ })).toBeVisible();

    const restored = (await (
      await page.request.get(`/api/periods/${withSchedule.id}/schedule`)
    ).json()) as { rows: typeof originalRows };
    const key = (row: (typeof originalRows)[number]): string =>
      `${row.team_id}-${row.room_id}-${row.start}-${row.end}`;
    expect(new Set(restored.rows.map(key))).toEqual(new Set(originalRows.map(key)));
    expect((await page.request.delete(`/api/teams/${outside.id}`)).ok()).toBe(true);
  });

  // 적용 버튼은 누르지 않습니다. 적용하면 이 기간이 현재 배정안을 갖게 되어 findFocusedPeriods 의
  // withoutSchedule 이 사라집니다. 적용 동작은 backend 통합 테스트(test_period_endpoints.py)가 확인합니다.
  test("부족분이 있으면 연산 결과를 결과 설명과 적용 버튼과 함께 표시한다", async ({ page }) => {
    const { withoutSchedule } = await findFocusedPeriods(page.request);

    await page.goto("/admin");
    // 기간 고르기는 기본 select 가 아니라 직접 그린 드롭다운입니다(components/Dropdown.tsx).
    // 버튼을 눌러 목록을 연 뒤 그 선택지를 누릅니다.
    await page.getByRole("button", { name: "기간 선택" }).click();
    await page
      .getByRole("option", { name: `${withoutSchedule.starts_on} – ${withoutSchedule.ends_on}` })
      .click();
    await expect(page.getByRole("heading", { name: "현재 확정된 배정안이 존재하지 않아요" })).toBeVisible();

    // 배정 불가능 판정은 CP-SAT 이 탐색 없이 즉시 끝낼 때가 있어 "진행 중" 문구를 놓칠 수 있습니다.
    // 이 검사는 계산이 끝난 뒤의 결과만 확인합니다.
    await page.getByRole("button", { name: /^스케줄링/ }).click();

    await expect(page.getByText("스케줄링 연산에 성공했어요")).toBeVisible({ timeout: ASSIGN_WAIT_MS });
    await expect(page.getByRole("heading", { name: /연산 결과예요$/ })).toBeVisible();
    await expect(page.getByText("더 적게 배정받은 팀이 있어요.", { exact: false })).toBeVisible();
    await expect(page.getByRole("button", { name: "이 배정안 적용" })).toBeVisible();
  });
});

// 배정 결과는 시간만 표시합니다. 붙은 칸 묶음의 개수(횟수)는 같은 시간을 받아도 배치에 따라 달라져 오해를 삽니다.
test("배정 결과는 횟수 없이 팀별 시간만 표시한다", async ({ page }) => {
  await page.goto("/admin");
  const counts = page.locator(".counts .cnt");
  await expect(counts.first()).toContainText("시간");
  for (const text of await counts.allTextContents()) expect(text).not.toMatch(/\d+번/);
  for (const text of await page.locator("p.sub").allTextContents()) expect(text).not.toMatch(/\d+(번|회)/);
});

// 확정 해제는 배정 결과 확인 화면에서만 합니다(사용자 결정 2026-10-21). 기간 화면에는 "배정 확정" 글자만 남습니다.
test.describe("확정 해제", () => {
  const CLOSED_AT = "2026-01-01T21:00:00";

  // 집중 합주기간 전부를 마감, 확정된 상태로 응답합니다.
  test.beforeEach(async ({ page }) => {
    await page.route(/\/api\/periods$/, async (route) => {
      const response = await route.fetch();
      const body = await response.json() as { periods: Record<string, unknown>[] };
      const periods = body.periods.map((period) => period.kind === "focused"
        ? { ...period, closes_at: CLOSED_AT, fixed_at: CLOSED_AT }
        : period);
      await route.fulfill({ response, json: { ...body, periods } });
    });
  });

  test("배정 결과 확인 화면에서 사유를 입력해 확정을 해제한다", async ({ page }) => {
    let sent: unknown = null;
    await page.route(/\/api\/periods\/\d+\/unfix$/, async (route) => {
      sent = route.request().postDataJSON();
      await route.fulfill({ json: { period: null } });
    });
    await page.goto("/admin");
    await page.getByRole("button", { name: /확정 해제$/ }).click();
    const dialog = page.getByRole("dialog", { name: "확정 해제" });
    await dialog.getByLabel("해제 사유").fill("팀 하나가 해체되었어요");
    await dialog.getByRole("button", { name: "해제하기" }).click();
    await expect.poll(() => sent).toEqual({ reason: "팀 하나가 해체되었어요" });
  });

  test("기간 화면에는 확정 해제 버튼이 없다", async ({ page }) => {
    await page.goto("/periods");
    await expect(page.getByText("배정 확정").first()).toBeVisible();
    await expect(page.getByRole("button", { name: /확정 해제$/ })).toHaveCount(0);
  });
});
