import { expect, test } from "@playwright/test";

import { findFocusedPeriods, loginForTests } from "./helpers";

// 배정 계산은 실측 1초 안팎이지만(2026-09-04), 컨테이너 부하에 따라 늘어날 수 있어
// 넉넉히 20초를 둔다. 화면(lib/jobs.ts)의 JOB_DEADLINE_MS(60초)보다는 작다 — 그보다
// 오래 걸리면 화면도 스스로 포기하므로 그 이상 기다릴 이유가 없다.
const ASSIGN_WAIT_MS = 20_000;

test.describe("배정 다시 계산", () => {
  test.beforeEach(async ({ page }) => {
    await loginForTests(page);
  });

  test("기간 고르기는 번호가 아니라 날짜 범위로 나온다", async ({ page }) => {
    await page.goto("/admin");
    const select = page.getByLabel("기간 고르기");
    // 기간 목록이 오기 전에는 옵션이 비어 있다 — 처음 하나가 달릴 때까지 기다린다.
    await expect(select.locator("option").first()).toBeAttached();
    const optionTexts = await select.locator("option").allTextContents();
    for (const text of optionTexts) {
      expect(text).toMatch(/^\d{4}-\d{2}-\d{2} – \d{4}-\d{2}-\d{2}$/);
    }
  });

  test("저장된 배정이 있는 기간을 다시 계산할 수 있다", async ({ page, request }) => {
    const { withSchedule } = await findFocusedPeriods(request);
    if (withSchedule === null) {
      test.skip(true, "저장된 배정이 있는 집중 합주기간이 없어 건너뜀");
      return;
    }
    const originalRows = withSchedule.rows;

    await page.goto("/admin");
    await page
      .getByLabel("기간 고르기")
      .selectOption({ label: `${withSchedule.starts_on} – ${withSchedule.ends_on}` });
    await expect(page.getByRole("heading", { name: "확정된 시간표입니다" })).toBeVisible();

    const recomputeButton = page.getByRole("button", { name: /다시 계산|계산하는 중/ });
    await recomputeButton.click();
    await expect(recomputeButton).toHaveText("계산하는 중…");
    await expect(recomputeButton).toHaveText("지금 다시 계산", { timeout: ASSIGN_WAIT_MS });
    await expect(
      page.getByText(/배정을 새로 확정했습니다|배정은 됐지만 저장되지 않았습니다/),
    ).toBeVisible();

    // 되돌린다 — 재계산이 만든 새 배정을 지우고 원래 저장돼 있던 배정을 복구한다.
    // save_schedule 이 재계산 직전 현행을 백업 한 회차로 남겨 두므로 rollback 으로 그대로 돌아간다.
    const rollback = await request.post(`/api/periods/${withSchedule.id}/rollback`);
    expect(rollback.ok()).toBe(true);

    const restored = (await (
      await request.get(`/api/periods/${withSchedule.id}/schedule`)
    ).json()) as { rows: typeof originalRows };
    const key = (row: (typeof originalRows)[number]): string =>
      `${row.team_id}-${row.room_id}-${row.start}-${row.end}`;
    expect(new Set(restored.rows.map(key))).toEqual(new Set(originalRows.map(key)));
  });

  test("자리를 다 채우지 못하면 조율안 탭이 나온다", async ({ page, request }) => {
    const { withoutSchedule } = await findFocusedPeriods(request);
    if (withoutSchedule === null) {
      test.skip(true, "조율안이 나올 집중 합주기간이 없어 건너뜀");
      return;
    }

    await page.goto("/admin");
    await page
      .getByLabel("기간 고르기")
      .selectOption({ label: `${withoutSchedule.starts_on} – ${withoutSchedule.ends_on}` });
    await expect(page.getByRole("heading", { name: "아직 확정된 시간표가 없습니다" })).toBeVisible();

    const recomputeButton = page.getByRole("button", { name: /다시 계산|계산하는 중/ });
    await recomputeButton.click();
    // 자리가 안 맞는다는 판정은 CP-SAT 이 탐색 없이 곧장 끝낼 때가 있어 "계산하는
    // 중…" 이 뜨는 순간을 못 볼 수 있다("저장된 배정이…" 검사가 그 문구는 이미 본다).
    // 여기서는 끝난 뒤의 결과만 확실히 잡는다.
    await expect(recomputeButton).toHaveText("지금 다시 계산", { timeout: ASSIGN_WAIT_MS });

    await expect(page.getByText(/조율안 \d+개/)).toBeVisible();
    await expect(page.getByRole("tab", { name: "A안" })).toBeVisible();
  });
});
