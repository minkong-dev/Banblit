import { expect, test } from "@playwright/test";

import { E2E_ACCOUNT, dateParts, dayFromToday, findFocusedPeriods, weekdayKr } from "./helpers";

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

// 대시보드의 "내 팀" 은 배정 일정에 나온 팀이 아니라 내가 소속된 팀 전부입니다.
// 아직 배정 일정이 없는 새 팀도 소속되면 바로 나와야 합니다.
test("배정 일정이 없는 팀에 소속되어도 대시보드 내 팀에 나온다", async ({ page }) => {
  const name = `E2E 새 소속 ${Date.now() % 100000}`;
  await page.goto("/teams");
  await page.getByRole("button", { name: "+ 새 팀" }).click();
  const form = page.getByRole("dialog", { name: "새 팀" });
  await form.getByLabel("팀 이름").fill(name);
  await form.getByRole("button", { name: "보컬 인원 추가" }).click();
  await form.getByRole("button", { name: "보컬 지정할 멤버 찾기" }).click();
  const search = page.getByRole("dialog", { name: "멤버 검색" });
  await search.getByLabel("검색어").fill(E2E_ACCOUNT.name);
  await search.getByRole("button", { name: new RegExp(E2E_ACCOUNT.name) }).click();
  await form.getByRole("button", { name: "팀 생성" }).click();
  await expect(page.locator(".teamrow2", { hasText: name })).toBeVisible();

  await page.goto("/scheduler");
  const panel = page.locator(".panel", { hasText: "내 팀" });
  await expect(panel.getByText(name)).toBeVisible();
});

// 주 보기의 시각 글자는 요일 머리글에 가려지지 않아야 합니다. 맨 위로 스크롤했을 때와, 들어오자마자
// 여는 시각 줄로 스크롤된 상태 모두 확인합니다.
test("주 보기의 맨 위 시각 글자가 요일 머리글에 가려지지 않는다", async ({ page }) => {
  await page.goto("/scheduler");
  await page.getByRole("button", { name: "주", exact: true }).click();
  const box = page.locator(".weekscroll");
  await expect(box).toBeVisible();

  const covered = () => page.evaluate(() => {
    const scroll = document.querySelector(".weekscroll")!;
    const header = document.querySelector(".weekgrid .wh")!.getBoundingClientRect();
    const labels = [...document.querySelectorAll(".weekgrid .wt")].map((el) => el.getBoundingClientRect());
    const inView = labels.filter((rect) => rect.bottom > header.top && rect.top < scroll.getBoundingClientRect().bottom);
    // 보이는 영역에 걸친 글자 중 가장 위의 것이 머리글 아래 끝보다 위로 올라가 있으면 가려진 것입니다.
    return header.bottom - Math.min(...inView.map((rect) => rect.top));
  });
  expect(await covered(), "들어온 직후").toBeLessThanOrEqual(0);
  await box.evaluate((el) => { el.scrollTop = 0; });
  expect(await covered(), "맨 위").toBeLessThanOrEqual(0);
});

// 예약 모달 오른쪽 "내 예약" 은 선택한 날짜의 예약이 아니라 내가 잡은 예약 전부입니다(불가능 일정 목록과 같은 방식).
// 다른 날짜의 모달을 열어도 그 예약이 날짜와 함께 보여야, 지난 달력을 뒤지지 않고 취소할 수 있습니다.
test("예약 모달의 내 예약은 다른 날짜의 예약도 날짜와 함께 보여 준다", async ({ page }) => {
  // 오늘과 내일은 global-setup 이 집중 합주기간으로 만들어 예약할 수 없으므로 사흘 뒤에 예약합니다.
  const booked = dayFromToday(3);
  const { rooms } = (await (await page.request.get("/api/rooms")).json()) as { rooms: { id: number }[] };
  const created = await page.request.post("/api/reservations", {
    data: { room_id: rooms[0].id, starts_at: `${booked}T19:00:00`, ends_at: `${booked}T20:00:00` },
  });
  expect(created.status()).toBe(201);

  const other = dayFromToday(2);
  const { year, month, day } = dateParts(`${other}T00:00:00`);
  await page.goto("/scheduler");
  await page.getByRole("tab", { name: "예약" }).click();
  if (month !== new Date().getMonth() + 1) await page.getByRole("button", { name: "다음 달" }).click();
  await page.getByRole("button", { name: `${month}월 ${day}일 ${weekdayKr(year, month, day)}요일` }).click();

  const target = dateParts(`${booked}T00:00:00`);
  await expect(page.locator("dialog .pane").last()).toContainText(`${target.month}월 ${target.day}일`);
});
