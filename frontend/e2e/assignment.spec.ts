import { expect, test } from "@playwright/test";

import { findFocusedPeriods } from "./helpers";

// 배정 계산은 실측 1초 안팎이지만(2026-09-04), 컨테이너 부하에 따라 늘어날 수 있어
// 20초를 둡니다. frontend(lib/jobs.ts)의 JOB_DEADLINE_MS(60초)보다는 작습니다. 60초보다
// 오래 걸리면 frontend 도 조회를 중단하므로 그 이상 기다릴 이유가 없습니다.
const ASSIGN_WAIT_MS = 20_000;

test.describe("배정 다시 계산", () => {
  test("기간 선택은 번호가 아니라 날짜 범위로 나온다", async ({ page }) => {
    await page.goto("/admin");
    const select = page.getByLabel("기간 선택");
    // 기간 목록이 도착하기 전에는 선택지가 비어 있습니다. 첫 항목이 표시될 때까지 기다립니다.
    await expect(select.locator("option").first()).toBeAttached();
    for (const text of await select.locator("option").allTextContents()) {
      expect(text).toMatch(/^\d{4}-\d{2}-\d{2} – \d{4}-\d{2}-\d{2}$/);
    }
  });

  test("저장된 배정이 있는 기간을 다시 계산할 수 있다", async ({ page }) => {
    const { withSchedule } = await findFocusedPeriods(page.request);
    const originalRows = withSchedule.rows;

    await page.goto("/admin");
    // 기간 고르기는 기본 select 가 아니라 직접 그린 드롭다운입니다(components/Dropdown.tsx).
    // 버튼을 눌러 목록을 연 뒤 그 선택지를 누릅니다.
    await page.getByRole("button", { name: "기간 선택" }).click();
    await page
      .getByRole("option", { name: `${withSchedule.starts_on} – ${withSchedule.ends_on}` })
      .click();
    await expect(page.getByRole("heading", { name: "확정된 배정안이에요" })).toBeVisible();

    const runButton = page.getByRole("button", { name: /^스케줄링/ });
    await runButton.click();
    await expect(runButton).toHaveText("스케줄링 진행 중…");
    await expect(runButton).toHaveText("스케줄링", { timeout: ASSIGN_WAIT_MS });
    await expect(page.getByText("선택한 배정으로 확정했어요")).toBeVisible();

    // 되돌립니다. save_schedule 이 재계산 직전 현행을 백업 배정기록으로 남기므로 rollback 으로 그대로 복구됩니다.
    // scheduler.spec.ts 도 이 기간의 배정을 읽습니다.
    const rollback = await page.request.post(`/api/periods/${withSchedule.id}/rollback`);
    expect(rollback.ok()).toBe(true);

    const restored = (await (
      await page.request.get(`/api/periods/${withSchedule.id}/schedule`)
    ).json()) as { rows: typeof originalRows };
    const key = (row: (typeof originalRows)[number]): string =>
      `${row.team_id}-${row.room_id}-${row.start}-${row.end}`;
    expect(new Set(restored.rows.map(key))).toEqual(new Set(originalRows.map(key)));
  });

  test("자리를 다 채우지 못하면 조율안 탭이 나온다", async ({ page }) => {
    const { withoutSchedule } = await findFocusedPeriods(page.request);

    await page.goto("/admin");
    // 기간 고르기는 기본 select 가 아니라 직접 그린 드롭다운입니다(components/Dropdown.tsx).
    // 버튼을 눌러 목록을 연 뒤 그 선택지를 누릅니다.
    await page.getByRole("button", { name: "기간 선택" }).click();
    await page
      .getByRole("option", { name: `${withoutSchedule.starts_on} – ${withoutSchedule.ends_on}` })
      .click();
    await expect(page.getByRole("heading", { name: "현재 확정된 배정안이 없어요" })).toBeVisible();

    // 배정 불가능 판정은 CP-SAT 이 탐색 없이 즉시 끝낼 때가 있어 "진행 중" 문구를 놓칠 수 있습니다.
    // 이 검사는 계산이 끝난 뒤의 결과만 확인합니다.
    await page.getByRole("button", { name: /^스케줄링/ }).click();

    await expect(page.getByRole("tab", { name: "A안" })).toBeVisible({ timeout: ASSIGN_WAIT_MS });
  });
});
