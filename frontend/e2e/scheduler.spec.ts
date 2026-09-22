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
  // 읽음 처리가 행을 삭제하므로 목록에 있는 알림은 전부 읽지 않은 알림입니다.
  const unread = notifications.length;
  expect(unread).toBeGreaterThan(0);

  await page.goto("/scheduler");
  await page.getByRole("button", { name: `알림 · 안 읽음 ${unread}개` }).click();

  const popup = page.getByRole("dialog", { name: "알림" });
  await expect(popup.locator("li")).toHaveCount(notifications.length);

  await popup.getByRole("button", { name: "모두 읽음" }).click();
  await expect(page.getByRole("button", { name: "알림", exact: true })).toBeVisible();
  await expect(popup.getByText("새 알림이 없어요")).toBeVisible();
});

// 로그인 상태 유지로 cookie 가 살아 있으면 랜딩·로그인 화면을 거치지 않고 대시보드로 갑니다.
// 이 이동이 없으면 브라우저를 다시 열었을 때 로그인 화면이 보여 로그인이 풀린 것처럼 보입니다.
test("로그인한 상태로 랜딩이나 로그인 화면에 들어가면 대시보드로 간다", async ({ page }) => {
  for (const path of ["/", "/login"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/scheduler$/);
  }
});
