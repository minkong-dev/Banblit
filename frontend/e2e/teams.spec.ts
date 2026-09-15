import { expect, test } from "@playwright/test";

import { E2E_ACCOUNT, E2E_TEAM } from "./helpers";

// 팀 행의 버튼 이름에는 "내 팀"·"1/1" 이 붙고, 같은 행에 "<팀> 수정"·"<팀> 삭제" 버튼이 있어
// 이름 정규식으로는 하나로 좁혀지지 않습니다. 행 버튼(.teamrow2)을 팀 이름으로 거릅니다.
test("팀 관리에서 팀을 누르면 포지션에 지정된 멤버가 나온다", async ({ page }) => {
  await page.goto("/teams");
  await page.locator(".teamrow2", { hasText: E2E_TEAM }).click();

  await expect(page.locator(".lineup").getByText(E2E_ACCOUNT.name)).toBeVisible();
});
