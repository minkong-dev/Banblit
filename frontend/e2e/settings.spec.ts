import { expect, test } from "@playwright/test";

import { E2E_ACCOUNT, E2E_MEMBER, E2E_ROOM, dayFromToday } from "./helpers";

type Room = { id: number; name: string; opens_at: string };

const EDIT_BUTTON = `${E2E_ROOM.name} 수정`;
// 한 칸(기본 60분) 뒤로 옮긴 개방 시간입니다. 마감 시간(22:00)보다 이릅니다.
const CHANGED_OPENS_AT = "19:00";

// 합주실 화면입니다. 합주실이 이미 있으면 추가 버튼이 없으므로 두 검사 모두 수정 form 을 씁니다.
test("합주실을 수정하면 저장되고 다시 열어도 남아 있다", async ({ page }) => {
  await page.goto("/rooms");
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
  await page.goto("/rooms");
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
test("집중 합주기간에 전체 합주를 지정하고 날짜별 시각을 저장한다", async ({ page }) => {
  const [starts, ensembleDay, ends] = [10, 11, 12].map(dayFromToday);
  const saved = async (): Promise<SavedPeriod | undefined> => {
    const { periods } = (await (await page.request.get("/api/periods")).json()) as { periods: SavedPeriod[] };
    return periods.find((item) => item.starts_on === starts);
  };

  await page.goto("/periods");
  await page.getByRole("button", { name: "+ 새 집중 합주기간" }).click();

  // 상단바의 알림·프로필 팝오버도 dialog role 이라 제목으로 이 모달만 찾습니다.
  const dialog = page.getByRole("dialog", { name: "새 집중 합주기간" });
  await dialog.getByLabel("시작일", { exact: true }).fill(starts);
  await dialog.getByLabel("종료일", { exact: true }).fill(ends);
  // 체크박스 input 은 시각적으로 감춰져 있어 label 문구를 눌러 켭니다.
  await dialog.getByText("전체 합주기간 지정").click();
  await dialog.getByLabel("전체 합주 시작일").fill(ensembleDay);
  await dialog.getByLabel("전체 합주 종료일").fill(ensembleDay);
  await dialog.getByLabel("시작 시간").fill("19:00");
  await expect(dialog.getByText("팀별 합주 날짜:")).toBeVisible();
  await dialog.getByRole("button", { name: "기간 추가" }).click();
  await expect(dialog).toHaveCount(0);

  expect((await saved())?.ensemble).toMatchObject({ starts_on: ensembleDay, starts_at: "19:00" });

  await page.getByRole("button", { name: `${starts} 부터의 기간을 수정` }).click();
  const days = page.locator(".ensdays");
  await days.getByLabel("시작 시간").fill("20:00");
  await days.getByRole("button", { name: "저장" }).click();
  await expect.poll(async () => (await saved())?.ensemble?.days)
    .toEqual([{ day: ensembleDay, starts_at: "20:00", ends_at: "22:00" }]);

  await page.locator("li.editing").getByRole("button", { name: "취소" }).click();
  page.once("dialog", (confirm) => void confirm.accept());
  await page.getByRole("button", { name: `${starts} 부터의 기간을 삭제` }).click();
  await expect.poll(saved).toBeUndefined();
});

// 팀 하나가 하루에 배정받는 시간의 상한입니다(2026-09-28 사용자 결정). 점유 단위 카드에서 1~3시간 중 고릅니다.
test("점유 단위 카드에서 팀당 하루 최대 배정 시간을 1~3시간 중 선택하고 저장한다", async ({ page }) => {
  await page.goto("/rooms");
  const pick = page.locator("#dailyMax");
  await expect(pick).toHaveText(/3시간/);
  await pick.click();
  await expect(page.getByRole("option")).toHaveText(["1시간", "2시간", "3시간"]);
  await page.getByRole("option", { name: "2시간" }).click();
  await expect(pick).toHaveText(/2시간/);
  await page.reload();
  await expect(page.locator("#dailyMax")).toHaveText(/2시간/);
  // 다른 검사가 기본값을 전제로 하므로 되돌립니다.
  await page.locator("#dailyMax").click();
  await page.getByRole("option", { name: "3시간" }).click();
  await expect(page.locator("#dailyMax")).toHaveText(/3시간/);
});

// 카드는 넘치는 내용을 잘라 냅니다. 드롭다운 목록이 카드 안에 갇히면 아래 선택지가 잘려 누를 수 없습니다.
test("카드 안의 드롭다운 목록이 카드에 잘리지 않고 모든 선택지를 누를 수 있다", async ({ page }) => {
  await page.goto("/rooms");
  await page.locator("#slotUnit").click();
  const options = page.getByRole("option");
  await expect(options.first()).toBeVisible();
  // 스크롤하지 않은 채로 목록의 위·아래 가장자리 바로 안쪽이 목록 자신으로 보이는지 잽니다. 카드에 잘리면 그 자리에
  // 카드 바깥 요소(다음 카드·바탕)가 보입니다.
  const edges = await page.getByRole("listbox").evaluate((list) => {
    const r = list.getBoundingClientRect();
    const at = (y: number) => list.contains(document.elementFromPoint(r.left + r.width / 2, y));
    return { top: at(r.top + 3), bottom: at(r.bottom - 3) };
  });
  expect(edges).toEqual({ top: true, bottom: true });
});

test("불가능 일정 화면이 등록된 일정을 멤버 이름과 함께 보여주고, 본인 일정에는 삭제 버튼을 둔다", async ({ page }) => {
  // global-setup.ts 가 E2E 계정의 불가능 일정을 내일 하루치로 1건 만듭니다. 본인 일정은 반려가 아니라 바로 삭제합니다.
  await page.goto("/unavailable");

  const row = page.locator("tr").filter({ hasText: E2E_ACCOUNT.name }).first();
  await expect(row).toBeVisible();
  await expect(row.getByRole("button", { name: /삭제$/ })).toBeVisible();
});

// 다른 멤버의 불가능 일정은 반려 사유를 적어 삭제하고, 그 멤버에게 사유가 알림으로 갑니다.
// 예약 반려도 같은 modal(components/RejectDialog.tsx)을 쓰므로 modal 의 동작은 이 검사가 대표합니다.
test("다른 멤버의 불가능 일정을 반려하면 표에서 사라지고 그 멤버에게 사유가 알림으로 간다", async ({ page, playwright, baseURL }) => {
  const reason = `리허설이라 빠질 수 없어요 ${Date.now()}`;
  const asMember = await playwright.request.newContext({ baseURL });
  try {
    expect((await asMember.post("/api/login", {
      data: { login_id: E2E_MEMBER.login_id, password: E2E_MEMBER.password },
    })).ok()).toBe(true);
    const { account } = await (await asMember.get("/api/me")).json() as { account: { id: number } };
    const day = dayFromToday(5);
    expect((await asMember.post(`/api/members/${account.id}/unavailable`, {
      data: { starts_at: `${day}T18:00:00`, ends_at: `${day}T19:00:00`, name: "반려 검사" },
    })).ok()).toBe(true);

    await page.goto("/unavailable");
    const row = page.locator("tr").filter({ hasText: "반려 검사" });
    await row.getByRole("button", { name: /반려$/ }).click();

    const dialog = page.getByRole("dialog", { name: "불가능 일정 반려" });
    await expect(dialog).toContainText(`${E2E_MEMBER.name}님의 불가능 일정을 반려할게요.`);
    await expect(dialog.getByPlaceholder("반려사유를 작성해주세요.")).toBeVisible();
    await dialog.getByLabel("반려 사유").fill(reason);
    await dialog.getByRole("button", { name: "반려하기" }).click();

    await expect(row).toHaveCount(0);
    const { notifications } = await (await asMember.get("/api/notifications")).json() as {
      notifications: { kind: string; reason: string | null }[];
    };
    expect(notifications.some((item) => item.kind === "rejected" && item.reason === reason)).toBe(true);
  } finally {
    await asMember.dispose();
  }
});
