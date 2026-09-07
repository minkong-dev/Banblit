import { expect, test } from "@playwright/test";

import { dateParts, findFocusedPeriods, loginForTests, weekdayKr } from "./helpers";

test.beforeEach(async ({ page, request }) => {
  await loginForTests(page.request, request);
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

type Notification = { id: number; kind: string; created_at: string; read: boolean };

// ponytail: 알림을 만드는 곳은 자동 배정 서비스 하나뿐이라(backend/api/auto_assign.py)
// 브라우저에서 새 알림을 만들어 낼 방법이 없다. 그래서 알림을 새로 만들지 않고,
// 서버가 가진 것과 화면이 보여주는 것이 같은지만 본다. 화면에서 알림이 생기는 경로가
// 열리면 알림을 만들어 놓고 확인하는 쪽으로 바꾼다.
test("알림 칸이 목록 맨 위에 있고 서버가 준 내 알림과 같은 것을 보여준다", async ({
  page,
  request,
}) => {
  const { notifications } = (await (await request.get("/api/notifications")).json()) as {
    notifications: Notification[];
  };
  const unread = notifications.filter((item) => !item.read).length;

  await page.goto("/scheduler");
  const panel = page.locator(".rail section.panel").first();
  await expect(panel.locator(".ph")).toContainText("알림");

  if (notifications.length === 0) {
    await expect(panel.getByText("새 알림이 없습니다")).toBeVisible();
    return;
  }
  await expect(panel.locator("li")).toHaveCount(notifications.length);
  if (unread === 0) return;

  // 머리글을 누르면 전부 읽은 것이 되고 "안 읽음 n" 이 사라진다.
  await expect(panel.locator(".ph")).toContainText(`안 읽음 ${unread}`);
  await panel.locator(".ph").click();
  await expect(panel.locator(".ph")).not.toContainText("안 읽음");
});
