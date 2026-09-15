import { expect, test } from "@playwright/test";

import { E2E_ROOM, dayFromToday } from "./helpers";

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

type SavedPeriod = {
  id: number;
  starts_on: string;
  ensemble: { starts_on: string; starts_at: string; days: { day: string; starts_at: string }[] } | null;
};

// 다른 검사가 쓰는 오늘·내일 기간과 겹치지 않게 10일 뒤 기간을 새로 만들고, 끝나면 삭제합니다.
test("집중합주 기간에 전체합주를 지정하고 날짜별 시각을 저장한다", async ({ page }) => {
  const [starts, ensembleDay, ends] = [10, 11, 12].map(dayFromToday);
  const saved = async (): Promise<SavedPeriod | undefined> => {
    const { periods } = (await (await page.request.get("/api/periods")).json()) as { periods: SavedPeriod[] };
    return periods.find((item) => item.starts_on === starts);
  };

  await page.goto("/settings");
  await page.getByRole("tab", { name: "기간" }).click();
  await page.getByRole("button", { name: "+ 새 집중합주 기간" }).click();

  // 상단바의 알림·프로필 팝오버도 dialog role 이라 제목으로 이 모달만 찾습니다.
  const dialog = page.getByRole("dialog", { name: "새 집중합주 기간" });
  await dialog.getByLabel("시작일", { exact: true }).fill(starts);
  await dialog.getByLabel("종료일", { exact: true }).fill(ends);
  // 체크박스 input 은 시각적으로 감춰져 있어 label 문구를 눌러 켭니다.
  await dialog.getByText("전체 합주기간 지정").click();
  await dialog.getByLabel("전체합주 시작일").fill(ensembleDay);
  await dialog.getByLabel("전체합주 종료일").fill(ensembleDay);
  await dialog.getByLabel("시작 시각").fill("19:00");
  await expect(dialog.getByText("팀별합주 날짜:")).toBeVisible();
  await dialog.getByRole("button", { name: "기간 추가" }).click();
  await expect(dialog).toHaveCount(0);

  expect((await saved())?.ensemble).toMatchObject({ starts_on: ensembleDay, starts_at: "19:00" });

  await page.getByRole("button", { name: `${starts} 부터의 기간을 수정` }).click();
  const days = page.locator(".ensdays");
  await days.getByLabel("시작 시각").fill("20:00");
  await days.getByRole("button", { name: "시각 저장" }).click();
  await expect.poll(async () => (await saved())?.ensemble?.days)
    .toEqual([{ day: ensembleDay, starts_at: "20:00", ends_at: "22:00" }]);

  await page.locator("li.editing").getByRole("button", { name: "취소" }).click();
  page.once("dialog", (confirm) => void confirm.accept());
  await page.getByRole("button", { name: `${starts} 부터의 기간을 삭제` }).click();
  await expect.poll(saved).toBeUndefined();
});
