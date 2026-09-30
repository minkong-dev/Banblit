import { expect, test } from "@playwright/test";

// components/hooks.ts 의 useDismissible(바깥 클릭·Escape 로 직접 닫던 구현)을 HTML popover 속성으로
// 옮긴 4곳입니다(AppShell.tsx ProfileMenu, NotificationMenu.tsx, RichText.tsx ColorPanel,
// routes/ProfileCards.tsx PhotoEdit). jsdom(vitest 가 쓰는 가짜 DOM)이 showPopover·togglePopover 를
// 지원하지 않아(30.0.1 기준) 이 파일에서 실제 브라우저로 검증합니다.

test("프로필 메뉴가 popover 로 열리고, 바깥을 누르거나 Esc 를 누르면 닫힌다", async ({ page }) => {
  await page.goto("/scheduler");
  const trigger = page.locator(".profbtn");
  const menu = page.getByRole("dialog", { name: "내 프로필" });

  await trigger.click();
  await expect(menu).toBeVisible();
  await expect(menu).toBeInViewport({ ratio: 1 });

  await page.mouse.click(10, 10);
  await expect(menu).toBeHidden();

  await trigger.click();
  await expect(menu).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
});

// hooks.ts 의 usePopoverRouteClose 가 useLocation 비교로 경로 변화를 감지해 popover 를 직접 닫습니다.
// 브라우저는 SPA 라우팅을 모르므로 popover 스스로는 이 경로 변화를 감지하지 못합니다.
test("프로필 메뉴가 열린 채로 다른 화면으로 이동하면 popover 가 닫힌다", async ({ page }) => {
  await page.goto("/scheduler");
  const trigger = page.locator(".profbtn");
  const menu = page.getByRole("dialog", { name: "내 프로필" });

  await trigger.click();
  await expect(menu).toBeVisible();

  await page.locator(".side").getByRole("link", { name: "공지사항" }).click();
  await expect(page).toHaveURL(/\/notices$/);
  await expect(menu).toBeHidden();
});

test("알림 popover 가 바깥을 누르면 닫힌다", async ({ page }) => {
  await page.goto("/scheduler");
  const trigger = page.locator(".notes .bell");
  const menu = page.getByRole("dialog", { name: "알림" });

  await trigger.click();
  await expect(menu).toBeVisible();
  await expect(menu).toBeInViewport({ ratio: 1 });

  await page.mouse.click(10, 10);
  await expect(menu).toBeHidden();
});

test("글자색 popover 가 열리고 바깥을 누르면 닫힌다", async ({ page }) => {
  await page.goto("/notices/new");
  const trigger = page.getByRole("button", { name: "글자색과 배경색" });
  const panel = page.getByRole("dialog", { name: "글자색과 배경색" });

  await trigger.click();
  await expect(panel).toBeVisible();
  await expect(panel).toBeInViewport({ ratio: 1 });

  await page.mouse.click(10, 10);
  await expect(panel).toBeHidden();
});

// PhotoEdit 은 네이티브 popover 가 대신해주지 않는 동작(닫힐 때 여는 버튼으로 초점 복귀)을
// toggle 이벤트로 직접 구현했습니다. 바깥 클릭으로 닫아도 이 복귀가 일어나야 합니다.
test("프로필 사진 변경 popover 가 닫히면 초점이 여는 버튼으로 되돌아간다", async ({ page }) => {
  await page.goto("/profile");
  const trigger = page.getByRole("button", { name: "프로필 사진 변경" });
  const menu = page.getByRole("group", { name: "프로필 사진 변경" });

  await trigger.click();
  await expect(menu).toBeVisible();
  await expect(menu).toBeInViewport({ ratio: 1 });

  await page.mouse.click(10, 10);
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();

  // 메뉴 안 버튼(기본 이미지 적용)으로 닫아도 같은 방식으로 초점이 되돌아갑니다.
  await trigger.click();
  await expect(menu).toBeVisible();
  await page.getByRole("button", { name: "기본 이미지 적용" }).click();
  await expect(menu).toBeHidden();
  await expect(trigger).toBeFocused();
});
