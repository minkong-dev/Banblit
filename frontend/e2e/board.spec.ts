import { expect, test } from "@playwright/test";

import { E2E_OTHER_TEAM, E2E_TEAM, SIGNED_OUT, escapeRegExp, teamNamed } from "./helpers";

// 화면이 아니라 서버 endpoint(/api/...)를 직접 조회해 권한 자체를 확인합니다. 다른 팀의
// 글쓰기 form 은 화면 조작으로 도달할 수 있는 경로가 없기 때문입니다.
// page.request 는 page 와 cookie 저장소를 공유하므로 storageState 의 로그인 상태로 요청합니다.
test("남의 팀 게시판에는 글을 못 쓴다", async ({ page }) => {
  const other = await teamNamed(page.request, E2E_OTHER_TEAM);

  const response = await page.request.post(`/api/teams/${other.id}/posts`, {
    data: { title: "E2E 남의 팀 글쓰기 시도", body: "이 글은 저장되면 안 됩니다." },
  });

  expect(response.status()).toBe(403);
  const body = (await response.json()) as { detail: string };
  expect(body.detail).toBe("그 팀 소속이 아닙니다");
});

// 로그아웃 endpoint 를 부르면 모든 검사가 공유하는 session 이 취소됩니다. 그래서 로그아웃하지 않고
// cookie 가 없는 새 요청 context 로 확인합니다. storageState 를 넘기지 않으면 config 의 로그인 상태가 들어갑니다.
test("로그인하지 않으면 팀 게시판 글 목록을 읽을 수 없다", async ({ page, playwright, baseURL }) => {
  const team = await teamNamed(page.request, E2E_TEAM);
  const anonymous = await playwright.request.newContext({ baseURL, storageState: SIGNED_OUT });

  const response = await anonymous.get(`/api/teams/${team.id}/posts`);

  expect(response.status()).toBe(401);
  await anonymous.dispose();
});

// 첨부는 게시글이 만들어진 뒤에 붙습니다(components/PostBoard.tsx). 그 두 단계가 한 번의
// "글쓰기"로 이어지는지를 화면에서 확인합니다.
test("팀 게시판 글에 파일을 붙여 올리면 글을 열었을 때 그 파일이 보인다", async ({ page }) => {
  const stamp = Date.now();
  const title = `E2E 첨부 확인 ${stamp}`;
  const fileName = `e2e-attachment-${stamp}.txt`;

  await page.goto("/board");
  // 목록의 "글쓰기" 는 작성 페이지로 가는 링크입니다. 폼은 그 페이지에 있습니다.
  await page.getByRole("link", { name: "글쓰기" }).click();
  await page.getByLabel("제목").fill(title);
  await page.getByLabel("내용").fill("첨부가 붙는지 보는 글입니다.");
  await page.getByLabel(/첨부파일/).setInputFiles({
    name: fileName,
    mimeType: "text/plain",
    buffer: Buffer.from("종단 검사가 올린 파일입니다."),
  });
  await page.getByRole("button", { name: "글쓰기" }).click();

  await page.getByRole("button", { name: new RegExp(escapeRegExp(title)) }).click();
  await expect(page.getByRole("heading", { name: title, exact: true })).toBeVisible();
  await expect(page.getByText("첨부파일 1개")).toBeVisible();
  await expect(page.getByRole("link", { name: fileName })).toBeVisible();

  // 되돌립니다. 게시글을 삭제하면 첨부 파일도 디스크에서 함께 삭제됩니다.
  const team = await teamNamed(page.request, E2E_TEAM);
  const { posts } = (await (
    await page.request.get(`/api/teams/${team.id}/posts`)
  ).json()) as { posts: { id: number; title: string }[] };
  const written = posts.find((post) => post.title === title);
  expect(written).toBeDefined();
  expect((await page.request.delete(`/api/posts/${written?.id}`)).status()).toBe(204);
});
