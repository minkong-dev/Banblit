import { expect, test } from "@playwright/test";

import { escapeRegExp } from "./helpers";

// 공지 작성은 전체 권한이 필요합니다. global-setup 이 만드는 E2E 계정이 첫 가입자라 전체 권한을 가집니다.
// 만든 공지는 삭제하지 않습니다. DB 가 실행마다 비워지므로 쌓이지 않습니다.
test("공지에 글을 쓰고 댓글을 달 수 있다", async ({ page }) => {
  const title = `E2E 공지 확인 ${Date.now()}`;
  const comment = "종단 검사가 남긴 댓글입니다.";

  await page.goto("/notices");
  await page.getByRole("link", { name: "글쓰기" }).click();
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

// 블라인드는 글을 지우지 않고 가립니다. 가린 글은 작성자 본인에게도 보이지 않고, 설정의 블라인드
// 탭에서만 보입니다. 권한은 board_moderate 이고 E2E 계정이 첫 가입자라 그 권한을 가집니다.
test("공지를 블라인드하면 목록에서 사라지고 설정에서 되돌린다", async ({ page }) => {
  const title = `E2E 블라인드 ${Date.now()}`;
  // 블라인드와 해제는 되돌릴 수 있는지 사람에게 한 번 묻습니다. 검사는 그 물음에 예로 답합니다.
  page.on("dialog", (dialog) => { void dialog.accept(); });

  await page.goto("/notices");
  await page.getByRole("link", { name: "글쓰기" }).click();
  await page.getByLabel("제목").fill(title);
  await page.getByLabel("내용").fill("가려질 글입니다.");
  await page.getByRole("button", { name: "글쓰기" }).click();

  const postButton = page.getByRole("button", { name: new RegExp(escapeRegExp(title)) });
  await postButton.click();
  await page.getByRole("button", { name: "글 블라인드" }).click();

  await expect(postButton).toHaveCount(0);

  await page.goto("/settings");
  await page.getByRole("tab", { name: "블라인드" }).click();
  const listed = page.locator("tr").filter({ hasText: title });
  await expect(listed).toBeVisible();
  await listed.getByRole("button", { name: "해제" }).click();

  await expect(listed).toHaveCount(0);
  await page.goto("/notices");
  await expect(postButton).toBeVisible();
});

test("본문에 그림을 넣으면 미리보기로 보인다", async ({ page }) => {
  const title = `E2E 본문 그림 ${Date.now()}`;

  await page.goto("/notices");
  await page.getByRole("link", { name: "글쓰기" }).click();
  await page.getByLabel("제목").fill(title);
  await page.getByLabel("내용").fill("그림이 본문에 들어갑니다.");

  // 도구 막대의 "파일" 은 떨구기·붙여넣기와 같은 경로입니다(components/RichText.tsx 의 attach).
  // 1x1 png 한 장을 올려, 본문에 <img> 가 들어가고 그 주소가 첨부 주소인지 확인합니다.
  await page.locator(".rttools .rtpick input").setInputFiles({
    name: "점.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  const inBody = page.locator(".rtbody img");
  await expect(inBody).toHaveAttribute("src", /\/api\/attachments\/\d+\/inline$/);

  await page.getByRole("button", { name: "글쓰기" }).click();
  await page.getByRole("button", { name: new RegExp(escapeRegExp(title)) }).click();
  await expect(page.locator(".rtview img")).toHaveAttribute("src", /\/api\/attachments\/\d+\/inline$/);
});
