import { expect, test } from "@playwright/test";

import { E2E_ACCOUNT_EMAIL, E2E_ACCOUNT_PASSWORD, E2E_ACCOUNT_TEAM } from "./helpers";

type Team = { id: number; name: string; member_count: number };

// 화면이 아니라 서버 통로(/api/...)를 직접 불러 권한 자체를 확인한다 — 남의 팀
// 글쓰기 서식으로는 화면 조작으로 갈 수 있는 자리가 없기 때문이다.
// request 는 이 검사 안에서 부른 응답의 쿠키를 스스로 저장해 다음 요청에 다시
// 싣는다(브라우저 컨텍스트와 같은 방식) — 로그인 뒤 헤더를 따로 만들 필요가 없다.
test("남의 팀 게시판에는 글을 못 쓴다", async ({ request }) => {
  await request.post("/api/login", {
    data: { email: E2E_ACCOUNT_EMAIL, password: E2E_ACCOUNT_PASSWORD },
  });

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

test("로그인하지 않으면 팀 게시판 글 목록을 읽을 수 없다", async ({ request }) => {
  const { teams } = (await (await request.get("/api/teams")).json()) as { teams: Team[] };
  const team = teams[0];
  if (team === undefined) {
    test.skip(true, "등록된 팀이 없어 건너뜀");
    return;
  }

  const response = await request.get(`/api/teams/${team.id}/posts`);

  expect(response.status()).toBe(401);
});
