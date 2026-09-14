import { expect, test } from "@playwright/test";

import { escapeRegExp, loginForTests } from "./helpers";

test.beforeEach(async ({ page }) => {
  await loginForTests(page.request);
});

// 이 테스트는 만든 공지를 삭제하지 않으므로 게시글이 계속 쌓입니다.
// 매번 다른 제목을 사용해 이전 실행의 게시글과 구분되게 합니다.
// 공지 작성은 헤드매니저만 할 수 있습니다. seed가 생성하는 e2e 계정이 헤드매니저라 이 테스트가 통과합니다.
test("공지에 글을 쓰고 댓글을 달 수 있다", async ({ page }) => {
  const title = `E2E 공지 확인 ${Date.now()}`;
  const body = "종단 검사가 남긴 글입니다.";
  const comment = "종단 검사가 남긴 댓글입니다.";

  await page.goto("/notices");
  await page.getByLabel("제목").fill(title);
  await page.getByLabel("내용").fill(body);
  await page.getByRole("button", { name: "글쓰기" }).click();

  const postButton = page.getByRole("button", { name: new RegExp(escapeRegExp(title)) });
  const row = page.locator("li").filter({ has: postButton });
  await expect(row).toContainText("댓글 0");

  await postButton.click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(page.getByText("아직 댓글이 없습니다")).toBeVisible();

  await page.getByLabel("댓글 쓰기").fill(comment);
  await page.getByRole("button", { name: "댓글 달기" }).click();

  await expect(page.getByText(comment)).toBeVisible();
  await expect(page.getByText("댓글 1개")).toBeVisible();

  await page.getByRole("button", { name: "‹ 목록으로" }).click();
  await expect(row).toContainText("댓글 1");
});
