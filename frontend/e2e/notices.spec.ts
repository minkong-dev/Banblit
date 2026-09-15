import { expect, test } from "@playwright/test";

import { escapeRegExp } from "./helpers";

// 공지 작성은 전체 권한이 필요합니다. global-setup 이 만드는 E2E 계정이 첫 가입자라 전체 권한을 가집니다.
// 만든 공지는 삭제하지 않습니다. DB 가 실행마다 비워지므로 쌓이지 않습니다.
test("공지에 글을 쓰고 댓글을 달 수 있다", async ({ page }) => {
  const title = `E2E 공지 확인 ${Date.now()}`;
  const comment = "종단 검사가 남긴 댓글입니다.";

  await page.goto("/notices");
  await page.getByRole("button", { name: "글쓰기" }).click();
  await page.getByLabel("제목").fill(title);
  await page.getByLabel("내용").fill("종단 검사가 남긴 글입니다.");
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
