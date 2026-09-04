import { expect, test } from "@playwright/test";

import { dateParts, findFocusedPeriods, loginForTests, weekdayKr } from "./helpers";

test.beforeEach(async ({ page }) => {
  await loginForTests(page);
});

test("달력이 실제 데이터로 그려진다", async ({ page, request }) => {
  const { withSchedule } = await findFocusedPeriods(request);
  if (withSchedule === null) {
    test.skip(true, "저장된 배정이 있는 집중 합주기간이 없어 건너뜀");
    return;
  }
  const row = withSchedule.rows[0];
  const { year, month, day } = dateParts(row.start);

  await page.goto("/scheduler");
  // "전체 일정" 이라야 내 팀이 아닌 팀의 배정도 보인다.
  await page.getByRole("tab", { name: "전체 일정" }).click();

  const cell = page.getByRole("button", {
    name: `${month}월 ${day}일 ${weekdayKr(year, month, day)}요일`,
  });
  await expect(cell).toContainText(row.team);
  await expect(cell.locator("time").first()).toHaveText(/\d{1,2}:\d{2}/);
});
