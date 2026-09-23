import { expect, test } from "@playwright/test";

// 상단바는 layout route 에 있어 화면을 이동해도 삭제되지 않습니다. 화면마다 상단바를 새로 만들면
// 이동하는 순간 shell.css 가 없는 상태로 스타일이 계산되어 프로필 카드가 열렸다 닫히는 것처럼 보입니다.
// 이동 전 상단바 요소에 표시를 남기고, 이동 후 같은 요소가 남아 있는지 확인합니다.
test("화면을 이동해도 상단바와 프로필 카드가 다시 생성되지 않는다", async ({ page }) => {
  const card = page.locator('[role="dialog"][aria-label="내 프로필"]');

  await page.goto("/scheduler");
  await page.locator("header.top").evaluate((header) => { header.dataset.probe = "kept"; });

  for (const name of ["공지사항", /팀 관리|내 팀|팀 찾기/, "대시보드"]) {
    await page.getByRole("link", { name }).click();
    await expect(page.locator('header.top[data-probe="kept"]')).toHaveCount(1);
    await expect(card).not.toHaveClass(/\bon\b/);
  }
});

// 상단바가 유지되므로 카드의 열림 상태도 유지됩니다. 클릭 없이 주소만 바뀌는 경우(뒤로 가기)에도 닫혀야 합니다.
test("프로필 카드를 연 채 주소가 바뀌면 카드가 닫힌다", async ({ page }) => {
  const card = page.locator('[role="dialog"][aria-label="내 프로필"]');
  const openButton = page.locator(".profbtn");

  await page.goto("/scheduler");
  await openButton.click();
  await page.getByRole("link", { name: "공지사항" }).click();
  await expect(page).toHaveURL(/\/notices$/);
  await expect(card).not.toHaveClass(/\bon\b/);

  await openButton.click();
  await expect(card).toHaveClass(/\bon\b/);
  await page.goBack();
  await expect(page).toHaveURL(/\/scheduler$/);
  await expect(card).not.toHaveClass(/\bon\b/);
});

test("프로필 카드는 버튼을 누를 때만 열리고 바깥을 누르거나 이동하면 닫힌다", async ({ page }) => {
  const card = page.locator('[role="dialog"][aria-label="내 프로필"]');
  const openButton = page.locator(".profbtn");

  await page.goto("/scheduler");
  await openButton.click();
  await expect(card).toHaveClass(/\bon\b/);
  await page.locator(".page").click({ position: { x: 5, y: 5 } });
  await expect(card).not.toHaveClass(/\bon\b/);

  await openButton.click();
  await card.getByRole("button", { name: /프로필 설정/ }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(card).not.toHaveClass(/\bon\b/);
});

// 프로필 사진입니다. 없으면 이름 앞 두 글자(span), 올리면 사진(img)이 같은 자리에 표시됩니다.
// 올린 사진은 상단바에도 같은 주소로 표시되므로 두 자리를 함께 확인합니다.
test("프로필 사진을 올리면 이니셜 대신 사진이 표시되고, 지우면 되돌아간다", async ({ page }) => {
  // 1x1 크기의 PNG 입니다. 화면에 보이는 내용은 검사하지 않으므로 가장 작은 파일을 씁니다.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );

  await page.goto("/profile");
  const photoCard = page.locator(".photo");
  await expect(photoCard.locator("span.big")).toBeVisible();

  await photoCard.locator("input[type=file]").setInputFiles({
    name: "얼굴.png",
    mimeType: "image/png",
    buffer: png,
  });

  await expect(photoCard.locator("img.big")).toBeVisible();
  await expect(page.locator(".profbtn img.face")).toBeVisible();

  await photoCard.getByRole("button", { name: "사진 삭제" }).click();

  await expect(photoCard.locator("span.big")).toBeVisible();
});

// 설정 화면의 계정 탭을 프로필 화면으로 옮겼습니다(2026-09-23). 옮긴 항목이 전부 있는지 확인합니다.
test("프로필 화면에서 이름·비밀번호·테마·탈퇴를 다룬다", async ({ page }) => {
  await page.goto("/profile");

  for (const title of ["프로필 사진", "내 정보", "비밀번호", "테마", "회원 탈퇴"]) {
    await expect(page.getByText(title, { exact: true })).toBeVisible();
  }
});
