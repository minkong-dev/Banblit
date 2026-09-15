import { expect, test } from "@playwright/test";

import { E2E_ROOM } from "./helpers";

type Room = { id: number; name: string; opens_at: string };

const EDIT_BUTTON = `${E2E_ROOM.name} 수정`;
// 한 칸(기본 60분) 뒤로 옮긴 개방 시간입니다. 마감 시간(22:00)보다 이릅니다.
const CHANGED_OPENS_AT = "19:00";

// 설정 화면은 합주실 탭으로 열립니다. 합주실이 이미 있으면 추가 버튼이 없으므로 두 검사 모두 수정 form 을 씁니다.
test("합주실을 수정하면 저장되고 다시 열어도 남아 있다", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: EDIT_BUTTON }).click();

  const editForm = page.locator("li.editing");
  await editForm.getByLabel("개방 시간").fill(CHANGED_OPENS_AT);
  await editForm.getByRole("button", { name: "저장" }).click();

  await expect(page.locator("li.editing")).toHaveCount(0);
  const row = page.locator("li").filter({ has: page.getByRole("button", { name: EDIT_BUTTON }) });
  await expect(row).toContainText(CHANGED_OPENS_AT);

  await page.reload();
  await expect(row).toContainText(CHANGED_OPENS_AT);

  // 복원합니다. 다른 검사가 18:00 부터 여는 합주실을 전제합니다.
  await page.getByRole("button", { name: EDIT_BUTTON }).click();
  await page.locator("li.editing").getByLabel("개방 시간").fill(E2E_ROOM.opens_at);
  await page.locator("li.editing").getByRole("button", { name: "저장" }).click();
  await expect(page.locator("li.editing")).toHaveCount(0);

  const { rooms } = (await (await page.request.get("/api/rooms")).json()) as { rooms: Room[] };
  expect(rooms.find((item) => item.name === E2E_ROOM.name)?.opens_at).toBe(E2E_ROOM.opens_at);
});

test("정각이 아닌 시각은 저장 버튼을 막는다", async ({ page }) => {
  await page.goto("/settings");
  await page.getByRole("button", { name: EDIT_BUTTON }).click();

  const editForm = page.locator("li.editing");
  await editForm.getByLabel("개방 시간").fill("18:20");

  await expect(editForm.getByRole("button", { name: "저장" })).toBeDisabled();
  await expect(editForm.getByRole("alert")).toContainText("정각");
});
