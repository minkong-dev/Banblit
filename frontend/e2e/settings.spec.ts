import { expect, test } from "@playwright/test";

import { loginForTests } from "./helpers";

type Room = { id: number; name: string; opens_at: string; closes_at: string };

test.beforeEach(async ({ page }) => {
  await loginForTests(page);
});

const SLOT_MINUTES = 30;

/** 30분 격자를 지키며 opens_at 을 한 칸 옮긴다. +30분이 closes_at 을 넘으면 -30분으로 옮긴다. */
function shiftedOpensAt(opensAt: string, closesAt: string): string {
  const [hour, minute] = opensAt.split(":").map(Number);
  const [closeHour, closeMinute] = closesAt.split(":").map(Number);
  const openMinutes = hour * 60 + minute;
  const closeMinutes = closeHour * 60 + closeMinute;
  const forward = openMinutes + SLOT_MINUTES;
  const chosen = forward < closeMinutes ? forward : openMinutes - SLOT_MINUTES;
  return `${String(Math.floor(chosen / 60)).padStart(2, "0")}:${String(chosen % 60).padStart(2, "0")}`;
}

test("합주실을 고치면 저장되고 다시 열어도 남아 있다", async ({ page, request }) => {
  const { rooms } = (await (await request.get("/api/rooms")).json()) as { rooms: Room[] };
  if (rooms.length === 0) {
    test.skip(true, "등록된 합주실이 없어 건너뜀");
    return;
  }
  const room = rooms[0];
  const changedOpensAt = shiftedOpensAt(room.opens_at, room.closes_at);
  const editButtonName = `${room.name} 고치기`;

  await page.goto("/settings");
  await page.getByRole("button", { name: editButtonName }).click();

  const editForm = page.locator("li.editing");
  await editForm.getByLabel("여는 시각").fill(changedOpensAt);
  await editForm.getByRole("button", { name: "저장" }).click();

  await expect(page.locator("li.editing")).toHaveCount(0);
  const row = page.locator("li").filter({ has: page.getByRole("button", { name: editButtonName }) });
  await expect(row).toContainText(changedOpensAt);

  await page.reload();
  const rowAfterReload = page
    .locator("li")
    .filter({ has: page.getByRole("button", { name: editButtonName }) });
  await expect(rowAfterReload).toContainText(changedOpensAt);

  // 되돌린다 — 다음 번 검사도, 이 값을 보는 사람도 원래 시각을 봐야 한다.
  await page.getByRole("button", { name: editButtonName }).click();
  await page.locator("li.editing").getByLabel("여는 시각").fill(room.opens_at);
  await page.locator("li.editing").getByRole("button", { name: "저장" }).click();
  await expect(page.locator("li.editing")).toHaveCount(0);

  const restored = (await (await request.get("/api/rooms")).json()) as { rooms: Room[] };
  const restoredRoom = restored.rooms.find((item) => item.id === room.id);
  expect(restoredRoom?.opens_at).toBe(room.opens_at);
});

test("30분에 안 맞는 시각은 저장 단추를 막는다", async ({ page }) => {
  await page.goto("/settings");
  const addForm = page.locator("form").filter({ has: page.getByRole("button", { name: "합주실 추가" }) });

  await addForm.getByLabel("이름").fill(`E2E 검사용 합주실 ${Date.now()}`);
  await addForm.getByLabel("닫는 시각").fill("23:00");
  // 30분 격자를 벗어난 값 — 저장 단추가 막히고 사유가 떠야 한다.
  await addForm.getByLabel("여는 시각").fill("18:20");

  await expect(addForm.getByRole("button", { name: "합주실 추가" })).toBeDisabled();
  await expect(addForm.getByRole("alert")).toContainText("정시 또는 30분");
});
