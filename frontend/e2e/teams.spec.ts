import { expect, test } from "@playwright/test";

import { E2E_ACCOUNT, E2E_MEMBER, E2E_TEAM } from "./helpers";

test("새 팀 창 하나에서 이름·포지션·멤버를 설정해 팀을 생성한다", async ({ page }) => {
  const name = "E2E 한 창 팀";
  await page.goto("/teams");
  await page.getByRole("button", { name: "+ 새 팀" }).click();

  const form = page.getByRole("dialog", { name: "새 팀" });
  await form.getByLabel("팀 이름").fill(name);
  await form.getByRole("button", { name: "드럼 인원 추가" }).click();
  await form.getByRole("button", { name: "드럼 지정할 멤버 찾기" }).click();

  const search = page.getByRole("dialog", { name: "멤버 검색" });
  await search.getByLabel("검색어").fill(E2E_MEMBER.name);
  await search.getByRole("button", { name: new RegExp(E2E_MEMBER.name) }).click();
  await expect(form.locator(".seat").getByText(E2E_MEMBER.name)).toBeVisible();

  await form.getByRole("button", { name: "팀 생성" }).click();
  await expect(page.locator(".teamrow2", { hasText: name })).toContainText("1/1");
});

// 팀 행의 버튼 이름에는 "내 팀"·"1/1" 이 붙고, 같은 행에 "<팀> 수정"·"<팀> 삭제" 버튼이 있어
// 이름 정규식으로는 하나로 좁혀지지 않습니다. 행 버튼(.teamrow2)을 팀 이름으로 거릅니다.
test("팀 관리에서 팀을 누르면 포지션에 지정된 멤버가 나온다", async ({ page }) => {
  await page.goto("/teams");
  await page.locator(".teamrow2", { hasText: E2E_TEAM }).click();

  await expect(page.locator(".lineup").getByText(E2E_ACCOUNT.name)).toBeVisible();
});
