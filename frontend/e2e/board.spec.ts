import { expect, test } from "@playwright/test";

import { E2E_ACCOUNT_TEAM, escapeRegExp, loginForTests } from "./helpers";

type Team = { id: number; name: string; member_count: number };

// 화면이 아니라 서버 통로(/api/...)를 직접 불러 권한 자체를 확인한다 — 남의 팀
// 글쓰기 서식으로는 화면 조작으로 갈 수 있는 자리가 없기 때문이다.
// request 는 이 검사 안에서 부른 응답의 쿠키를 스스로 저장해 다음 요청에 다시
// 싣는다(브라우저 컨텍스트와 같은 방식) — 로그인 뒤 헤더를 따로 만들 필요가 없다.
test("남의 팀 게시판에는 글을 못 쓴다", async ({ request }) => {
  await loginForTests(request);

  const { teams } = (await (await request.get("/api/teams")).json()) as { teams: Team[] };
  const other = teams.find((team) => team.name !== E2E_ACCOUNT_TEAM);
  if (other === undefined) {
    test.skip(true, "E2E 계정이 속하지 않은 팀이 없어 건너뜀");
    return;
  }

  const response = await request.post(`/api/teams/${other.id}/posts`, {
    data: { title: "E2E 남의 팀 글쓰기 시도", body: "이 글은 저장되면 안 됩니다." },
  });

  expect(response.status()).toBe(403);
  const body = (await response.json()) as { detail: string };
  expect(body.detail).toBe("그 팀 소속이 아닙니다");
});

// 팀 번호는 로그인해야 알 수 있으므로(팀 목록도 로그인이 필요하다) 먼저 로그인해
// 번호만 받아 두고, 로그아웃해 쿠키를 버린 다음 같은 통로를 다시 부른다.
test("로그인하지 않으면 팀 게시판 글 목록을 읽을 수 없다", async ({ request }) => {
  await loginForTests(request);
  const { teams } = (await (await request.get("/api/teams")).json()) as { teams: Team[] };
  const team = teams[0];
  if (team === undefined) {
    test.skip(true, "등록된 팀이 없어 건너뜀");
    return;
  }
  await request.post("/api/logout");

  const response = await request.get(`/api/teams/${team.id}/posts`);

  expect(response.status()).toBe(401);
});

// 첨부는 글이 만들어진 뒤에 붙는다(components/PostBoard.tsx). 그 두 단계가 한 번의
// "글쓰기" 로 이어지는지를 화면에서 확인한다.
test("팀 게시판 글에 파일을 붙여 올리면 글을 열었을 때 그 파일이 보인다", async ({
  page,
  request,
}) => {
  await loginForTests(page.request, request);
  const stamp = Date.now();
  const title = `E2E 첨부 확인 ${stamp}`;
  const fileName = `e2e-attachment-${stamp}.txt`;

  await page.goto("/board");
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

  // 되돌린다 — 글을 지우면 붙은 파일도 디스크에서 함께 사라진다.
  const { teams } = (await (await request.get("/api/teams")).json()) as { teams: Team[] };
  const mine = teams.find((team) => team.name === E2E_ACCOUNT_TEAM);
  if (mine === undefined) return;
  const { posts } = (await (
    await request.get(`/api/teams/${mine.id}/posts`)
  ).json()) as { posts: { id: number; title: string }[] };
  const written = posts.find((post) => post.title === title);
  if (written === undefined) return;
  expect((await request.delete(`/api/posts/${written.id}`)).status()).toBe(204);
});
