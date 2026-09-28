import { expect, test } from "@playwright/test";

import { E2E_ACCOUNT } from "./helpers";

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
test("프로필 사진 변경 말풍선에서 사진을 올리고, 기본 이미지로 되돌린다", async ({ page }) => {
  // 1x1 크기의 PNG 입니다. 화면에 보이는 내용은 검사하지 않으므로 가장 작은 파일을 씁니다.
  const png = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    "base64",
  );

  await page.goto("/profile");
  const head = page.locator(".prohead");
  await expect(head.locator("span.big")).toBeVisible();

  // 말풍선은 "프로필 사진 변경" 을 누를 때만 열립니다.
  const menu = page.getByRole("group", { name: "프로필 사진 변경" });
  await expect(menu).toBeHidden();
  await head.getByRole("button", { name: "프로필 사진 변경" }).click();
  await expect(menu).toBeVisible();

  const chooser = page.waitForEvent("filechooser");
  await menu.getByRole("button", { name: "프로필 사진 업로드" }).click();
  await (await chooser).setFiles({ name: "얼굴.png", mimeType: "image/png", buffer: png });

  await expect(head.locator("img.big")).toBeVisible();
  await expect(page.locator(".profbtn img.face")).toBeVisible();
  await expect(menu).toBeHidden();

  await head.getByRole("button", { name: "프로필 사진 변경" }).click();
  await menu.getByRole("button", { name: "기본 이미지 적용" }).click();
  await expect(head.locator("span.big")).toBeVisible();
});

// 평소에는 값만 표시하고 입력칸이 없습니다. 오른쪽 위 편집을 누르면 입력칸이 열리고, 저장 한 번으로 전부 기록한 뒤
// 다시 표시 상태로 돌아갑니다. 테마는 상단바의 버튼이 전환하므로 프로필에 테마 카드가 없습니다.
test("프로필은 표시 상태로 열리고, 편집에서 수정한 값을 저장 한 번으로 기록한다", async ({ page }) => {
  await page.goto("/profile");
  const head = page.locator(".prohead");
  await expect(head.getByRole("heading", { name: E2E_ACCOUNT.name })).toBeVisible();
  await expect(head.getByText(E2E_ACCOUNT.department, { exact: true })).toBeVisible();
  await expect(page.locator(".main input:not([type=file])")).toHaveCount(0);
  await expect(page.getByText("테마", { exact: true })).toHaveCount(0);
  await expect(page.getByText("회원 탈퇴", { exact: true })).toHaveCount(0);

  await page.getByRole("button", { name: "프로필 편집" }).click();
  await expect(page.getByRole("button", { name: "저장", exact: true })).toHaveCount(1);
  await expect(page.getByText("회원 탈퇴", { exact: true })).toBeVisible();
  await page.getByLabel("이름", { exact: true }).fill("편집 검사");
  await page.getByRole("button", { name: "저장", exact: true }).click();

  await expect(head.getByRole("heading", { name: "편집 검사" })).toBeVisible();
  await expect(page.locator(".main input:not([type=file])")).toHaveCount(0);

  // 다른 검사가 이 계정의 이름을 기준으로 삼으므로 되돌립니다.
  await page.getByRole("button", { name: "프로필 편집" }).click();
  await page.getByLabel("이름", { exact: true }).fill(E2E_ACCOUNT.name);
  await page.getByRole("button", { name: "저장", exact: true }).click();
  await expect(head.getByRole("heading", { name: E2E_ACCOUNT.name })).toBeVisible();
});

test("편집을 취소하면 입력한 값을 버리고 표시 상태로 돌아간다", async ({ page }) => {
  await page.goto("/profile");
  await page.getByRole("button", { name: "프로필 편집" }).click();
  await page.getByLabel("이름", { exact: true }).fill("버릴 이름");
  await page.getByRole("button", { name: "취소", exact: true }).click();
  await expect(page.locator(".prohead").getByRole("heading", { name: E2E_ACCOUNT.name })).toBeVisible();
  await expect(page.locator(".main input:not([type=file])")).toHaveCount(0);
});

test("상단바의 테마 버튼이 라이트와 다크를 전환하고 새로 열어도 유지된다", async ({ page }) => {
  await page.goto("/scheduler");
  const root = page.locator("html");
  const before = await root.getAttribute("data-theme");
  const after = before === "dark" ? "light" : "dark";

  await page.locator("header.top").getByRole("button", { name: after === "dark" ? "다크 모드로 전환" : "라이트 모드로 전환" }).click();
  await expect(root).toHaveAttribute("data-theme", after);
  await page.reload();
  await expect(root).toHaveAttribute("data-theme", after);
});
