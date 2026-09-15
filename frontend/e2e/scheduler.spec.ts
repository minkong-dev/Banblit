import { expect, test } from "@playwright/test";

import { dateParts, findFocusedPeriods, weekdayKr } from "./helpers";

test("달력이 실제 데이터로 그려진다", async ({ page }) => {
  // global-setup 이 오늘 날짜에 배정을 저장하므로 달력을 넘기지 않아도 그 칸이 이번 달에 있습니다.
  const { withSchedule } = await findFocusedPeriods(page.request);
  const row = withSchedule.rows[0];
  const { year, month, day } = dateParts(row.start);

  await page.goto("/scheduler");
  // '전체 일정'을 선택해야 내 팀이 아닌 팀의 배정도 표시됩니다.
  await page.getByRole("tab", { name: "전체 일정" }).click();

  const cell = page.getByRole("button", {
    name: `${month}월 ${day}일 ${weekdayKr(year, month, day)}요일`,
  });
  await expect(cell).toContainText(row.team);
  await expect(cell.locator("time").first()).toHaveText(/\d{1,2}:\d{2}/);
});

type Notification = { id: number; read: boolean };

// 알림은 배정이 저장되거나 되돌리기가 완료될 때 서버가 그 팀 멤버에게 생성합니다
// (backend/api/routers/schedule.py). global-setup 의 배정 저장이 E2E 계정에 알림을 남깁니다.
test("알림 버튼이 서버가 준 내 알림을 보여주고 모두 읽음으로 바꾼다", async ({ page }) => {
  const { notifications } = (await (await page.request.get("/api/notifications")).json()) as {
    notifications: Notification[];
  };
  const unread = notifications.filter((item) => !item.read).length;
  expect(unread).toBeGreaterThan(0);

  await page.goto("/scheduler");
  await page.getByRole("button", { name: `알림 · 안 읽음 ${unread}개` }).click();

  const popup = page.getByRole("dialog", { name: "알림" });
  await expect(popup.locator("li")).toHaveCount(notifications.length);

  await popup.getByRole("button", { name: "모두 읽음으로 표시" }).click();
  await expect(page.getByRole("button", { name: "알림", exact: true })).toBeVisible();
});
