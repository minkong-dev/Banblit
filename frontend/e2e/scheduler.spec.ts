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
  // '전체 일정'을 선택해야 내 팀이 아닌 팀의 배정도 표시됩니다.
  await page.getByRole("tab", { name: "전체 일정" }).click();

  const cell = page.getByRole("button", {
    name: `${month}월 ${day}일 ${weekdayKr(year, month, day)}요일`,
  });
  await expect(cell).toContainText(row.team);
  await expect(cell.locator("time").first()).toHaveText(/\d{1,2}:\d{2}/);
});

type Notification = { id: number; kind: string; created_at: string; read: boolean };

// ponytail: 알림은 배정이 저장되거나 되돌리기가 완료될 때 서버가 생성합니다
// (backend/api/routers/schedule.py, backend/jobs/auto_assign.py). 이 테스트는 알림을 새로
// 만들지 않고, 서버가 반환한 알림과 화면이 표시하는 알림이 같은지만 확인합니다. 알림을 생성해
// 두고 확인하려면 assignment.spec.ts 처럼 배정 계산을 실행해야 합니다.
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

  // 알림 패널의 제목(.ph)을 클릭하면 전부 읽은 상태가 되고 '안 읽음 n' 표시가 사라집니다.
  await expect(panel.locator(".ph")).toContainText(`안 읽음 ${unread}`);
  await panel.locator(".ph").click();
  await expect(panel.locator(".ph")).not.toContainText("안 읽음");
});
